/* ╔══════════════════════════════════════════════════════════╗
   ║            НАЛАШТУВАННЯ EMAILJS                          ║
   ║  1. Зайди на https://emailjs.com → зареєструйся         ║
   ║  2. Add Service → підключи Gmail                        ║
   ║  3. Email Templates → Create Template                   ║
   ║     Змінні в шаблоні: {{order_id}} {{ident}} {{name}}   ║
   ║     {{phone}} {{email}} {{delivery}} {{city}}           ║
   ║     {{photos_info}} {{total_qty}} {{total_price}}        ║
   ║  4. Account → API Keys → Public Key                     ║
   ╚══════════════════════════════════════════════════════════╝ */

const EMAILJS_PUBLIC_KEY  = 'OKVIg2JMHnfpoJMXj';
const EMAILJS_SERVICE_ID  = 'service_kr5v41g';
const EMAILJS_TEMPLATE_ID = 'template_ysrji1b';
const YOUR_EMAIL          = 'kardashsashaa2004@gmail.com';

const PRICE = 12; // грн за відбиток

const S = { step:1, identType:'instagram', ident:'', name:'', phone:'', email:'', delivery:'nova', city:'', photos:[] };
let pid = 0;

/* ═══════════════════════════════════════════════════════
   PERSISTENCE — localStorage draft system
   Saves all text state + photo metadata every time
   something changes. Photos themselves cannot be stored
   in localStorage (browser limitation) — user is shown
   a clear recovery banner to re-upload them.
   ═══════════════════════════════════════════════════════ */
const DRAFT_KEY = 'proyav_draft_v1';
const DRAFT_TTL = 24 * 60 * 60 * 1000; // 24 hours

function saveDraft() {
  if (S.step <= 1 && !S.ident) return; // nothing worth saving
  const draft = {
    savedAt:     Date.now(),
    step:        S.step,
    identType:   S.identType,
    ident:       S.ident,
    name:        S.name,
    phone:       S.phone,
    email:       S.email,
    delivery:    S.delivery,
    city:        S.city,
    // store photo metadata so user knows what to re-upload
    photosMeta:  S.photos.map(p => ({
      id:    p.id,
      color: p.color,
      paper: p.paper,
      qty:   p.qty,
    })),
  };
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch(e) {}
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || Date.now() - d.savedAt > DRAFT_TTL) { clearDraft(); return null; }
    return d;
  } catch(e) { return null; }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch(e) {}
}

function applyDraft(d) {
  S.identType = d.identType || 'instagram';
  S.ident     = d.ident     || '';
  S.name      = d.name      || '';
  S.phone     = d.phone     || '';
  S.email     = d.email     || '';
  S.delivery  = d.delivery  || 'nova';
  S.city      = d.city      || '';

  // Restore form fields
  setIdentType(S.identType);
  const identInp = document.getElementById('ident-input');
  if (S.identType === 'instagram') {
    identInp.value = S.ident;
  } else {
    // stored as "ПРЯ-123456", show only digits in input
    identInp.value = S.ident.replace('ПРЯ-', '');
  }
  onIdentInput();

  if (S.name)  { document.getElementById('inp-name').value  = S.name;  document.getElementById('inp-name').classList.add('valid'); }
  if (S.phone) { document.getElementById('inp-phone').value = S.phone; document.getElementById('inp-phone').classList.add('valid'); }
  if (S.email) { document.getElementById('inp-email').value = S.email; document.getElementById('inp-email').classList.add('valid'); }
  setDelivery(S.delivery);
  if (S.city)  { document.getElementById('inp-city').value  = S.city;  document.getElementById('inp-city').classList.add('valid'); }

  // Show photo recovery banner if there were photos
  if (d.photosMeta && d.photosMeta.length > 0) {
    showPhotoBanner(d.photosMeta);
  }
}

