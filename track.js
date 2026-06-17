/* ════════════════════════════════════════════════════════════════
   ПРОЯВ · first-party трекер дій (приватний, без кук, без третіх сторін).
   Шле легкі події на /api-track. Анонімний session-id у localStorage.
   Ніколи не кидає помилок і не впливає на UX.
   API: window.pvTrack(type, meta)  ·  авто: pageview + клік по [data-track].
   ════════════════════════════════════════════════════════════════ */
(function () {
  var KEY = 'pv_sid';
  function sid() {
    try {
      var s = localStorage.getItem(KEY);
      if (!s) { s = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(KEY, s); }
      return s;
    } catch (e) { return 'anon'; }
  }
  function ref() {
    try {
      var p = new URLSearchParams(location.search);
      if (p.get('ph')) return 'ph=' + p.get('ph');
      if (p.get('utm_source')) return 'utm:' + p.get('utm_source');
      return (document.referrer && document.referrer.indexOf(location.host) < 0) ? 'ext' : 'direct';
    } catch (e) { return 'direct'; }
  }
  function send(type, meta) {
    try {
      var body = JSON.stringify({ type: type, path: location.pathname, ref: ref(), session: sid(), meta: meta || null });
      if (navigator.sendBeacon) navigator.sendBeacon('/api-track', new Blob([body], { type: 'application/json' }));
      else fetch('/api-track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  window.pvTrack = send;
  send('pageview');
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-track]');
    if (!el) return;
    var m = el.getAttribute('data-track-meta');
    send(el.getAttribute('data-track'), m ? { v: m } : null);
  }, true);
})();
