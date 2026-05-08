
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

/* ─ Init ─ */
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const s = document.getElementById('splash');
    s.classList.add('done');
    setTimeout(() => s.remove(), 800);
  }, 1600);
  renderStepper();
  setDelivery('nova');
  emailjs.init(EMAILJS_PUBLIC_KEY);
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
function setIdentType(type) {
  S.identType = type;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type===type));
  const label = document.getElementById('ident-label'), prefix = document.getElementById('ident-prefix'), inp = document.getElementById('ident-input');
  if (type==='instagram') { label.textContent='Нікнейм Instagram'; prefix.textContent='@'; inp.placeholder='your_nickname'; }
  else { label.textContent='Номер замовлення'; prefix.textContent='#'; inp.placeholder='000123'; }
  clearErr('ident-input','ident-err'); onIdentInput();
}

function onIdentInput() {
  S.ident = document.getElementById('ident-input').value.trim();
  clearErr('ident-input','ident-err');
  document.getElementById('btn-step1').disabled = S.ident.length < 2;
}

function tryStep1(e) {
  if (S.ident.length < 2) { shake('ident-input','ident-err','Введіть коректне значення'); return; }
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

/* ── Build a single photo card DOM node (called ONCE per photo) ── */
function buildPhotoCard(ph) {
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.dataset.photoId = ph.id;
  card.innerHTML = `
    <div class="photo-preview">
      <img src="${ph.previewUrl}" alt="фото">
      <span class="photo-size-badge">10 × 15 см</span>
      <button class="photo-delete" aria-label="Видалити фото">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
      </button>
    </div>
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

  /* ── Segment toggles (color / paper) ── */
  card.querySelectorAll('.photo-seg').forEach(seg => {
    const group = seg.dataset.group;
    seg.querySelectorAll('.photo-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        ph[group] = val;                                         // update state
        seg.querySelectorAll('.photo-seg-btn').forEach(b => b.classList.toggle('active', b===btn));
        updateSummary();                                         // just the footer counter
      });
    });
  });

  /* ── Quantity ── */
  const qtyEl = card.querySelector('.qty-value');
  card.querySelector('.qty-minus').addEventListener('click', () => {
    if (ph.qty <= 1) return;
    ph.qty--;
    qtyEl.textContent = ph.qty;
    bumpQty(qtyEl);
    updateSummary();
  });
  card.querySelector('.qty-plus').addEventListener('click', () => {
    ph.qty++;
    qtyEl.textContent = ph.qty;
    bumpQty(qtyEl);
    updateSummary();
  });

  return card;
}

function bumpQty(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'qtyBump .22s ease';
}

/* ── Add photos: append new cards, never re-render existing ones ── */
function addPhotos(files) {
  const list = document.getElementById('photos-list');
  files.forEach(file => {
    if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
      showToast(`⚠ ${file.name}: непідтримуваний формат`); return;
    }
    if (file.size > 25 * 1024 * 1024) { showToast(`⚠ ${file.name}: файл більше 25 МБ`); return; }

    const id = ++pid;
    const url = URL.createObjectURL(file);
    const ph  = { id, file, previewUrl: url, color: 'color', paper: 'mat', qty: 1 };
    S.photos.push(ph);

    const card = buildPhotoCard(ph);
    list.appendChild(card);

    /* Check image integrity without touching the card's own <img> */
    const probe = new Image();
    probe.onerror = () => {
      const warn = document.createElement('div');
      warn.className = 'photo-warn';
      warn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><path d="M8 2L14.5 14H1.5L8 2z" stroke="#a04000" stroke-width="1.4"/><line x1="8" y1="7" x2="8" y2="11" stroke="#a04000" stroke-width="1.4"/><circle cx="8" cy="12.5" r=".8" fill="#a04000"/></svg><span>Не вдалось прочитати зображення — файл може бути пошкоджений</span>`;
      card.querySelector('.photo-preview').after(warn);
    };
    probe.src = url;
  });

  updateUploadVisibility();
  updateSummary();
}

/* ── Remove: animate out a single card ── */
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
}

/* ── Helpers ── */
function updateUploadVisibility() {
  const has = S.photos.length > 0;
  document.getElementById('upload-zone').style.display    = has ? 'none' : '';
  document.getElementById('photos-bottom').style.display  = has ? '' : 'none';
}

function updateSummary() {
  const totalQty = S.photos.reduce((s, p) => s + p.qty, 0);
  document.getElementById('photos-summary').textContent = `${S.photos.length} фото · ${totalQty} відбитків`;
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
  setDelivery('nova'); setIdentType('instagram');
  updateUploadVisibility(); updateSummary();
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-1').classList.add('active');
  document.getElementById('btn-step1').disabled=true;
  renderStepper(); window.scrollTo({top:0});
}