function showPhotoBanner(meta) {
  const totalPrints = meta.reduce((s, p) => s + (p.qty || 1), 0);
  const existing = document.getElementById('photo-recovery-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'photo-recovery-banner';
  banner.innerHTML = `
    <div class="recovery-banner">
      <div class="recovery-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <div class="recovery-text">
        <strong>Незавершене замовлення</strong>
        <span>Потрібно повторно завантажити ${meta.length} фото (${totalPrints} відбитків). Налаштування збережено.</span>
      </div>
      <button class="recovery-dismiss" onclick="dismissPhotoBanner()" aria-label="Закрити">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
      </button>
    </div>`;
  const screen3 = document.getElementById('screen-3');
  screen3.insertBefore(banner, screen3.firstChild);
}

function dismissPhotoBanner() {
  const b = document.getElementById('photo-recovery-banner');
  if (b) { b.style.animation = 'bannerOut .25s ease forwards'; setTimeout(() => b.remove(), 260); }
}

/* ─ Init ─ */
window.addEventListener('DOMContentLoaded', () => {
  emailjs.init(EMAILJS_PUBLIC_KEY);
  renderStepper();
  setDelivery('nova');

  // ── Restore draft ──
  const draft = loadDraft();
  if (draft && draft.step > 1) {
    applyDraft(draft);
    // Go to the step where user left off (cap at step 3 — photos need re-upload)
    const resumeStep = Math.min(draft.step, 3);
    goTo(resumeStep);
    // Show splash only briefly when resuming
    setTimeout(() => {
      const s = document.getElementById('splash');
      if (s) { s.classList.add('done'); setTimeout(() => s.remove(), 700); }
    }, 800);
  } else {
    setTimeout(() => {
      const s = document.getElementById('splash');
      if (s) { s.classList.add('done'); setTimeout(() => s.remove(), 800); }
    }, 1600);
  }
});

// ── Warn before accidental exit on steps 2-4 ──
window.addEventListener('beforeunload', (e) => {
  if (S.step >= 2 && S.photos.length > 0) {
    e.preventDefault();
    e.returnValue = ''; // required for Chrome
  }
});

/* ─ Toast ─ */
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ─ Navigation ─ */
function goTo(step, back=false) {
  document.getElementById(`screen-${S.step}`)?.classList.remove('active');
  S.step = step;
  saveDraft();
  const el = document.getElementById(`screen-${step}`);
  if (el) {
    el.classList.add('active');
    el.style.animation = 'none'; el.offsetHeight;
    el.style.animation = back ? 'screenInBack .38s cubic-bezier(.22,1,.36,1)' : '';
  }
  renderStepper();
  if (step === 4) renderReview();
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ─ Stepper ─ */
function renderStepper() {
  let h = '';
  [1,2,3,4].forEach((s,i) => {
    const done = S.step>s, active = S.step===s;
    const inner = done
      ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"><polyline points="1,6 5,10 11,2"/></svg>`
      : s;
    h += `<div class="step-item"><div class="step-bubble ${done?'done':active?'active':''}">${inner}</div>`;
    if (i<3) h += `<div class="step-line ${done?'done':''}"></div>`;
    h += `</div>`;
  });
  document.getElementById('stepper').innerHTML = h;
}

/* ─ Ripple ─ */
function ripple(btn, e) {
  const r = document.createElement('span'); r.className = 'ripple';
  const rect = btn.getBoundingClientRect(), sz = Math.max(rect.width, rect.height);
  r.style.cssText = `width:${sz}px;height:${sz}px;left:${(e.clientX||rect.width/2)-rect.left-sz/2}px;top:${(e.clientY||rect.height/2)-rect.top-sz/2}px`;
  btn.appendChild(r); setTimeout(() => r.remove(), 600);
}
document.addEventListener('click', e => { const b = e.target.closest('.btn-primary,.btn-primary-sm'); if(b) ripple(b,e); });

/* ══ STEP 1 ══ */

/* ── Instagram rules (official) ──
   · Only a-z, A-Z, 0-9, underscore (_), period (.)
   · 1–30 characters
   · Cannot start or end with a period
   · No consecutive periods (..)
   · Case-insensitive (we lowercase on save)                     */
function isValidInstagram(v) {
  if (!v || v.length < 1 || v.length > 30) return false;
  if (!/^[a-zA-Z0-9._]+$/.test(v))        return false;
  if (v.startsWith('.') || v.endsWith('.'))return false;
  if (v.includes('..'))                    return false;
  return true;
}

/* ── Order format: ПРЯ-XXXXXX (6 digits) ── */
function isValidOrder(v) {
  return /^\d{6}$/.test(v.trim());
}

function igErrorMsg(v) {
  if (!v)                                    return '';
  if (v.length > 30)                         return 'Максимум 30 символів';
  if (v.startsWith('.') || v.endsWith('.'))  return 'Нікнейм не може починатися або закінчуватися крапкою';
  if (v.includes('..'))                      return 'Не можна використовувати дві крапки поспіль';
  if (!/^[a-zA-Z0-9._]+$/.test(v))          return 'Дозволено тільки літери, цифри, крапку та підкреслення';
  return '';
}

function setIdentType(type) {
  S.identType = type;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));

  const label   = document.getElementById('ident-label');
  const prefix  = document.getElementById('ident-prefix');
  const badge   = document.getElementById('order-badge');
  const inp     = document.getElementById('ident-input');
  const counter = document.getElementById('ident-counter');
  const hint    = document.getElementById('ident-hint');

  inp.value = '';
  clearErr('ident-input', 'ident-err');
  hint.classList.remove('visible');
  hint.textContent = '';

  if (type === 'instagram') {
    label.textContent = 'Нікнейм Instagram';
    prefix.style.display = '';
    badge.classList.remove('visible');
    inp.classList.remove('order-mode', 'has-counter');
    inp.classList.add('has-prefix', 'has-counter');
    inp.placeholder = 'your_nickname';
    inp.maxLength   = 30;
    inp.inputMode   = 'text';
    counter.classList.add('visible');
    counter.textContent = '0/30';
    hint.textContent = 'Тільки латинські літери, цифри, крапка та підкреслення';
    hint.classList.add('visible');
  } else {
    label.textContent = 'Номер замовлення';
    prefix.style.display = 'none';
    badge.classList.add('visible');
    inp.classList.remove('has-prefix', 'has-counter');
    inp.classList.add('order-mode');
    inp.placeholder = '123456';
    inp.maxLength   = 6;
    inp.inputMode   = 'numeric';
    counter.classList.remove('visible');
    hint.textContent = 'Введіть 6-значний номер із вашого підтвердження';
    hint.classList.add('visible');
  }

  document.getElementById('btn-step1').disabled = true;
}

