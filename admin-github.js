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

function inferRepoFromUrl() {
  const host = location.hostname;
  const parts = location.pathname.split('/').filter(Boolean);
  if (host.endsWith('.github.io')) {
    return { owner: host.replace('.github.io', ''), repo: parts[0] || '' };
  }
  return { owner: '', repo: '' };
}

function initConnectForm() {
  const saved = JSON.parse(localStorage.getItem('github-admin-repo') || '{}');
  const inferred = inferRepoFromUrl();
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
  return {
    sha: data.sha,
    json: JSON.parse(base64ToUtf8(data.content))
  };
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

async function loadData() {
  const [productsFile, siteFile] = await Promise.all([
    readJsonFile('data/products.json'),
    readJsonFile('data/site.json')
  ]);
  state.products = productsFile.json;
  state.productsSha = productsFile.sha;
  state.site = siteFile.json;
  state.siteSha = siteFile.sha;
  renderProducts();
  renderSiteForm();
  renderJsonEditor();
}

async function connect(event) {
  event.preventDefault();
  const form = event.currentTarget;
  state.owner = form.elements.owner.value.trim();
  state.repo = form.elements.repo.value.trim();
  state.branch = form.elements.branch.value.trim() || 'main';
  state.token = form.elements.token.value.trim();

  if (form.rememberRepo.checked) {
    localStorage.setItem('github-admin-repo', JSON.stringify({ owner: state.owner, repo: state.repo, branch: state.branch }));
  }

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
    if (form.image.files[0]) {
      const file = form.image.files[0];
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.jpg';
      const filePath = `uploads/${id}-${Date.now()}${ext}`;
      image = await uploadFile(filePath, file, `Upload image for ${id}`);
    }

    const product = {
      id,
      name: form.name.value.trim(),
      category: form.category.value.trim(),
      price: Number(form.price.value || 0),
      unit: form.unit.value,
      image,
      description: form.description.value.trim(),
      popular: form.popular.checked,
      nutrition: {
        calories: form.calories.value.trim(),
        protein: form.protein.value.trim(),
        fat: form.fat.value.trim(),
        carbs: form.carbs.value.trim()
      },
      services: form.services.value.split(',').map(item => item.trim()).filter(Boolean),
      stock: form.stock.checked
    };

    if (!product.name || !product.price) throw new Error('Название и цена обязательны');

    const index = state.products.findIndex(item => item.id === id);
    if (index >= 0) state.products[index] = product;
    else state.products.unshift(product);

    state.productsSha = await writeTextFile(
      'data/products.json',
      JSON.stringify(state.products, null, 2) + '\n',
      state.productsSha,
      `Save product ${product.name}`
    );

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
    state.productsSha = await writeTextFile(
      'data/products.json',
      JSON.stringify(state.products, null, 2) + '\n',
      state.productsSha,
      `Delete product ${id}`
    );
    renderProducts();
  } catch (error) {
    alert(error.message);
  }
}

function linesToArray(value) {
  return String(value || '').split('\n').map(item => item.trim()).filter(Boolean);
}

function arrayToLines(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function renderSiteForm() {
  const form = $('[data-site-form]');
  form.brand.value = state.site.brand || '';
  form.tagline.value = state.site.tagline || '';
  form.heroTitle.value = state.site.heroTitle || '';
  form.heroText.value = state.site.heroText || '';
  form.phone.value = state.site.phone || '';
  form.email.value = state.site.email || '';
  form.about.value = state.site.about || '';
  form.addresses.value = arrayToLines(state.site.addresses);
  form.benefits.value = arrayToLines(state.site.benefits);
}

function renderJsonEditor() {
  $('[data-json-form] textarea[name="json"]').value = JSON.stringify(state.site, null, 2);
}

async function submitSite(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-site-message]');
  message.textContent = 'Сохраняем site.json...';

  try {
    state.site = {
      ...state.site,
      brand: form.brand.value.trim(),
      tagline: form.tagline.value.trim(),
      heroTitle: form.heroTitle.value.trim(),
      heroText: form.heroText.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      about: form.about.value.trim(),
      addresses: linesToArray(form.addresses.value),
      benefits: linesToArray(form.benefits.value)
    };

    state.siteSha = await writeTextFile('data/site.json', JSON.stringify(state.site, null, 2) + '\n', state.siteSha, 'Update site texts');
    renderJsonEditor();
    message.textContent = 'Сайт сохранён. GitHub Pages обновит публикацию через некоторое время.';
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitJson(event) {
  event.preventDefault();
  const message = $('[data-json-message]');
  message.textContent = 'Проверяем и сохраняем JSON...';
  try {
    const nextSite = JSON.parse(event.currentTarget.json.value);
    state.site = nextSite;
    state.siteSha = await writeTextFile('data/site.json', JSON.stringify(state.site, null, 2) + '\n', state.siteSha, 'Update full site JSON');
    renderSiteForm();
    message.textContent = 'site.json сохранён.';
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('[data-upload-message]');
  message.textContent = 'Загружаем фото...';
  try {
    const file = form.image.files[0];
    const safeName = slugify(file.name.replace(/\.[^.]+$/, ''));
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '.jpg';
    const path = `uploads/${safeName}-${Date.now()}${ext}`;
    const savedPath = await uploadFile(path, file, `Upload ${file.name}`);
    message.textContent = `Фото загружено: ${savedPath}`;
    form.reset();
  } catch (error) {
    message.textContent = error.message;
  }
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
$('[data-json-form]').addEventListener('submit', submitJson);
$('[data-upload-form]').addEventListener('submit', submitUpload);
$('[data-reload]').addEventListener('click', loadData);
$('[data-logout]').addEventListener('click', logout);
$$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.adminTab)));
