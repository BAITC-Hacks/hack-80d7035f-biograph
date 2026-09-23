-- Prototype cart for the hosted n8n chat. This is not the ekt.kz website cart.
-- Run after db/init.sql. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS cart_sessions (
  session_id TEXT PRIMARY KEY,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_pending (
  session_id TEXT PRIMARY KEY REFERENCES cart_sessions(session_id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES products(sku),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  prepared_execution TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  session_id TEXT NOT NULL REFERENCES cart_sessions(session_id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES products(sku),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, sku)
);

CREATE OR REPLACE FUNCTION prepare_cart_intent(
  p_session TEXT, p_sku TEXT, p_quantity INTEGER, p_execution TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  product_record products%ROWTYPE;
  in_cart INTEGER;
BEGIN
  IF nullif(trim(p_session), '') IS NULL OR nullif(trim(p_execution), '') IS NULL
     OR p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100 THEN
    RETURN jsonb_build_object('status', 'invalid_request');
  END IF;

  SELECT * INTO product_record FROM products WHERE sku = p_sku;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unknown_product');
  END IF;
  SELECT coalesce(quantity, 0) INTO in_cart
    FROM cart_items WHERE session_id = p_session AND sku = p_sku;
  in_cart := coalesce(in_cart, 0);
  IF product_record.stock_total < in_cart + p_quantity THEN
    RETURN jsonb_build_object('status', 'insufficient_stock', 'available',
      greatest(product_record.stock_total - in_cart, 0));
  END IF;

  INSERT INTO cart_sessions (session_id) VALUES (p_session)
    ON CONFLICT (session_id) DO NOTHING;
  INSERT INTO cart_pending (session_id, sku, quantity, prepared_execution, created_at)
    VALUES (p_session, p_sku, p_quantity, p_execution, now())
    ON CONFLICT (session_id) DO UPDATE SET sku = excluded.sku,
      quantity = excluded.quantity, prepared_execution = excluded.prepared_execution,
      created_at = now();

  RETURN jsonb_build_object('status', 'awaiting_confirmation', 'sku', p_sku,
    'name', product_record.name, 'quantity', p_quantity,
    'unit_price', product_record.price, 'currency', product_record.currency,
    'stock_total', product_record.stock_total);
END;
$$;

DROP FUNCTION IF EXISTS confirm_add_to_cart(TEXT, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION confirm_add_to_cart(
  p_session TEXT, p_explicit_yes BOOLEAN, p_execution TEXT, p_cart_base_url TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  pending_record cart_pending%ROWTYPE;
  product_record products%ROWTYPE;
  session_token UUID;
  in_cart INTEGER;
BEGIN
  -- The boolean is computed from the current raw Chat Trigger message, never by the AI.
  IF p_explicit_yes IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'confirmation_required');
  END IF;
  IF nullif(trim(p_session), '') IS NULL OR nullif(trim(p_execution), '') IS NULL
     OR nullif(trim(p_cart_base_url), '') IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_request');
  END IF;

  SELECT token INTO session_token FROM cart_sessions
    WHERE session_id = p_session FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_pending_item');
  END IF;
  SELECT * INTO pending_record FROM cart_pending
    WHERE session_id = p_session FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_pending_item');
  END IF;
  IF pending_record.created_at < now() - interval '15 minutes' THEN
    DELETE FROM cart_pending WHERE session_id = p_session;
    RETURN jsonb_build_object('status', 'confirmation_expired');
  END IF;
  IF pending_record.prepared_execution = p_execution THEN
    RETURN jsonb_build_object('status', 'separate_confirmation_message_required');
  END IF;

  SELECT * INTO product_record FROM products
    WHERE sku = pending_record.sku FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unknown_product');
  END IF;
  SELECT coalesce(quantity, 0) INTO in_cart FROM cart_items
    WHERE session_id = p_session AND sku = pending_record.sku;
  in_cart := coalesce(in_cart, 0);
  IF product_record.stock_total < in_cart + pending_record.quantity THEN
    RETURN jsonb_build_object('status', 'insufficient_stock', 'available',
      greatest(product_record.stock_total - in_cart, 0));
  END IF;

  INSERT INTO cart_items (session_id, sku, quantity)
    VALUES (p_session, pending_record.sku, pending_record.quantity)
    ON CONFLICT (session_id, sku) DO UPDATE SET
      quantity = cart_items.quantity + excluded.quantity;
  DELETE FROM cart_pending WHERE session_id = p_session;

  RETURN jsonb_build_object('status', 'added', 'sku', pending_record.sku,
    'quantity_added', pending_record.quantity, 'quantity_in_cart',
    in_cart + pending_record.quantity, 'cart_token', session_token,
    'cart_url', rtrim(p_cart_base_url, '/') || '?token=' || session_token);
END;
$$;

-- Only the trusted n8n Postgres credential may operate the cart.
REVOKE ALL ON cart_sessions, cart_pending, cart_items FROM PUBLIC;
REVOKE ALL ON FUNCTION prepare_cart_intent(TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_add_to_cart(TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
DO $revoke$
DECLARE role_name TEXT;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON cart_sessions, cart_pending, cart_items FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION prepare_cart_intent(TEXT, TEXT, INTEGER, TEXT) FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON FUNCTION confirm_add_to_cart(TEXT, BOOLEAN, TEXT, TEXT) FROM %I', role_name);
  END LOOP;
END;
$revoke$;

