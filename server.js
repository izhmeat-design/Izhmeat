require('dotenv').config();

const crypto = require('crypto');
const https = require('https');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 7 * 1024 * 1024 } });

const PORT = Number(process.env.PORT || 3000);
const DATA_DRIVER = (process.env.DATA_DRIVER || 'local').toLowerCase();
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'local-dev-secret-change-me';
const SESSION_COOKIE = 'shop_admin_session';
const DEFAULT_MAIL_TO = 'izhmeat@gmail.com';

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR));

function nowIso() {
  return new Date().toISOString();
}


function orderDateKey(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function nextOrderIdForDate(orders, dateKey) {
  let sameDayCount = 0;
  let maxSequence = 0;

  for (const order of orders || []) {
    const id = String(order.id || '');
    const createdAt = order.createdAt ? new Date(order.createdAt) : null;
    const sameById = id.startsWith(`${dateKey}-`);
    const sameByDate = createdAt && !Number.isNaN(createdAt.getTime()) && orderDateKey(createdAt) === dateKey;

    if (!sameById && !sameByDate) continue;

    sameDayCount += 1;

    if (sameById) {
      const sequence = Number(id.slice(dateKey.length + 1));
      if (Number.isFinite(sequence)) maxSequence = Math.max(maxSequence, sequence);
    }
  }

  const nextSequence = Math.max(sameDayCount, maxSequence) + 1;
  return `${dateKey}-${nextSequence}`;
}


function slugify(input) {
  return String(input || 'item')
    .toLowerCase()
    .replace(/[а]/g, 'a').replace(/[б]/g, 'b').replace(/[в]/g, 'v').replace(/[г]/g, 'g')
    .replace(/[д]/g, 'd').replace(/[её]/g, 'e').replace(/[ж]/g, 'zh').replace(/[з]/g, 'z')
    .replace(/[и]/g, 'i').replace(/[й]/g, 'y').replace(/[к]/g, 'k').replace(/[л]/g, 'l')
    .replace(/[м]/g, 'm').replace(/[н]/g, 'n').replace(/[о]/g, 'o').replace(/[п]/g, 'p')
    .replace(/[р]/g, 'r').replace(/[с]/g, 's').replace(/[т]/g, 't').replace(/[у]/g, 'u')
    .replace(/[ф]/g, 'f').replace(/[х]/g, 'h').replace(/[ц]/g, 'c').replace(/[ч]/g, 'ch')
    .replace(/[ш]/g, 'sh').replace(/[щ]/g, 'sch').replace(/[ы]/g, 'y').replace(/[э]/g, 'e')
    .replace(/[ю]/g, 'yu').replace(/[я]/g, 'ya')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

function extFromMime(mime, originalName = '') {
  const fromName = path.extname(originalName).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(fromName)) return fromName;
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/svg+xml') return '.svg';
  return '.jpg';
}

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function createSessionCookie() {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 1000 * 60 * 60 * 12 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifySessionCookie(cookieValue) {
  if (!cookieValue || !cookieValue.includes('.')) return false;
  const [payload, signature] = cookieValue.split('.');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (verifySessionCookie(req.cookies[SESSION_COOKIE])) return next();
  return res.status(401).json({ error: 'Нужен административный вход' });
}

async function githubApi(filePath, method = 'GET', body) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error('Для DATA_DRIVER=github заполните GITHUB_OWNER, GITHUB_REPO и GITHUB_TOKEN');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath.replace(/^\/+/, '')}${method === 'GET' ? `?ref=${encodeURIComponent(branch)}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `GitHub API error ${response.status}`);
  }
  return data;
}

async function readText(filePath) {
  if (DATA_DRIVER === 'github') {
    const data = await githubApi(filePath, 'GET');
    if (!data || !data.content) return '';
    return Buffer.from(data.content, 'base64').toString('utf8');
  }
  return fs.readFile(path.join(ROOT, filePath), 'utf8');
}

async function writeText(filePath, content, message) {
  if (DATA_DRIVER === 'github') {
    const branch = process.env.GITHUB_BRANCH || 'main';
    const current = await githubApi(filePath, 'GET');
    await githubApi(filePath, 'PUT', {
      message: message || `Update ${filePath}`,
      content: Buffer.from(content).toString('base64'),
      branch,
      ...(current?.sha ? { sha: current.sha } : {})
    });
    return;
  }
  await fs.mkdir(path.dirname(path.join(ROOT, filePath)), { recursive: true });
  await fs.writeFile(path.join(ROOT, filePath), content, 'utf8');
}

async function writeBinary(filePath, buffer, message) {
  if (DATA_DRIVER === 'github') {
    const branch = process.env.GITHUB_BRANCH || 'main';
    const current = await githubApi(filePath, 'GET');
    await githubApi(filePath, 'PUT', {
      message: message || `Upload ${filePath}`,
      content: Buffer.from(buffer).toString('base64'),
      branch,
      ...(current?.sha ? { sha: current.sha } : {})
    });
    return;
  }
  await fs.mkdir(path.dirname(path.join(ROOT, filePath)), { recursive: true });
  await fs.writeFile(path.join(ROOT, filePath), buffer);
}

async function readJson(filePath, fallback) {
  try {
    const text = await readText(filePath);
    return text ? JSON.parse(text) : fallback;
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

async function writeJson(filePath, data, message) {
  await writeText(filePath, `${JSON.stringify(data, null, 2)}\n`, message);
}

function validateOrder(order) {
  const errors = [];
  if (!order.customer?.name || order.customer.name.trim().length < 2) errors.push('Укажите имя');
  if (!order.customer?.phone || order.customer.phone.trim().length < 5) errors.push('Укажите телефон');
  if (!Array.isArray(order.items) || order.items.length === 0) errors.push('Корзина пуста');
  return errors;
}

function money(value) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0));
}



function createTelegramProxyAgent() {
  const proxyUrl = process.env.TELEGRAM_PROXY_URL;
  if (!proxyUrl) return undefined;

  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl);
  } catch (error) {
    throw new Error('Для TELEGRAM_PROXY_URL установите зависимость: npm install https-proxy-agent');
  }
}

function telegramRequest(token, methodName, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const request = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/${methodName}`,
      method: 'POST',
      timeout: 20000,
      agent: createTelegramProxyAgent(),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        if (response.statusCode < 200 || response.statusCode >= 300 || data.ok === false) {
          const description = data.description || data.raw || `Telegram HTTP ${response.statusCode}`;
          const error = new Error(description);
          error.statusCode = response.statusCode;
          error.telegramResponse = data;
          reject(error);
          return;
        }
        resolve(data);
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('Таймаут соединения с api.telegram.org'));
    });
    request.on('error', error => reject(error));
    request.write(body);
    request.end();
  });
}

