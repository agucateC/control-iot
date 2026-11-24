import { CONFIG } from '../config.js';
import { el } from '../utils/dom.js';
import { act, badge, button, field, fmtDate, input, loadInto, pager, select, table } from './widgets.js';

const E = CONFIG.ENDPOINTS.admin;
const TABS = [['resumen', 'Resumen'], ['inventario', 'Inventario'], ['modelos', 'Modelos'], ['clientes', 'Clientes'],
  ['asignaciones', 'Asignaciones'], ['bitacora', 'Bitácora']];

/** ADMINISTRACIÓN (solo rol ADMINISTRADOR). Todo dato sale de la API; nada se inventa en el cliente. */
export class AdminView {
  #host; #api; #body; #tabs = new Map(); #current = 'resumen'; #onOpen;

  /** @param onOpen (idVehiculo, vista) → abre esa unidad en CONTROL/MONITOREO (la API decide si hay permiso) */
  constructor({ host, api, onOpen }) {
    this.#host = host; this.#api = api; this.#onOpen = onOpen;
    const nav = el('div', { cls: 'adm-tabs', attrs: { role: 'tablist', 'aria-label': 'Secciones de administración' } });
    for (const [key, label] of TABS) {
      const b = el('button', { cls: 'adm-tab', attrs: { type: 'button', role: 'tab', id: `tab-${key}`, 'aria-controls': 'adm-body' }, text: label });
      b.addEventListener('click', () => this.show(key));
      b.addEventListener('keydown', (e) => this.#keys(e));
      nav.append(b); this.#tabs.set(key, b);
    }
    this.#body = el('div', { cls: 'adm-body', attrs: { id: 'adm-body', role: 'tabpanel', tabindex: '0' } });
    host.replaceChildren(el('h2', { cls: 'adm-title', attrs: { id: 'adm-title' }, text: 'Administración' }), nav, this.#body);
  }

  #keys(e) {
    const keys = [...this.#tabs.keys()]; const i = keys.indexOf(this.#current);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (n === null) return;
    e.preventDefault(); const k = keys[(n + keys.length) % keys.length]; this.show(k); this.#tabs.get(k).focus();
  }

  show(key = this.#current) {
    this.#current = key;
    for (const [k, b] of this.#tabs) { b.setAttribute('aria-selected', String(k === key)); b.tabIndex = k === key ? 0 : -1; }
    this.#body.setAttribute('aria-labelledby', `tab-${key}`);
    ({ resumen: () => this.#resumen(), inventario: () => this.#inventario(0), modelos: () => this.#modelos(),
      clientes: () => this.#clientes(0), asignaciones: () => this.#asignaciones(0), bitacora: () => this.#bitacora(0) })[key]();
  }

  // ---------- Resumen ----------
  #resumen() {
    loadInto(this.#body, () => this.#api.get(E.metricas), (m) => {
      const card = (label, value) => el('div', { cls: 'adm-card', children: [el('strong', { text: String(value) }), el('span', { text: label })] });
      const u = m.unidades_por_estado, r = m.usuarios_por_rol;
      return el('div', { children: [
        el('div', { cls: 'adm-cards', children: [
          card('Unidades en stock', u.STOCK ?? 0), card('Unidades vendidas', u.VENDIDA ?? 0), card('Dadas de baja', u.BAJA ?? 0),
          card('Asignaciones vigentes', m.asignaciones_vigentes), card('Clientes activos', r.USUARIO ?? 0), card('Administradores', r.ADMINISTRADOR ?? 0),
          card('Sesiones de invitado activas', m.sesiones_invitado_activas), card('Demos privadas', m.demos_privadas), card('Eventos de auditoría (24 h)', m.eventos_auditoria_24h)] }),
        el('p', { cls: 'adm-hint', text: `Datos reales de la base de datos · generado ${fmtDate(m.generado_en)}` })] });
    });
  }

  // ---------- Inventario ----------
  async #inventario(offset, estado = '') {
    const host = this.#body;
    await loadInto(host, async () => {
      const [pg, modelos] = await Promise.all([
        this.#api.get(`${E.unidades}?limit=${CONFIG.PAGE_SIZE}&offset=${offset}${estado ? `&estado=${estado}` : ''}`), this.#api.get(E.modelos)]);
      return { pg, modelos };
    }, ({ pg, modelos }) => {
      const nuevo = this.#formUnidad(modelos, () => this.#inventario(0));
      const f = select([['', 'Todos los estados'], ['STOCK', 'Stock'], ['VENDIDA', 'Vendidas'], ['BAJA', 'Baja']], { 'aria-label': 'Filtrar por estado' });
      f.value = estado; f.addEventListener('change', () => this.#inventario(0, f.value));
      const cols = [
        { label: 'Serie', cell: (u) => u.numero_serie }, { label: 'Alias', cell: (u) => u.alias },
        { label: 'Modelo', cell: (u) => u.modelo },
        { label: 'Estado', cell: (u) => badge(u.estado + (u.es_exhibicion ? ' · exhibición' : ''), u.estado === 'VENDIDA' ? 'warning' : u.estado === 'BAJA' ? 'danger' : 'success') },
        { label: 'Cliente', cell: (u) => (u.cliente ? `${u.cliente.nombre} (${u.cliente.email})` : '—') },
        { label: 'En demo', cell: (u) => (u.en_demo ? 'Sí' : 'No') },
        { label: 'Acciones', cell: (u) => this.#acciones(u, modelos) }];
      return el('div', { children: [nuevo, el('div', { cls: 'adm-toolbar', children: [f] }),
        table(cols, pg.items, { empty: 'Aún no hay unidades registradas.', caption: 'Inventario de unidades' }),
        pager(pg, (o) => this.#inventario(Math.max(0, o), estado))] });
    });
  }

  #acciones(u, modelos) {
    const box = el('div', { cls: 'adm-actions' });
    if (u.id_vehiculo) {
      box.append(button('Control', { title: 'Abrir en CONTROL (la API exige consentimiento si está vendida)', onClick: () => this.#onOpen(u.id_vehiculo, 'control') }),
        button('Monitoreo', { onClick: () => this.#onOpen(u.id_vehiculo, 'monitoreo') }));
    }
    if (u.estado !== 'VENDIDA') {
      box.append(button(u.estado === 'BAJA' ? 'Reactivar' : 'Dar de baja', { cls: 'btn-outline-warning', onClick: async () => {
        if (u.estado !== 'BAJA' && !globalThis.confirm(`¿Dar de baja la unidad ${u.numero_serie}?`)) return;
        const ok = await act(this.#api.put(E.unidad(u.id_unidad), { id_modelo: u.id_modelo, alias: u.alias, estado: u.estado === 'BAJA' ? 'STOCK' : 'BAJA', es_exhibicion: u.es_exhibicion }, { auth: true }), 'Unidad actualizada');
        if (ok) this.#inventario(0);
      } }));
      box.append(button(u.es_exhibicion ? 'Quitar exhibición' : 'Marcar exhibición', { onClick: async () => {
        const ok = await act(this.#api.put(E.unidad(u.id_unidad), { id_modelo: u.id_modelo, alias: u.alias, estado: u.estado, es_exhibicion: !u.es_exhibicion }, { auth: true }), 'Unidad actualizada');
        if (ok) this.#inventario(0);
      } }));
    }
    return box;
  }

  #formUnidad(modelos, done) {
    const activos = modelos.filter((m) => m.activo);
    const serie = input('text', { required: '', maxlength: 60, pattern: '[A-Za-z0-9._\\-]{3,60}', autocomplete: 'off' });
    const modelo = select(activos.map((m) => [m.id_modelo, m.nombre]));
    const alias = input('text', { maxlength: 80 });
    const exh = input('checkbox'); exh.className = 'form-check-input';
    const form = el('form', { cls: 'adm-form', attrs: { novalidate: '' } });
    form.append(el('h3', { cls: 'adm-sub', text: 'Registrar unidad' }),
      field('Número de serie', serie, { hint: 'Único. Letras, números, punto, guion.' }), field('Modelo', modelo), field('Alias (opcional)', alias),
      el('label', { cls: 'adm-check', children: [exh, ' Unidad de exhibición (invitados)'] }),
      button('Registrar', { cls: 'btn-danger', type: 'submit' }));
    if (!activos.length) form.append(el('p', { cls: 'adm-hint', text: 'Primero crea un modelo en la pestaña Modelos.' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity() || !activos.length) { form.reportValidity(); return; }
      const ok = await act(this.#api.post(E.unidades, { numero_serie: serie.value.trim(), id_modelo: Number(modelo.value), alias: alias.value.trim() || null, es_exhibicion: exh.checked }, { auth: true }), 'Unidad registrada');
      if (ok) done();
    });
    return form;
  }

  // ---------- Modelos ----------
  #modelos() {
    loadInto(this.#body, () => this.#api.get(E.modelos), (rows) => {
      const nombre = input('text', { required: '', maxlength: 80 }), mc = input('text', { maxlength: 50, placeholder: 'ESP32' });
      const paso = input('number', { min: 100, max: 600000, value: 10000, required: '' });
      const pasos = input('number', { min: 1, max: 1000, value: 50, required: '' });
      const total = input('number', { min: 1000, max: 3600000, value: 120000, required: '' });
      const form = el('form', { cls: 'adm-form', attrs: { novalidate: '' } });
      form.append(el('h3', { cls: 'adm-sub', text: 'Crear modelo' }), field('Nombre', nombre), field('Microcontrolador', mc),
        field('Duración máx. por paso (ms)', paso, { hint: 'Límite físico validado por el servidor en las demos.' }),
        field('Pasos máx. por demo', pasos), field('Duración total máx. (ms)', total), button('Crear modelo', { cls: 'btn-danger', type: 'submit' }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const ok = await act(this.#api.post(E.modelos, { nombre: nombre.value.trim(), microcontrolador: mc.value.trim() || null,
          max_duracion_paso_ms: +paso.value, max_pasos_demo: +pasos.value, max_duracion_demo_ms: +total.value }, { auth: true }), 'Modelo creado');
        if (ok) this.#modelos();
      });
      return el('div', { children: [form, table([
        { label: 'Modelo', cell: (m) => m.nombre }, { label: 'Microcontrolador', cell: (m) => m.microcontrolador },
        { label: 'Paso máx.', cell: (m) => `${m.max_duracion_paso_ms} ms` }, { label: 'Pasos máx.', cell: (m) => m.max_pasos_demo },
        { label: 'Total máx.', cell: (m) => `${m.max_duracion_demo_ms} ms` }, { label: 'Estado', cell: (m) => (m.activo ? 'Activo' : 'Inactivo') }],
      rows, { empty: 'Aún no hay modelos.', caption: 'Modelos de vehículo' })] });
    });
  }

  // ---------- Clientes ----------
  #clientes(offset) {
    loadInto(this.#body, () => this.#api.get(`${E.clientes}?limit=${CONFIG.PAGE_SIZE}&offset=${offset}`), (pg) => {
      const email = input('email', { required: '', maxlength: 190, autocomplete: 'off' }), nombre = input('text', { required: '', maxlength: 100 });
      const rol = select([['USUARIO', 'Usuario (comprador)'], ['ADMINISTRADOR', 'Administrador']]);
      const pw = input('text', { required: '', minlength: 10, autocomplete: 'off' });
      const form = el('form', { cls: 'adm-form', attrs: { novalidate: '' } });
      form.append(el('h3', { cls: 'adm-sub', text: 'Crear cuenta' }), field('Correo', email), field('Nombre', nombre), field('Rol', rol),
        field('Contraseña temporal', pw, { hint: '10+ caracteres, una mayúscula y un número. Deberá cambiarla.' }), button('Crear cuenta', { cls: 'btn-danger', type: 'submit' }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const ok = await act(this.#api.post(E.clientes, { email: email.value.trim(), nombre: nombre.value.trim(), rol: rol.value, password: pw.value }, { auth: true }), 'Cuenta creada');
        if (ok) this.#clientes(0);
      });
      const cols = [{ label: 'Nombre', cell: (u) => u.nombre }, { label: 'Correo', cell: (u) => u.email }, { label: 'Rol', cell: (u) => u.rol },
        { label: 'Estado', cell: (u) => badge(u.activo ? 'Activa' : 'Inactiva', u.activo ? 'success' : 'secondary') },
        { label: 'Último acceso', cell: (u) => fmtDate(u.ultimo_login) },
        { label: 'Acciones', cell: (u) => el('div', { cls: 'adm-actions', children: [
          button(u.activo ? 'Desactivar' : 'Activar', { cls: 'btn-outline-warning', onClick: async () => {
            if (u.activo && !globalThis.confirm(`¿Desactivar a ${u.nombre}? Se libera sus unidades y se cierran sus sesiones.`)) return;
            const ok = await act(this.#api.put(E.cliente(u.id_usuario), { nombre: u.nombre, rol: u.rol, activo: !u.activo }, { auth: true }), 'Cuenta actualizada');
            if (ok) this.#clientes(offset);
          } }),
          button('Restablecer contraseña', { onClick: async () => {
            if (!globalThis.confirm(`¿Generar contraseña temporal para ${u.nombre}?`)) return;
            const r = await act(this.#api.post(E.resetPassword(u.id_usuario), undefined, { auth: true }));
            if (r) globalThis.alert(`Contraseña temporal (se muestra una sola vez):\n\n${r.password_temporal}`);
          } })] }) }];
      return el('div', { children: [form, table(cols, pg.items, { empty: 'No hay cuentas.', caption: 'Cuentas' }), pager(pg, (o) => this.#clientes(Math.max(0, o)))] });
    });
  }

  // ---------- Asignaciones ----------
  #asignaciones(offset) {
    loadInto(this.#body, async () => {
      const [pg, unidades, clientes] = await Promise.all([
        this.#api.get(`${E.asignaciones}?vigentes=true&limit=${CONFIG.PAGE_SIZE}&offset=${offset}`),
        this.#api.get(`${E.unidades}?estado=STOCK&limit=100`), this.#api.get(`${E.clientes}?rol=USUARIO&limit=100`)]);
      return { pg, unidades: unidades.items.filter((u) => !u.es_exhibicion), clientes: clientes.items.filter((c) => c.activo) };
    }, ({ pg, unidades, clientes }) => {
      const u = select(unidades.map((x) => [x.id_unidad, `${x.numero_serie} · ${x.modelo}`])), c = select(clientes.map((x) => [x.id_usuario, `${x.nombre} (${x.email})`]));
      const form = el('form', { cls: 'adm-form' });
      form.append(el('h3', { cls: 'adm-sub', text: 'Asignar unidad a un cliente' }), field('Unidad en stock', u), field('Cliente', c), button('Asignar', { cls: 'btn-danger', type: 'submit' }));
      if (!unidades.length || !clientes.length) form.append(el('p', { cls: 'adm-hint', text: 'Se necesita al menos una unidad en stock (no de exhibición) y un cliente activo.' }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!unidades.length || !clientes.length) return;
        const ok = await act(this.#api.post(E.asignaciones, { id_unidad: +u.value, id_usuario: +c.value }, { auth: true }), 'Unidad asignada');
        if (ok) this.#asignaciones(0);
      });
      return el('div', { children: [form, table([
        { label: 'Unidad', cell: (a) => a.numero_serie }, { label: 'Cliente', cell: (a) => `${a.nombre} (${a.email})` }, { label: 'Desde', cell: (a) => fmtDate(a.desde) },
        { label: 'Acción', cell: (a) => button('Liberar', { cls: 'btn-outline-warning', onClick: async () => {
          if (!globalThis.confirm(`¿Liberar ${a.numero_serie}? El cliente pierde el acceso de inmediato.`)) return;
          const ok = await act(this.#api.delete(E.asignacion(a.id_unidad), { auth: true }), 'Unidad liberada');
          if (ok) this.#asignaciones(0);
        } }) }], pg.items, { empty: 'No hay asignaciones vigentes.', caption: 'Asignaciones vigentes' }), pager(pg, (o) => this.#asignaciones(Math.max(0, o)))] });
    });
  }

  // ---------- Bitácora ----------
  #bitacora(offset, accion = '') {
    loadInto(this.#body, () => this.#api.get(`${E.auditoria}?limit=${CONFIG.PAGE_SIZE}&offset=${offset}${accion ? `&accion=${encodeURIComponent(accion)}` : ''}`), (pg) => {
      const f = input('search', { placeholder: 'Filtrar por acción (p. ej. login)', maxlength: 40, 'aria-label': 'Filtrar por acción' }); f.value = accion;
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.#bitacora(0, f.value.trim()); });
      return el('div', { children: [el('div', { cls: 'adm-toolbar', children: [f, button('Filtrar', { onClick: () => this.#bitacora(0, f.value.trim()) })] }),
        table([{ label: 'Fecha', cell: (a) => fmtDate(a.ocurrio_en) }, { label: 'Acción', cell: (a) => a.accion }, { label: 'Rol', cell: (a) => a.rol },
          { label: 'Usuario', cell: (a) => a.id_usuario }, { label: 'Recurso', cell: (a) => (a.recurso_tipo ? `${a.recurso_tipo} ${a.recurso_id ?? ''}` : null) }, { label: 'Detalle', cell: (a) => a.detalle }],
        pg.items, { empty: 'Sin eventos para ese filtro.', caption: 'Bitácora de auditoría' }), pager(pg, (o) => this.#bitacora(Math.max(0, o), accion))] });
    });
  }
}
