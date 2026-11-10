# Control IoT — Etapa 1 (Aplicación de Control)

Aplicación web **solo de control** para un vehículo IoT: joystick circular táctil, botones del catálogo,
**DETENER**, ejecución de **DEMO** y panel de conectividad con **tres indicadores reales**.
HTML5 + CSS3 + Bootstrap 5.3 (local) + JavaScript ES6+ con módulos nativos. Sin build, sin dependencias en tiempo de ejecución.
Se publica **solo el frontend** en GitHub Pages; el backend (FastAPI + RDS) vive en AWS.

> Autor: **Carlos Omar Cruz Ramos**. El pie muestra «© 2026 Control IoT. Todos los derechos reservados. Desarrollado por Carlos Omar Cruz Ramos · 2026»; el nombre y el enlace se cambian en `js/config.js` (`STUDENT_NAME`, `STUDENT_URL`).

## Estructura

```
control-iot/
├── index.html                 Vista (HTML semántico + sprite de iconos inline)
├── css/styles.css             Control de videojuego rojo/negro; una sola pantalla (sin scroll) en móvil, vertical y horizontal
├── js/
│   ├── app.js                 Composición: crea los módulos y los conecta
│   ├── config.js              URL base, ID de vehículo, endpoints, tiempos. SIN secretos
│   ├── services/
│   │   ├── apiClient.js       Fetch + async/await, GET/POST/PUT/DELETE, timeout, errores
│   │   ├── vehicleService.js  Contrato real: detalle, movimientos, iniciar/cancelar DEMO, ejecucion-demo
│   │   ├── socketClient.js    Sesión WSS real: reconexión con backoff, ping/pong, validación de eventos
│   │   └── healthMonitor.js   GET /salud y GET /salud/rds periódicos
│   ├── domain/
│   │   ├── catalog.js         Catálogo → botones disponibles (alias de nombres, sin inventar comandos)
│   │   ├── commandController.js  ÚNICA tubería de envío (prioridad de DETENER, coalescencia, dedupe)
│   │   └── demoController.js  Iniciar/cancelar DEMO y seguir su avance por WSS
│   ├── state/store.js         Estado observable mínimo
│   ├── ui/                    joystick, controlPanel, statusPanel, demoPanel, toast
│   └── utils/                 dom (anti-inyección), validators, errors, format, emitter
├── assets/                    favicon.ico, favicon-32.png, apple-touch-icon, icon-192/512
├── vendor/bootstrap/          Bootstrap 5.3.8 CSS (MIT)
├── docs/                      ARQUITECTURA, CONTRATO_API, PRUEBAS, SEGURIDAD, PUBLICACION, CHECKLIST
└── .nojekyll
```

## Ejecución local

```bash
cd control-iot
python3 -m http.server 8081          # o: npx serve .
# abre http://localhost:8081/
```

Parámetros opcionales de URL (útiles para pruebas):

| Parámetro | Ejemplo | Efecto |
|---|---|---|
| `vehiculo` | `?vehiculo=2` | Otro ID (entero positivo) |
| `api` | `?api=http://localhost:8000` | Otra API; solo se acepta `https://` o `http://localhost` |

Si pruebas contra tu API real desde `localhost:8081`, agrega ese origen a `CORS_ORIGINS` en el servidor (ver `docs/PUBLICACION.md`).

## Configuración (`js/config.js`)

| Constante | Qué es |
|---|---|
| `APP_NAME`, `STUDENT_NAME`, `STUDENT_URL`, `YEAR` | Pie de página (el nombre enlaza a `STUDENT_URL`) |
| `API_BASE_URL` | `https://drift-king.duckdns.org` (HTTPS) |
| `WS_BASE_URL` | Derivada: `https`→`wss` |
| `VEHICLE_ID` | `2` (grúa) |
| `ENDPOINTS` | Rutas reales del contrato (`docs/CONTRATO_API.md`) |
| `RENOVAR_MOVIMIENTO_MS` | `0` = no reenviar el comando mientras se mantiene presionado |

**La clave de API no está en el código**: se escribe en el cuadro del icono 🔑 (solo se necesita para ejecutar/cancelar DEMO)
y vive en memoria (o en `sessionStorage` si marcas «Recordar solo en esta pestaña»).

## Diseño

