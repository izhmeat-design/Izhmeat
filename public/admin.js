const adminState = { products: [], orders: [], site: {}, status: {} };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} руб`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || (data.errors || []).join(', ') || 'Ошибка запроса');
  return data;
}

function linesToArray(value) {
  return String(value || '').split('\n').map(item => item.trim()).filter(Boolean);
}

function arrayToLines(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function uid(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeSite(site = {}) {
  return {
    ...site,
    addresses: Array.isArray(site.addresses) ? site.addresses : [],
    benefits: Array.isArray(site.benefits) ? site.benefits : [],
    payment: Array.isArray(site.payment) ? site.payment : [],
    delivery: site.delivery || {},
    deliverySection: site.deliverySection || {},
    aboutSection: site.aboutSection || {},
    catalogSection: site.catalogSection || {},
    qualitySection: {
      ...(site.qualitySection || {}),
      cards: Array.isArray(site.qualitySection?.cards) ? site.qualitySection.cards : []
    },
    heroPills: Array.isArray(site.heroPills) ? site.heroPills : [],
    deliveryServices: Array.isArray(site.deliveryServices) ? site.deliveryServices : [],
    siteBlocks: Array.isArray(site.siteBlocks) ? site.siteBlocks : []
  };
}

async function checkStatus() {
  const status = await api('/api/admin/status');
  adminState.status = status;
  $('[data-data-driver]').textContent = status.dataDriver;
  $('[data-login-screen]').classList.toggle('hidden', status.loggedIn);
  $('[data-admin-screen]').classList.toggle('hidden', !status.loggedIn);
  if (status.loggedIn) await loadAdminData();
}

function switchTab(name) {
  $$('[data-admin-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.adminTab === name));
  $$('[data-admin-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.adminPanel !== name));
}

function categoryOptions() {
  return [...new Set(adminState.products.map(item => item.category).filter(Boolean))].sort();
}

function renderCategorySelect() {
  const select = $('[data-category-select]');
  const cats = categoryOptions();
  select.innerHTML = cats.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('') || '<option value="Все виды мяса">Все виды мяса</option>';
}

async function loadAdminData() {
  const [products, orders, site] = await Promise.all([
    api('/api/products'),
    api('/api/admin/orders'),
    api('/api/site')
  ]);
  adminState.products = products;
  adminState.orders = orders;
  adminState.site = normalizeSite(site);
  renderCategorySelect();
  renderProducts();
  renderOrders(orders);
  renderSiteForm();
  renderFocusedScreenshotSections();
  renderContentLists();
  renderJsonEditor();
}

function renderProducts() {
  const root = $('[data-admin-products]');
  if (!adminState.products.length) {
    root.innerHTML = '<p class="muted">Товаров пока нет.</p>';
    return;
  }
  root.innerHTML = adminState.products.map(product => `
    <article class="admin-product" data-id="${escapeHtml(product.id)}">
      <img src="${escapeHtml(product.image || '/uploads/product-beef.svg')}" alt="${escapeHtml(product.name)}">
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.category)} • ${money(product.price)}/${escapeHtml(product.unit)} • ${product.stock === false ? 'нет в наличии' : 'в наличии'}</p>
      </div>
      <div class="admin-actions">
        <button class="button button--light" data-edit type="button">Изменить</button>
        <button class="button danger" data-delete type="button">Удалить</button>
      </div>
    </article>
  `).join('');
  root.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editProduct(button.closest('[data-id]').dataset.id)));
  root.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deleteProduct(button.closest('[data-id]').dataset.id)));
}

function renderOrders(orders) {
  const root = $('[data-orders]');
  if (!orders.length) {
    root.innerHTML = '<p class="muted">Заказов пока нет.</p>';
    return;
  }
  root.innerHTML = orders.slice(0, 8).map(order => `
    <article class="admin-product" style="grid-template-columns:1fr;">
      <div>
        <h3>Заказ №${escapeHtml(order.id)}</h3>
        <p>${new Date(order.createdAt).toLocaleString('ru-RU')} • ${escapeHtml(order.customer.name)} • ${escapeHtml(order.customer.phone)}</p>
        <pre>${escapeHtml(order.items.map(item => `${item.name} — ${item.qty} ${item.unit}`).join('\n'))}\nИтого ~ ${money(order.total)}</pre>
      </div>
    </article>
  `).join('');
}

function editProduct(id) {
  const product = adminState.products.find(item => item.id === id);
  if (!product) return;
  switchTab('products');
  const form = $('[data-product-form]');
  form.id.value = product.id;
  form.name.value = product.name;
  form.category.value = product.category;
  form.newCategory.value = '';
  form.price.value = product.price;
  form.unit.value = product.unit;
  form.description.value = product.description || '';
  form.services.value = (product.services || []).join(', ');
  form.calories.value = product.nutrition?.calories || '';
  form.protein.value = product.nutrition?.protein || '';
  form.fat.value = product.nutrition?.fat || '';
  form.carbs.value = product.nutrition?.carbs || '';
  form.popular.checked = Boolean(product.popular);
  form.stock.checked = product.stock !== false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
  if (!confirm('Удалить товар?')) return;
  await api(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadAdminData();
}

function resetProductForm() {
  const form = $('[data-product-form]');
  form.reset();
  form.id.value = '';
  form.stock.checked = true;
  $('[data-product-message]').textContent = '';
}

async function submitProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  if (data.get('newCategory')) data.set('category', data.get('newCategory'));
  data.set('popular', form.popular.checked ? 'true' : 'false');
  data.set('stock', form.stock.checked ? 'true' : 'false');
  $('[data-product-message]').textContent = 'Сохраняем...';
  try {
    await api('/api/admin/products', { method: 'POST', body: data });
    $('[data-product-message]').textContent = 'Товар сохранён.';
    resetProductForm();
    await loadAdminData();
  } catch (error) {
    $('[data-product-message]').textContent = error.message;
  }
}

async function uploadImage(file) {
  if (!file || !file.size) return '';
  const data = new FormData();
  data.append('image', file);
  const result = await api('/api/admin/uploads', { method: 'POST', body: data });
  return result.url || '';
}

function renderSiteForm() {
  const form = $('[data-site-form]');
  const site = adminState.site;
  const delivery = site.delivery || {};
  const deliverySection = site.deliverySection || {};
  const catalog = site.catalogSection || {};
  const quality = site.qualitySection || {};
  const about = site.aboutSection || {};
  form.brand.value = site.brand || '';
  form.tagline.value = site.tagline || '';
  form.heroTitle.value = site.heroTitle || '';
  form.heroText.value = site.heroText || '';
  form.heroBadgeLabel.value = site.heroBadgeLabel || '';
  form.heroBadgeText.value = site.heroBadgeText || '';
  form.heroStampText.value = site.heroStampText || '';
  form.heroImage.value = site.heroImage || '';
  form.phone.value = site.phone || '';
  form.email.value = site.email || '';
  form.workTime.value = site.workTime || '';
  form.footerText.value = site.footerText || '';
  form.catalogEyebrow.value = catalog.eyebrow || '';
  form.catalogTitle.value = catalog.title || '';
  form.catalogSearchLabel.value = catalog.searchLabel || '';
  form.catalogSearchPlaceholder.value = catalog.searchPlaceholder || '';
  form.qualityEyebrow.value = quality.eyebrow || '';
  form.qualityTitle.value = quality.title || '';
  form.qualityLead.value = quality.lead || '';
  form.deliverySectionEyebrow.value = deliverySection.eyebrow || '';
  form.deliverySectionTitle.value = deliverySection.title || '';
  form.deliveryTime.value = site.deliveryTime || '';
  form.deliveryImage.value = site.deliveryImage || '';
  form.deliveryCity.value = delivery.city || '';
  form.deliveryPrice.value = delivery.price || 0;
  form.deliveryFreeFrom.value = delivery.freeFrom || 0;
  form.deliverySuburb.value = delivery.suburb || '';
  form.deliveryNote.value = delivery.note || '';
  form.aboutEyebrow.value = about.eyebrow || '';
  form.aboutTitle.value = about.title || '';
  form.about.value = site.about || '';
  form.addresses.value = arrayToLines(site.addresses);
  form.benefits.value = arrayToLines(site.benefits);
  form.payment.value = arrayToLines(site.payment);
}

async function collectSiteFromForm(form) {
  const data = new FormData(form);
  const heroImage = form.heroImageFile.files[0] ? await uploadImage(form.heroImageFile.files[0]) : form.heroImage.value;
  const deliveryImage = form.deliveryImageFile.files[0] ? await uploadImage(form.deliveryImageFile.files[0]) : form.deliveryImage.value;

  return normalizeSite({
    ...adminState.site,
    brand: String(data.get('brand') || '').trim(),
    tagline: String(data.get('tagline') || '').trim(),
    heroTitle: String(data.get('heroTitle') || '').trim(),
    heroText: String(data.get('heroText') || '').trim(),
    heroBadgeLabel: String(data.get('heroBadgeLabel') || '').trim(),
    heroBadgeText: String(data.get('heroBadgeText') || '').trim(),
    heroStampText: String(data.get('heroStampText') || '').trim(),
    heroImage,
    phone: String(data.get('phone') || '').trim(),
    email: String(data.get('email') || '').trim(),
    workTime: String(data.get('workTime') || '').trim(),
    footerText: String(data.get('footerText') || '').trim(),
    catalogSection: {
      eyebrow: String(data.get('catalogEyebrow') || '').trim(),
      title: String(data.get('catalogTitle') || '').trim(),
      searchLabel: String(data.get('catalogSearchLabel') || '').trim(),
      searchPlaceholder: String(data.get('catalogSearchPlaceholder') || '').trim()
    },
    qualitySection: {
      ...(adminState.site.qualitySection || {}),
      eyebrow: String(data.get('qualityEyebrow') || '').trim(),
      title: String(data.get('qualityTitle') || '').trim(),
      lead: String(data.get('qualityLead') || '').trim(),
      cards: adminState.site.qualitySection?.cards || []
    },
    deliverySection: {
      eyebrow: String(data.get('deliverySectionEyebrow') || '').trim(),
      title: String(data.get('deliverySectionTitle') || '').trim()
    },
    deliveryTime: String(data.get('deliveryTime') || '').trim(),
    deliveryImage,
    delivery: {
      city: String(data.get('deliveryCity') || '').trim(),
      price: Number(data.get('deliveryPrice') || 0),
      freeFrom: Number(data.get('deliveryFreeFrom') || 0),
      suburb: String(data.get('deliverySuburb') || '').trim(),
      note: String(data.get('deliveryNote') || '').trim()
    },
    aboutSection: {
      eyebrow: String(data.get('aboutEyebrow') || '').trim(),
      title: String(data.get('aboutTitle') || '').trim()
    },
    about: String(data.get('about') || '').trim(),
    addresses: linesToArray(data.get('addresses')),
    benefits: linesToArray(data.get('benefits')),
    payment: linesToArray(data.get('payment'))
  });
}

async function saveSite(site, messageNode) {
  const saved = normalizeSite(site);
  await api('/api/admin/site', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saved)
  });
  adminState.site = saved;
  renderSiteForm();
  renderFocusedScreenshotSections();
  renderContentLists();
  renderJsonEditor();
  if (messageNode) messageNode.textContent = 'Сохранено.';
}

async function submitSite(event) {
  event.preventDefault();
  const message = $('[data-site-message]');
  message.textContent = 'Сохраняем...';
  try {
    await saveSite(await collectSiteFromForm(event.currentTarget), message);
  } catch (error) {
    message.textContent = error.message;
  }
}

function areaItems(area) {
  if (area === 'heroPills') return adminState.site.heroPills || [];
  if (area === 'qualityCards') return adminState.site.qualitySection?.cards || [];
  if (area === 'deliveryServices') return adminState.site.deliveryServices || [];
  if (area === 'siteBlocks') return adminState.site.siteBlocks || [];
  return [];
}

function setAreaItems(area, items) {
  if (area === 'heroPills') adminState.site.heroPills = items;
  if (area === 'qualityCards') {
    adminState.site.qualitySection = adminState.site.qualitySection || {};
    adminState.site.qualitySection.cards = items;
  }
  if (area === 'deliveryServices') adminState.site.deliveryServices = items;
  if (area === 'siteBlocks') adminState.site.siteBlocks = items;
}

function areaLabel(area) {
  return {
    heroPills: 'Главный экран',
    qualityCards: 'Свежее мясо',
    deliveryServices: 'Доставка',
    siteBlocks: 'Дополнительный блок'
  }[area] || area;
}


function renderFocusedScreenshotSections() {
  renderFocusedHeroPills();
  renderFocusedQualityHead();
  renderFocusedQualityCards();
}

function renderFocusedHeroPills() {
  const root = $('[data-focused-hero-pills]');
  if (!root) return;
  const items = adminState.site.heroPills || [];
  root.innerHTML = items.map((item, index) => `
    <form class="focused-card-form" data-focused-hero-pill="${index}">
      <div class="focused-card-form__head">
        <strong>Маленькая карточка ${index + 1}</strong>
        <label class="checkbox"><input name="enabled" type="checkbox" ${item.enabled === false ? '' : 'checked'} /> Показывать</label>
      </div>
      <div class="focused-card-form__preview">
        <img src="${escapeHtml(item.image || '/uploads/product-beef.svg')}" alt="">
        <div class="admin-form">
          <input name="imageCurrent" type="hidden" value="${escapeHtml(item.image || '')}" />
          <label>Заголовок<input name="title" value="${escapeHtml(item.title || '')}" /></label>
          <label>Описание<input name="text" value="${escapeHtml(item.text || '')}" /></label>
          <label>Заменить фото<input name="image" type="file" accept="image/*" /></label>
          <button class="button button--primary" type="submit">Сохранить карточку</button>
          <p class="form-message" data-focused-message></p>
        </div>
      </div>
    </form>
  `).join('');
  root.querySelectorAll('[data-focused-hero-pill]').forEach(form => form.addEventListener('submit', submitFocusedHeroPill));
}

function renderFocusedQualityHead() {
  const form = $('[data-focused-quality-head]');
  if (!form) return;
  const section = adminState.site.qualitySection || {};
  form.eyebrow.value = section.eyebrow || '';
  form.title.value = section.title || '';
  form.lead.value = section.lead || '';
}

function renderFocusedQualityCards() {
  const root = $('[data-focused-quality-cards]');
  if (!root) return;
  const items = adminState.site.qualitySection?.cards || [];
  root.innerHTML = items.map((item, index) => `
    <form class="focused-card-form" data-focused-quality-card="${index}">
      <div class="focused-card-form__head">
        <strong>Большая карточка ${index + 1}</strong>
        <label class="checkbox"><input name="enabled" type="checkbox" ${item.enabled === false ? '' : 'checked'} /> Показывать</label>
      </div>
      <div class="focused-card-form__preview">
        <img src="${escapeHtml(item.image || '/uploads/product-beef.svg')}" alt="">
        <div class="admin-form">
          <input name="imageCurrent" type="hidden" value="${escapeHtml(item.image || '')}" />
          <label>Бейдж<input name="tag" value="${escapeHtml(item.tag || '')}" /></label>
          <label>Заголовок<input name="title" value="${escapeHtml(item.title || '')}" /></label>
          <label class="wide-field">Описание<textarea name="text" rows="3">${escapeHtml(item.text || '')}</textarea></label>
          <label>Заменить фото<input name="image" type="file" accept="image/*" /></label>
          <button class="button button--primary" type="submit">Сохранить большую карточку</button>
          <p class="form-message" data-focused-message></p>
        </div>
      </div>
    </form>
  `).join('');
  root.querySelectorAll('[data-focused-quality-card]').forEach(form => form.addEventListener('submit', submitFocusedQualityCard));
}

async function submitFocusedHeroPill(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const index = Number(form.dataset.focusedHeroPill);
  const message = form.querySelector('[data-focused-message]');
  message.textContent = 'Сохраняем...';
  try {
    const image = form.image.files[0] ? await uploadImage(form.image.files[0]) : form.imageCurrent.value;
    const items = [...(adminState.site.heroPills || [])];
    items[index] = {
      ...(items[index] || {}),
      id: items[index]?.id || `hero-pill-${index + 1}`,
      enabled: form.enabled.checked,
      title: form.title.value.trim(),
      text: form.text.value.trim(),
      image
    };
    adminState.site.heroPills = items;
    await saveSite(adminState.site, message);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitFocusedQualityHead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-focused-quality-head-message]');
  message.textContent = 'Сохраняем...';
  try {
    adminState.site.qualitySection = {
      ...(adminState.site.qualitySection || {}),
      eyebrow: form.eyebrow.value.trim(),
      title: form.title.value.trim(),
      lead: form.lead.value.trim(),
      cards: adminState.site.qualitySection?.cards || []
    };
    await saveSite(adminState.site, message);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitFocusedQualityCard(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const index = Number(form.dataset.focusedQualityCard);
  const message = form.querySelector('[data-focused-message]');
  message.textContent = 'Сохраняем...';
  try {
    const image = form.image.files[0] ? await uploadImage(form.image.files[0]) : form.imageCurrent.value;
    const cards = [...(adminState.site.qualitySection?.cards || [])];
    cards[index] = {
      ...(cards[index] || {}),
      id: cards[index]?.id || `quality-card-${index + 1}`,
      enabled: form.enabled.checked,
      tag: form.tag.value.trim(),
      title: form.title.value.trim(),
      text: form.text.value.trim(),
      image
    };
    adminState.site.qualitySection = {
      ...(adminState.site.qualitySection || {}),
      cards
    };
    await saveSite(adminState.site, message);
  } catch (error) {
    message.textContent = error.message;
  }
}

function renderContentLists() {
  ['heroPills', 'qualityCards', 'deliveryServices', 'siteBlocks'].forEach(area => {
    const root = $(`[data-list="${area}"]`);
    if (!root) return;
    const items = areaItems(area);
    if (!items.length) {
      root.innerHTML = '<p class="muted">Элементов пока нет.</p>';
      return;
    }
    root.innerHTML = items.map((item, index) => `
      <article class="editor-item" data-area="${area}" data-index="${index}">
        <img src="${escapeHtml(item.image || '/uploads/product-beef.svg')}" alt="${escapeHtml(item.title || 'Элемент')}">
        <div>
          <h3>${escapeHtml(item.title || item.eyebrow || 'Без заголовка')}</h3>
          <p>${item.enabled === false ? 'скрыт' : 'показывается'} • ${areaLabel(area)}${item.tag ? ` • ${escapeHtml(item.tag)}` : ''}</p>
        </div>
        <div class="admin-actions">
          <button class="button button--light" data-content-edit type="button">Изменить</button>
          <button class="button danger" data-content-delete type="button">Удалить</button>
        </div>
      </article>
    `).join('');
  });
  $$('[data-content-edit]').forEach(button => button.addEventListener('click', () => {
    const row = button.closest('[data-area]');
    editContent(row.dataset.area, Number(row.dataset.index));
  }));
  $$('[data-content-delete]').forEach(button => button.addEventListener('click', () => {
    const row = button.closest('[data-area]');
    deleteContent(row.dataset.area, Number(row.dataset.index));
  }));
}

function resetContentForm() {
  const form = $('[data-content-form]');
  form.reset();
  form.id.value = '';
  form.imageCurrent.value = '';
  form.enabled.checked = true;
  form.area.value = 'heroPills';
  form.theme.value = 'warm';
  form.layout.value = 'image-right';
  $('[data-content-message]').textContent = '';
}

function editContent(area, index) {
  const item = areaItems(area)[index];
  if (!item) return;
  const form = $('[data-content-form]');
  form.area.value = area;
  form.id.value = item.id || String(index);
  form.enabled.checked = item.enabled !== false;
  form.tag.value = item.tag || item.eyebrow || '';
  form.title.value = item.title || '';
  form.text.value = item.text || '';
  form.imageCurrent.value = item.image || '';
  form.imageUrl.value = item.image || '';
  form.theme.value = item.theme || 'warm';
  form.layout.value = item.layout || 'image-right';
  $('[data-content-message]').textContent = item.image ? `Текущее фото: ${item.image}` : '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function submitContent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-content-message]');
  message.textContent = 'Сохраняем элемент...';

  try {
    const area = form.area.value;
    const imageFromUpload = form.image.files[0] ? await uploadImage(form.image.files[0]) : '';
    const image = imageFromUpload || form.imageUrl.value.trim() || form.imageCurrent.value || '';
    const id = form.id.value || uid(area);
    let item;

    if (area === 'siteBlocks') {
      item = {
        id,
        enabled: form.enabled.checked,
        eyebrow: form.tag.value.trim(),
        title: form.title.value.trim(),
        text: form.text.value.trim(),
        image,
        theme: form.theme.value,
        layout: form.layout.value
      };
    } else if (area === 'qualityCards') {
      item = {
        id,
        enabled: form.enabled.checked,
        tag: form.tag.value.trim(),
        title: form.title.value.trim(),
        text: form.text.value.trim(),
        image
      };
    } else if (area === 'deliveryServices') {
      item = {
        id,
        enabled: form.enabled.checked,
        title: form.title.value.trim(),
        text: form.text.value.trim()
      };
    } else {
      item = {
        id,
        enabled: form.enabled.checked,
        title: form.title.value.trim(),
        text: form.text.value.trim(),
        image
      };
    }

    if (!item.title && !item.text && !item.image) {
      message.textContent = 'Добавьте заголовок, текст или фото.';
      return;
    }

    const items = [...areaItems(area)];
    const index = items.findIndex(existing => String(existing.id) === String(id));
    if (index >= 0) items[index] = item;
    else items.push(item);
    setAreaItems(area, items);

    await saveSite(adminState.site, message);
    resetContentForm();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function deleteContent(area, index) {
  if (!confirm('Удалить элемент сайта?')) return;
  const items = [...areaItems(area)];
  items.splice(index, 1);
  setAreaItems(area, items);
  try {
    await saveSite(adminState.site);
  } catch (error) {
    $('[data-content-message]').textContent = error.message;
  }
}

function renderJsonEditor() {
  const textarea = $('[data-json-form] textarea[name="json"]');
  if (textarea) textarea.value = JSON.stringify(adminState.site, null, 2);
}

async function submitJson(event) {
  event.preventDefault();
  const message = $('[data-json-message]');
  message.textContent = 'Проверяем JSON...';
  try {
    const parsed = normalizeSite(JSON.parse(event.currentTarget.json.value));
    await saveSite(parsed, message);
  } catch (error) {
    message.textContent = `Ошибка JSON: ${error.message}`;
  }
}

async function submitUpload(event) {
  event.preventDefault();
  const message = $('[data-upload-message]');
  message.textContent = 'Загружаем фото...';
  try {
    const url = await uploadImage(event.currentTarget.image.files[0]);
    message.textContent = `Фото загружено: ${url}`;
    event.currentTarget.reset();
  } catch (error) {
    message.textContent = error.message;
  }
}


async function loadNotificationStatus() {
  const root = $('[data-notification-status]');
  if (!root) return;

  try {
    const status = await api('/api/admin/notifications/status');
    root.innerHTML = `
      <article class="admin-product" style="grid-template-columns:1fr;">
        <div>
          <h3>Email</h3>
          <p>Получатель: <strong>${escapeHtml(status.mailTo)}</strong></p>
          <p>${status.emailConfigured ? 'SMTP настроен — письма будут отправляться.' : 'SMTP пока не настроен — заполните SMTP_HOST, SMTP_USER и SMTP_PASS в .env.'}</p>
        </div>
      </article>
      <article class="admin-product" style="grid-template-columns:1fr;">
        <div>
          <h3>Telegram</h3>
          <p>${status.telegramConfigured ? `Бот подключён. Chat ID: ${escapeHtml(status.telegramChatId)}` : 'Telegram пока не настроен — заполните TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env.'}</p>
          <p>${status.telegramProxyConfigured ? 'Прокси для Telegram включён через TELEGRAM_PROXY_URL.' : 'Прокси не задан. Если api.telegram.org недоступен, заполните TELEGRAM_PROXY_URL в .env или запустите сайт на сервере с доступом к Telegram API.'}</p>
        </div>
      </article>
    `;
  } catch (error) {
    root.innerHTML = `<p class="form-message">${escapeHtml(error.message)}</p>`;
  }
}


async function findTelegramChats() {
  const root = $('[data-telegram-chats]');
  const message = $('[data-notification-message]');
  if (!root) return;
  root.innerHTML = '';
  message.textContent = 'Ищем Telegram Chat ID... Сначала отправьте любое сообщение вашему боту.';
  try {
    const result = await api('/api/admin/notifications/telegram-updates');
    const chats = result.chats || [];
    if (!chats.length) {
      root.innerHTML = '<p class="muted">Chat ID не найден. Откройте бота в Telegram, нажмите Start, отправьте любое сообщение и нажмите эту кнопку ещё раз.</p>';
      message.textContent = 'Chat ID пока не найден.';
      return;
    }

    root.innerHTML = chats.map(chat => `
      <article class="admin-product" style="grid-template-columns:1fr;">
        <div>
          <h3>${escapeHtml(chat.title || 'Telegram чат')}</h3>
          <p>Chat ID: <strong>${escapeHtml(chat.id)}</strong></p>
          <p>Тип: ${escapeHtml(chat.type || 'не указан')}${chat.username ? ` • @${escapeHtml(chat.username)}` : ''}</p>
          <p class="muted">Скопируйте Chat ID в файл .env в строку TELEGRAM_CHAT_ID=...</p>
        </div>
      </article>
    `).join('');
    message.textContent = 'Chat ID найден. Скопируйте его в .env и перезапустите сервер.';
  } catch (error) {
    message.textContent = error.message;
  }
}


async function sendTestNotifications() {
  const message = $('[data-notification-message]');
  message.textContent = 'Отправляем тестовое уведомление...';
  try {
    const result = await api('/api/admin/notifications/test', { method: 'POST' });
    const lines = (result.results || []).map(item => {
      if (item.sent) return `${item.channel}: отправлено`;
      if (item.skipped) return `${item.channel}: пропущено — ${item.reason}`;
      if (item.error) return `${item.channel}: ошибка — ${item.error}${item.rawError ? ` (${item.rawError})` : ''}`;
      return JSON.stringify(item);
    });
    message.textContent = lines.join(' | ');
    await loadNotificationStatus();
  } catch (error) {
    message.textContent = error.message;
  }
}


async function submitLogin(event) {
  event.preventDefault();
  $('[data-login-message]').textContent = 'Проверяем пароль...';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: new FormData(event.currentTarget).get('password') })
    });
    $('[data-login-message]').textContent = '';
    await checkStatus();
  } catch (error) {
    $('[data-login-message]').textContent = error.message;
  }
}

async function logout() {
  await api('/api/admin/logout', { method: 'POST' });
  await checkStatus();
}

$('[data-login-form]').addEventListener('submit', submitLogin);
$('[data-product-form]').addEventListener('submit', submitProduct);
$('[data-reset-product]').addEventListener('click', resetProductForm);
$('[data-refresh]').addEventListener('click', loadAdminData);
$('[data-site-form]').addEventListener('submit', submitSite);
$('[data-focused-quality-head]').addEventListener('submit', submitFocusedQualityHead);
$('[data-content-form]').addEventListener('submit', submitContent);
$('[data-reset-content]').addEventListener('click', resetContentForm);
$('[data-json-form]').addEventListener('submit', submitJson);
$('[data-json-refresh]').addEventListener('click', renderJsonEditor);
$('[data-upload-form]').addEventListener('submit', submitUpload);
$('[data-test-notifications]').addEventListener('click', sendTestNotifications);
$('[data-find-telegram-chat]').addEventListener('click', findTelegramChats);
$('[data-logout]').addEventListener('click', logout);
$$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.adminTab)));

checkStatus().catch(error => {
  $('[data-login-message]').textContent = error.message;
});
