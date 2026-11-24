import { el } from '../utils/dom.js';
import { friendlyMessage } from '../utils/errors.js';
import { toast } from './toast.js';

let uid = 0;
/** Campo con etiqueta asociada (accesible por teclado y lector de pantalla). */
export function field(label, control, { hint } = {}) {
  const id = `f${++uid}`;
  control.id = id;
  const wrap = el('div', { cls: 'adm-field' });
  wrap.append(el('label', { cls: 'form-label', attrs: { for: id }, text: label }), control);
  if (hint) wrap.append(el('small', { cls: 'adm-hint', text: hint }));
  return wrap;
}
export function input(type = 'text', attrs = {}) { return el('input', { cls: 'form-control form-control-sm', attrs: { type, ...attrs } }); }
export function select(options, attrs = {}) {
  const s = el('select', { cls: 'form-select form-select-sm', attrs });
  for (const [value, text] of options) s.append(el('option', { attrs: { value: String(value) }, text }));
  return s;
}
export function button(text, { cls = 'btn-outline-light', onClick, type = 'button', title } = {}) {
  const b = el('button', { cls: `btn btn-sm ${cls}`, attrs: { type, ...(title ? { title } : {}) }, text });
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
export function badge(text, kind = 'secondary') { return el('span', { cls: `badge adm-badge text-bg-${kind}`, text }); }

/** Tabla con estados de carga/vacío. `columns`: [{label, cell:(row)=>Node|string, num?}] */
export function table(columns, rows, { empty = 'Sin registros.', caption } = {}) {
  if (!rows.length) return el('p', { cls: 'adm-empty', text: empty });
  const t = el('table', { cls: 'table table-dark table-sm adm-table align-middle' });
  if (caption) t.append(el('caption', { cls: 'visually-hidden', text: caption }));
  const hr = el('tr');
  for (const c of columns) hr.append(el('th', { attrs: { scope: 'col' }, text: c.label }));
  t.append(el('thead', { children: [hr] }));
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    for (const c of columns) {
      const v = c.cell(r);
      const td = el('td');
      if (v instanceof Node) td.append(v); else td.textContent = v ?? '—';
      tr.append(td);
    }
    tb.append(tr);
  }
  t.append(tb);
  return el('div', { cls: 'table-responsive', children: [t] });
}

export function pager({ total, limit, offset }, go) {
  const page = Math.floor(offset / limit) + 1, pages = Math.max(1, Math.ceil(total / limit));
  const prev = button('‹ Anterior', { onClick: () => go(offset - limit) });
  const next = button('Siguiente ›', { onClick: () => go(offset + limit) });
  prev.disabled = offset <= 0; next.disabled = offset + limit >= total;
  return el('div', { cls: 'adm-pager', children: [prev, el('span', { text: `Página ${page} de ${pages} · ${total} en total` }), next] });
}

export const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${String(v).replace(' ', 'T')}Z`);   // la API guarda UTC sin zona
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false });
};

/** Muestra carga → contenido | error con «Reintentar». */
export async function loadInto(host, task, render) {
  host.replaceChildren(el('p', { cls: 'adm-loading', attrs: { role: 'status' }, text: 'Cargando…' }));
  try { host.replaceChildren(await render(await task())); }
  catch (e) {
    host.replaceChildren(el('div', { cls: 'adm-error', attrs: { role: 'alert' }, children: [
      el('span', { text: friendlyMessage(e) }), button('Reintentar', { onClick: () => loadInto(host, task, render) })] }));
  }
}

export async function act(promise, okMsg) {
  try { const r = await promise; if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) { toast(friendlyMessage(e), { error: true, ms: 6000 }); return null; }
}
