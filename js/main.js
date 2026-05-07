
// ─── State ───────────────────────────────────────────
const state = {
  step: 1,
  identType: 'instagram',
  ident: '',
  name: '',
  phone: '',
  email: '',
  delivery: 'nova',
  city: '',
  photos: []   // { id, file, previewUrl, color, paper, qty }
};

let photoIdCounter = 0;
const PRICE_PER_PRINT = 12; // грн орієнтовно

// ─── Navigation ───────────────────────────────────────
function goTo(step) {
  const oldScreen = document.getElementById(`screen-${state.step}`);
  if (oldScreen) oldScreen.classList.remove('active');

  state.step = step;

  const newScreen = document.getElementById(`screen-${step}`);
  if (newScreen) newScreen.classList.add('active');

  renderStepper();
  if (step === 4) renderReview();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Stepper ─────────────────────────────────────────
function renderStepper() {
  const el = document.getElementById('stepper');
  const steps = [1,2,3,4];
  let html = '';
  steps.forEach((s, i) => {
    const done = state.step > s;
    const active = state.step === s;
    const bubbleClass = done ? 'done' : active ? 'active' : '';
    const inner = done
      ? `<svg class="check-icon" viewBox="0 0 14 14" fill="none" stroke="white" stroke-width="1.8"><polyline points="2,7 6,11 12,3"/></svg>`
      : s;
    html += `<div class="step-item"><div class="step-bubble ${bubbleClass}">${inner}</div>`;
    if (i < steps.length - 1) {
      html += `<div class="step-line ${done ? 'done' : ''}"></div>`;
    }
    html += `</div>`;
  });
  el.innerHTML = html;
}

// ─── Step 1 logic ────────────────────────────────────
function setIdentType(type) {
  state.identType = type;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));

  const label = document.getElementById('ident-label');
  const prefix = document.getElementById('ident-prefix');
  const input = document.getElementById('ident-input');

  if (type === 'instagram') {
    label.textContent = 'Нікнейм Instagram';
    prefix.textContent = '@';
    prefix.style.display = '';
    input.classList.add('has-prefix');
    input.placeholder = 'your_nickname';
  } else {
    label.textContent = 'Номер замовлення';
    prefix.textContent = '#';
    prefix.style.display = '';
    input.classList.add('has-prefix');
    input.placeholder = '000123';
  }
  validateStep1();
}

function validateStep1() {
  const val = document.getElementById('ident-input').value.trim();
  state.ident = val;
  document.getElementById('btn-step1').disabled = val.length < 2;
}

// ─── Step 2 logic ────────────────────────────────────
function setDelivery(type) {
  state.delivery = type;
  document.getElementById('del-nova').classList.toggle('active', type === 'nova');
  document.getElementById('del-self').classList.toggle('active', type === 'self');
  document.getElementById('city-wrap').style.display = type === 'nova' ? '' : 'none';
  validateStep2();
}

function validateStep2() {
  const name = document.getElementById('inp-name').value.trim();
  const phone = document.getElementById('inp-phone').value.trim();
  const city = state.delivery === 'nova' ? document.getElementById('inp-city').value.trim() : 'ok';

  state.name = name;
  state.phone = phone;
  state.email = document.getElementById('inp-email').value.trim();
  state.city = document.getElementById('inp-city').value.trim();

  document.getElementById('btn-step2').disabled = !(name.length > 1 && phone.length > 7 && city.length > 0);
}

// ─── Step 3: Photos ───────────────────────────────────
function onDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('dragover');
}

function onDragLeave() {
  document.getElementById('upload-zone').classList.remove('dragover');
}

function onDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  addPhotos(files);
}

function onFilesSelected(e) {
  const files = Array.from(e.target.files);
  addPhotos(files);
  e.target.value = '';
}

function addPhotos(files) {
  files.forEach(file => {
    if (file.size > 25 * 1024 * 1024) { alert(`Файл ${file.name} перевищує 25 МБ`); return; }
    const id = ++photoIdCounter;
    const url = URL.createObjectURL(file);
    state.photos.push({ id, file, previewUrl: url, color: 'color', paper: 'mat', qty: 1 });
  });
  renderPhotos();
}

function removePhoto(id) {
  const ph = state.photos.find(p => p.id === id);
  if (ph) URL.revokeObjectURL(ph.previewUrl);
  state.photos = state.photos.filter(p => p.id !== id);
  renderPhotos();
}

function setPhotoOpt(id, key, val) {
  const ph = state.photos.find(p => p.id === id);
  if (ph) ph[key] = val;
  renderPhotos();
}

function changeQty(id, delta) {
  const ph = state.photos.find(p => p.id === id);
  if (ph) ph.qty = Math.max(1, ph.qty + delta);
  renderPhotos();
}

