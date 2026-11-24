import { CONFIG } from '../config.js';
import { el } from '../utils/dom.js';
import { friendlyMessage } from '../utils/errors.js';
import { toast } from './toast.js';
import { act, badge, button, field, fmtDate, input, loadInto, select, table } from './widgets.js';

const C = CONFIG.ENDPOINTS;

/** MIS VEHÍCULOS (rol USUARIO): solo unidades asignadas a su cuenta (la API filtra por token), soporte y editor de demos propias. */
export class MineView {
  #host; #api; #onOpen; #body; #sel = null;

  constructor({ host, api, onOpen }) {
    this.#host = host; this.#api = api; this.#onOpen = onOpen;
    this.#body = el('div', { cls: 'adm-body' });
    host.replaceChildren(el('h2', { cls: 'adm-title', attrs: { id: 'mine-title' }, text: 'Mis vehículos' }), this.#body);
  }

  show() { this.#list(); }

  #list() {
    loadInto(this.#body, () => this.#api.get(C.misVehiculos), (rows) => {
      if (!rows.length) return el('p', { cls: 'adm-empty', text: 'Aún no tienes vehículos asignados. Cuando la empresa te asigne uno aparecerá aquí.' });
      if (!this.#sel || !rows.some((r) => r.id_unidad === this.#sel)) this.#sel = rows[0].id_unidad;
      const cur = rows.find((r) => r.id_unidad === this.#sel);
      const sel = select(rows.map((r) => [r.id_unidad, `${r.alias || r.numero_serie} · ${r.modelo}`]), { 'aria-label': 'Seleccionar vehículo' });
      sel.value = String(this.#sel); sel.addEventListener('change', () => { this.#sel = Number(sel.value); this.#list(); });
      const demosHost = el('div', { cls: 'adm-sub-block' });
      const out = el('div', { children: [
        el('div', { cls: 'adm-toolbar', children: [field('Vehículo', sel)] }),
        el('div', { cls: 'adm-card-row', children: [
          el('div', { cls: 'adm-card', children: [el('strong', { text: cur.alias || cur.numero_serie }), el('span', { text: `${cur.modelo} · serie ${cur.numero_serie}` }),
            el('span', { text: `Asignado: ${fmtDate(cur.asignada_desde)}` }), cur.activo ? badge('Activo', 'success') : badge('Inactivo', 'secondary'),
            el('div', { cls: 'adm-actions', children: [button('Abrir CONTROL', { cls: 'btn-danger', onClick: () => this.#onOpen(cur.id_vehiculo, 'control') }),
              button('Abrir MONITOREO', { onClick: () => this.#onOpen(cur.id_vehiculo, 'monitoreo') })] })] }),
          this.#soporte(cur)] }),
        demosHost] });
      this.#demos(demosHost, cur);
      return out;
    });
  }

  // ---- consentimiento de soporte: sin esto el administrador NO puede operar tu unidad ----
  #soporte(u) {
    const box = el('div', { cls: 'adm-card adm-support' });
    box.append(el('strong', { text: 'Acceso de soporte' }));
    if (u.soporte_autorizado_hasta) {
      box.append(el('span', { text: `Autorizado hasta ${fmtDate(u.soporte_autorizado_hasta)}` }),
        button('Revocar ahora', { cls: 'btn-outline-warning', onClick: async () => { if (await act(this.#api.delete(C.soporte(u.id_unidad), { auth: true }), 'Acceso de soporte revocado')) this.#list(); } }));
      return box;
    }
    box.append(el('span', { text: 'La empresa no puede operar tu vehículo sin tu autorización.' }));
    const min = input('number', { min: 5, max: 240, value: 30, required: '' }), why = input('text', { minlength: 3, maxlength: 255, required: '', placeholder: 'Motivo (p. ej. revisión del brazo)' });
    const f = el('form', { cls: 'adm-form', attrs: { novalidate: '' } });
    f.append(field('Minutos (5–240)', min), field('Motivo', why), button('Autorizar soporte', { type: 'submit' }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.checkValidity()) { f.reportValidity(); return; }
      if (await act(this.#api.post(C.soporte(u.id_unidad), { minutos: +min.value, motivo: why.value.trim() }, { auth: true }), 'Soporte autorizado')) this.#list();
    });
    box.append(f);
    return box;
  }

  // ---- editor de demos ----
  async #demos(host, u) {
    await loadInto(host, async () => {
      const d = await this.#api.get(C.detalle(u.id_vehiculo));
      return { demos: d.demos ?? [], comandos: (d.comandos ?? []).filter((c) => c.activo) };
    }, ({ demos, comandos }) => {
      const nombre = input('text', { required: '', maxlength: 80 }), desc = input('text', { maxlength: 255 });
      const f = el('form', { cls: 'adm-form', attrs: { novalidate: '' } });
      f.append(el('h3', { cls: 'adm-sub', text: 'Nueva demo propia' }), field('Nombre', nombre), field('Descripción', desc), button('Crear demo', { cls: 'btn-danger', type: 'submit' }));
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!f.checkValidity()) { f.reportValidity(); return; }
        if (await act(this.#api.post(C.demos(u.id_vehiculo), { nombre: nombre.value.trim(), descripcion: desc.value.trim() || null }, { auth: true }), 'Demo creada')) this.#demos(host, u);
      });
      const list = el('div', { cls: 'demo-list' });
      if (!demos.length) list.append(el('p', { cls: 'adm-empty', text: 'Este vehículo aún no tiene demos.' }));
      for (const d of demos) list.append(this.#demoCard(u, d, comandos, () => this.#demos(host, u)));
      return el('div', { children: [el('h3', { cls: 'adm-sub', text: 'Demos' }), el('p', { cls: 'adm-hint', text: 'Las demos de fábrica no se pueden editar; las tuyas sí. Se ejecutan desde CONTROL y DETENER siempre las cancela.' }), list, f] });
    });
  }

  #demoCard(u, d, comandos, refresh) {
    const propia = d.tipo === 'PRIVADA';
    const card = el('details', { cls: 'demo-card' });
    card.append(el('summary', { children: [d.nombre, ' ', badge(propia ? 'Propia' : 'De fábrica', propia ? 'info' : 'secondary')] }));
    const body = el('div', { cls: 'demo-body' });
    card.append(body);
    card.addEventListener('toggle', () => { if (card.open) this.#steps(body, u, d, comandos, propia, refresh); });
    return card;
  }

  async #steps(host, u, d, comandos, propia, refresh) {
    const nombre = (id) => comandos.find((c) => c.id_comando === id)?.nombre ?? `#${id}`;
    await loadInto(host, () => this.#api.get(C.demoMovs(u.id_vehiculo, d.id_demo)), (movs) => {
      const rows = [...movs].sort((a, b) => a.orden - b.orden);
      const reload = () => this.#steps(host, u, d, comandos, propia, refresh);
      const cols = [{ label: '#', cell: (m) => m.orden }, { label: 'Comando', cell: (m) => nombre(m.id_comando) },
        { label: 'Duración', cell: (m) => `${m.duracion_ms} ms` }, { label: 'Pausa', cell: (m) => `${m.pausa_ms} ms` }];
      if (propia) cols.push({ label: 'Acciones', cell: (m) => this.#stepActions(u, d, m, rows, reload) });
      const out = el('div', { children: [table(cols, rows, { empty: 'Sin pasos todavía.', caption: `Pasos de ${d.nombre}` })] });
      if (propia) {
        out.append(this.#stepForm(u, d, comandos, rows, reload),
          button('Eliminar esta demo', { cls: 'btn-outline-danger', onClick: async () => {
            if (!globalThis.confirm(`¿Eliminar la demo «${d.nombre}»?`)) return;
            if (await act(this.#api.delete(C.demo(u.id_vehiculo, d.id_demo), { auth: true }), 'Demo eliminada')) refresh();
          } }));
      }
      return out;
    });
  }

  #stepForm(u, d, comandos, rows, reload) {
    const cmd = select(comandos.map((c) => [c.id_comando, c.nombre])), dur = input('number', { min: 1, value: 500, required: '' }), pausa = input('number', { min: 0, value: 0, required: '' });
    const f = el('form', { cls: 'adm-form adm-inline', attrs: { novalidate: '' } });
    f.append(field('Comando', cmd), field('Duración (ms)', dur), field('Pausa (ms)', pausa), button('Agregar paso', { type: 'submit' }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.checkValidity()) { f.reportValidity(); return; }
      const orden = (rows.at(-1)?.orden ?? 0) + 1;
      if (await act(this.#api.post(C.demoMovs(u.id_vehiculo, d.id_demo), { id_comando: +cmd.value, orden, duracion_ms: +dur.value, pausa_ms: +pausa.value }, { auth: true }), 'Paso agregado')) reload();
    });
    return f;
  }

  #stepActions(u, d, m, rows, reload) {
    const i = rows.findIndex((r) => r.id_demo_movimiento === m.id_demo_movimiento);
    const put = (x, body) => this.#api.put(C.demoMov(u.id_vehiculo, d.id_demo, x.id_demo_movimiento), body, { auth: true });
    const body = (x, orden) => ({ id_comando: x.id_comando, orden, duracion_ms: x.duracion_ms, pausa_ms: x.pausa_ms });
    // Reordenar = intercambiar `orden` con el vecino (UNIQUE(id_demo, orden)) pasando por un valor temporal libre.
    const swap = async (other) => {
      const tmp = Math.max(...rows.map((r) => r.orden)) + 1000;
      try { await put(m, body(m, tmp)); await put(other, body(other, m.orden)); await put(m, body(m, other.orden)); reload(); }
      catch (e) { toast(friendlyMessage(e), { error: true, ms: 6000 }); reload(); }
    };
    const up = button('↑', { title: 'Subir', onClick: () => swap(rows[i - 1]) }), down = button('↓', { title: 'Bajar', onClick: () => swap(rows[i + 1]) });
    up.disabled = i === 0; down.disabled = i === rows.length - 1;
    up.setAttribute('aria-label', `Subir paso ${m.orden}`); down.setAttribute('aria-label', `Bajar paso ${m.orden}`);
    const dur = input('number', { min: 1, value: m.duracion_ms, 'aria-label': `Duración del paso ${m.orden} (ms)` }); dur.style.width = '6rem';
    const save = button('Guardar', { onClick: async () => { if (await act(put(m, { ...body(m, m.orden), duracion_ms: +dur.value }), 'Paso actualizado')) reload(); } });
    const del = button('Quitar', { cls: 'btn-outline-danger', onClick: async () => { if (await act(this.#api.delete(C.demoMov(u.id_vehiculo, d.id_demo, m.id_demo_movimiento), { auth: true }), 'Paso eliminado')) reload(); } });
    return el('div', { cls: 'adm-actions', children: [up, down, dur, save, del] });
  }
}