function onIdentInput() {
  const inp = document.getElementById('ident-input');
  let v = inp.value;

  if (S.identType === 'instagram') {
    /* Strip disallowed characters in real-time */
    const cleaned = v.replace(/[^a-zA-Z0-9._]/g, '');
    if (cleaned !== v) { inp.value = cleaned; v = cleaned; }

    const counter = document.getElementById('ident-counter');
    const len = v.length;
    counter.textContent = `${len}/30`;
    counter.classList.toggle('warn', len >= 28);

    S.ident = v;
    const errMsg = igErrorMsg(v);
    const valid  = isValidInstagram(v);

    if (v.length === 0) {
      clearErr('ident-input', 'ident-err');
      inp.classList.remove('valid', 'error');
    } else if (valid) {
      clearErr('ident-input', 'ident-err');
      inp.classList.add('valid'); inp.classList.remove('error');
    } else {
      /* Show inline error but no shake while typing */
      inp.classList.remove('valid'); inp.classList.add('error');
      const errEl = document.getElementById('ident-err');
      if (errMsg) { errEl.textContent = errMsg; errEl.classList.add('show'); }
    }

    document.getElementById('btn-step1').disabled = !valid;

  } else {
    /* Order mode: only allow digits */
    const cleaned = v.replace(/\D/g, '').slice(0, 6);
    if (cleaned !== v) { inp.value = cleaned; v = cleaned; }

    S.ident = 'ПРЯ-' + v;   // store full order id
    const valid = isValidOrder(v);
    if (v.length === 0) {
      clearErr('ident-input', 'ident-err');
      inp.classList.remove('valid', 'error');
    } else if (valid) {
      clearErr('ident-input', 'ident-err');
      inp.classList.add('valid'); inp.classList.remove('error');
    } else {
      inp.classList.remove('valid', 'error');  // no red while still typing
    }
    document.getElementById('btn-step1').disabled = !valid;
  }
}