function explainTelegramError(error) {
  const message = error?.message || String(error);
  if (message.includes('ETELEGRAM') || message.includes('401') || message.toLowerCase().includes('unauthorized')) {
    return 'Telegram не принял токен бота. Проверьте TELEGRAM_BOT_TOKEN или перевыпустите токен у @BotFather.';
  }
  if (message.includes('chat not found') || message.includes('400')) {
    return 'Telegram не нашёл чат. Откройте бота, нажмите Start, напишите ему сообщение и проверьте TELEGRAM_CHAT_ID.';
  }
  if (message.includes('ENOTFOUND') || message.includes('EAI_AGAIN')) {
    return 'Сервер не может найти api.telegram.org. Проверьте DNS/интернет на сервере.';
  }
  if (message.includes('ECONNRESET') || message.includes('ETIMEDOUT') || message.includes('Таймаут')) {
    return 'Нет стабильного соединения с Telegram API. Проверьте доступ к api.telegram.org на сервере или заполните TELEGRAM_PROXY_URL в .env.';
  }
  return message;
}


function formatOrder(order) {
  const lines = [];
  lines.push(`Новый заказ №${order.id}`);
  lines.push(`Клиент: ${order.customer.name}`);
  lines.push(`Телефон: ${order.customer.phone}`);
  if (order.customer.address) lines.push(`Адрес: ${order.customer.address}`);
  if (order.customer.comment) lines.push(`Комментарий: ${order.customer.comment}`);
  lines.push('');
  lines.push('Состав заказа:');
  for (const item of order.items) {
    lines.push(`• ${item.name} — ${item.qty} ${item.unit}, ${money(item.price)} руб/${item.unit}, сумма ~ ${money(item.price * item.qty)} руб`);
  }
  lines.push('');
  lines.push(`Итого ориентировочно: ${money(order.total)} руб`);
  lines.push(`Создан: ${order.createdAt}`);
  return lines.join('\n');
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { channel: 'telegram', skipped: true, reason: 'TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заполнены' };

  try {
    await telegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    });
    return { channel: 'telegram', sent: true };
  } catch (error) {
    return {
      channel: 'telegram',
      error: explainTelegramError(error),
      rawError: error.message || String(error)
    };
  }
}

