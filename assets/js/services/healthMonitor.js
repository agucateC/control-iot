import { CONFIG } from '../config.js';
import { Emitter } from '../utils/emitter.js';

/**
 * Comprobaciones REALES periódicas:
 *  - Servidor AWS: GET /salud            → up | down | checking
 *  - Amazon RDS:   GET /salud/rds        → up | down | unverified   (solo con el diagnóstico del backend)
 * Si el backend no tiene /salud/rds (404) RDS queda "Sin verificar": nunca se supone.
 */
export class HealthMonitor extends Emitter {
  #api; #timer = 0; #running = false; #busy = false;
  api = 'checking';
  rds = 'unverified';

  #probe;
  /** @param probePath ruta GET alternativa (p. ej. el detalle del vehículo) si el backend aún no tiene /salud */
  constructor(apiClient, probePath) { super(); this.#api = apiClient; this.#probe = probePath; }

  start() {
    this.#running = true;
    globalThis.addEventListener?.('online', this.#kick);
    document.addEventListener?.('visibilitychange', this.#kick);
    this.refresh();
  }
  stop() {
    this.#running = false; clearTimeout(this.#timer);
    globalThis.removeEventListener?.('online', this.#kick);
    document.removeEventListener?.('visibilitychange', this.#kick);
  }
  #kick = () => { if (this.#running && !document.hidden) this.refresh(); };

  async refresh() {
    if (this.#busy) return;
    this.#busy = true;
    clearTimeout(this.#timer);
    try {
      if (this.api !== 'up') this.#set('checking', this.rds);
      const apiState = await this.#checkApi();
      let rds = this.rds;
      if (apiState === 'up') rds = await this.#checkRds();
      else rds = 'unverified';                 // sin API no se puede verificar RDS
      this.#set(apiState, rds);
    } finally {
      this.#busy = false;
      if (this.#running) this.#timer = setTimeout(() => this.refresh(), CONFIG.HEALTH_INTERVAL_MS);
    }
  }

  async #checkApi() {
    try {
      const r = await this.#api.get(CONFIG.ENDPOINTS.salud, { timeoutMs: CONFIG.HEALTH_TIMEOUT_MS });
      return r?.estado === 'disponible' ? 'up' : 'down';
    } catch (e) {
      // Backend anterior sin /salud: se comprueba con una operación REAL de la API (lectura del vehículo).
      if (e.kind === 'http' && (e.status === 404 || e.status === 405) && this.#probe) {
        try { await this.#api.get(this.#probe, { timeoutMs: CONFIG.HEALTH_TIMEOUT_MS }); return 'up'; } catch { return 'down'; }
      }
      return 'down';
    }
  }

  async #checkRds() {
    try {
      const r = await this.#api.get(CONFIG.ENDPOINTS.saludRds, { timeoutMs: CONFIG.HEALTH_TIMEOUT_MS });
      return r?.estado === 'disponible' ? 'up' : 'down';
    } catch (e) {
      if (e.kind === 'http' && e.status === 503 && e.body?.estado === 'no_disponible') return 'down'; // diagnóstico del backend
      return 'unverified';                                              // sin diagnóstico válido → Sin verificar
    }
  }

  #set(api, rds) {
    const changed = api !== this.api || rds !== this.rds;
    this.api = api; this.rds = rds;
    if (changed) this.emit('change', { api, rds });
  }
}