function tryStep1(e) {
  if (S.identType === 'instagram') {
    if (!isValidInstagram(document.getElementById('ident-input').value)) {
      const msg = igErrorMsg(document.getElementById('ident-input').value) || 'Введіть коректний нікнейм Instagram';
      shake('ident-input', 'ident-err', msg); return;
    }
    S.ident = document.getElementById('ident-input').value.toLowerCase(); // normalize
  } else {
    const v = document.getElementById('ident-input').value;
    if (!isValidOrder(v)) {
      shake('ident-input', 'ident-err', 'Номер замовлення — 6 цифр (наприклад: 123456)'); return;
    }
    S.ident = 'ПРЯ-' + v;
  }
  goTo(2);
}

/* ══ STEP 2 ══ */
function isPhone(v) { return /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(v.replace(/\s/g,'')); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

function liveValidate(id, errId, test, msg) {
  const el = document.getElementById(id); const v = el.value.trim();
  if (!v) { clearErr(id,errId); el.classList.remove('valid'); return; }
  if (test()) { clearErr(id,errId); el.classList.add('valid'); }
  else { el.classList.remove('valid'); }
}

function liveEmailValidate() {
  const el = document.getElementById('inp-email'); const v = el.value.trim();
  clearErr('inp-email','email-err'); el.classList.remove('valid','error');
  if (!v) return;
  if (isEmail(v)) el.classList.add('valid');
  else { document.getElementById('email-err').textContent='Некоректний email'; document.getElementById('email-err').classList.add('show'); el.classList.add('error'); }
}

function setDelivery(type) {
  S.delivery = type;
  document.getElementById('del-nova').classList.toggle('active', type==='nova');
  document.getElementById('del-self').classList.toggle('active', type==='self');
  document.getElementById('city-wrap').style.display = type==='nova' ? '' : 'none';
  saveDraft();
}

function tryStep2(e) {
  const name  = document.getElementById('inp-name').value.trim();
  const phone = document.getElementById('inp-phone').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  const city  = document.getElementById('inp-city').value.trim();
  let ok = true;
  if (name.length < 2)         { shake('inp-name','name-err','Введіть ім\'я (мінімум 2 символи)'); ok=false; }
  if (!isPhone(phone))         { shake('inp-phone','phone-err','Введіть коректний номер телефону'); ok=false; }
  if (email && !isEmail(email)){ shake('inp-email','email-err','Некоректний email'); ok=false; }
  if (S.delivery==='nova' && city.length<2) { shake('inp-city','city-err','Вкажіть місто або відділення'); ok=false; }
  if (!ok) return;
  S.name=name; S.phone=phone; S.email=email; S.city=city;
  saveDraft();
  goTo(3);
}

/* ─ Field helpers ─ */
function shake(id, errId, msg) {
  const el = document.getElementById(id); if(!el) return;
  el.classList.add('error'); el.classList.remove('valid');
  const err = document.getElementById(errId);
  if (err) { err.textContent=msg; err.classList.add('show'); }
  el.classList.remove('shake'); el.offsetHeight; el.classList.add('shake');
  setTimeout(()=>el.classList.remove('shake'),400);
  el.scrollIntoView({behavior:'smooth',block:'center'});
}
function clearErr(id, errId) {
  document.getElementById(id)?.classList.remove('error');
  document.getElementById(errId)?.classList.remove('show');
}

/* ══ STEP 3 ══ */
function onDragOver(e) { e.preventDefault(); document.getElementById('upload-zone').classList.add('dragover'); }
function onDragLeave() { document.getElementById('upload-zone').classList.remove('dragover'); }
function onDrop(e) { e.preventDefault(); document.getElementById('upload-zone').classList.remove('dragover'); addPhotos(Array.from(e.dataTransfer.files)); }
function onFilesSelected(e) { addPhotos(Array.from(e.target.files)); e.target.value=''; }

/* ═══════════════════════════════════════════════════════════════
   PHOTO VALIDATION PIPELINE
   Runs fully async — never blocks the UI.
   Each photo gets a structured result:
     { ok, warnings[], errors[], width, height, format }
   ═══════════════════════════════════════════════════════════════ */

/* ── Known file signatures (magic bytes) ── */
const MAGIC = {
  jpeg: [[0xFF,0xD8,0xFF]],
  png:  [[0x89,0x50,0x4E,0x47]],
  webp: null,  // checked separately (RIFF....WEBP)
  heic: null,  // checked separately (ftyp)
};

async function readFileHeader(file, bytes=12) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(new Uint8Array(e.target.result));
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, bytes));
  });
}

