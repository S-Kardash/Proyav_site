/* ════════════════════════════════════════════════════════════════
   ПРОЯВ · ЄДИНЕ ДЖЕРЕЛО ПРАВДИ по продуктах і цінах.
   Підключається в order.html, nabir.html, admin.html, partner.html.
   Не дублюй ціни в окремих файлах — лише тут.
   ════════════════════════════════════════════════════════════════ */
(function () {
  // Пакети. photos = скільки відбитків включає набір; price — фікс-ціна.
  // family 'std' — лінійка, що авто-апгрейдиться (10→20→50). 'baby' — окремий тематичний набір.
  // img — оптимізоване фото-герой набору (assets/products/*). Джерело: товар_фото/.
  // cap — максимум відбитків у наборі (якщо відрізняється від photos: великий 50→80).
  // Ціна «Архіву» 1200 — рішення власника 12.06.2026 (юніт-економіка: при 900 маржа
  // падала до 4% у найгіршому кейсі; фікс 1200 покриває 50–80 кадрів без доплат).
  var packages = {
    small:  { key:'small',  name:'Маленький «Момент»', short:'Маленький набір', photos:12, price:400, family:'std',  desc:'12 фото · оксамитовий конверт',            audience:'один день, який варто памʼятати',  img:'assets/products/envelopes/envelopes-01.jpg' },
    medium: { key:'medium', name:'Подвійний «Спогад»',  short:'Подвійний набір', photos:24, price:600, family:'std',  desc:'24 фото · два оксамитові конверти',         audience:'сесія цілком — собі й батькам',     popular:true, img:'assets/products/envelopes/envelopes-04.jpg' },
    large:  { key:'large',  name:'Великий «Архів»',     short:'Великий набір',   photos:50, cap:80, price:1200, family:'std', desc:'50–80 фото · преміальна коробка',   audience:'весілля та великі історії',          img:'assets/products/box/box-01.jpg' },
    baby:   { key:'baby',   name:'«Малюк»',             short:'Спогади малюка',  photos:12, price:450, family:'baby', desc:'12 фото · конверт з ведмедиком',           audience:'перші дні нової людини',             img:'assets/products/newborn/newborn-05.jpg' },
  };

  var printPrice = 15;                       // ₴ за відбиток (внутрішні розрахунки; роздріб вимкнено)
  // Роздрібний друк поштучно ВИМКНЕНО (рішення власника 12.06.2026, дослідження
  // запуску): поштучні 15₴ ставлять бренд в одну лінійку з лабами по 3–7₴ і
  // руйнують «обряд». Повернення = один флаг (true) тут і RETAIL_ENABLED в _utils.js.
  var retailEnabled = false;

  // SLA проявлення (П1.2): peak вмикається вручну на сезон весіль.
  var sla = { standardHours: 48, peakHours: 72, peak: false };

  // «Перша серія» (П1.1): передзамовлення для валідації попиту. Знижку рахує
  // СЕРВЕР (дзеркало в _utils.js) — тут лише відображення. enabled:false → секція зникає.
  var firstSeries = { enabled: true, slots: 10, discountPct: 15 };
  var stdChain   = ['small', 'medium', 'large']; // за зростанням ліміту фото

  // Авто-апгрейд у межах лінійки std, щоб набір вмістив `qty` відбитків.
  // baby — окремий (не апгрейдиться). Повертає підсумковий ключ пакета.
  function fitPackage(productType, qty) {
    var pkg = packages[productType];
    if (!pkg || pkg.family !== 'std') return productType; // baby лишається
    var best = stdChain[stdChain.length - 1]; // за замовчуванням — найбільший
    for (var i = 0; i < stdChain.length; i++) {
      if (packages[stdChain[i]].photos >= qty) { best = stdChain[i]; break; }
    }
    // ніколи не опускаємо нижче обраного тарифу
    if (stdChain.indexOf(best) < stdChain.indexOf(productType)) best = productType;
    return best;
  }

  // Максимум відбитків для пакета (std = великий cap 80, baby = 12).
  function photoCap(productType) {
    var pkg = packages[productType];
    if (!pkg) return Infinity;
    if (pkg.family === 'std') { var top = packages[stdChain[stdChain.length - 1]]; return top.cap || top.photos; }
    return pkg.cap || pkg.photos;
  }

  // Підрахунок замовлення.
  // mode 'package' → фікс-ціна пакета (після авто-апгрейду за qty).
  // mode 'retail'  → qty × printPrice.
  function computeOrder(mode, productType, qty) {
    qty = Number(qty) || 0;
    if (mode === 'package' && packages[productType]) {
      var finalType = fitPackage(productType, qty);
      var pkg = packages[finalType];
      return {
        mode: 'package',
        productType: finalType,
        price: pkg.price,
        photos: pkg.photos,
        cap: photoCap(finalType),
        name: pkg.short,
        upgradedFrom: finalType !== productType ? productType : null,
      };
    }
    return {
      mode: 'retail',
      productType: null,
      price: qty * printPrice,
      photos: null,
      cap: Infinity,
      name: 'Роздрібний друк',
      upgradedFrom: null,
    };
  }

  // ── Партнерські рівні ───────────────────────────────────────────────
  // Комісія — НЕ головний гачок (головне: преміум + захист роботи фотографа).
  // Але вона росте з активністю й НІКОЛИ не знижується — відчуття прогресу.
  // За зростанням minOrders (lifetime виконаних замовлень).
  var commissionTiers = [
    { level: 1, name: 'Партнер',    minOrders: 0,  pct: 12 },
    { level: 2, name: 'Майстер',    minOrders: 5,  pct: 15 },
    { level: 3, name: 'Архіваріус', minOrders: 15, pct: 20 },
  ];

  // Поточний рівень + скільки замовлень до наступного.
  function commissionFor(orderCount) {
    var n = Number(orderCount) || 0;
    var cur = commissionTiers[0];
    for (var i = 0; i < commissionTiers.length; i++) {
      if (n >= commissionTiers[i].minOrders) cur = commissionTiers[i];
    }
    var next = commissionTiers[commissionTiers.indexOf(cur) + 1] || null;
    return {
      level: cur.level, name: cur.name, pct: cur.pct,
      next: next ? { name: next.name, pct: next.pct, ordersLeft: Math.max(0, next.minOrders - n) } : null,
    };
  }

  window.PROYAV = {
    packages: packages,
    printPrice: printPrice,
    retailEnabled: retailEnabled,
    sla: sla,
    firstSeries: firstSeries,
    stdChain: stdChain,
    order: ['small', 'medium', 'large', 'baby'],
    commissionTiers: commissionTiers,
    fitPackage: fitPackage,
    photoCap: photoCap,
    computeOrder: computeOrder,
    commissionFor: commissionFor,
  };
})();
