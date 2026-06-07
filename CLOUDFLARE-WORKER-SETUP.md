# GitHub Pages + Cloudflare Worker для Telegram

Эта версия оставляет сайт на GitHub Pages, а Telegram-уведомления отправляет через Cloudflare Worker.

## Что исправлено в этой версии

1. Исправлены пути к стандартным фото:
   - `assets/...`
   - `uploads/...`

   Для GitHub Pages нельзя использовать пути вида `/assets/...` и `/uploads/...`, потому что на проектном сайте GitHub Pages они ведут в корень домена, а не в папку репозитория.

2. В админку добавлен блок:

```text
Редактирование сайта → Telegram-уведомления через Cloudflare Worker
```

3. В `data/site.json` добавлено поле:

```json
"telegramWorkerUrl": ""
```

4. Добавлена папка:

```text
cloudflare-worker/
```

В ней готовый код Worker.

---

# Пошаговая настройка

## 1. Загрузите сайт в GitHub

1. Создайте репозиторий.
2. Загрузите файлы из архива в корень репозитория.
3. Включите GitHub Pages:

```text
Settings → Pages → Deploy from branch → main → /root
```

## 2. Создайте Cloudflare аккаунт

Откройте:

```text
https://dash.cloudflare.com/
```

Создайте аккаунт или войдите.

## 3. Установите Wrangler

На компьютере в терминале:

```bash
npm install -g wrangler
```

Или используйте без установки:

```bash
npx wrangler
```

## 4. Авторизуйтесь

```bash
npx wrangler login
```

## 5. Перейдите в папку Worker

В распакованном архиве откройте папку:

```text
cloudflare-worker
```

## 6. Добавьте Telegram token как secret

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

Вставьте token от BotFather.

Важно: token не нужно вставлять в GitHub и не нужно вставлять в код сайта.

## 7. Проверьте Chat ID

В файле:

```text
cloudflare-worker/wrangler.toml
```

уже указан:

```toml
TELEGRAM_CHAT_ID = "8674762889"
```

Если Chat ID изменится, поменяйте его там.

## 8. Опубликуйте Worker

В папке `cloudflare-worker` выполните:

```bash
npx wrangler deploy
```

После публикации Cloudflare покажет URL, например:

```text
https://lavka-orders-telegram.username.workers.dev
```

## 9. Вставьте Worker URL в админку сайта

1. Откройте GitHub Pages сайт.
2. Откройте:

```text
admin.html
```

3. Введите GitHub token.
4. Перейдите:

```text
Редактирование сайта → Telegram-уведомления через Cloudflare Worker
```

5. Вставьте Worker URL.
6. Нажмите **Сохранить Worker URL в site.json**.

После этого заказы с сайта будут уходить в Telegram через Worker.

---

# Почему стандартные фото могли не отображаться

В GitHub Pages проект обычно открывается по адресу:

```text
https://username.github.io/repository-name/
```

Если картинка указана так:

```text
/assets/photo.webp
```

браузер ищет её по адресу:

```text
https://username.github.io/assets/photo.webp
```

Это неправильно.

Нужно так:

```text
assets/photo.webp
```

Тогда браузер ищет:

```text
https://username.github.io/repository-name/assets/photo.webp
```

В этой версии пути исправлены.

---

# Проверка после настройки

1. Откройте главную страницу сайта.
2. Проверьте, что логотип и стандартные фото отображаются.
3. Добавьте товар в корзину.
4. Оформите заказ.
5. В Telegram должно прийти сообщение.
6. Если не пришло, проверьте Worker logs в Cloudflare.

---

# Важно про безопасность

Telegram token хранится только в Cloudflare Secret:

```text
TELEGRAM_BOT_TOKEN
```

Он не хранится в GitHub, `app.js`, `admin-github.js` или `site.json`.


## Если Worker URL не сохраняется в админке

В этой сборке адрес Worker уже встроен в `app.js` как резервный адрес:

```text
https://lavka-orders-telegram.izhmeat.workers.dev
```

Также он прописан в `data/site.json`:

```json
"telegramWorkerUrl": "https://lavka-orders-telegram.izhmeat.workers.dev"
```

Поэтому уведомления должны работать даже если админка временно не смогла сохранить поле из-за GitHub token. Если админка возвращает на экран входа, войдите заново и проверьте, что у GitHub token есть право `Contents: Read and write`.