function matchesMagic(buf, sig) {
  return sig.every((b, i) => buf[i] === b);
}

async function detectRealFormat(file, buf) {
  if (!buf || buf.length < 12) return null;
  for (const sig of MAGIC.jpeg) if (matchesMagic(buf, sig)) return 'jpeg';
  for (const sig of MAGIC.png)  if (matchesMagic(buf, sig)) return 'png';
  // WebP: RIFF????WEBP
  if (buf[0]===0x52&&buf[1]===0x49&&buf[2]===0x46&&buf[3]===0x46 &&
      buf[8]===0x57&&buf[9]===0x45&&buf[10]===0x42&&buf[11]===0x50) return 'webp';
  // HEIC/HEIF: ftyp box
  if (buf[4]===0x66&&buf[5]===0x74&&buf[6]===0x79&&buf[7]===0x70) return 'heic';
  return null;
}

function getImageDimensions(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth,  h: img.naturalHeight, ok: true  });
    img.onerror = () => resolve({ w: 0, h: 0, ok: false });
    img.src = url;
  });
}

/* ── Main validation function ── */
async function validatePhoto(file, url) {
  const result = { ok: true, blocking: [], warnings: [], format: null, w: 0, h: 0 };

  /* 1. Minimum file size — anything under 5KB is almost certainly corrupt */
  if (file.size < 5 * 1024) {
    result.blocking.push('Файл занадто малий — схоже на пошкоджений або порожній файл');
    result.ok = false;
    return result;
  }

  /* 2. Magic bytes — verify real format, not just extension */
  const header = await readFileHeader(file, 12);
  const realFmt = await detectRealFormat(file, header);

  if (!realFmt) {
    // Extension says image but bytes say otherwise
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','webp','heic','heif'].includes(ext)) {
      result.blocking.push('Файл пошкоджений або має неправильний формат (не відповідає розширенню)');
    } else {
      result.blocking.push(`Формат «${ext}» не підтримується. Завантажте JPG, PNG, WebP або HEIC`);
    }
    result.ok = false;
    return result;
  }
  result.format = realFmt;

  /* 3. Check image actually loads and get dimensions */
  const dims = await getImageDimensions(url);
  if (!dims.ok) {
    result.blocking.push('Зображення не вдалося відкрити — файл пошкоджений');
    result.ok = false;
    return result;
  }
  result.w = dims.w;
  result.h = dims.h;

  /* 4. Zero dimensions — corrupt EXIF / truncated file */
  if (dims.w === 0 || dims.h === 0) {
    result.blocking.push('Не вдалося визначити розмір зображення — файл може бути пошкоджений');
    result.ok = false;
    return result;
  }

  /* ── Non-blocking checks (warnings) ── */

  /* 5. Resolution for 10×15 cm at 300 DPI
        10cm = 3.94in → 3.94×300 ≈ 1181px (short side)
        15cm = 5.91in → 5.91×300 ≈ 1772px (long side)
        We check short side ≥ 1181 and long side ≥ 1772               */
  const shortSide = Math.min(dims.w, dims.h);
  const longSide  = Math.max(dims.w, dims.h);
  const MIN_SHORT = 1181;
  const MIN_LONG  = 1772;

  if (shortSide < MIN_SHORT || longSide < MIN_LONG) {
    const megapix = ((dims.w * dims.h) / 1e6).toFixed(1);
    result.warnings.push(
      `Низька роздільна здатність: ${dims.w}×${dims.h}px (${megapix} МП). ` +
      `Для якісного друку рекомендується мінімум ${MIN_LONG}×${MIN_SHORT}px`
    );
  }

  /* 6. Orientation — 10×15 is portrait, landscape may print with white bars */
  if (dims.w > dims.h) {
    result.warnings.push(
      `Горизонтальне фото (${dims.w}×${dims.h}px). ` +
      `Формат 10×15 см вертикальний — фото буде обрізане або роздруковане з білими полями`
    );
  }

  /* 7. Extreme aspect ratio — panorama or very square */
  const ratio = longSide / shortSide;
  if (ratio > 2.5) {
    result.warnings.push(
      `Нестандартне співвідношення сторін (${ratio.toFixed(1)}:1). ` +
      `Частина зображення буде обрізана при друку 10×15`
    );
  }

  /* 8. Very large file — not blocking but noteworthy */
  if (file.size > 20 * 1024 * 1024) {
    result.warnings.push(
      `Великий файл (${(file.size/1024/1024).toFixed(0)} МБ) — завантаження може тривати довше`
    );
  }

  return result;
}

