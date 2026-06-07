const state = {
  owner: '',
  repo: '',
  branch: 'main',
  token: '',
  products: [],
  site: {},
  productsSha: '',
  siteSha: ''
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => `${new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0))} руб`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

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

function uid(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function initConnectForm() {
  const saved = JSON.parse(localStorage.getItem('github-admin-repo') || '{}');
  const host = location.hostname;
  const parts = location.pathname.split('/').filter(Boolean);
  const inferred = host.endsWith('.github.io') ? { owner: host.replace('.github.io', ''), repo: parts[0] || '' } : {};
  const form = $('[data-connect-form]');
  form.elements.owner.value = saved.owner || inferred.owner || '';
  form.elements.repo.value = saved.repo || inferred.repo || '';
  form.elements.branch.value = saved.branch || 'main';
}

function switchTab(name) {
  $$('[data-admin-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.adminTab === name));
  $$('[data-admin-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.adminPanel !== name));
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${state.owner}/${state.repo}/contents/${path}`, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${state.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('GitHub не принял token или у token нет права Contents: Read and write. Скопируйте изменения, обновите страницу и войдите в админку заново.');
    }
    throw new Error(data.message || `GitHub API error ${response.status}`);
  }
  return data;
}

function base64ToUtf8(base64) {
  const binary = atob(String(base64 || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

async function readJsonFile(path) {
  const data = await githubRequest(`${path}?ref=${encodeURIComponent(state.branch)}`);
  return { sha: data.sha, json: JSON.parse(base64ToUtf8(data.content)) };
}

async function writeTextFile(path, text, sha, message) {
  const data = await githubRequest(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: utf8ToBase64(text),
      branch: state.branch,
      ...(sha ? { sha } : {})
    })
  });
  return data.content?.sha || '';
}

async function uploadFile(path, file, message) {
  let current = null;
  try { current = await githubRequest(`${path}?ref=${encodeURIComponent(state.branch)}`); } catch {}
  const data = await githubRequest(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: await fileToBase64(file),
      branch: state.branch,
      ...(current?.sha ? { sha: current.sha } : {})
    })
  });
  return data.content?.path || path;
}

async function uploadImage(file, prefix = 'image') {
  if (!file || !file.size) return '';
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.jpg';
  const path = `uploads/${slugify(prefix)}-${Date.now()}${ext}`;
  return uploadFile(path, file, `Upload ${prefix}`);
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
    qualitySection: { ...(site.qualitySection || {}), cards: Array.isArray(site.qualitySection?.cards) ? site.qualitySection.cards : [] },
    heroPills: Array.isArray(site.heroPills) ? site.heroPills : [],
    deliveryServices: Array.isArray(site.deliveryServices) ? site.deliveryServices : [],
    siteBlocks: Array.isArray(site.siteBlocks) ? site.siteBlocks : []
  };
}

async function loadData() {
  const [productsFile, siteFile] = await Promise.all([readJsonFile('data/products.json'), readJsonFile('data/site.json')]);
  state.products = productsFile.json;
  state.productsSha = productsFile.sha;
  state.site = normalizeSite(siteFile.json);
  state.siteSha = siteFile.sha;
  renderProducts();
  renderSiteForm();
  renderFocusedScreenshotSections();
  renderContentLists();
  renderWorkerForm();
  renderJsonEditor();
}

async function connect(event) {
  event.preventDefault();
  const form = event.currentTarget;
  state.owner = form.elements.owner.value.trim();
  state.repo = form.elements.repo.value.trim();
  state.branch = form.elements.branch.value.trim() || 'main';
  state.token = form.elements.token.value.trim();
  if (form.elements.rememberRepo.checked) localStorage.setItem('github-admin-repo', JSON.stringify({ owner: state.owner, repo: state.repo, branch: state.branch }));

  $('[data-connect-message]').textContent = 'Подключаемся к GitHub...';
  try {
    await loadData();
    $('[data-login-screen]').classList.add('hidden');
    $('[data-admin-screen]').classList.remove('hidden');
  } catch (error) {
    $('[data-connect-message]').textContent = error.message;
  }
}

function renderProducts() {
  const root = $('[data-products-list]');
  if (!state.products.length) {
    root.innerHTML = '<p class="muted">Товаров пока нет.</p>';
    return;
  }
  root.innerHTML = state.products.map(product => `
    <article class="admin-product" data-id="${escapeHtml(product.id)}">
      <img src="${escapeHtml(product.image || 'uploads/product-beef.svg')}" alt="${escapeHtml(product.name)}">
      <div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.category)} • ${money(product.price)}/${escapeHtml(product.unit)} • ${product.stock === false ? 'нет в наличии' : 'в наличии'}</p>
      </div>
      <div class="admin-actions">
        <button class="button button--light" data-edit-product type="button">Изменить</button>
        <button class="button danger" data-delete-product type="button">Удалить</button>
      </div>
    </article>
  `).join('');
  root.querySelectorAll('[data-edit-product]').forEach(button => button.addEventListener('click', () => editProduct(button.closest('[data-id]').dataset.id)));
  root.querySelectorAll('[data-delete-product]').forEach(button => button.addEventListener('click', () => deleteProduct(button.closest('[data-id]').dataset.id)));
}

function editProduct(id) {
  const product = state.products.find(item => item.id === id);
  if (!product) return;
  const form = $('[data-product-form]');
  form.id.value = product.id || '';
  form.imageCurrent.value = product.image || '';
  form.name.value = product.name || '';
  form.category.value = product.category || '';
  form.price.value = product.price || '';
  form.unit.value = product.unit || 'кг';
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

function resetProductForm() {
  const form = $('[data-product-form]');
  form.reset();
  form.id.value = '';
  form.imageCurrent.value = '';
  form.stock.checked = true;
  $('[data-product-message]').textContent = '';
}

async function submitProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-product-message]');
  message.textContent = 'Сохраняем товар в GitHub...';

  try {
    const id = form.id.value || slugify(form.name.value);
    let image = form.imageCurrent.value || '';
    if (form.image.files[0]) image = await uploadImage(form.image.files[0], id);

    const product = {
      id,
      name: form.name.value.trim(),
      category: form.category.value.trim(),
      price: Number(form.price.value || 0),
      unit: form.unit.value,
      image,
      description: form.description.value.trim(),
      popular: form.popular.checked,
      nutrition: { calories: form.calories.value.trim(), protein: form.protein.value.trim(), fat: form.fat.value.trim(), carbs: form.carbs.value.trim() },
      services: form.services.value.split(',').map(item => item.trim()).filter(Boolean),
      stock: form.stock.checked
    };

    if (!product.name || !product.price) throw new Error('Название и цена обязательны');

    const index = state.products.findIndex(item => item.id === id);
    if (index >= 0) state.products[index] = product;
    else state.products.unshift(product);

    state.productsSha = await writeTextFile('data/products.json', JSON.stringify(state.products, null, 2) + '\n', state.productsSha, `Save product ${product.name}`);
    message.textContent = 'Товар сохранён. GitHub Pages обновит сайт через некоторое время.';
    resetProductForm();
    renderProducts();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function deleteProduct(id) {
  if (!confirm('Удалить товар?')) return;
  state.products = state.products.filter(item => item.id !== id);
  try {
    state.productsSha = await writeTextFile('data/products.json', JSON.stringify(state.products, null, 2) + '\n', state.productsSha, `Delete product ${id}`);
    renderProducts();
  } catch (error) { alert(error.message); }
}

function linesToArray(value) { return String(value || '').split('\n').map(item => item.trim()).filter(Boolean); }
function arrayToLines(value) { return Array.isArray(value) ? value.join('\n') : ''; }

function renderSiteForm() {
  const form = $('[data-site-form]');
  const site = state.site;
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
  form.logoImage.value = site.logoImage || '';
  form.deliveryImage.value = site.deliveryImage || '';
  form.phone.value = site.phone || '';
  form.email.value = site.email || '';
  form.workTime.value = site.workTime || '';
  form.footerText.value = site.footerText || '';
  form.catalogEyebrow.value = catalog.eyebrow || '';
  form.catalogTitle.value = catalog.title || '';
  form.catalogSearchLabel.value = catalog.searchLabel || '';
  form.catalogSearchPlaceholder.value = catalog.searchPlaceholder || '';
  form.deliverySectionEyebrow.value = deliverySection.eyebrow || '';
  form.deliverySectionTitle.value = deliverySection.title || '';
  form.deliveryTime.value = site.deliveryTime || '';
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

async function saveSite(site, messageNode, commitMessage = 'Update site') {
  state.site = normalizeSite(site);
  state.siteSha = await writeTextFile('data/site.json', JSON.stringify(state.site, null, 2) + '\n', state.siteSha, commitMessage);
  renderSiteForm();
  renderFocusedScreenshotSections();
  renderContentLists();
  renderWorkerForm();
  renderJsonEditor();
  if (messageNode) messageNode.textContent = 'Сохранено. GitHub Pages обновит сайт через некоторое время.';
}

async function submitSite(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-site-message]');
  message.textContent = 'Сохраняем site.json...';

  try {
    const heroImage = form.heroImageFile.files[0] ? await uploadImage(form.heroImageFile.files[0], 'hero') : form.heroImage.value;
    const logoImage = form.logoImageFile.files[0] ? await uploadImage(form.logoImageFile.files[0], 'logo') : form.logoImage.value;
    const deliveryImage = form.deliveryImageFile.files[0] ? await uploadImage(form.deliveryImageFile.files[0], 'delivery') : form.deliveryImage.value;

    const nextSite = normalizeSite({
      ...state.site,
      brand: form.brand.value.trim(),
      tagline: form.tagline.value.trim(),
      heroTitle: form.heroTitle.value.trim(),
      heroText: form.heroText.value.trim(),
      heroBadgeLabel: form.heroBadgeLabel.value.trim(),
      heroBadgeText: form.heroBadgeText.value.trim(),
      heroStampText: form.heroStampText.value.trim(),
      heroImage,
      logoImage,
      deliveryImage,
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      workTime: form.workTime.value.trim(),
      footerText: form.footerText.value.trim(),
      catalogSection: { eyebrow: form.catalogEyebrow.value.trim(), title: form.catalogTitle.value.trim(), searchLabel: form.catalogSearchLabel.value.trim(), searchPlaceholder: form.catalogSearchPlaceholder.value.trim() },
      deliverySection: { eyebrow: form.deliverySectionEyebrow.value.trim(), title: form.deliverySectionTitle.value.trim() },
      deliveryTime: form.deliveryTime.value.trim(),
      delivery: { city: form.deliveryCity.value.trim(), price: Number(form.deliveryPrice.value || 0), freeFrom: Number(form.deliveryFreeFrom.value || 0), suburb: form.deliverySuburb.value.trim(), note: form.deliveryNote.value.trim() },
      aboutSection: { eyebrow: form.aboutEyebrow.value.trim(), title: form.aboutTitle.value.trim() },
      about: form.about.value.trim(),
      addresses: linesToArray(form.addresses.value),
      benefits: linesToArray(form.benefits.value),
      payment: linesToArray(form.payment.value)
    });

    await saveSite(nextSite, message, 'Update main site sections');
  } catch (error) {
    message.textContent = error.message;
  }
}

function renderFocusedScreenshotSections() {
  renderFocusedHeroPills();
  renderFocusedQualityHead();
  renderFocusedQualityCards();
}

function renderFocusedHeroPills() {
  const root = $('[data-focused-hero-pills]');
  const items = state.site.heroPills || [];
  root.innerHTML = items.map((item, index) => `
    <form class="focused-card-form" data-focused-hero-pill="${index}">
      <div class="focused-card-form__head">
        <strong>Маленькая карточка ${index + 1}</strong>
        <label class="checkbox"><input name="enabled" type="checkbox" ${item.enabled === false ? '' : 'checked'} /> Показывать</label>
      </div>
      <div class="focused-card-form__preview">
        <img src="${escapeHtml(item.image || 'uploads/product-beef.svg')}" alt="">
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
  const section = state.site.qualitySection || {};
  form.eyebrow.value = section.eyebrow || '';
  form.title.value = section.title || '';
  form.lead.value = section.lead || '';
}

function renderFocusedQualityCards() {
  const root = $('[data-focused-quality-cards]');
  const items = state.site.qualitySection?.cards || [];
  root.innerHTML = items.map((item, index) => `
    <form class="focused-card-form" data-focused-quality-card="${index}">
      <div class="focused-card-form__head">
        <strong>Большая карточка ${index + 1}</strong>
        <label class="checkbox"><input name="enabled" type="checkbox" ${item.enabled === false ? '' : 'checked'} /> Показывать</label>
      </div>
      <div class="focused-card-form__preview">
        <img src="${escapeHtml(item.image || 'uploads/product-beef.svg')}" alt="">
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
    const image = form.image.files[0] ? await uploadImage(form.image.files[0], `hero-pill-${index + 1}`) : form.imageCurrent.value;
    const items = [...(state.site.heroPills || [])];
    items[index] = { ...(items[index] || {}), id: items[index]?.id || `hero-pill-${index + 1}`, enabled: form.enabled.checked, title: form.title.value.trim(), text: form.text.value.trim(), image };
    await saveSite({ ...state.site, heroPills: items }, message, 'Update hero card');
  } catch (error) { message.textContent = error.message; }
}

async function submitFocusedQualityHead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-focused-quality-head-message]');
  message.textContent = 'Сохраняем...';
  try {
    await saveSite({ ...state.site, qualitySection: { ...(state.site.qualitySection || {}), eyebrow: form.eyebrow.value.trim(), title: form.title.value.trim(), lead: form.lead.value.trim(), cards: state.site.qualitySection?.cards || [] } }, message, 'Update quality section heading');
  } catch (error) { message.textContent = error.message; }
}

async function submitFocusedQualityCard(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const index = Number(form.dataset.focusedQualityCard);
  const message = form.querySelector('[data-focused-message]');
  message.textContent = 'Сохраняем...';
  try {
    const image = form.image.files[0] ? await uploadImage(form.image.files[0], `quality-card-${index + 1}`) : form.imageCurrent.value;
    const cards = [...(state.site.qualitySection?.cards || [])];
    cards[index] = { ...(cards[index] || {}), id: cards[index]?.id || `quality-card-${index + 1}`, enabled: form.enabled.checked, tag: form.tag.value.trim(), title: form.title.value.trim(), text: form.text.value.trim(), image };
    await saveSite({ ...state.site, qualitySection: { ...(state.site.qualitySection || {}), cards } }, message, 'Update quality card');
  } catch (error) { message.textContent = error.message; }
}

function areaItems(area) {
  if (area === 'heroPills') return state.site.heroPills || [];
  if (area === 'qualityCards') return state.site.qualitySection?.cards || [];
  if (area === 'deliveryServices') return state.site.deliveryServices || [];
  if (area === 'siteBlocks') return state.site.siteBlocks || [];
  return [];
}

function setAreaItems(area, items) {
  if (area === 'heroPills') state.site.heroPills = items;
  if (area === 'qualityCards') {
    state.site.qualitySection = state.site.qualitySection || {};
    state.site.qualitySection.cards = items;
  }
  if (area === 'deliveryServices') state.site.deliveryServices = items;
  if (area === 'siteBlocks') state.site.siteBlocks = items;
}

function areaLabel(area) {
  return { heroPills: 'Главный экран', qualityCards: 'Свежее мясо', deliveryServices: 'Доставка', siteBlocks: 'Доп. блок' }[area] || area;
}

function renderContentLists() {
  ['heroPills', 'qualityCards', 'deliveryServices', 'siteBlocks'].forEach(area => {
    const root = $(`[data-list="${area}"]`);
    const items = areaItems(area);
    root.innerHTML = items.length ? items.map((item, index) => `
      <article class="editor-item" data-area="${area}" data-index="${index}">
        <img src="${escapeHtml(item.image || 'uploads/product-beef.svg')}" alt="">
        <div>
          <h3>${escapeHtml(item.title || item.eyebrow || 'Без заголовка')}</h3>
          <p>${item.enabled === false ? 'скрыт' : 'показывается'} • ${areaLabel(area)}${item.tag ? ` • ${escapeHtml(item.tag)}` : ''}</p>
        </div>
        <div class="admin-actions">
          <button class="button button--light" data-content-edit type="button">Изменить</button>
          <button class="button danger" data-content-delete type="button">Удалить</button>
        </div>
      </article>
    `).join('') : '<p class="muted">Элементов пока нет.</p>';
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
}

async function submitContent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-content-message]');
  message.textContent = 'Сохраняем элемент...';
  try {
    const area = form.area.value;
    const image = form.image.files[0] ? await uploadImage(form.image.files[0], `${area}-${form.title.value || 'image'}`) : (form.imageUrl.value.trim() || form.imageCurrent.value || '');
    const id = form.id.value || uid(area);
    let item;
    if (area === 'siteBlocks') item = { id, enabled: form.enabled.checked, eyebrow: form.tag.value.trim(), title: form.title.value.trim(), text: form.text.value.trim(), image, theme: form.theme.value, layout: form.layout.value };
    else if (area === 'qualityCards') item = { id, enabled: form.enabled.checked, tag: form.tag.value.trim(), title: form.title.value.trim(), text: form.text.value.trim(), image };
    else if (area === 'deliveryServices') item = { id, enabled: form.enabled.checked, title: form.title.value.trim(), text: form.text.value.trim() };
    else item = { id, enabled: form.enabled.checked, title: form.title.value.trim(), text: form.text.value.trim(), image };

    const items = [...areaItems(area)];
    const index = items.findIndex(existing => String(existing.id) === String(id));
    if (index >= 0) items[index] = item;
    else items.push(item);
    setAreaItems(area, items);
    await saveSite(state.site, message, `Update ${area}`);
    resetContentForm();
  } catch (error) { message.textContent = error.message; }
}

async function deleteContent(area, index) {
  if (!confirm('Удалить элемент сайта?')) return;
  const items = [...areaItems(area)];
  items.splice(index, 1);
  setAreaItems(area, items);
  try { await saveSite(state.site, $('[data-content-message]'), `Delete ${area} item`); } catch (error) { $('[data-content-message]').textContent = error.message; }
}


function renderWorkerForm() {
  const form = $('[data-worker-form]');
  if (!form) return;
  form.elements.telegramWorkerUrl.value = state.site.telegramWorkerUrl || 'https://lavka-orders-telegram.izhmeat.workers.dev';
}

async function submitWorkerForm(event) {
  event.preventDefault();
  const message = $('[data-worker-message]');
  message.textContent = 'Сохраняем Worker URL...';
  try {
    await saveSite(
      { ...state.site, telegramWorkerUrl: event.currentTarget.elements.telegramWorkerUrl.value.trim() },
      message,
      'Update Cloudflare Worker URL'
    );
  } catch (error) {
    message.textContent = error.message;
  }
}


function renderJsonEditor() {
  $('[data-json-form] textarea[name="json"]').value = JSON.stringify(state.site, null, 2);
}

async function submitJson(event) {
  event.preventDefault();
  const message = $('[data-json-message]');
  message.textContent = 'Проверяем и сохраняем JSON...';
  try {
    await saveSite(JSON.parse(event.currentTarget.json.value), message, 'Update full site JSON');
  } catch (error) { message.textContent = error.message; }
}

async function submitUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-upload-message]');
  message.textContent = 'Загружаем фото...';
  try {
    const file = form.image.files[0];
    const path = await uploadImage(file, file.name.replace(/\.[^.]+$/, ''));
    message.textContent = `Фото загружено: ${path}`;
    form.reset();
  } catch (error) { message.textContent = error.message; }
}

function logout() {
  state.token = '';
  $('[data-admin-screen]').classList.add('hidden');
  $('[data-login-screen]').classList.remove('hidden');
  $('[data-connect-form]').elements.token.value = '';
}

initConnectForm();
$('[data-connect-form]').addEventListener('submit', connect);
$('[data-product-form]').addEventListener('submit', submitProduct);
$('[data-reset-product]').addEventListener('click', resetProductForm);
$('[data-site-form]').addEventListener('submit', submitSite);
$('[data-focused-quality-head]').addEventListener('submit', submitFocusedQualityHead);
$('[data-content-form]').addEventListener('submit', submitContent);
$('[data-reset-content]').addEventListener('click', resetContentForm);
$('[data-json-form]').addEventListener('submit', submitJson);
$('[data-upload-form]').addEventListener('submit', submitUpload);
$('[data-reload]').addEventListener('click', loadData);
$('[data-logout]').addEventListener('click', logout);
$$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.adminTab)));
