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
    siteBlocks: Array.isArray(site.siteBlocks) ? site.siteBlocks : [],
    sectionThemes: site.sectionThemes || {},
    sectionVisibility: site.sectionVisibility || {},
    sectionOrder: Array.isArray(site.sectionOrder) ? site.sectionOrder : []
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
  renderBuilder();
  renderVisualBuilder();
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


const BUILDER_SECTIONS = [
  { id: 'hero', label: 'Главный экран', hint: 'Первый экран сайта: слоган, заголовок, текст и главное фото.', imageKey: 'heroImage' },
  { id: 'categories', label: 'Категории', hint: 'Плитки быстрого выбора категорий.', imageKey: 'categoryTiles' },
  { id: 'daily', label: 'Товары дня', hint: 'Заголовок блока с популярными товарами.', imageKey: 'products' },
  { id: 'quality', label: 'Выбор мясника', hint: 'Раздел с большими карточками и фото.', imageKey: 'qualityCards' },
  { id: 'meatGuide', label: 'Подбор под блюдо', hint: 'Подсказки: шашлык, суп, жарка, фарш.', imageKey: 'meatGuide' },
  { id: 'order', label: 'Как заказать', hint: 'Шаги оформления заказа.', imageKey: 'orderSteps' },
  { id: 'catalog', label: 'Каталог', hint: 'Заголовок каталога и тема фона.', imageKey: 'products' },
  { id: 'delivery', label: 'Доставка', hint: 'Заголовок, условия и фото доставки.', imageKey: 'deliveryImage' },
  { id: 'about', label: 'Описание магазина', hint: 'Блок о лавке и ассортименте.', imageKey: 'heroImage' },
  { id: 'contacts', label: 'Подвал и контакты', hint: 'Фон подвала, контакты и короткий текст.', imageKey: 'logoImage' }
];

function sectionThemeLabel(theme) {
  return {
    default: 'стандартная',
    light: 'светлая',
    warm: 'тёплая',
    cream: 'кремовая',
    dark: 'тёмная',
    accent: 'красная'
  }[theme || 'default'] || theme;
}

function builderGet(sectionId) {
  const site = state.site;
  if (sectionId === 'hero') return { eyebrow: site.tagline || '', title: site.heroTitle || '', text: site.heroText || '', image: site.heroImage || '' };
  if (sectionId === 'categories') return { ...(site.categorySection || {}), image: site.categoryTiles?.[0]?.image || '' };
  if (sectionId === 'daily') return { ...(site.dailyProductsSection || {}), image: state.products?.[0]?.image || '' };
  if (sectionId === 'quality') return { ...(site.qualitySection || {}), image: site.qualitySection?.cards?.[0]?.image || '' };
  if (sectionId === 'meatGuide') return { ...(site.meatGuideSection || {}), image: '' };
  if (sectionId === 'order') return { ...(site.orderSection || {}), image: '' };
  if (sectionId === 'catalog') return { ...(site.catalogSection || {}), image: state.products?.[0]?.image || '' };
  if (sectionId === 'delivery') return { ...(site.deliverySection || {}), text: site.delivery?.note || '', image: site.deliveryImage || '' };
  if (sectionId === 'about') return { ...(site.aboutSection || {}), text: site.about || '', image: site.heroImage || '' };
  if (sectionId === 'contacts') return { eyebrow: 'Контакты', title: site.brand || '', text: site.footerText || '', image: site.logoImage || '' };
  return { eyebrow: '', title: '', text: '', image: '' };
}

