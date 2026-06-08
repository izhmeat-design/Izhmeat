const state = {
  site: {},
  products: [],
  category: 'Все',
  search: '',
  cart: JSON.parse(localStorage.getItem('meat-shop-cart') || '{}')
};

const money = value => `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} руб`;
const fallbackImage = product => product.fallbackImage || product.localImage || 'uploads/product-beef.svg';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const DEFAULT_TELEGRAM_WORKER_URL = 'https://lavka-orders-telegram.izhmeat.workers.dev';

async function getJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить данные');
  return response.json();
}

function saveCart() {
  localStorage.setItem('meat-shop-cart', JSON.stringify(state.cart));
  renderCartBadge();
}

function orderDateKey(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function nextLocalOrderId() {
  const key = `lavka-order-seq-${orderDateKey()}`;
  const next = Number(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, String(next));
  return `${orderDateKey()}-${next}`;
}


function renderSectionThemes(site) {
  const allowedThemes = ['default', 'light', 'warm', 'cream', 'dark', 'accent'];
  $$('[data-section-key]').forEach(section => {
    allowedThemes.forEach(theme => section.classList.remove(`section-theme-${theme}`));
    const key = section.dataset.sectionKey;
    const theme = site.sectionThemes?.[key] || 'default';
    section.classList.add(`section-theme-${allowedThemes.includes(theme) ? theme : 'default'}`);
  });
}


function renderHeroPills(site) {
  const root = $('[data-hero-pills]');
  if (!root) return;
  const pills = (site.heroPills || []).filter(item => item && item.enabled !== false);
  root.innerHTML = pills.map(item => `
    <div class="mascot-pill">
      <img src="${escapeHtml(item.image || 'uploads/product-beef.svg')}" alt="${escapeHtml(item.title || '')}" loading="lazy" />
      <div><strong>${escapeHtml(item.title || '')}</strong><span>${escapeHtml(item.text || '')}</span></div>
    </div>
  `).join('');
}

function renderQualitySection(site) {
  const section = site.qualitySection || {};
  $$('[data-quality]').forEach(node => {
    const key = node.dataset.quality;
    if (section[key] !== undefined) node.textContent = section[key];
  });
  const root = $('[data-quality-cards]');
  if (!root) return;
  const cards = (section.cards || []).filter(item => item && item.enabled !== false);
  root.innerHTML = cards.map((card, index) => `
    <article class="character-card ${['character-card--soft','character-card--warm','character-card--gold'][index % 3]}">
      <div class="character-card__image-wrap">
        <img src="${escapeHtml(card.image || 'uploads/product-beef.svg')}" alt="${escapeHtml(card.title || '')}" loading="lazy" />
      </div>
      <div class="character-card__body">
        ${card.tag ? `<span class="character-card__tag">${escapeHtml(card.tag)}</span>` : ''}
        ${card.title ? `<h3>${escapeHtml(card.title)}</h3>` : ''}
        ${card.text ? `<p>${escapeHtml(card.text)}</p>` : ''}
      </div>
    </article>
  `).join('');
}

function renderCatalogSection(site) {
  const section = site.catalogSection || {};
  $$('[data-catalog]').forEach(node => {
    const key = node.dataset.catalog;
    if (section[key] !== undefined) node.textContent = section[key];
  });
  const input = $('[data-search]');
  if (input && section.searchPlaceholder) input.placeholder = section.searchPlaceholder;
}

function renderEditableSection(prefix, section) {
  $$(`[data-${prefix}]`).forEach(node => {
    const key = node.dataset[prefix.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    if (section && section[key] !== undefined) node.textContent = section[key];
  });
}

function getCategoryImage(category) {
  const tile = (state.site.categoryTiles || []).find(item => item.category === category || item.title === category);
  if (tile?.image) return tile.image;
  const product = state.products.find(item => item.category === category && (item.image || item.localImage || item.fallbackImage));
  return product?.image || product?.localImage || product?.fallbackImage || 'uploads/product-beef.svg';
}

function categoryProductCount(category) {
  return state.products.filter(item => item.category === category && item.stock !== false).length;
}

function renderCategoryTiles(site) {
  const root = $('[data-category-tiles]');
  if (!root) return;
  const existingCategories = categories().filter(category => category !== 'Все');
  const fromSite = (site.categoryTiles || []).filter(item => item && item.title);
  const fromProducts = existingCategories
    .filter(category => !fromSite.some(item => item.category === category || item.title === category))
    .map(category => ({ title: category, category, image: getCategoryImage(category), text: `${categoryProductCount(category)} позиций` }));

  const tiles = [...fromSite, ...fromProducts].filter(item => item.enabled !== false);
  root.innerHTML = tiles.map(tile => {
    const category = tile.category || tile.title;
    const count = categoryProductCount(category);
    return `
      <button class="category-tile" type="button" data-category-tile="${escapeHtml(category)}">
        <img src="${escapeHtml(tile.image || getCategoryImage(category))}" alt="${escapeHtml(tile.title)}" loading="lazy" />
        <span class="category-tile__content">
          <strong>${escapeHtml(tile.title || category)}</strong>
          <small>${escapeHtml(tile.text || `${count} позиций`)}</small>
          <em>${count || 'перейти'}</em>
        </span>
      </button>
    `;
  }).join('');

  root.querySelectorAll('[data-category-tile]').forEach(button => {
    button.addEventListener('click', () => {
      state.category = button.dataset.categoryTile;
      renderCategories();
      renderProducts();
      document.querySelector('#catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  renderEditableSection('category-section', site.categorySection || {});
}

function createProductCard(product, options = {}) {
  const template = $('#product-card-template');
  const node = template.content.cloneNode(true);
  const img = node.querySelector('img');
  img.src = product.image || fallbackImage(product);
  img.onerror = () => { img.onerror = null; img.src = fallbackImage(product); };
  img.alt = product.name;
  node.querySelector('.product-card__category').textContent = product.category;
  node.querySelector('h3').textContent = product.name;
  node.querySelector('.product-card__desc').textContent = product.description || '';
  node.querySelector('.product-card__price').textContent = `${money(product.price)}/${product.unit}`;
  const mark = node.querySelector('.product-card__mark');
  mark.textContent = product.dayLabel || (product.popular ? 'хит' : 'свежее');
  if (product.popular || options.daily) mark.classList.add('product-card__mark--hit');
  node.querySelector('[data-add]').addEventListener('click', () => addToCart(product.id));
  node.querySelector('[data-product-open]').addEventListener('click', () => openProduct(product));
  return node;
}

function renderDailyProducts(site) {
  const root = $('[data-daily-products]');
  if (!root) return;
  const popular = state.products.filter(product => product.stock !== false && product.popular).slice(0, 8);
  const products = popular.length ? popular : state.products.filter(product => product.stock !== false).slice(0, 6);
  root.innerHTML = '';
  products.forEach(product => root.appendChild(createProductCard(product, { daily: true })));
  renderEditableSection('daily-section', site.dailyProductsSection || {});
}

function renderMeatGuide(site) {
  const root = $('[data-meat-guide]');
  if (!root) return;
  const items = (site.meatGuide || []).filter(item => item && item.enabled !== false);
  root.innerHTML = items.map((item, index) => `
    <article class="guide-card">
      <span>${escapeHtml(item.tag || `совет ${index + 1}`)}</span>
      <h3>${escapeHtml(item.title || '')}</h3>
      <p>${escapeHtml(item.text || '')}</p>
    </article>
  `).join('');
  renderEditableSection('meat-guide-section', site.meatGuideSection || {});
}

function renderOrderSteps(site) {
  const root = $('[data-order-steps]');
  if (!root) return;
  const steps = (site.orderSteps || []).filter(item => item && item.enabled !== false);
  root.innerHTML = steps.map((step, index) => `
    <article class="order-step">
      <b>${index + 1}</b>
      <h3>${escapeHtml(step.title || '')}</h3>
      <p>${escapeHtml(step.text || '')}</p>
    </article>
  `).join('');
  renderEditableSection('order-section', site.orderSection || {});
}

function renderDeliveryServices(site) {
  const root = $('[data-delivery-services]');
  if (!root) return;
  const services = (site.deliveryServices || []).filter(item => item && item.enabled !== false);
  root.innerHTML = services.map(item => `
    <article class="service-panel">
      <strong>${escapeHtml(item.title || '')}</strong>
      <span>${escapeHtml(item.text || '')}</span>
    </article>
  `).join('');
}

function renderSiteBlocks(site) {
  const root = $('[data-site-blocks]');
  if (!root) return;
  const blocks = (site.siteBlocks || []).filter(block => block && block.enabled !== false && (block.title || block.text || block.image));
  root.innerHTML = blocks.map(block => {
    const theme = block.theme === 'dark' ? 'section--dark' : (block.theme === 'warm' ? 'section--warm' : '');
    const reverse = block.layout === 'image-left' ? ' site-block__grid--reverse' : '';
    const image = block.image ? `<div class="site-block__media"><img src="${escapeHtml(block.image)}" alt="${escapeHtml(block.title || 'Фото блока')}" loading="lazy"></div>` : '';
    return `
      <section class="section site-block ${theme}">
        <div class="container site-block__grid${reverse}">
          <div class="site-block__content">
            ${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ''}
            ${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ''}
            ${block.text ? `<p>${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>` : ''}
          </div>
          ${image}
        </div>
      </section>
    `;
  }).join('');
}

function renderSite() {
  const site = state.site;
  document.title = `${site.brand || 'Мясная лавка'} — интернет-магазин`;
  $$('[data-site]').forEach(node => {
    const key = node.dataset.site;
    if (site[key] !== undefined) node.textContent = site[key];
    if (node.tagName === 'A' && key === 'phone') node.href = `tel:${String(site[key]).replace(/[^+\d]/g, '')}`;
    if (node.tagName === 'A' && key === 'email') node.href = `mailto:${site[key]}`;
  });
  $$('[data-site-image]').forEach(node => {
    const key = node.dataset.siteImage;
    if (site[key]) node.src = site[key];
  });
  $$('[data-about]').forEach(node => {
    const key = node.dataset.about;
    if (site.aboutSection?.[key] !== undefined) node.textContent = site.aboutSection[key];
  });
  $$('[data-delivery-section]').forEach(node => {
    const key = node.dataset.deliverySection;
    if (site.deliverySection?.[key] !== undefined) node.textContent = site.deliverySection[key];
  });

  $('[data-benefits]').innerHTML = (site.benefits || []).map((benefit, index) => `<div class="benefit"><span>${index + 1}</span>${escapeHtml(benefit)}</div>`).join('');
  const delivery = site.delivery || {};
  $('[data-delivery="city"]').textContent = delivery.city || '';
  $('[data-delivery="price"]').textContent = delivery.freeFrom ? `До ${money(delivery.freeFrom)} — ${money(delivery.price)}, выше — бесплатно` : '';
  $('[data-delivery="suburb"]').textContent = delivery.suburb || '';
  $('[data-delivery="note"]').textContent = delivery.note || '';
  $('[data-payment]').innerHTML = (site.payment || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  $('[data-addresses]').innerHTML = (site.addresses || []).map(item => `<p>${escapeHtml(item)}</p>`).join('');

  renderHeroPills(site);
  renderQualitySection(site);
  renderCatalogSection(site);
  renderDeliveryServices(site);
  renderSiteBlocks(site);
  renderSectionThemes(site);
}

function categories() {
  return ['Все', ...new Set(state.products.map(product => product.category).filter(Boolean))];
}

function renderCategories() {
  const root = $('[data-categories]');
  root.innerHTML = categories().map(category => `<button class="chip ${category === state.category ? 'is-active' : ''}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
  root.querySelectorAll('[data-category]').forEach(button => {
    button.addEventListener('click', () => {
      state.category = button.dataset.category;
      renderCategories();
      renderProducts();
    });
  });
}

function filteredProducts() {
  const query = state.search.trim().toLowerCase();
  return state.products.filter(product => {
    const byCategory = state.category === 'Все' || product.category === state.category;
    const bySearch = !query || [product.name, product.category, product.description].join(' ').toLowerCase().includes(query);
    return byCategory && bySearch && product.stock !== false;
  });
}

function renderProducts() {
  const root = $('[data-products]');
  root.innerHTML = '';
  const products = filteredProducts();
  if (!products.length) {
    root.innerHTML = '<p>Товары не найдены. Попробуйте изменить категорию или запрос.</p>';
    return;
  }
  products.forEach(product => root.appendChild(createProductCard(product)));
}

function openProduct(product) {
  const nutrition = product.nutrition || {};
  const services = (product.services || []).map(item => `<span>${escapeHtml(item)}</span>`).join('') || '<span>По согласованию</span>';
  $('[data-product-content]').innerHTML = `
    <div class="product-detail">
      <img src="${escapeHtml(product.image || fallbackImage(product))}" onerror="this.onerror=null;this.src='${escapeHtml(fallbackImage(product))}';" alt="${escapeHtml(product.name)}">
      <div>
        <p class="eyebrow">${escapeHtml(product.category)}</p>
        <h2>${escapeHtml(product.name)}</h2>
        <div class="product-detail__price">${money(product.price)}/${escapeHtml(product.unit)}</div>
        <p>${escapeHtml(product.description || '')}</p>
        <div class="meta-grid">
          <div><small>Ккал</small><strong>${escapeHtml(nutrition.calories || '—')}</strong></div>
          <div><small>Белки</small><strong>${escapeHtml(nutrition.protein || '—')}</strong></div>
          <div><small>Жиры</small><strong>${escapeHtml(nutrition.fat || '—')}</strong></div>
          <div><small>Углеводы</small><strong>${escapeHtml(nutrition.carbs || '—')}</strong></div>
        </div>
        <h3>Бесплатные доп. услуги</h3>
        <div class="service-list">${services}</div>
        <br>
        <button class="button button--primary" data-modal-add type="button">Добавить в корзину</button>
      </div>
    </div>
  `;
  $('[data-modal-add]').addEventListener('click', () => {
    addToCart(product.id);
    $('[data-product-dialog]').close();
    openCart();
  });
  $('[data-product-dialog]').showModal();
}

function addToCart(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  state.cart[id] = Number(state.cart[id] || 0) + 1;
  saveCart();
}

function cartItems() {
  return Object.entries(state.cart)
    .map(([id, qty]) => ({ ...state.products.find(product => product.id === id), qty }))
    .filter(item => item.id && item.qty > 0);
}

function renderCartBadge() {
  const count = Object.values(state.cart).reduce((sum, qty) => sum + Number(qty || 0), 0);
  $$('[data-cart-count]').forEach(node => {
    node.textContent = count.toFixed(count % 1 ? 1 : 0);
  });
}

function renderCart() {
  const root = $('[data-cart-items]');
  const items = cartItems();
  if (!items.length) {
    root.innerHTML = '<p>Корзина пока пуста.</p>';
    $('[data-cart-total]').textContent = money(0);
    return;
  }
  root.innerHTML = items.map(item => `
    <div class="cart-item" data-cart-item="${escapeHtml(item.id)}">
      <div><strong>${escapeHtml(item.name)}</strong><br><small>${money(item.price)}/${escapeHtml(item.unit)}</small></div>
      <div class="cart-item__controls">
        <input type="number" min="0" step="${item.unit === 'кг' ? '0.1' : '1'}" value="${item.qty}" aria-label="Количество ${escapeHtml(item.name)}">
        <span>${escapeHtml(item.unit)}</span>
        <button class="icon-button" type="button" aria-label="Удалить">×</button>
      </div>
    </div>
  `).join('');
  root.querySelectorAll('[data-cart-item]').forEach(row => {
    const id = row.dataset.cartItem;
    row.querySelector('input').addEventListener('change', event => {
      const value = Number(event.target.value);
      if (value <= 0) delete state.cart[id];
      else state.cart[id] = value;
      saveCart();
      renderCart();
    });
    row.querySelector('button').addEventListener('click', () => {
      delete state.cart[id];
      saveCart();
      renderCart();
    });
  });
  const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
  $('[data-cart-total]').textContent = money(total);
}

function openCart() {
  renderCart();
  $('[data-cart-dialog]').showModal();
}

function formatOrderText(orderId, customer, items) {
  const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
  return [
    `Новый заказ №${orderId}`,
    `Клиент: ${customer.name}`,
    `Телефон: ${customer.phone}`,
    customer.address ? `Адрес: ${customer.address}` : '',
    customer.comment ? `Комментарий: ${customer.comment}` : '',
    '',
    'Состав заказа:',
    ...items.map(item => `• ${item.name} — ${item.qty} ${item.unit}, ${money(item.price)}/${item.unit}, сумма ~ ${money(item.price * item.qty)}`),
    '',
    `Итого ориентировочно: ${money(total)}`
  ].filter(Boolean).join('\n');
}

async function submitOrder(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const message = $('[data-order-message]');
  const submitButton = formElement.querySelector('button[type="submit"]');
  const items = cartItems();

  if (!items.length) {
    message.textContent = 'Добавьте товары в корзину.';
    return;
  }

  const form = new FormData(formElement);
  const customer = {
    name: form.get('name'),
    phone: form.get('phone'),
    address: form.get('address'),
    comment: form.get('comment')
  };

  const fallbackOrderId = nextLocalOrderId();
  const workerUrl = String(state.site.telegramWorkerUrl || DEFAULT_TELEGRAM_WORKER_URL || '').trim();
  const orderText = formatOrderText(fallbackOrderId, customer, items);
  const payload = {
    orderId: fallbackOrderId,
    customer,
    items: items.map(item => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      unit: item.unit,
      qty: Number(item.qty)
    })),
    total: items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0),
    source: location.href
  };

  if (submitButton) submitButton.disabled = true;
  message.textContent = 'Отправляем заказ...';

  try {
    if (workerUrl) {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || 'Cloudflare Worker не принял заказ');
      }

      const finalOrderId = data.orderId || fallbackOrderId;
      state.cart = {};
      saveCart();
      renderCart();
      formElement.reset();
      message.textContent = `Заказ №${finalOrderId} отправлен и принят в обработку. Спасибо за заказ.`;
      return;
    }

    const mailTo = state.site.email || 'izhmeat@gmail.com';
    const mailUrl = `mailto:${encodeURIComponent(mailTo)}?subject=${encodeURIComponent(`Заказ №${fallbackOrderId}`)}&body=${encodeURIComponent(orderText)}`;
    try { await navigator.clipboard?.writeText(orderText).catch(() => {}); } catch {}
    window.location.href = mailUrl;

    state.cart = {};
    saveCart();
    renderCart();
    formElement.reset();
    message.textContent = `Заказ №${fallbackOrderId} сформирован. Текст заказа скопирован, письмо открыто для отправки. Спасибо за заказ.`;
  } catch (error) {
    message.textContent = `Не удалось отправить заказ: ${error.message}`;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function init() {
  try {
    const [site, products] = await Promise.all([getJson('data/site.json'), getJson('data/products.json')]);
    state.site = site;
    state.products = products;
    renderSite();
    renderCategories();
    renderCategoryTiles(site);
    renderDailyProducts(site);
    renderMeatGuide(site);
    renderOrderSteps(site);
    renderProducts();
    renderCartBadge();
  } catch (error) {
    document.body.insertAdjacentHTML('afterbegin', `<div class="container" style="padding: 16px; color: #9d221c; font-weight: 800;">${escapeHtml(error.message)}</div>`);
  }

  $('[data-search]').addEventListener('input', event => {
    state.search = event.target.value;
    renderProducts();
  });
  $$('[data-open-cart]').forEach(button => button.addEventListener('click', openCart));
  $('[data-close-cart]').addEventListener('click', () => $('[data-cart-dialog]').close());
  $('[data-product-close]').addEventListener('click', () => $('[data-product-dialog]').close());
  $('[data-order-form]').addEventListener('submit', submitOrder);
}

init();
