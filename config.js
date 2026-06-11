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
  var packages = {
    small:  { key:'small',  name:'Маленький «Момент»', short:'Маленький набір', photos:12, price:400, family:'std',  desc:'12 фото · оксамитовий конверт',            img:'assets/products/envelopes/envelopes-01.jpg' },
    medium: { key:'medium', name:'Подвійний «Спогад»',  short:'Подвійний набір', photos:24, price:600, family:'std',  desc:'24 фото · два оксамитові конверти',         img:'assets/products/envelopes/envelopes-04.jpg' },
    large:  { key:'large',  name:'Великий «Архів»',     short:'Великий набір',   photos:50, cap:80, price:900, family:'std', desc:'50–80 фото · преміальна коробка',    img:'assets/products/box/box-01.jpg' },
    baby:   { key:'baby',   name:'«Малюк»',             short:'Спогади малюка',  photos:12, price:450, family:'baby', desc:'12 фото · конверт з ведмедиком',           img:'assets/products/newborn/newborn-05.jpg' },
  };

  var printPrice = 15;                       // ₴ за відбиток (роздріб à la carte / Напрямок 1)
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
    stdChain: stdChain,
    order: ['small', 'medium', 'large', 'baby'],
    commissionTiers: commissionTiers,
    fitPackage: fitPackage,
    photoCap: photoCap,
    computeOrder: computeOrder,
    commissionFor: commissionFor,
  };
})();