function builderSet(sectionId, values) {
  const site = state.site;
  site.sectionThemes = site.sectionThemes || {};
  site.sectionThemes[sectionId] = values.theme || 'default';

  if (sectionId === 'hero') {
    site.tagline = values.eyebrow;
    site.heroTitle = values.title;
    site.heroText = values.text;
    if (values.image) site.heroImage = values.image;
  } else if (sectionId === 'categories') {
    site.categorySection = { ...(site.categorySection || {}), eyebrow: values.eyebrow, title: values.title, lead: values.text };
    if (values.image) {
      site.categoryTiles = site.categoryTiles || [];
      if (site.categoryTiles[0]) site.categoryTiles[0].image = values.image;
    }
  } else if (sectionId === 'daily') {
    site.dailyProductsSection = { ...(site.dailyProductsSection || {}), eyebrow: values.eyebrow, title: values.title, lead: values.text };
  } else if (sectionId === 'quality') {
    site.qualitySection = { ...(site.qualitySection || {}), eyebrow: values.eyebrow, title: values.title, lead: values.text, cards: site.qualitySection?.cards || [] };
    if (values.image && site.qualitySection.cards?.[0]) site.qualitySection.cards[0].image = values.image;
  } else if (sectionId === 'meatGuide') {
    site.meatGuideSection = { ...(site.meatGuideSection || {}), eyebrow: values.eyebrow, title: values.title, lead: values.text };
  } else if (sectionId === 'order') {
    site.orderSection = { ...(site.orderSection || {}), eyebrow: values.eyebrow, title: values.title, lead: values.text };
  } else if (sectionId === 'catalog') {
    site.catalogSection = { ...(site.catalogSection || {}), eyebrow: values.eyebrow, title: values.title, searchLabel: site.catalogSection?.searchLabel || 'Поиск по магазину', searchPlaceholder: site.catalogSection?.searchPlaceholder || 'Например: говядина, шейка, баранина' };
  } else if (sectionId === 'delivery') {
    site.deliverySection = { ...(site.deliverySection || {}), eyebrow: values.eyebrow, title: values.title };
    site.delivery = { ...(site.delivery || {}), note: values.text };
    if (values.image) site.deliveryImage = values.image;
  } else if (sectionId === 'about') {
    site.aboutSection = { ...(site.aboutSection || {}), eyebrow: values.eyebrow, title: values.title };
    site.about = values.text;
  } else if (sectionId === 'contacts') {
    site.brand = values.title || site.brand;
    site.footerText = values.text;
    if (values.image) site.logoImage = values.image;
  }
}

function renderBuilderGrid() {
  const form = $('[data-builder-form]');
  const selected = form?.elements?.sectionId?.value || 'hero';

  const renderCards = root => {
    if (!root) return;
    root.innerHTML = BUILDER_SECTIONS.map(section => {
      const values = builderGet(section.id);
      const theme = state.site.sectionThemes?.[section.id] || 'default';
      const image = values.image || state.site.logoImage || 'assets/logo-lavka-svezhego-myasa.png';
      return `
        <button class="builder-card ${selected === section.id ? 'is-active' : ''}" type="button" data-builder-section="${section.id}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(section.label)}">
          <span>
            <strong>${escapeHtml(section.label)}</strong>
            <span>${escapeHtml(values.title || values.eyebrow || section.hint)}</span>
            <em>${escapeHtml(sectionThemeLabel(theme))}</em>
          </span>
        </button>
      `;
    }).join('');
    root.querySelectorAll('[data-builder-section]').forEach(button => {
      button.addEventListener('click', () => loadBuilderSection(button.dataset.builderSection));
    });
  };

  renderCards($('[data-builder-grid]'));
  renderCards($('[data-builder-mini-grid]'));

  const select = $('[data-builder-select]');
  if (select) {
    select.innerHTML = BUILDER_SECTIONS.map(section => `<option value="${section.id}">${escapeHtml(section.label)}</option>`).join('');
    select.value = selected;
  }
}