/* ── Build a single photo card DOM node (called ONCE per photo) ── */
function buildPhotoCard(ph) {
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.dataset.photoId = ph.id;
  card.innerHTML = `
    <div class="photo-preview photo-validating">
      <img src="${ph.previewUrl}" alt="фото">
      <span class="photo-size-badge">10 × 15 см</span>
      <button class="photo-delete" aria-label="Видалити фото">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
      </button>
    </div>
    <div class="photo-status-bar" id="status-${ph.id}"></div>
    <div class="photo-controls">
      <div>
        <span class="photo-seg-label">Колір</span>
        <div class="photo-seg" data-group="color">
          <button class="photo-seg-btn active" data-val="color">Кольорове</button>
          <button class="photo-seg-btn" data-val="bw">Чорно-біле</button>
        </div>
      </div>
      <div>
        <span class="photo-seg-label">Папір</span>
        <div class="photo-seg" data-group="paper">
          <button class="photo-seg-btn" data-val="gloss">Глянець</button>
          <button class="photo-seg-btn active" data-val="mat">Мат</button>
        </div>
      </div>
      <div class="qty-row">
        <span class="qty-label">Кількість</span>
        <div class="qty-controls">
          <button class="qty-btn qty-minus" aria-label="Зменшити">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="2" y1="6" x2="10" y2="6"/></svg>
          </button>
          <span class="qty-value">1</span>
          <button class="qty-btn qty-plus plus" aria-label="Збільшити">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>
          </button>
        </div>
      </div>
    </div>`;

  /* ── Delete ── */
  card.querySelector('.photo-delete').addEventListener('click', () => removePhoto(ph.id));

  /* ── Segment toggles ── */
  card.querySelectorAll('.photo-seg').forEach(seg => {
    seg.querySelectorAll('.photo-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        ph[seg.dataset.group] = btn.dataset.val;
        seg.querySelectorAll('.photo-seg-btn').forEach(b => b.classList.toggle('active', b===btn));
        updateSummary(); saveDraft();
      });
    });
  });

  /* ── Quantity ── */
  const qtyEl = card.querySelector('.qty-value');
  card.querySelector('.qty-minus').addEventListener('click', () => {
    if (ph.qty <= 1) return;
    ph.qty--; qtyEl.textContent = ph.qty; bumpQty(qtyEl); updateSummary(); saveDraft();
  });
  card.querySelector('.qty-plus').addEventListener('click', () => {
    ph.qty++; qtyEl.textContent = ph.qty; bumpQty(qtyEl); updateSummary(); saveDraft();
  });

  return card;
}

/* ── Render validation results into the status bar ── */
function renderValidation(ph, result) {
  const preview = document.querySelector(`[data-photo-id="${ph.id}"] .photo-preview`);
  const bar     = document.getElementById(`status-${ph.id}`);
  if (!preview || !bar) return;

  // Remove loading spinner
  preview.classList.remove('photo-validating');

  if (!result.ok) {
    // Blocking error — mark card and show error
    bar.innerHTML = result.blocking.map(msg => `
      <span class="status-badge err">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="6" r="5"/><line x1="6" y1="3.5" x2="6" y2="6.5"/><circle cx="6" cy="8.5" r=".6" fill="currentColor"/></svg>
        ${msg}
      </span>`).join('');
    // Add a "remove" prompt
    bar.innerHTML += `<span class="status-badge err" style="cursor:pointer" onclick="removePhoto(${ph.id})">Видалити ×</span>`;
    return;
  }

  // Warnings
  if (result.warnings.length > 0) {
    bar.innerHTML = result.warnings.map(msg => `
      <span class="status-badge warn">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 1.5L11 10H1L6 1.5z"/><line x1="6" y1="5" x2="6" y2="7.5"/><circle cx="6" cy="9" r=".6" fill="currentColor"/></svg>
        ${msg}
      </span>`).join('');
    return;
  }

  // All good — show resolution info as a soft ok badge
  const mp = ((result.w * result.h) / 1e6).toFixed(1);
  bar.innerHTML = `
    <span class="status-badge ok">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1.5,6 4.5,9.5 10.5,2.5"/></svg>
      ${result.w}×${result.h}px · ${mp} МП
    </span>`;
}