function renderPhotos() {
  const list = document.getElementById('photos-list');
  const zone = document.getElementById('upload-zone');
  const bottom = document.getElementById('photos-bottom');
  const summary = document.getElementById('photos-summary');

  const hasPhotos = state.photos.length > 0;
  zone.style.display = hasPhotos ? 'none' : '';
  bottom.style.display = hasPhotos ? '' : 'none';

  list.innerHTML = state.photos.map(ph => `
    <div class="photo-card" data-id="${ph.id}">
      <div class="photo-preview">
        <img src="${ph.previewUrl}" alt="фото">
        <span class="photo-size-badge">10 × 15 см</span>
        <button class="photo-delete" onclick="removePhoto(${ph.id})">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" stroke-width="1.8"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
        </button>
      </div>
      <div class="photo-controls">
        <div>
          <span class="photo-seg-label">Колір</span>
          <div class="photo-seg">
            <button class="photo-seg-btn ${ph.color==='color'?'active':''}" onclick="setPhotoOpt(${ph.id},'color','color')">Кольорове</button>
            <button class="photo-seg-btn ${ph.color==='bw'?'active':''}" onclick="setPhotoOpt(${ph.id},'color','bw')">Чорно-біле</button>
          </div>
        </div>
        <div>
          <span class="photo-seg-label">Папір</span>
          <div class="photo-seg">
            <button class="photo-seg-btn ${ph.paper==='gloss'?'active':''}" onclick="setPhotoOpt(${ph.id},'paper','gloss')">Глянець</button>
            <button class="photo-seg-btn ${ph.paper==='mat'?'active':''}" onclick="setPhotoOpt(${ph.id},'paper','mat')">Мат</button>
          </div>
        </div>
        <div class="qty-row">
          <span class="qty-label">Кількість</span>
          <div class="qty-controls">
            <button class="qty-btn" onclick="changeQty(${ph.id},-1)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="2" y1="7" x2="12" y2="7"/></svg>
            </button>
            <span class="qty-value">${ph.qty}</span>
            <button class="qty-btn plus" onclick="changeQty(${ph.id},1)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" stroke-width="1.8"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  const totalQty = state.photos.reduce((s, p) => s + p.qty, 0);
  summary.textContent = `${state.photos.length} фото · ${totalQty} відбитків`;
}

// ─── Review ─────────────────────────────────────────
function renderReview() {
  document.getElementById('rv-ident-label').textContent = state.identType === 'instagram' ? 'Instagram' : 'Замовлення';
  const identVal = state.identType === 'instagram' ? `@${state.ident}` : `#${state.ident}`;
  document.getElementById('rv-ident-val').textContent = identVal;
  document.getElementById('rv-name').textContent = state.name;
  document.getElementById('rv-phone').textContent = state.phone;

  const emailRow = document.getElementById('rv-email-row');
  if (state.email) {
    emailRow.style.display = '';
    document.getElementById('rv-email').textContent = state.email;
  } else {
    emailRow.style.display = 'none';
  }

  document.getElementById('rv-delivery').textContent = state.delivery === 'nova' ? 'Нова Пошта' : 'Самовивіз';
  const cityRow = document.getElementById('rv-city-row');
  if (state.delivery === 'nova') {
    cityRow.style.display = '';
    document.getElementById('rv-city').textContent = state.city;
  } else {
    cityRow.style.display = 'none';
  }

  const grid = document.getElementById('rv-photos-grid');
  grid.innerHTML = state.photos.map(ph => {
    const colorLabel = ph.color === 'color' ? 'Колір' : 'Ч/Б';
    const paperLabel = ph.paper === 'mat' ? 'Мат' : 'Глянець';
    return `
      <div class="review-photo-thumb">
        <img src="${ph.previewUrl}" alt="">
        <div class="review-photo-badge">${colorLabel} · ${paperLabel} · ×${ph.qty}</div>
      </div>
    `;
  }).join('');

  const totalQty = state.photos.reduce((s, p) => s + p.qty, 0);
  const totalPrice = totalQty * PRICE_PER_PRINT;
  document.getElementById('rv-total-qty').textContent = totalQty;
  document.getElementById('rv-total-price').textContent = `${totalPrice} ₴`;
}

// ─── Submit ──────────────────────────────────────────
function submitOrder() {
  // In production: POST to backend with FormData
  goTo(5);
}

// ─── Reset ───────────────────────────────────────────
function resetApp() {
  state.photos.forEach(ph => URL.revokeObjectURL(ph.previewUrl));
  state.photos = [];
  state.step = 1;
  state.ident = '';
  state.name = '';
  state.phone = '';
  state.email = '';
  state.city = '';
  state.delivery = 'nova';
  state.identType = 'instagram';

  document.getElementById('ident-input').value = '';
  document.getElementById('inp-name').value = '';
  document.getElementById('inp-phone').value = '';
  document.getElementById('inp-email').value = '';
  document.getElementById('inp-city').value = '';

  setDelivery('nova');
  setIdentType('instagram');
  renderPhotos();

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-1').classList.add('active');
  renderStepper();
  window.scrollTo({ top: 0 });
}

// ─── Init ────────────────────────────────────────────
renderStepper();
setDelivery('nova');
