/**
 * Configuración de la aplicación. OJO: este archivo se publica tal cual en GitHub Pages,
 * así que API_KEY queda visible para cualquiera que abra el código de la página.
 * No pongas aquí claves de AWS ni datos de RDS.
 */
const params = new URLSearchParams(globalThis.location?.search ?? '');

/** Permite probar otro servidor con ?api=https://... solo si es HTTPS (o localhost). */
function resolveApiBase(defaultUrl) {
  const candidate = params.get('api');
  if (!candidate) return defaultUrl;
  try {
    const u = new URL(candidate);
    const local = ['localhost', '127.0.0.1'].includes(u.hostname);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return u.origin;
  } catch { /* se ignora y se usa el valor por defecto */ }
  return defaultUrl;
}

function resolveVehicleId(defaultId) {
  const n = Number(params.get('vehiculo'));
  return Number.isInteger(n) && n > 0 ? n : defaultId;
}

const API_BASE_URL = resolveApiBase('https://drift-king.duckdns.org');

export const CONFIG = Object.freeze({
  /** Datos del pie de página: © AÑO APP_NAME. Todos los derechos reservados. Desarrollado por STUDENT_NAME · AÑO */
  APP_NAME: 'Control IoT',
  STUDENT_NAME: 'Carlos Omar Cruz Ramos',
  GITHUB_URL: 'https://github.com/agucateC',        // '' para ocultar el enlace
  LINKEDIN_URL: 'https://www.linkedin.com/in/carlos-omar-cruz-ramos',   // '' para ocultar el enlace
  YEAR: 2026,

  API_BASE_URL,
  /** Clave X-API-Key para las operaciones protegidas (ejecutar/cancelar DEMO). */
  API_KEY: '7TME%??xjdu%Nohiul%*P%7Ni!37oR@',
  /** WSS derivado de la misma base: https→wss (nunca ws:// desde una página HTTPS). */
  WS_BASE_URL: API_BASE_URL.replace(/^http/i, 'ws'),
  VEHICLE_ID: resolveVehicleId(2),

  /** Endpoints REALES del contrato de la API (ver docs/CONTRATO_API.md). */
  ENDPOINTS: Object.freeze({
    detalle: (id) => `/vehiculos/${id}`,
    movimientos: (id) => `/vehiculos/${id}/movimientos`,
    iniciarDemo: (id, demo) => `/vehiculos/${id}/demos/${demo}/iniciar`,
    cancelarDemo: (id) => `/vehiculos/${id}/ejecucion-demo/cancelar`,
    ejecucionDemo: (id) => `/vehiculos/${id}/ejecucion-demo`,
    estado: (id) => `/vehiculos/${id}/estado`,
    historial: (id) => `/vehiculos/${id}/historial`,
    salud: '/salud',
    saludRds: '/salud/rds',
    ws: (id) => `/ws/vehiculos/${id}`,
    instrucciones: (id) => `/vehiculos/${id}/ia/instrucciones`,
  }),

  /** MONITOREO. El backend devuelve ya los 10 más recientes (GET /historial) y MySQL entrega fechas sin zona. */
  HISTORY_LIMIT: 10,
  DISPLAY_TIME_ZONE: 'America/Mexico_City',
  SERVER_NAIVE_IS_UTC: true,                 // fecha_hora / fecha_actualizacion sin zona = UTC (ver docs/MONITOREO.md)
  HISTORY_RETRY_MS: [500, 1500],             // reintentos acotados si el evento WSS aún no aparece en el historial
  CLOCK_SKEW_WARN_MS: 5 * 60 * 1000,         // aviso si la hora de BD y la del evento difieren más que esto

  /** IA: voz (Web Speech API del navegador → POST /ia/instrucciones) y señas con la mano (MediaPipe en el navegador). */
  VOICE_LANG: 'es-MX',
  VOICE_REQUEST_TIMEOUT_MS: 25000,           // la IA tarda más que un movimiento normal
  GESTURES: Object.freeze({
    MEDIAPIPE_MODULE: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
    MEDIAPIPE_WASM: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    MODEL_URL: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
    MIN_SCORE: 0.6,        // confianza mínima de MediaPipe
    FRAME_MS: 100,         // ≈10 fotogramas por segundo
    STABLE_FRAMES: 3,      // una seña debe repetirse así de seguido para activarse
    LOST_FRAMES: 5,        // sin mano (o seña distinta) tantos fotogramas → se suelta y el carro se DETIENE
    /** Seña de MediaPipe → comando del catálogo ('DETENER' = parar). */
    MAP: Object.freeze({ Pointing_Up: 'AVANZAR', Thumb_Down: 'RETROCEDER', Victory: 'GIRAR_IZQUIERDA', Thumb_Up: 'GIRAR_DERECHA', Open_Palm: 'DETENER', Closed_Fist: 'DETENER' }),
    NAMES: Object.freeze({ Pointing_Up: '☝️ Avanzar', Thumb_Down: '👎 Retroceder', Victory: '✌️ Girar a la izquierda', Thumb_Up: '👍 Girar a la derecha', Open_Palm: '✋ Detener', Closed_Fist: '✊ Detener' }),
  }),

  REQUEST_TIMEOUT_MS: 8000,
  MOVE_TIMEOUT_MS: 5000,
  HEALTH_INTERVAL_MS: 15000,
  HEALTH_TIMEOUT_MS: 5000,
  WS_PING_MS: 20000,
  WS_PONG_TIMEOUT_MS: 8000,
  WS_BACKOFF_MS: [1000, 2000, 4000, 8000, 15000],
  /** Espera máxima del evento WS que corresponde a un POST aceptado. */
  EVENT_WAIT_MS: 3000,
  /**
   * 0 = no reenviar el comando mientras se mantiene presionado (evita POST repetitivos e historial duplicado).
   * Si tu firmware corta el movimiento a los N ms, pon un valor menor (p. ej. 3500) para renovarlo.
   */
  RENOVAR_MOVIMIENTO_MS: 0,
});