function loadBuilderSection(sectionId) {
  const form = $('[data-builder-form]');
  if (!form) return;
  const section = BUILDER_SECTIONS.find(item => item.id === sectionId) || BUILDER_SECTIONS[0];
  const values = builderGet(section.id);

  form.elements.sectionId.value = section.id;
  if (form.elements.sectionSelect) form.elements.sectionSelect.value = section.id;
  form.elements.eyebrow.value = values.eyebrow || '';
  form.elements.title.value = values.title || '';
  form.elements.text.value = values.lead || values.text || '';
  form.elements.imageUrl.value = values.image || '';
  form.elements.theme.value = state.site.sectionThemes?.[section.id] || 'default';

  $('[data-builder-selected-title]').textContent = section.label;
  $('[data-builder-selected-hint]').textContent = section.hint;
  $('[data-builder-preview]').src = values.image || state.site.logoImage || 'assets/logo-lavka-svezhego-myasa.png';
  renderBuilderGrid();
}

async function submitBuilderForm(event) {
  event.preventDefault();
  event.stopPropagation();
  const form = event.currentTarget;
  const elements = form.elements;
  const message = $('[data-builder-message]');
  message.textContent = 'Сохраняем блок конструктора...';

  try {
    const sectionId = elements.sectionId.value || elements.sectionSelect?.value || 'hero';
    const uploaded = elements.imageFile.files[0] ? await uploadImage(elements.imageFile.files[0], `builder-${sectionId}`) : '';
    builderSet(sectionId, {
      eyebrow: elements.eyebrow.value.trim(),
      title: elements.title.value.trim(),
      text: elements.text.value.trim(),
      image: uploaded || elements.imageUrl.value.trim(),
      theme: elements.theme.value
    });

    await saveSite(state.site, message, `Update builder section ${sectionId}`);
    loadBuilderSection(sectionId);
    elements.imageFile.value = '';
  } catch (error) {
    message.textContent = error.message;
  }
}

function renderBuilder() {
  const form = $('[data-builder-form]');
  if (!form) return;
  renderBuilderGrid();
  const current = form.elements.sectionId.value || form.elements.sectionSelect?.value || 'hero';
  loadBuilderSection(current);
}



function fixedSectionIds() {
  return BUILDER_SECTIONS.map(section => section.id);
}

function customSectionId(block, index) {
  return `custom-${block?.id || index}`;
}

function customIndexFromSectionId(sectionId) {
  if (!sectionId || !sectionId.startsWith('custom-')) return -1;
  const raw = sectionId.replace('custom-', '');
  const directIndex = Number(raw);
  if (Number.isInteger(directIndex) && state.site.siteBlocks?.[directIndex]) return directIndex;
  return (state.site.siteBlocks || []).findIndex((block, index) => customSectionId(block, index) === sectionId);
}

function isMovableVisualSection(sectionId) {
  return sectionId !== 'contacts';
}

function allSectionIds() {
  const custom = (state.site.siteBlocks || []).map((block, index) => customSectionId(block, index));
  return [...fixedSectionIds(), ...custom];
}

function normalizedSectionOrder() {
  const all = allSectionIds();
  const saved = Array.isArray(state.site.sectionOrder) ? state.site.sectionOrder : [];
  const result = saved.filter(id => all.includes(id));
  all.forEach(id => {
    if (!result.includes(id)) result.push(id);
  });
  return result;
}

function ensureSectionOrder() {
  state.site.sectionOrder = normalizedSectionOrder();
  return state.site.sectionOrder;
}


function safeImage(path) {
  return path || state.site.logoImage || 'assets/logo-lavka-svezhego-myasa.png';
}