function bumpQty(el) {
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'qtyBump .22s ease';
}

/* ── Add photos: validate then append ── */
const MAX_PHOTOS = 100;

async function addPhotos(files) {
  const list = document.getElementById('photos-list');

  for (const file of files) {
    // Hard limit
    if (S.photos.length >= MAX_PHOTOS) {
      showToast(`⚠ Максимум ${MAX_PHOTOS} фото в одному замовленні`);
      break;
    }

    // Basic format filter before heavy checks
    if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
      showToast(`⚠ ${file.name}: непідтримуваний тип файлу`); continue;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast(`⚠ ${file.name}: файл більше 25 МБ`); continue;
    }

    // Duplicate check (same name + size)
    const isDup = S.photos.some(p => p.file.name === file.name && p.file.size === file.size);
    if (isDup) { showToast(`⚠ ${file.name}: це фото вже додано`); continue; }

    const id  = ++pid;
    const url = URL.createObjectURL(file);
    const ph  = { id, file, previewUrl: url, color: 'color', paper: 'mat', qty: 1 };
    S.photos.push(ph);

    const card = buildPhotoCard(ph);
    list.appendChild(card);
    updateUploadVisibility();
    updateSummary();

    // Run async validation — updates card when ready, no UI blocking
    validatePhoto(file, url).then(result => {
      ph.validationResult = result;
      if (!result.ok) {
        // Keep in list but mark — user decides whether to remove
        ph.hasError = true;
      }
      renderValidation(ph, result);
      saveDraft();
    });
  }

  updateUploadVisibility();
  updateSummary();
}

/* ── Remove ── */
function removePhoto(id) {
  const ph   = S.photos.find(p => p.id === id); if (!ph) return;
  const card = document.querySelector(`[data-photo-id="${id}"]`);
  URL.revokeObjectURL(ph.previewUrl);
  S.photos = S.photos.filter(p => p.id !== id);
  if (card) {
    card.classList.add('removing');
    card.addEventListener('animationend', () => card.remove(), { once: true });
  }
  updateUploadVisibility();
  updateSummary();
  saveDraft();
}

/* ── Helpers ── */
function updateUploadVisibility() {
  const has = S.photos.length > 0;
  document.getElementById('upload-zone').style.display   = has ? 'none' : '';
  document.getElementById('photos-bottom').style.display = has ? '' : 'none';
}

function updateSummary() {
  const totalQty = S.photos.reduce((s, p) => s + p.qty, 0);
  const errCount = S.photos.filter(p => p.hasError).length;
  let text = `${S.photos.length} фото · ${totalQty} відбитків`;
  if (errCount > 0) text += ` · ⚠ ${errCount} з помилками`;
  document.getElementById('photos-summary').textContent = text;
}

/* Legacy stubs — safe to call but do nothing harmful now */
function setOpt() {}
function changeQty() {}
function renderPhotos() {}

