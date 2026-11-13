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
import { LastMovement } from './state/lastMovement.js';
import { HistoryStore } from './state/history.js';
import { MonitorView } from './ui/monitorView.js';
import { StatusPanel } from './ui/statusPanel.js';
import { toast } from './ui/toast.js';
import { ViewRouter } from './ui/viewRouter.js';
import { friendlyMessage } from './utils/errors.js';
import { setText } from './utils/dom.js';

/** Punto de entrada: crea los módulos y los conecta (la composición vive solo aquí). */
class App {
  constructor() {
    this.status = new StatusPanel();
    this.demo = null;
    this.api = new ApiClient({ baseUrl: CONFIG.API_BASE_URL, timeoutMs: CONFIG.REQUEST_TIMEOUT_MS, getApiKey: () => CONFIG.API_KEY });
    this.vehicle = new VehicleService(this.api, CONFIG.VEHICLE_ID);
    this.socket = new SocketClient(CONFIG.VEHICLE_ID);
    this.health = new HealthMonitor(this.api, CONFIG.ENDPOINTS.detalle(CONFIG.VEHICLE_ID));
    this.commands = new CommandController({ service: this.vehicle, isWsOpen: () => this.socket.isOpen });
    this.demo = new DemoController(this.vehicle);

    const joystick = new Joystick(document.getElementById('joystick'), document.getElementById('joystick-knob'), document.getElementById('joystick-state'));
    this.vehicleName = '';
    this.router = new ViewRouter({
      skipLink: document.querySelector('.skip-link'),
      views: {
        control: { el: document.getElementById('control'), link: document.getElementById('nav-control'), title: () => `Control IoT${this.vehicleName ? ` · ${this.vehicleName}` : ''}` },
        monitoreo: { el: document.getElementById('monitor'), link: document.getElementById('nav-monitoreo'), title: () => `Monitoreo${this.vehicleName ? ` · ${this.vehicleName}` : ''} · Control IoT` },
      },
    });
    this.controlPanel = new ControlPanel({ commandController: this.commands, joystick, isActive: () => this.router.current === 'control' });
    this.monitor = new MonitorController({
      service: new MonitorService(this.api, CONFIG.VEHICLE_ID), view: new MonitorView(), lastMovement: new LastMovement(), history: new HistoryStore(),
    });
    this.demoPanel = new DemoPanel({ demoController: this.demo });
    this.loaded = false;
  }

  start() {
    this.#credits();
    setText(document.getElementById('vehicle-id'), `(ID: ${CONFIG.VEHICLE_ID})`);
    document.getElementById('btn-reload').addEventListener('click', () => this.loadVehicle());
    const about = document.getElementById('about-box');
    document.getElementById('btn-about').addEventListener('click', () => (typeof about.showModal === 'function' ? about.showModal() : about.setAttribute('open', '')));

    // Una sola sesión WSS compartida: alimenta CONTROL y MONITOREO.
    this.socket.on('state', ({ state, ...info }) => {
      this.status.setWs(state, { state, ...info });
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
      if (api === 'up' && !this.loaded) this.loadVehicle();   // se recupera sola cuando la API vuelve
      if (api === 'up') this.monitor.onApiRecovered();
    });
    this.demo.on('change', (s) => this.commands.setDemoRunning(s.running));
    this.commands.on('demoStop', () => this.demoPanel.cancelDemo());   // DETENER durante DEMO = cancelar

    this.router.on('change', ({ from, to }) => {
      if (from === 'control') this.controlPanel.suspend();            // al salir: suelta lo sostenido (→ DETENER solo si hacía falta)
      if (to === 'monitoreo') this.monitor.activate(); else this.monitor.deactivate();
    });
    this.status.setWs('connecting'); this.status.setApi('checking'); this.status.setRds('unverified');
    this.socket.start();
    this.health.start();
    this.router.start();
    this.loadVehicle();
  }

  #credits() {
    for (const n of document.querySelectorAll('[data-credit="year"]')) setText(n, String(CONFIG.YEAR));
    setText(document.getElementById('credits-app'), CONFIG.APP_NAME);
    const name = document.getElementById('credits-name');
    setText(name, CONFIG.STUDENT_NAME);
    if (CONFIG.STUDENT_URL) name.href = CONFIG.STUDENT_URL; else name.removeAttribute('href');
  }

  async loadVehicle() {
    const box = document.getElementById('load-error');
    try {
      const v = await this.vehicle.getDetail();
      this.loaded = true;
      box.classList.add('d-none');
      this.vehicleName = v.nombre;
      setText(document.getElementById('vehicle-name'), v.nombre + (v.activo ? '' : ' (inactivo)'));
      this.monitor.setVehicle(v.nombre + (v.activo ? '' : ' (inactivo)'), CONFIG.VEHICLE_ID);
      document.title = this.router.current === 'monitoreo' ? `Monitoreo · ${v.nombre} · Control IoT` : `Control IoT · ${v.nombre}`;
      const catalog = new CommandCatalog(v.comandos);
      this.commands.setCatalog(catalog);
      this.controlPanel.setCatalog(catalog);
      this.demo.setDemos(v.demos);
      if (!catalog.stop) toast('El catálogo no tiene DETENER: créalo para poder detener el vehículo.', { error: true, ms: 7000 });
      setText(document.getElementById('log-main'), 'Listo: mantén presionado un control.');
    } catch (e) {
      this.loaded = false;
      setText(document.getElementById('load-error-text'), `No se pudo cargar el vehículo ${CONFIG.VEHICLE_ID}. ${friendlyMessage(e)}`);
      box.classList.remove('d-none');
    }
  }
}

new App().start();