function visualSectionContent(sectionId) {
  const site = state.site;
  const data = builderGet(sectionId);
  const title = data.title || data.eyebrow || BUILDER_SECTIONS.find(item => item.id === sectionId)?.label || sectionId;
  const text = data.lead || data.text || BUILDER_SECTIONS.find(item => item.id === sectionId)?.hint || '';
  const image = data.image || site.logoImage || 'assets/logo-lavka-svezhego-myasa.png';

  if (sectionId === 'categories') {
    const tiles = (site.categoryTiles || []).slice(0, 6).map(item => `<span>${escapeHtml(item.title || item.category || 'Категория')}</span>`).join('');
    return `<div class="visual-preview-grid">${tiles}</div>`;
  }

  if (sectionId === 'daily') {
    const products = (state.products || []).filter(p => p.popular).slice(0, 4);
    const cards = (products.length ? products : (state.products || []).slice(0, 4)).map(p => `<span>${escapeHtml(p.name || 'Товар')}</span>`).join('');
    return `<div class="visual-preview-grid">${cards}</div>`;
  }

  if (sectionId === 'meatGuide') {
    const cards = (site.meatGuide || []).slice(0, 4).map(item => `<span>${escapeHtml(item.title || 'Совет')}</span>`).join('');
    return `<div class="visual-preview-grid">${cards}</div>`;
  }

  if (sectionId === 'order') {
    const cards = (site.orderSteps || []).slice(0, 4).map((item, index) => `<span>${index + 1}. ${escapeHtml(item.title || 'Шаг')}</span>`).join('');
    return `<div class="visual-preview-grid">${cards}</div>`;
  }

  return `
    <div class="visual-preview-split">
      <div>
        <p>${escapeHtml(data.eyebrow || '')}</p>
        <h3>${escapeHtml(title)}</h3>
        <span>${escapeHtml(text)}</span>
      </div>
      <img src="${escapeHtml(image)}" alt="">
    </div>
  `;
}

function visualThemeClass(sectionId) {
  const theme = state.site.sectionThemes?.[sectionId] || 'default';
  return `visual-theme-${theme}`;
}

function isSectionVisible(sectionId) {
  return state.site.sectionVisibility?.[sectionId] !== false;
}

function renderVisualBuilder(showHidden = false) {
  const root = $('[data-visual-builder]');
  if (!root) return;

  ensureSectionOrder();

  const fixedSections = BUILDER_SECTIONS.map(section => ({ type: 'fixed', id: section.id, label: section.label, hint: section.hint }));
  const customSections = (state.site.siteBlocks || []).map((block, index) => ({
    type: 'custom',
    id: customSectionId(block, index),
    index,
    label: block.title || block.eyebrow || `Дополнительный блок ${index + 1}`,
    hint: block.text || 'Дополнительный редактируемый блок'
  }));

  const byId = new Map([...fixedSections, ...customSections].map(section => [section.id, section]));
  const sections = normalizedSectionOrder()
    .map(id => byId.get(id))
    .filter(Boolean)
    .filter(section => {
      if (section.type === 'custom') return showHidden || state.site.siteBlocks?.[section.index]?.enabled !== false;
      return showHidden || isSectionVisible(section.id);
    });

  root.innerHTML = sections.map((section, visibleIndex) => {
    const hidden = section.type === 'custom'
      ? state.site.siteBlocks?.[section.index]?.enabled === false
      : !isSectionVisible(section.id);

    const moveButtons = isMovableVisualSection(section.id) ? `
      <button type="button" title="Поднять блок выше" data-visual-move-up="${section.id}">↑</button>
      <button type="button" title="Опустить блок ниже" data-visual-move-down="${section.id}">↓</button>
    ` : '<span class="visual-toolbar-note">внизу</span>';

    if (section.type === 'custom') {
      const block = state.site.siteBlocks[section.index] || {};
      const theme = block.theme || 'default';
      const image = block.image || state.site.logoImage || 'assets/logo-lavka-svezhego-myasa.png';
      return `
        <article class="visual-site-section visual-theme-${escapeHtml(theme)} ${hidden ? 'is-hidden-section' : ''}" data-visual-section="${section.id}" data-custom-index="${section.index}">
          <div class="visual-toolbar">
            ${moveButtons}
            <button type="button" title="Редактировать" data-visual-edit="${section.id}">✎</button>
            <button type="button" title="Добавить блок" data-visual-add="${section.id}">+</button>
            <button type="button" title="Удалить блок" data-visual-delete="${section.id}">🗑</button>
          </div>
          <div class="visual-section-label">${visibleIndex + 1}. ${escapeHtml(section.label)}${hidden ? ' — скрыт' : ''}</div>
          <div class="visual-preview-split">
            <div>
              <p>${escapeHtml(block.eyebrow || 'Дополнительный блок')}</p>
              <h3>${escapeHtml(block.title || section.label)}</h3>
              <span>${escapeHtml(block.text || '')}</span>
            </div>
            <img src="${escapeHtml(image)}" alt="">
          </div>
        </article>
      `;
    }

    return `
      <article class="visual-site-section ${visualThemeClass(section.id)} ${hidden ? 'is-hidden-section' : ''}" data-visual-section="${section.id}">
        <div class="visual-toolbar">
          ${moveButtons}
          <button type="button" title="Редактировать" data-visual-edit="${section.id}">✎</button>
          <button type="button" title="Добавить блок" data-visual-add="${section.id}">+</button>
          <button type="button" title="Скрыть блок" data-visual-delete="${section.id}">🗑</button>
        </div>
        <div class="visual-section-label">${visibleIndex + 1}. ${escapeHtml(section.label)}${hidden ? ' — скрыт' : ''}</div>
        ${visualSectionContent(section.id)}
      </article>
    `;
  }).join('');

  root.querySelectorAll('[data-visual-edit]').forEach(button => button.addEventListener('click', () => visualEditSection(button.dataset.visualEdit)));
  root.querySelectorAll('[data-visual-add]').forEach(button => button.addEventListener('click', () => visualAddBlock(button.dataset.visualAdd)));
  root.querySelectorAll('[data-visual-delete]').forEach(button => button.addEventListener('click', () => visualDeleteSection(button.dataset.visualDelete)));
  root.querySelectorAll('[data-visual-move-up]').forEach(button => button.addEventListener('click', () => visualMoveSection(button.dataset.visualMoveUp, -1)));
  root.querySelectorAll('[data-visual-move-down]').forEach(button => button.addEventListener('click', () => visualMoveSection(button.dataset.visualMoveDown, 1)));
}

