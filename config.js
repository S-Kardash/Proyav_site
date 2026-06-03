/* ════════════════════════════════════════════════════════════════
   ПРОЯВ · ЄДИНЕ ДЖЕРЕЛО ПРАВДИ по продуктах і цінах.
   Підключається в order.html, nabir.html, admin.html, partner.html.
   Не дублюй ціни в окремих файлах — лише тут.
   ════════════════════════════════════════════════════════════════ */
(function () {
  // Пакети. photos = скільки відбитків включає набір; price — фікс-ціна.
  // family 'std' — лінійка, що авто-апгрейдиться (10→20→50). 'baby' — окремий тематичний набір.
  var packages = {
    small:  { key:'small',  name:'Малий «Момент»',    short:'Малий набір',    photos:10, price:400, family:'std',  desc:'10 фото · оксамитовий конверт' },
    medium: { key:'medium', name:'Середній «Спогад»',  short:'Середній набір', photos:20, price:600, family:'std',  desc:'20 фото · оксамитовий конверт' },
    large:  { key:'large',  name:'Великий «Архів»',    short:'Великий набір',  photos:50, price:900, family:'std',  desc:'50 фото · преміальна коробка' },
    baby:   { key:'baby',   name:'«Малюк»',            short:'Спогади малюка', photos:10, price:450, family:'baby', desc:'10 фото · конверт з ведмедиком' },
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

  // Максимум відбитків для пакета (std = 50, baby = 10).
  function photoCap(productType) {
    var pkg = packages[productType];
    if (!pkg) return Infinity;
    if (pkg.family === 'std') return packages[stdChain[stdChain.length - 1]].photos;
    return pkg.photos;
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

  window.PROYAV = {
    packages: packages,
    printPrice: printPrice,
    stdChain: stdChain,
    order: ['small', 'medium', 'large', 'baby'],
    fitPackage: fitPackage,
    photoCap: photoCap,
    computeOrder: computeOrder,
  };
})();