async function sendMail(subject, text) {
  const host = process.env.SMTP_HOST;
  const to = process.env.MAIL_TO || DEFAULT_MAIL_TO;
  if (!host) return { channel: 'email', skipped: true, reason: 'SMTP_HOST не заполнен' };

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'orders@example.com',
    to,
    subject,
    text
  });
  return { channel: 'email', sent: true, to };
}

async function notifyOrder(order) {
  const text = formatOrder(order);
  const results = await Promise.allSettled([
    sendTelegram(text),
    sendMail(`Новый заказ №${order.id}`, text)
  ]);
  return results.map((r, index) => {
    const channel = index === 0 ? 'telegram' : 'email';
    return r.status === 'fulfilled' ? r.value : { channel, error: r.reason.message || String(r.reason) };
  });
}

app.get('/api/site', async (_req, res, next) => {
  try { res.json(await readJson('data/site.json', {})); } catch (error) { next(error); }
});

app.get('/api/products', async (_req, res, next) => {
  try { res.json(await readJson('data/products.json', [])); } catch (error) { next(error); }
});

app.post('/api/order', async (req, res, next) => {
  try {
    const orderInput = req.body;
    const errors = validateOrder(orderInput);
    if (errors.length) return res.status(400).json({ errors });

    const products = await readJson('data/products.json', []);
    const productMap = new Map(products.map(product => [product.id, product]));
    const items = orderInput.items.map(item => {
      const product = productMap.get(item.id);
      if (!product) return null;
      const qty = Math.max(0.1, Math.min(999, Number(item.qty) || 1));
      return {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        unit: product.unit,
        qty
      };
    }).filter(Boolean);

    if (!items.length) return res.status(400).json({ errors: ['В корзине нет доступных товаров'] });

    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const orders = await readJson('data/orders.json', []);
    const createdAt = nowIso();
    const dateKey = orderDateKey(createdAt);
    const order = {
      id: nextOrderIdForDate(orders, dateKey),
      status: 'new',
      customer: {
        name: String(orderInput.customer.name || '').trim(),
        phone: String(orderInput.customer.phone || '').trim(),
        address: String(orderInput.customer.address || '').trim(),
        comment: String(orderInput.customer.comment || '').trim()
      },
      items,
      total,
      createdAt
    };

    orders.unshift(order);
    await writeJson('data/orders.json', orders, `Add order ${order.id}`);

    // Отвечаем клиенту сразу после сохранения заказа.
    // Уведомления отправляются в фоне и не держат корзину в статусе «Отправляем заказ...».
    notifyOrder(order)
      .then(results => console.log(`Order ${order.id} notifications:`, results))
      .catch(error => console.error(`Order ${order.id} notification error:`, error));

    res.status(201).json({ ok: true, orderId: order.id, notificationQueued: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', (req, res) => {
  if (String(req.body.password || '') !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Неверный пароль' });
  }
  res.cookie(SESSION_COOKIE, createSessionCookie(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ loggedIn: verifySessionCookie(req.cookies[SESSION_COOKIE]), dataDriver: DATA_DRIVER });
});

app.get('/api/admin/orders', requireAdmin, async (_req, res, next) => {
  try { res.json(await readJson('data/orders.json', [])); } catch (error) { next(error); }
});

app.get('/api/admin/notifications/status', requireAdmin, (_req, res) => {
  const mailTo = process.env.MAIL_TO || DEFAULT_MAIL_TO;
  res.json({
    mailTo,
    emailConfigured: Boolean(process.env.SMTP_HOST),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    telegramProxyConfigured: Boolean(process.env.TELEGRAM_PROXY_URL),
    telegramChatId: process.env.TELEGRAM_CHAT_ID ? String(process.env.TELEGRAM_CHAT_ID).replace(/.(?=.{4})/g, '•') : ''
  });
});

app.get('/api/admin/notifications/telegram-updates', requireAdmin, async (_req, res, next) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN не заполнен' });

    const data = await telegramRequest(token, 'getUpdates', {});
    const chats = new Map();
    for (const update of data.result || []) {
      const message = update.message || update.channel_post || update.edited_message || update.my_chat_member || {};
      const chat = message.chat;
      if (!chat || chat.id === undefined) continue;
      chats.set(String(chat.id), {
        id: chat.id,
        type: chat.type || '',
        title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '',
        username: chat.username || '',
        date: message.date || null
      });
    }

    res.json({ ok: true, chats: [...chats.values()] });
  } catch (error) {
    res.status(400).json({ error: explainTelegramError(error), rawError: error.message || String(error) });
  }
});

app.post('/api/admin/notifications/test', requireAdmin, async (_req, res, next) => {
  try {
    const text = [
      'Тестовое уведомление — Лавка свежего мяса',
      '',
      'Если вы видите это сообщение, уведомления о заказах работают.',
      `Время проверки: ${nowIso()}`
    ].join('\n');

    const results = await Promise.allSettled([
      sendTelegram(text),
      sendMail('Тестовое уведомление — Лавка свежего мяса', text)
    ]);

    res.json({
      ok: true,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { channel: 'unknown', error: r.reason.message })
    });
  } catch (error) { next(error); }
});