function scrollToBlockEditor() {
  $('[data-builder-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToContentEditor() {
  $('[data-content-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function visualEditSection(sectionId) {
  if (sectionId.startsWith('custom-')) {
    const index = customIndexFromSectionId(sectionId);
    const block = state.site.siteBlocks?.[index];
    if (!block) return;
    const form = $('[data-content-form]');
    form.area.value = 'siteBlocks';
    form.id.value = block.id || '';
    form.eyebrow.value = block.eyebrow || '';
    form.title.value = block.title || '';
    form.text.value = block.text || '';
    form.imageCurrent.value = block.image || '';
    form.theme.value = block.theme || 'default';
    form.layout.value = block.layout || 'image-right';
    form.enabled.checked = block.enabled !== false;
    form.dataset.editIndex = index;
    scrollToContentEditor();
    $('[data-visual-builder-message]').textContent = 'Открыт дополнительный блок в редакторе «Карточки, статьи и блоки».';
    return;
  }

  loadBuilderSection(sectionId);
  scrollToBlockEditor();
  $('[data-visual-builder-message]').textContent = 'Блок открыт в редакторе ниже. Измените поля и нажмите «Сохранить блок конструктора».';
}

async function visualAddBlock(afterSectionId = '') {
  const message = $('[data-visual-builder-message]');
  message.textContent = 'Добавляем новый блок...';
  try {
    state.site.siteBlocks = state.site.siteBlocks || [];
    const id = `block-${Date.now()}`;
    state.site.siteBlocks.push({
      id,
      enabled: true,
      eyebrow: 'Новый блок',
      title: 'Новый раздел сайта',
      text: 'Здесь можно написать текст, добавить фото и выбрать фон.',
      image: state.site.heroImage || state.site.logoImage || 'assets/logo-lavka-svezhego-myasa.png',
      theme: 'warm',
      layout: 'image-right'
    });

    const newSectionId = `custom-${id}`;
    const order = ensureSectionOrder().filter(item => item !== newSectionId);
    const afterIndex = order.indexOf(afterSectionId);
    if (afterIndex >= 0) order.splice(afterIndex + 1, 0, newSectionId);
    else order.push(newSectionId);
    state.site.sectionOrder = order;

    await saveSite(state.site, message, 'Add visual builder block');
    renderVisualBuilder(true);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function visualDeleteSection(sectionId) {
  const message = $('[data-visual-builder-message]');
  try {
    if (sectionId.startsWith('custom-')) {
      const index = customIndexFromSectionId(sectionId);
      const block = state.site.siteBlocks?.[index];
      if (!block) return;
      if (!confirm('Удалить дополнительный блок?')) return;
      state.site.siteBlocks.splice(index, 1);
      state.site.sectionOrder = ensureSectionOrder().filter(item => item !== sectionId);
      await saveSite(state.site, message, 'Delete visual builder block');
      renderVisualBuilder(true);
      return;
    }

    const label = BUILDER_SECTIONS.find(item => item.id === sectionId)?.label || sectionId;
    if (!confirm(`Скрыть блок «${label}» на сайте? Его можно вернуть через JSON или кнопку показа скрытых блоков.`)) return;
    state.site.sectionVisibility = state.site.sectionVisibility || {};
    state.site.sectionVisibility[sectionId] = false;
    await saveSite(state.site, message, `Hide visual builder section ${sectionId}`);
    renderVisualBuilder(true);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function visualMoveSection(sectionId, direction) {
  const message = $('[data-visual-builder-message]');
  try {
    if (!isMovableVisualSection(sectionId)) {
      message.textContent = 'Этот блок закреплён внизу сайта.';
      return;
    }
    const order = ensureSectionOrder();
    const index = order.indexOf(sectionId);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length) {
      message.textContent = direction < 0 ? 'Этот блок уже самый верхний.' : 'Этот блок уже самый нижний.';
      return;
    }
    const [item] = order.splice(index, 1);
    order.splice(nextIndex, 0, item);
    state.site.sectionOrder = order;
    await saveSite(state.site, message, `Move section ${sectionId}`);
    renderVisualBuilder(true);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function visualRestoreSection(sectionId) {
  const message = $('[data-visual-builder-message]');
  try {
    if (sectionId.startsWith('custom-')) {
      const index = customIndexFromSectionId(sectionId);
      if (state.site.siteBlocks?.[index]) state.site.siteBlocks[index].enabled = true;
    } else {
      state.site.sectionVisibility = state.site.sectionVisibility || {};
      state.site.sectionVisibility[sectionId] = true;
    }
    await saveSite(state.site, message, `Restore visual builder section ${sectionId}`);
    renderVisualBuilder(true);
  } catch (error) {
    message.textContent = error.message;
  }
}


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
  renderBuilder();
  renderVisualBuilder();
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
$('[data-builder-form]').addEventListener('submit', submitBuilderForm);
$('[data-focused-quality-head]').addEventListener('submit', submitFocusedQualityHead);
$('[data-content-form]').addEventListener('submit', submitContent);
$('[data-reset-content]').addEventListener('click', resetContentForm);
$('[data-json-form]').addEventListener('submit', submitJson);
$('[data-upload-form]').addEventListener('submit', submitUpload);
$('[data-reload]').addEventListener('click', loadData);
$('[data-logout]').addEventListener('click', logout);
$$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.adminTab)));
$('[data-visual-add-global]')?.addEventListener('click', () => visualAddBlock('global'));
$('[data-visual-show-hidden]')?.addEventListener('click', () => renderVisualBuilder(true));
const builderSelect = $('[data-builder-select]');
if (builderSelect) builderSelect.addEventListener('change', event => loadBuilderSection(event.target.value));