/* ══ STEP 4 ══ */
function renderReview() {
  document.getElementById('rv-ident-label').textContent = S.identType==='instagram'?'Instagram':'Замовлення';
  document.getElementById('rv-ident-val').textContent = S.identType==='instagram'?`@${S.ident}`:`#${S.ident}`;
  document.getElementById('rv-name').textContent = S.name;
  document.getElementById('rv-phone').textContent = S.phone;
  const er=document.getElementById('rv-email-row');
  if(S.email){er.style.display='';document.getElementById('rv-email').textContent=S.email;}else er.style.display='none';
  document.getElementById('rv-delivery').textContent = S.delivery==='nova'?'Нова Пошта':'Самовивіз';
  const cr=document.getElementById('rv-city-row');
  if(S.delivery==='nova'){cr.style.display='';document.getElementById('rv-city').textContent=S.city;}else cr.style.display='none';
  document.getElementById('rv-photos-title').textContent = `Фото · ${S.photos.length}`;
  document.getElementById('rv-photos-grid').innerHTML = S.photos.map(ph=>`
    <div class="review-photo-thumb">
      <img src="${ph.previewUrl}" alt="" loading="lazy">
      <div class="review-photo-badge">${ph.color==='color'?'Колір':'Ч/Б'} · ${ph.paper==='mat'?'Мат':'Глянець'} · ×${ph.qty}</div>
    </div>`).join('');
  const tq=S.photos.reduce((s,p)=>s+p.qty,0);
  document.getElementById('rv-total-qty').textContent=tq;
  document.getElementById('rv-total-price').textContent=`${tq*PRICE} ₴`;
}

/* ══ SUBMIT ══ */
async function submitOrder(e) {
  const btn=document.getElementById('btn-submit');
  btn.disabled=true; btn.innerHTML=`<div class="btn-spinner"></div> Надсилаємо...`;
  const orderId='ПРЯ-'+Date.now().toString().slice(-6);
  const tq=S.photos.reduce((s,p)=>s+p.qty,0);
  const photosInfo=S.photos.map((p,i)=>`Фото ${i+1}: ${p.color==='color'?'Кольорове':'Чорно-біле'}, ${p.paper==='mat'?'Мат':'Глянець'}, ${p.qty} відб.`).join('\n');
  const params={to_email:YOUR_EMAIL,order_id:orderId,ident:(S.identType==='instagram'?'@':'')+S.ident,name:S.name,phone:S.phone,email:S.email||'—',delivery:S.delivery==='nova'?'Нова Пошта':'Самовивіз',city:S.city||'—',photos_info:photosInfo,total_qty:tq,total_price:tq*PRICE+' ₴'};
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);
    document.getElementById('success-order-num').textContent=orderId;
    clearDraft();
    celebrate(); goTo(5);
  } catch(err) {
    console.error(err);
    btn.disabled=false; btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 16 16" fill="white"><path d="M2 8l10-5-4 5 4 5-10-5z"/></svg> Надіслати замовлення`;
    showToast('⚠ Помилка відправки. Перевір налаштування EmailJS.');
  }
}

/* ─ Confetti ─ */
function celebrate() {
  const c=document.getElementById('dotsCanvas'); c.style.display='block';
  c.width=window.innerWidth; c.height=window.innerHeight;
  const ctx=c.getContext('2d');
  const ps=Array.from({length:60},()=>({x:Math.random()*c.width,y:c.height+20,r:Math.random()*5+2,vx:(Math.random()-.5)*3,vy:-(Math.random()*9+5),color:['#2c2a28','#c8b89a','#a89070','#f5efe4','#6e5c4a'][Math.floor(Math.random()*5)],alpha:1}));
  let f=0;
  (function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.2;p.alpha-=.013;ctx.globalAlpha=Math.max(0,p.alpha);ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill()});
    ctx.globalAlpha=1;
    if(++f<130) requestAnimationFrame(draw);
    else{c.style.display='none';ctx.clearRect(0,0,c.width,c.height);}
  })();
}

/* ─ Reset ─ */
function resetApp() {
  S.photos.forEach(p=>URL.revokeObjectURL(p.previewUrl));
  Object.assign(S,{step:1,identType:'instagram',ident:'',name:'',phone:'',email:'',delivery:'nova',city:'',photos:[]});
  ['ident-input','inp-name','inp-phone','inp-email','inp-city'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';el.classList.remove('error','valid','shake');}});
  document.querySelectorAll('.field-error').forEach(e=>e.classList.remove('show'));
  document.getElementById('photos-list').innerHTML = '';   // clear photo cards DOM
  clearDraft();
  const b = document.getElementById('photo-recovery-banner'); if(b) b.remove();
  setDelivery('nova'); setIdentType('instagram');
  updateUploadVisibility(); updateSummary();
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-1').classList.add('active');
  document.getElementById('btn-step1').disabled=true;
  renderStepper(); window.scrollTo({top:0});
}
