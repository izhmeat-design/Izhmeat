# Cloudflare Worker для Telegram-заказов

Этот Worker принимает заказ с GitHub Pages сайта и отправляет его в Telegram.

## Что хранится безопасно

`TELEGRAM_BOT_TOKEN` хранится в Cloudflare Worker Secret, а не в GitHub и не в браузере.

## Быстрая настройка через Wrangler

1. Установите Node.js.
2. В папке `cloudflare-worker` выполните:

```bash
npm create cloudflare@latest
```

Можно пропустить создание нового проекта, если используете этот готовый файл `worker.js`.

3. Установите Wrangler или используйте npx:

```bash
npx wrangler login
```

4. Добавьте секрет Telegram token:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

Вставьте новый token от BotFather.

5. Проверьте `TELEGRAM_CHAT_ID` в `wrangler.toml`.

6. Опубликуйте Worker:

```bash
npx wrangler deploy
```

7. После публикации Cloudflare покажет URL вида:

```text
https://lavka-orders-telegram.USERNAME.workers.dev
```

8. Откройте админку сайта на GitHub Pages.

9. Перейдите:

```text
Редактирование сайта → Telegram-уведомления через Cloudflare Worker
```

10. Вставьте Worker URL и сохраните.

## Общий номер заказа за день

По умолчанию сайт передает локальный номер заказа. Чтобы Worker сам выдавал общий номер вида `07-06-2026-17`, создайте Cloudflare KV namespace и привяжите его как `ORDER_COUNTERS`.

Команды:

```bash
npx wrangler kv namespace create ORDER_COUNTERS
```

Затем добавьте полученный id в `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ORDER_COUNTERS"
id = "ваш_id"
```

И снова выполните:

```bash
npx wrangler deploy
```
