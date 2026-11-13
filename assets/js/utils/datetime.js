import { CONFIG } from '../config.js';

/**
 * Fechas del backend. `fecha_hora` / `fecha_actualizacion` vienen de MySQL SIN zona horaria
 * ("2026-11-12T18:20:11"): se interpretan como UTC (CONFIG.SERVER_NAIVE_IS_UTC) y se MUESTRAN en
 * CONFIG.DISPLAY_TIME_ZONE. Los timestamps de WSS ya traen zona (+00:00) y se usan tal cual.
 */
const TZ_SUFFIX = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

export function parseServerDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let s = value.trim().replace(' ', 'T');
  const time = s.split('T')[1];
  if (time !== undefined && !TZ_SUFFIX.test(time) && CONFIG.SERVER_NAIVE_IS_UTC) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

let formatter;
function fmt() {
  if (formatter) return formatter;
  const base = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
  try { formatter = new Intl.DateTimeFormat('es-MX', { ...base, timeZone: CONFIG.DISPLAY_TIME_ZONE }); }
  catch { formatter = new Intl.DateTimeFormat('es-MX', base); }   // zona inválida → la del navegador
  return formatter;
}

/** "12/11/2026 07:18:03" en la zona documentada (o '—' si la fecha no es válida). */
export function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  const p = Object.fromEntries(fmt().formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** Nombre corto de la zona mostrada, p. ej. "GMT-6". */
export function zoneLabel(date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('es-MX', { timeZone: CONFIG.DISPLAY_TIME_ZONE, timeZoneName: 'short' })
      .formatToParts(date).find((x) => x.type === 'timeZoneName');
    return part?.value ?? CONFIG.DISPLAY_TIME_ZONE;
  } catch { return 'hora local'; }
}
