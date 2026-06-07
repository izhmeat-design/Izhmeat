export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, corsHeaders);
    }

    try {
      const body = await request.json();
      const orderId = await makeOrderId(env, body.orderId);
      const text = formatOrder(orderId, body);

      const telegramResponse = await sendTelegram(env, text);

      return json({
        ok: true,
        orderId,
        telegram: telegramResponse
      }, 200, corsHeaders);
    } catch (error) {
      return json({
        ok: false,
        error: error.message || 'Unknown error'
      }, 400, corsHeaders);
    }
  }
};

function buildCorsHeaders(request, env) {
  const requestOrigin = request.headers.get('Origin') || '*';
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  const origin = allowedOrigin === '*' ? requestOrigin : allowedOrigin;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function dateKey(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function makeOrderId(env, fallbackOrderId) {
  const key = dateKey();

  // Optional KV binding. Create KV namespace and bind it as ORDER_COUNTERS
  // if you want one common daily counter for all clients.
  if (env.ORDER_COUNTERS) {
    const current = Number(await env.ORDER_COUNTERS.get(key) || '0');
    const next = current + 1;
    await env.ORDER_COUNTERS.put(key, String(next));
    return `${key}-${next}`;
  }

  return fallbackOrderId || `${key}-${Date.now()}`;
}

function money(value) {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} руб`;
}

function formatOrder(orderId, body) {
  const customer = body.customer || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const total = body.total ?? items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

  return [
    `🥩 Новый заказ №${orderId}`,
    '',
    `👤 Клиент: ${customer.name || 'не указано'}`,
    `📞 Телефон: ${customer.phone || 'не указано'}`,
    customer.address ? `📍 Адрес: ${customer.address}` : '',
    customer.comment ? `💬 Комментарий: ${customer.comment}` : '',
    '',
    '🛒 Состав заказа:',
    ...items.map(item => `• ${item.name} — ${item.qty} ${item.unit || ''}, ${money(Number(item.price || 0) * Number(item.qty || 0))}`),
    '',
    `Итого ориентировочно: ${money(total)}`,
    body.source ? `Источник: ${body.source}` : ''
  ].filter(Boolean).join('\n');
}

async function sendTelegram(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан в Cloudflare Worker Secrets');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID не задан в Cloudflare Worker Variables');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram HTTP ${response.status}`);
  }

  return { sent: true };
}
