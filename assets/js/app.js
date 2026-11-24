import { CONFIG } from './config.js';
import { CommandCatalog } from './domain/catalog.js';
import { CommandController } from './domain/commandController.js';
import { DemoController } from './domain/demoController.js';
import { MonitorController } from './domain/monitorController.js';
import { ApiClient } from './services/apiClient.js';
import { HealthMonitor } from './services/healthMonitor.js';
import { SocketClient } from './services/socketClient.js';
import { MonitorService } from './services/monitorService.js';
import { VehicleService } from './services/vehicleService.js';
import { ControlPanel } from './ui/controlPanel.js';
import { DemoPanel } from './ui/demoPanel.js';
import { Joystick } from './ui/joystick.js';
import { Lever } from './ui/lever.js';
import { VoiceControl } from './ui/voiceControl.js';
import { GestureControl } from './ui/gestureControl.js';
import { FullscreenControl } from './ui/fullscreenControl.js';
import { LastMovement } from './state/lastMovement.js';
import { HistoryStore } from './state/history.js';
import { MonitorView } from './ui/monitorView.js';
import { StatusPanel } from './ui/statusPanel.js';
import { toast } from './ui/toast.js';
import { ViewRouter } from './ui/viewRouter.js';
import { AuthSession } from './services/authSession.js';
import { AdminView } from './ui/adminView.js';
import { MineView } from './ui/mineView.js';
import { GateView } from './ui/gateView.js';
import { selectedVehicleId, selectVehicle } from './state/vehicleSelection.js';
import { friendlyMessage, setAuthMode } from './utils/errors.js';
import { setText } from './utils/dom.js';

/** Punto de entrada: crea los módulos y los conecta (la composición vive solo aquí). */
class App {
  /** @param {AuthSession|null} session null = modo 4.1/4.2 (X-API-Key); con sesión = roles (ADMINISTRADOR/USUARIO/INVITADO). */
  constructor(session = null) {
    this.session = session;
    this.vehicleId = selectedVehicleId();             // null: aún no hay vehículo elegido (admin sin selección)
    this.hasVehicle = this.vehicleId !== null;
    this.status = new StatusPanel();
    this.demo = null;
    this.api = new ApiClient({ baseUrl: CONFIG.API_BASE_URL, timeoutMs: CONFIG.REQUEST_TIMEOUT_MS, getApiKey: () => CONFIG.API_KEY, session });
    const vid = this.vehicleId ?? 0;
    this.vehicle = new VehicleService(this.api, vid);
    this.socket = new SocketClient(vid, session);
    this.health = new HealthMonitor(this.api, this.hasVehicle ? CONFIG.ENDPOINTS.detalle(vid) : '/salud');
    this.commands = new CommandController({ service: this.vehicle, isWsOpen: () => this.socket.isOpen });
    this.demo = new DemoController(this.vehicle);

    const joystick = new Joystick(document.getElementById('joystick'), document.getElementById('joystick-knob'), document.getElementById('joystick-state'));
    this.vehicleName = '';
    const views = {
      control: { el: document.getElementById('control'), link: document.getElementById('nav-control'), title: () => `Control IoT${this.vehicleName ? ` · ${this.vehicleName}` : ''}` },
      monitoreo: { el: document.getElementById('monitor'), link: document.getElementById('nav-monitoreo'), title: () => `Monitoreo${this.vehicleName ? ` · ${this.vehicleName}` : ''} · Control IoT` },
    };
    const role = session?.role ?? null;
    if (role === 'USUARIO') views.vehiculos = { el: document.getElementById('vehiculos'), link: document.getElementById('nav-vehiculos'), title: () => 'Mis vehículos · Control IoT' };
    if (role === 'ADMINISTRADOR') views.administracion = { el: document.getElementById('administracion'), link: document.getElementById('nav-administracion'), title: () => 'Administración · Control IoT' };
    for (const v of Object.values(views)) v.link.hidden = false;
    document.documentElement.dataset.role = role ?? '';
    this.router = new ViewRouter({
      skipLink: document.querySelector('.skip-link'),
      fallback: role === 'ADMINISTRADOR' ? 'administracion' : role === 'USUARIO' ? 'vehiculos' : 'control',
      views,
    });
    this.adminView = role === 'ADMINISTRADOR' ? new AdminView({ host: views.administracion.el, api: this.api, onOpen: (id, v) => this.openVehicle(id, v) }) : null;
    this.mineView = role === 'USUARIO' ? new MineView({ host: views.vehiculos.el, api: this.api, onOpen: (id, v) => this.openVehicle(id, v) }) : null;
    this.controlPanel = new ControlPanel({ commandController: this.commands, joystick, lever: new Lever(document.getElementById('lever')), isActive: () => this.router.current === 'control' });
    this.monitor = new MonitorController({
      service: new MonitorService(this.api, vid), view: new MonitorView(), lastMovement: new LastMovement(), history: new HistoryStore(),
    });
    this.demoPanel = new DemoPanel({ demoController: this.demo });
    this.voice = new VoiceControl({ button: document.getElementById('btn-voice'), service: this.vehicle });
    this.gestures = new GestureControl({ button: document.getElementById('btn-gesture'), commandController: this.commands });
    this.loaded = false;
  }

