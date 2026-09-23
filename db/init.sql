-- ekt.kz assistant: PostgreSQL / Supabase schema
-- Safe to run repeatedly. The sample rows are synthetic and for demo/testing only.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'KZT',
  stock_total INTEGER NOT NULL DEFAULT 0 CHECK (stock_total >= 0),
  stock_by_warehouse JSONB NOT NULL DEFAULT '{}'::jsonb,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  certificate_url TEXT,
  product_url TEXT NOT NULL,
  embedding vector,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_sku_idx ON products (sku);
CREATE INDEX IF NOT EXISTS products_category_stock_idx ON products (category, stock_total);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS terms (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'kk')),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS terms_locale_idx ON terms (locale);
CREATE INDEX IF NOT EXISTS terms_question_trgm_idx ON terms USING gin (question gin_trgm_ops);

-- Required by n8n Postgres Chat Memory.
CREATE TABLE IF NOT EXISTS n8n_chat_histories (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  message JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS n8n_chat_histories_session_idx
  ON n8n_chat_histories (session_id, id);

-- Synthetic demo catalogue. Replace with imported ekt.kz data in production.
INSERT INTO products
  (sku, name, category, price, stock_total, stock_by_warehouse, attributes, certificate_url, product_url, embedding)
VALUES
  (
    'TEST-001',
    'Автоматический выключатель 16A, 1P',
    'Автоматические выключатели',
    1850.00,
    14,
    '{"Алматы": 10, "Астана": 4}'::jsonb,
    '{"Номинальный ток": "16 A", "Полюсов": 1, "Характеристика": "C", "Отключающая способность": "6 kA"}'::jsonb,
    'https://example.com/certificates/test-001.pdf',
    'https://ekt.kz/products/test-001',
    '[0.10,0.20,0.30]'::vector
  ),
  (
    'TEST-000',
    'Автоматический выключатель 25A, 1P',
    'Автоматические выключатели',
    2200.00,
    0,
    '{"Алматы": 0, "Астана": 0}'::jsonb,
    '{"Номинальный ток": "25 A", "Полюсов": 1, "Характеристика": "C", "Отключающая способность": "6 kA"}'::jsonb,
    NULL,
    'https://ekt.kz/products/test-000',
    '[0.11,0.20,0.30]'::vector
  ),
  (
    'TEST-002',
    'Автоматический выключатель 25A, 1P, серия Pro',
    'Автоматические выключатели',
    2450.00,
    8,
    '{"Алматы": 5, "Астана": 3}'::jsonb,
    '{"Номинальный ток": "25 A", "Полюсов": 1, "Характеристика": "C", "Отключающая способность": "10 kA"}'::jsonb,
    'https://example.com/certificates/test-002.pdf',
    'https://ekt.kz/products/test-002',
    '[0.12,0.20,0.30]'::vector
  ),
  (
    'TEST-003',
    'Автоматический выключатель 20A, 1P',
    'Автоматические выключатели',
    1980.00,
    6,
    '{"Алматы": 6}'::jsonb,
    '{"Номинальный ток": "20 A", "Полюсов": 1, "Характеристика": "C", "Отключающая способность": "6 kA"}'::jsonb,
    NULL,
    'https://ekt.kz/products/test-003',
    '[0.09,0.20,0.30]'::vector
  )
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  stock_total = EXCLUDED.stock_total,
  stock_by_warehouse = EXCLUDED.stock_by_warehouse,
  attributes = EXCLUDED.attributes,
  certificate_url = EXCLUDED.certificate_url,
  product_url = EXCLUDED.product_url,
  embedding = EXCLUDED.embedding,
  updated_at = now();

INSERT INTO terms (question, answer, locale, keywords)
VALUES
  (
    'Какие условия доставки?',
    'Доставка доступна после подтверждения заказа. Срок и стоимость зависят от города, габаритов и наличия товара на складе. Для точного расчёта уточните город и состав заказа.',
    'ru',
    ARRAY['доставка', 'доставить', 'город', 'срок']
  ),
  (
    'Какие условия оплаты?',
    'Условия оплаты согласовываются при оформлении заказа. Для корпоративных заказов запросите счёт у менеджера.',
    'ru',
    ARRAY['оплата', 'счёт', 'счет']
  ),
  (
    'Жеткізу шарттары қандай?',
    'Жеткізу тапсырыс расталғаннан кейін қолжетімді. Мерзімі мен құны қалаға, тауар көлеміне және қоймадағы қалдыққа байланысты.',
    'kk',
    ARRAY['жеткізу', 'қала', 'мерзім']
  )
ON CONFLICT DO NOTHING;

-- The trigram extension is optional on some managed PostgreSQL instances.
-- If the two GIN indexes above fail, first run: CREATE EXTENSION IF NOT EXISTS pg_trgm;
