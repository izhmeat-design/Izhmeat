const state = {
  site: {},
  products: [],
  category: 'Все',
  search: '',
  cart: JSON.parse(localStorage.getItem('meat-shop-cart') || '{}')
};

const money = value => `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} руб`;
const fallbackImage = product => product.fallbackImage || product.localImage || '/uploads/product-beef.svg';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить данные');
  return response.json();
}

function saveCart() {
  localStorage.setItem('meat-shop-cart', JSON.stringify(state.cart));
  renderCartBadge();
}

function renderHeroPills(site) {
  const root = $('[data-hero-pills]');
  if (!root) return;
  const pills = (site.heroPills || []).filter(item => item && item.enabled !== false);
  root.innerHTML = pills.map(item => `
    <div class="mascot-pill">
      <img src="${escapeHtml(item.image || '/uploads/product-beef.svg')}" alt="${escapeHtml(item.title || '')}" loading="lazy" />
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
        <img src="${escapeHtml(card.image || '/uploads/product-beef.svg')}" alt="${escapeHtml(card.title || '')}" loading="lazy" />
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

  const benefits = $('[data-benefits]');
  benefits.innerHTML = (site.benefits || []).map((benefit, index) => `<div class="benefit"><span>${index + 1}</span>${escapeHtml(benefit)}</div>`).join('');
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
  const template = $('#product-card-template');
  root.innerHTML = '';
  const products = filteredProducts();
  if (!products.length) {
    root.innerHTML = '<p>Товары не найдены. Попробуйте изменить категорию или запрос.</p>';
    return;
  }
  products.forEach(product => {
    const node = template.content.cloneNode(true);
    const img = node.querySelector('img');
    img.src = product.image || fallbackImage(product);
    img.onerror = () => { img.onerror = null; img.src = fallbackImage(product); };
    img.alt = product.name;
    node.querySelector('.product-card__category').textContent = product.category;
    node.querySelector('h3').textContent = product.name;
    node.querySelector('.product-card__desc').textContent = product.description || '';
    node.querySelector('.product-card__price').textContent = `${money(product.price)}/${product.unit}`;
    node.querySelector('[data-add]').addEventListener('click', () => addToCart(product.id));
    node.querySelector('[data-product-open]').addEventListener('click', () => openProduct(product));
    root.appendChild(node);
  });
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
  $('[data-cart-count]').textContent = count.toFixed(count % 1 ? 1 : 0);
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
  const body = {
    customer: {
      name: form.get('name'),
      phone: form.get('phone'),
      address: form.get('address'),
      comment: form.get('comment')
    },
    items: items.map(item => ({ id: item.id, qty: item.qty }))
  };

  message.textContent = 'Отправляем заказ...';
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();

    if (!response.ok) {
      message.textContent = (data.errors || [data.error || 'Ошибка отправки']).join(', ');
      return;
    }

    state.cart = {};
    saveCart();
    renderCart();
    formElement.reset();
    message.textContent = `Заказ №${data.orderId} отправлен и принят в обработку. Спасибо за заказ.`;
  } catch (error) {
    message.textContent = 'Не удалось отправить заказ. Проверьте соединение и попробуйте ещё раз.';
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function init() {
  try {
    const [site, products] = await Promise.all([getJson('/api/site'), getJson('/api/products')]);
    state.site = site;
    state.products = products;
    renderSite();
    renderCategories();
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