  /** Cambia de unidad: la elección se recuerda solo en esta pestaña y la API vuelve a autorizar cada uso. */
  openVehicle(id, view) {
    selectVehicle(id);
    globalThis.location.hash = `#/${view}`;
    globalThis.location.reload();
  }

  #sessionUi() {
    const s = this.session;
    if (!s) return;
    const chip = document.getElementById('session-chip'), timer = document.getElementById('session-timer');
    setText(document.getElementById('session-name'), s.user?.nombre || s.role);
    chip.hidden = false;
    const out = document.getElementById('btn-logout'); out.hidden = false;
    out.addEventListener('click', async () => { await s.logout(); globalThis.location.hash = ''; globalThis.location.reload(); });
    s.on('expired', () => { toast('Tu sesión terminó. Vuelve a iniciar sesión.', { error: true, ms: 5000 }); setTimeout(() => globalThis.location.reload(), 1200); });
    if (s.isGuest && s.guest) {                                  // cuenta regresiva de la sesión temporal
      const end = Date.parse(s.guest.expira_en);
      const tick = () => {
        const left = Math.max(0, Math.round((end - Date.now()) / 1000));
        setText(timer, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
        timer.dataset.low = String(left <= 30);
        if (left === 0) { clearInterval(iv); this.#guestOver('Tu tiempo de prueba terminó.'); }
      };
      const iv = setInterval(tick, 1000); tick();
    }
  }

  #guestOver(msg) {
    this.session.clear();
    toast(msg, { ms: 4000 });
    setTimeout(() => { globalThis.location.hash = ''; globalThis.location.reload(); }, 1500);
  }

