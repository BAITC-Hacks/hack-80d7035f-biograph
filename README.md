# ekt.kz AI assistant

Чат-консультант для ekt.kz: поиск товаров, характеристики, остатки по складам, сертификаты, аналоги и условия покупки. Цена и наличие берутся только из базы каталога.

## Быстрый запуск

1. Скопируйте шаблон окружения:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Замените `POSTGRES_PASSWORD` и `N8N_ENCRYPTION_KEY` в `.env` на собственные секретные значения. Файл `.env` не коммитится.

3. Запустите локальный стек:

   ```powershell
   docker compose up -d
   ```

4. Откройте n8n: [http://localhost:5678](http://localhost:5678). При первом запуске создайте владельца n8n.

5. Создайте credential типа **Postgres** с параметрами из `.env`:

   - Host: `postgres` (если n8n запущен через этот Docker Compose);
   - Port: `5432`;
   - Database: значение `POSTGRES_DB`;
   - User: значение `POSTGRES_USER`;
   - Password: значение `POSTGRES_PASSWORD`;
   - SSL: выключен для локального Docker.

6. Импортируйте `n8n/workflows/ekt_assistant.json` и назначьте этот Postgres credential нодам `Postgres Chat Memory`, `search_products`, `get_product`, `find_analogs` и `purchase_terms`. Также выберите существующий OpenAI credential в `OpenAI Chat Model`.

## Уже работающий облачный вариант

На https://marindsain8n.ru создан и опубликован workflow `ekt_assistant`. Его Postgres credential подключён к Supabase через Session pooler (порт 5432). SQL из [db/init.sql](db/init.sql) уже выполнен в Supabase. Три демонстрационных запроса — товар по артикулу, отсутствие остатка и доставка — успешно проверены 23 сентября 2026 года.

Для загрузки реального каталога подготовлен `n8n/workflows/ekt_catalog_preview.json` (workflow `ekt_catalog_preview`). В n8n создайте credential типа **HTTP Basic Auth** для API ekt.kz, назначьте его ноде `Fetch first catalogue page` и запустите workflow вручную. Нода `Inspect API shape` покажет названия полей и два образца записи. После проверки структуры ответа можно добавить преобразование и upsert в `products`. Логин и пароль API хранятся только в n8n credential; workflow JSON не содержит их.

## Данные

При первом создании локальной БД Docker выполняет [db/init.sql](db/init.sql). Скрипт создаёт:

- `products` с ценой, остатками, характеристиками, сертификатом, ссылкой на карточку и embedding;
- `terms` для доставки и оплаты;
- `n8n_chat_histories` для истории чата по sessionId;
- синтетические записи `TEST-001`, `TEST-000`, `TEST-002` и `TEST-003`.

`TEST-000` имеет нулевой остаток, а `TEST-002` и `TEST-003` пригодны для проверки аналогов. Перед демонстрацией замените синтетические данные выгрузкой ekt.kz; Basic Auth API-данные хранятся только в credentials n8n или `.env`.

## Проверка

В чате workflow отправьте:

```text
Покажите товар по артикулу TEST-001
У товара TEST-000 нулевой остаток, предложите аналог
Какие условия доставки?
```

Ожидается: ответ с данными из БД, аналоги при нулевом остатке и условия доставки из `terms`.
