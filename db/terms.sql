-- Verified public purchase terms from ekt.kz; safe to re-run.
UPDATE terms
SET answer = 'Для Алматы доставка в пределах города бесплатна при заказе свыше 30 000 ₸. При меньшей сумме — 1 000 или 2 000 ₸ в зависимости от района. По другим городам сроки и стоимость согласуются с менеджером; при заказе свыше 400 000 ₸ доставка бесплатна. Источник: https://ekt.kz/checkout-delivery/',
    keywords = ARRAY['доставка','доставить','город','срок','условия']
WHERE question = 'Какие условия доставки?' AND locale = 'ru';

UPDATE terms
SET answer = 'Физлица могут оплатить заказ банковской картой онлайн, наличными при получении или наличными/картой в торговом зале при самовывозе. Юрлица — перечислением по счёту либо наличными в торговом зале при самовывозе. Источник: https://ekt.kz/checkout-delivery/',
    keywords = ARRAY['оплата','оплатить','платеж','счёт','счет']
WHERE question = 'Какие условия оплаты?' AND locale = 'ru';

INSERT INTO terms (question, answer, locale, keywords)
SELECT 'Есть ли минимальная партия?',
       'Розничные заказы возможны. Минимальное количество отдельного товара может зависеть от упаковки или формы поставки; точное количество по артикулу уточните у менеджера. Источник: https://ekt.kz/about/faq/',
       'ru', ARRAY['минимальная','партия','розница','упаковка']
WHERE NOT EXISTS (
  SELECT 1 FROM terms WHERE question = 'Есть ли минимальная партия?' AND locale = 'ru'
);

UPDATE products SET certificate_url = NULL
WHERE sku LIKE 'TEST-%' AND certificate_url LIKE 'https://example.com/%';

SELECT (SELECT count(*) FROM terms WHERE locale='ru') AS ru_terms,
       (SELECT count(*) FROM products WHERE sku LIKE 'TEST-%'
          AND certificate_url LIKE 'https://example.com/%') AS placeholder_certificates;