  start() {
    this.#credits();
    this.#sessionUi();
    setText(document.getElementById('vehicle-id'), this.hasVehicle ? `(ID: ${this.vehicleId})` : '');
    document.getElementById('btn-reload').addEventListener('click', () => this.loadVehicle());
    const about = document.getElementById('about-box');
    document.getElementById('btn-about').addEventListener('click', () => (typeof about.showModal === 'function' ? about.showModal() : about.setAttribute('open', '')));

    // Una sola sesión WSS compartida: alimenta CONTROL y MONITOREO.
    this.socket.on('state', ({ state, ...info }) => {
      this.status.setWs(state, { state, ...info });
      if (state === 'closed' && (info.reason === 'session-ended' || info.reason === 'unauthorized')) {
        if (this.session?.isGuest) this.#guestOver('La sesión de prueba terminó.');
        else if (info.reason === 'unauthorized') this.session?.expire();
      } else if (state === 'closed' && info.reason === 'forbidden') toast('Ya no tienes acceso a este vehículo.', { error: true, ms: 6000 });
      this.monitor.onSocketState({ state });
      if (state === 'open') this.demo.resync();            // recupera DEMO en curso tras (re)conectar
      if (state === 'closed' || state === 'reconnecting') this.health.refresh();
    });
    this.socket.on('event', (ev) => {
      this.status.showEvent(ev);
      this.commands.onSocketEvent(ev);
      this.demo.onSocketEvent(ev);
      this.monitor.onSocketEvent(ev);
    });
    this.health.on('change', ({ api, rds }) => {
      this.status.setApi(api); this.status.setRds(rds);
      if (api === 'up' && !this.loaded && this.hasVehicle) this.loadVehicle();   // se recupera sola cuando la API vuelve
      if (api === 'up') this.monitor.onApiRecovered();
    });
    this.demo.on('change', (s) => { this.commands.setDemoRunning(s.running); this.voice.setBusy(s.running); this.gestures.setBusy(s.running); this.controlPanel.demoStep(s.comando); });
    this.commands.on('action', (a) => this.monitor.setAction(a));      // evidencia técnica → MONITOREO
    this.commands.on('demoStop', () => this.demoPanel.cancelDemo());   // DETENER durante DEMO = cancelar

    this.router.on('change', ({ from, to }) => {
      if (from === 'control') { this.controlPanel.suspend(); this.voice.cancel(); this.gestures.stop(); }            // al salir: suelta lo sostenido (→ DETENER solo si hacía falta)
      if (to === 'monitoreo') this.monitor.activate(); else this.monitor.deactivate();
      if (to === 'administracion') this.adminView.show();
      if (to === 'vehiculos') this.mineView.show();
    });
    this.status.setWs('connecting'); this.status.setApi('checking'); this.status.setRds('unverified');
    new FullscreenControl(document.getElementById('btn-fullscreen'));
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});   // necesario para poder «instalar» la app
    if (this.hasVehicle) this.socket.start(); else this.status.setWs('closed');
    this.health.start();
    this.router.start();
    if (this.hasVehicle) this.loadVehicle(); else this.#noVehicle();
  }

  #noVehicle() {
    setText(document.getElementById('vehicle-name'), 'Sin vehículo seleccionado');
    setText(document.getElementById('log-main'), 'Elige un vehículo');
    this.loaded = true;
  }

  #credits() {
    for (const n of document.querySelectorAll('[data-credit="year"]')) setText(n, String(CONFIG.YEAR));
    setText(document.getElementById('credits-app'), CONFIG.APP_NAME);
    const name = document.getElementById('credits-name');
    setText(name, CONFIG.STUDENT_NAME);
    if (CONFIG.GITHUB_URL) name.href = CONFIG.GITHUB_URL; else name.removeAttribute('href');
    for (const [id, url] of [['credits-github', CONFIG.GITHUB_URL], ['credits-linkedin', CONFIG.LINKEDIN_URL]]) {
      const a = document.getElementById(id);
      if (url) a.href = url; else a.hidden = true;
    }
  }

  async loadVehicle() {
    const box = document.getElementById('load-error');
    try {
      const v = await this.vehicle.getDetail();
      this.loaded = true;
      box.classList.add('d-none');
      this.vehicleName = v.nombre;
      setText(document.getElementById('vehicle-name'), v.nombre + (v.activo ? '' : ' (inactivo)'));
      this.monitor.setVehicle(v.nombre + (v.activo ? '' : ' (inactivo)'), this.vehicleId);
      document.title = this.router.current === 'monitoreo' ? `Monitoreo · ${v.nombre} · Control IoT` : `Control IoT · ${v.nombre}`;
      const catalog = new CommandCatalog(v.comandos);
      this.commands.setCatalog(catalog);
      this.controlPanel.setCatalog(catalog);
      this.demo.setDemos(v.demos);
      if (!catalog.stop) toast('El catálogo no tiene DETENER: créalo para poder detener el vehículo.', { error: true, ms: 7000 });
      setText(document.getElementById('log-main'), 'Listo');
    } catch (e) {
      this.loaded = false;
      setText(document.getElementById('load-error-text'), `No se pudo cargar el vehículo ${this.vehicleId}. ${friendlyMessage(e)}`);
      box.classList.remove('d-none');
    }
  }
}

async function main() {
  setAuthMode(CONFIG.AUTH_ENABLED);
  let session = null;
  if (CONFIG.AUTH_ENABLED) {
    session = new AuthSession();
    const api = new ApiClient({ baseUrl: CONFIG.API_BASE_URL, timeoutMs: CONFIG.REQUEST_TIMEOUT_MS, session });
    if (!(await session.restore())) await new GateView({ host: document.getElementById('gate'), session, api }).open();
    if (session.isGuest && session.guest) selectVehicle(session.guest.id_vehiculo);      // el invitado solo ve su unidad de exhibición
    else if (session.role === 'USUARIO' && !selectedVehicleId()) {
      try { const mine = await api.get(CONFIG.ENDPOINTS.misVehiculos); if (mine[0]?.id_vehiculo) selectVehicle(mine[0].id_vehiculo); } catch { /* sin vehículos aún */ }
    }
  }
  new App(session).start();
}
main();
