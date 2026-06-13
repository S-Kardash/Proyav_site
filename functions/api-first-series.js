import { ok, preflight, db, FIRST_SERIES, firstSeriesUsed } from './_utils.js';

/**
 * api-first-series.js — публічний статус «Першої серії» для лендінгу (П1.1).
 * GET → { enabled, slots, used, left }
 * Якщо БД недоступна — повертаємо enabled з конфіга, used=0 (секція не зникне
 * через тимчасову помилку; знижку все одно рахує api-retail зі своїм лічильником).
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  let used = 0;
  try { used = await firstSeriesUsed(db(env)); } catch { used = 0; }

  const left = Math.max(0, FIRST_SERIES.slots - used);
  return ok({
    enabled: FIRST_SERIES.enabled && left > 0,
    slots:   FIRST_SERIES.slots,
    used,
    left,
    discountPct: FIRST_SERIES.discountPct,
  });
}
