import { CONFIG } from '../config.js';
import { el } from '../utils/dom.js';
import { friendlyMessage } from '../utils/errors.js';
import { badge, button, field, input } from './widgets.js';

/** Pantalla previa a la app: iniciar sesión (ADMINISTRADOR/USUARIO) o probar una unidad de exhibición (INVITADO). */
export class GateView {
  #host; #session; #api; #resolve = null; #msg;

  constructor({ host, session, api }) { this.#host = host; this.#session = session; this.#api = api; }

  /** Resuelve cuando hay una sesión válida. */
  open() {
    this.#host.hidden = false;
    const email = input('email', { required: '', autocomplete: 'username', maxlength: 190 });
    const pw = input('password', { required: '', autocomplete: 'current-password', maxlength: 200 });
    const form = el('form', { cls: 'adm-form gate-form', attrs: { novalidate: '' } });
    this.#msg = el('p', { cls: 'adm-error', attrs: { role: 'alert', hidden: '' } });
    form.append(el('h2', { cls: 'adm-sub', text: 'Iniciar sesión' }), field('Correo', email), field('Contraseña', pw), this.#msg, button('Entrar', { cls: 'btn-danger', type: 'submit' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      this.#error('');
      try { await this.#session.login(email.value.trim(), pw.value); pw.value = ''; this.#done(); }
      catch (err) { this.#error(err.status === 401 ? 'Correo o contraseña incorrectos.' : friendlyMessage(err)); }
    });
    const guest = el('section', { cls: 'gate-guest', attrs: { 'aria-labelledby': 'gate-guest-title' } });
    guest.append(el('h2', { cls: 'adm-sub', attrs: { id: 'gate-guest-title' }, text: 'Probar sin cuenta' }), el('p', { cls: 'adm-hint', text: `Sesión temporal de ${CONFIG.GUEST_MINUTES_HINT} minutos con una unidad de exhibición. Solo DETENER y las demos de la empresa.` }));
    const list = el('div', { cls: 'gate-catalog', attrs: { 'aria-live': 'polite' } });
    guest.append(list);
    this.#catalog(list);
    this.#host.replaceChildren(el('div', { cls: 'gate-box', children: [el('h1', { cls: 'gate-title', text: CONFIG.APP_NAME }), form, guest] }));
    email.focus();
    return new Promise((r) => { this.#resolve = r; });
  }

  async #catalog(host) {
    host.replaceChildren(el('p', { cls: 'adm-loading', text: 'Cargando catálogo…' }));
    try {
      const items = await this.#api.get(CONFIG.ENDPOINTS.catalogo);
      if (!items.length) { host.replaceChildren(el('p', { cls: 'adm-empty', text: 'No hay unidades de exhibición por ahora.' })); return; }
      host.replaceChildren(...items.map((u) => {
        const b = button(u.disponible ? 'Probar' : 'En uso', { cls: 'btn-danger', onClick: async () => {
          b.disabled = true; this.#error('');
          try { await this.#session.startGuest(u.id_unidad); this.#done(); }
          catch (err) { this.#error(friendlyMessage(err)); this.#catalog(host); }
        } });
        b.disabled = !u.disponible;
        return el('div', { cls: 'adm-card gate-unit', children: [el('strong', { text: u.alias || 'Unidad de exhibición' }), el('span', { text: u.modelo }),
          badge(u.disponible ? 'Disponible' : 'Ocupada', u.disponible ? 'success' : 'warning'), b] });
      }));
    } catch (e) {
      host.replaceChildren(el('div', { cls: 'adm-error', attrs: { role: 'alert' }, children: [el('span', { text: friendlyMessage(e) }), button('Reintentar', { onClick: () => this.#catalog(host) })] }));
    }
  }

  #error(t) { this.#msg.textContent = t; this.#msg.hidden = !t; }
  #done() { this.#host.hidden = true; this.#resolve?.(); }
}