app.put('/api/admin/site', requireAdmin, async (req, res, next) => {
  try {
    await writeJson('data/site.json', req.body, 'Update site settings');
    res.json({ ok: true });
  } catch (error) { next(error); }
});


app.post('/api/admin/uploads', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    if (!String(req.file.mimetype || '').startsWith('image/')) return res.status(400).json({ error: 'Можно загружать только изображения' });
    const ext = extFromMime(req.file.mimetype, req.file.originalname);
    const baseName = slugify(path.basename(req.file.originalname, path.extname(req.file.originalname)) || 'site-image');
    const fileName = `${baseName}-${Date.now()}${ext}`;
    const filePath = `public/uploads/${fileName}`;
    await writeBinary(filePath, req.file.buffer, `Upload site image ${fileName}`);
    res.json({ ok: true, url: `/uploads/${fileName}` });
  } catch (error) { next(error); }
});

app.post('/api/admin/products', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const fields = req.body;
    const products = await readJson('data/products.json', []);
    const id = fields.id ? slugify(fields.id) : slugify(fields.name);
    const existingIndex = products.findIndex(product => product.id === id);
    const existing = existingIndex >= 0 ? products[existingIndex] : {};
    let image = existing.image || '';

    if (req.file) {
      const ext = extFromMime(req.file.mimetype, req.file.originalname);
      const fileName = `${id}-${Date.now()}${ext}`;
      const filePath = `public/uploads/${fileName}`;
      await writeBinary(filePath, req.file.buffer, `Upload image for ${id}`);
      image = `/uploads/${fileName}`;
    }

    const product = {
      id,
      name: String(fields.name || existing.name || '').trim(),
      category: String(fields.category || existing.category || 'Все виды мяса').trim(),
      price: Number(fields.price || existing.price || 0),
      unit: String(fields.unit || existing.unit || 'кг').trim(),
      image,
      description: String(fields.description || existing.description || '').trim(),
      popular: fields.popular === 'true' || fields.popular === 'on' || fields.popular === true,
      nutrition: {
        calories: String(fields.calories || existing.nutrition?.calories || '').trim(),
        protein: String(fields.protein || existing.nutrition?.protein || '').trim(),
        fat: String(fields.fat || existing.nutrition?.fat || '').trim(),
        carbs: String(fields.carbs || existing.nutrition?.carbs || '').trim()
      },
      services: String(fields.services || existing.services?.join(', ') || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
      stock: fields.stock === undefined ? true : (fields.stock === 'true' || fields.stock === 'on' || fields.stock === true)
    };

    if (!product.name) return res.status(400).json({ error: 'Название товара обязательно' });
    if (!product.price) return res.status(400).json({ error: 'Цена товара обязательна' });

    if (existingIndex >= 0) products[existingIndex] = product;
    else products.unshift(product);
    await writeJson('data/products.json', products, `Save product ${product.id}`);
    res.json({ ok: true, product });
  } catch (error) { next(error); }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const products = await readJson('data/products.json', []);
    const nextProducts = products.filter(product => product.id !== req.params.id);
    await writeJson('data/products.json', nextProducts, `Delete product ${req.params.id}`);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`Meat shop is running: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
  console.log(`Data driver: ${DATA_DRIVER}`);
});