- **Control de videojuego** en rojo y negro (paleta `#010101 · #72130d · #a02216 · #cc2c20 · #dd3022 · #ec4e29`): joystick circular a la izquierda, **DETENER** grande al centro (con el selector de DEMO y sus iconos ▶ ✕ 🔑) y botones circulares con icono a la derecha.
- **Una sola pantalla, sin deslizar**: el área del control se ajusta al espacio libre (`100dvh`, container queries). En **horizontal** (o pantallas anchas) se ve como mando; en **vertical** se apila: indicadores, joystick, botones, DETENER y DEMO.
- Los botones muestran icono + etiqueta cuando caben; en pantallas muy pequeñas solo icono (siempre con `aria-label`).
- La **clave de API** se pide en un cuadro (icono 🔑) y «Acerca de» está en el icono ⓘ.
- Probado sin scroll ni solapes en 13 tamaños: 320×568 a 1920×1080, vertical y horizontal.

## Cómo funciona

1. Al abrir: `GET /vehiculos/{id}` → nombre, catálogo de comandos y DEMO. Solo aparecen los botones que **existen y están activos**.
2. **Joystick** (Pointer Events): arriba/abajo/izq./der. → `AVANZAR`/`RETROCEDER`/`GIRAR_IZQUIERDA`/`GIRAR_DERECHA`, con zona neutral e histéresis.
   Solo se envía una solicitud por **cambio de dirección**; al soltar → `DETENER`.
3. **Botones**: *mantenidos* (avanzar, brazo…) envían al presionar y `DETENER` al soltar; *puntuales* (giros 90°/360°, sonido) envían una vez.
4. **Un solo comando activo**: mientras un control está presionado los demás se deshabilitan; con una DEMO en curso solo funcionan **Cancelar** y **DETENER** (que cancela la DEMO).
5. **Evidencia por etapas** (nunca «ejecutado»): ✔ Solicitado → ✔ Aceptado por la API (201) → ✔ Evento WSS (mismo `timestamp`).
6. **DEMO**: `POST …/demos/{id}/iniciar` (202) y la secuencia, el orden y las pausas los ejecuta **el servidor**; la app muestra `demo_inicio`, cada `demo_movimiento`, `demo_fin`/`demo_cancelada`/`demo_error`. Los pasos de DEMO **no** entran al historial (lo garantiza el backend; verificado en las pruebas).

## Indicadores de conectividad

| Indicador | Fuente real | Estados |
|---|---|---|
| WebSocket (WSS) | Apertura/error/cierre del `WebSocket` del navegador | En línea · Conectando… / Reconectando… · Desconectado |
| Servidor AWS (APIs) | `GET /salud` cada 15 s (y al reconectar) | Disponible · Comprobando… · No disponible |
| Amazon RDS | `GET /salud/rds` (diagnóstico del backend) | Disponible · No disponible · **Sin verificar** |

RDS **nunca se supone**: si la API no responde o el backend no tiene `/salud/rds`, queda «Sin verificar».
Ninguno de los tres indica que el **vehículo físico** esté en línea (eso dependerá del ESP8266/ESP32 en una etapa posterior).

## Requisitos del backend (cambios incluidos en `backend-api-v1.1.zip`)

El backend original no tenía CORS ni `/salud`. La versión 1.1 agrega: controladores POO, `PUT`/`DELETE`,
CORS por `CORS_ORIGINS`, `GET /salud` y `GET /salud/rds`. Los `POST …/actualizar|eliminar|cancelar` anteriores siguen funcionando,
y **esta app usa POST para movimientos y acciones de DEMO**, por lo que es compatible con el backend anterior y el nuevo
(sin `/salud` la API se comprueba con una lectura real del vehículo, y RDS queda «Sin verificar»).

## Commits recomendados

```
chore: estructura inicial, .gitignore y .nojekyll
feat(ui): maqueta Mobile First con Bootstrap, favicon y pie con créditos
feat(api): cliente REST (GET/POST/PUT/DELETE), timeout y errores amigables
feat(ws): sesión WSS con reconexión, ping/pong y validación de eventos
feat(health): indicadores API AWS y RDS con diagnóstico real
feat(control): catálogo, controlador único de comandos y prioridad de DETENER
feat(joystick): Pointer Events con zona neutral e histéresis
feat(demo): selector, ejecutar y cancelar DEMO con seguimiento por WSS
docs: README, contrato, pruebas, seguridad y publicación
```

Más detalles: `docs/ARQUITECTURA.md`, `docs/CONTRATO_API.md`, `docs/PRUEBAS.md`, `docs/SEGURIDAD.md`, `docs/PUBLICACION.md`, `docs/CHECKLIST.md`.
