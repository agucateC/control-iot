# MONITOREO (práctica 4.2) — auditoría, arquitectura y pruebas

Vista nueva dentro del mismo sitio y repositorio. **CONTROL no se rehízo**: solo se tocaron 3 puntos de integración
(`CommandController.releaseAll()`, `ControlPanel.suspend()/isActive` y la composición en `app.js`).

## 1. Auditoría y contratos reales

Fuente de los contratos: código del backend v1.2 entregado (controladores, esquemas Pydantic y `openapi.json` generado).
**No se pudo consultar el Swagger desplegado en `drift-king.duckdns.org` desde el entorno de desarrollo** (red restringida);
por eso hay un paso pendiente de comprobación en producción (sección 6).

| Dato | Contrato real (verificado en el código del backend) |
|---|---|
| Último estado | `GET /vehiculos/{id}/estado` → `{id_vehiculo, vehiculo, id_comando, comando, codigo, conectado, fecha_actualizacion}`; sin estado: `id_comando/comando/codigo = null` |
| Historial | `GET /vehiculos/{id}/historial` → `[{id_historial, id_vehiculo, comando, codigo, fecha_hora, origen}]`. **Siempre los 10 más recientes, orden descendente, solo movimientos individuales** (las DEMO no se guardan). No admite parámetros de límite/orden |
| Evento WSS individual | `movimiento_individual`: `id_vehiculo, comando, codigo, id_comando, origen, conectado, timestamp (UTC con zona)`. **No trae `id_historial`**; se emite DESPUÉS del commit en RDS |
| Eventos de DEMO/IA | `demo_inicio`, `demo_movimiento (orden, total_movimientos, duracion_ms, pausa_ms)`, `demo_fin`, `demo_cancelada`, `demo_error`; la IA agrega `origen: "ia"` e `id_demo: null` |
| Fechas | `fecha_hora` y `fecha_actualizacion` salen de MySQL **sin zona** (`2026-11-12T17:45:54`) |
| Salud | `GET /salud` (API) y `GET /salud/rds` (200/503) — sin cambios |
| Auth / CORS | Lecturas públicas; la clave `X-API-Key` solo se usa en DEMO/IA. CORS por `CORS_ORIGINS` (debe incluir el origen de GitHub Pages) |

Consecuencias de diseño: como el evento WSS no trae el id persistido, la persistencia **se confirma por REST** (no se asume).

## 2. Arquitectura

```
 GitHub Pages (HTTPS)                         AWS (Caddy HTTPS/WSS)                    Amazon RDS
┌──────────────────────────────┐        ┌──────────────────────────────┐       ┌───────────────┐
│ index.html  (#/control | #/monitoreo)│   │ FastAPI (21 servicios)       │       │ MySQL         │
│                              │ REST   │  GET /estado  /historial     │  SQL  │ estado        │
│ ViewRouter ─ CONTROL (joystick,│──────▶│  POST /movimientos           │──────▶│ historial     │
│   botones, DETENER, DEMO)    │        │  GET /salud  /salud/rds      │       │ (solo SP)     │
│            └ MONITOREO       │◀───────│                              │       └───────────────┘
│   MonitorController          │  WSS   │  ConnectionManager.broadcast │
│    ├ MonitorService (GET)    │◀══════▶│  (después del commit)        │
│    ├ LastMovement (tarjeta)  │ 1 sola │                              │
│    └ HistoryStore (tabla)    │ sesión └──────────────────────────────┘
│ SocketClient + HealthMonitor │ (compartida por las dos vistas)
└──────────────────────────────┘   El navegador NUNCA habla con RDS.
```

Archivos nuevos: `utils/datetime.js`, `utils/singleFlight.js`, `services/monitorService.js`, `state/lastMovement.js`,
`state/history.js`, `domain/monitorController.js`, `ui/monitorView.js`, `ui/viewRouter.js`.
Modificados: `index.html` (nav + vista), `css/styles.css` (nav + MONITOREO), `app.js`, `config.js`, `commandController.js` (+`releaseAll`), `controlPanel.js` (+`suspend`, `isActive`).

## 3. Lógica

**Último movimiento.** Al entrar: `GET /estado`. Luego cada evento WSS válido del mismo vehículo actualiza la tarjeta al instante
(también los generados desde otra pestaña/cliente). La tarjeta rotula el canal («Leído de la API» / «Publicado por WSS»), la
persistencia («Estado guardado en RDS», «Verificando…», «Persistido en RDS · historial #N», «Sin confirmar», «No se guarda en el
historial (DEMO/IA)») y siempre «Ejecución física sin verificar». Solicitado / aceptado HTTP viven en CONTROL; aquí solo WSS y RDS.

**Tabla de 10.** `GET /historial` → dedupe por `id_historial`, orden por id DESC (el id crece con cada insert; `fecha_hora` tiene resolución de
segundos), máximo 10. El DOM se reconcilia por `data-id`: se crean solo las filas nuevas, se reordena y se quitan las que salen del top 10
(solo se dejan de **mostrar**; no se borra nada en RDS). Numeración visual 1..10.

**Estrategia de reconciliación (probada).**
| Riesgo | Defensa |
|---|---|
| Respuesta REST vieja pisa un evento nuevo | `LastMovement.seq`: si llegó un evento WSS después de pedir el GET, la respuesta se descarta |
| Fetch simultáneos | `SingleFlight`: 1 en vuelo + a lo sumo 1 repetición |
| Evento sin id persistido | tras `movimiento_individual` se espera un id mayor al conocido; reintentos acotados (0.5 s y 1.5 s); si no aparece → «Sin confirmar». Sin polling continuo |
| Evento duplicado / atrasado | firma `evento|timestamp|comando|orden` y comparación de timestamp |
| WSS perdido | al reabrir (o volver a la pestaña / recuperarse la API) → REST de estado + historial |
| DEMO/IA | solo tarjeta; el historial no se consulta ni modifica. Al terminar → `GET /estado` |
| Otro vehículo / payload inválido | `SocketClient` filtra por `id_vehiculo`; los servicios validan la forma y descartan filas inválidas |
| Cambiar de vista | un único listener `hashchange`; las vistas se ocultan, no se recrean; al salir de CONTROL se suelta lo sostenido (DETENER solo si había algo) |

**Hora.** MySQL entrega fechas sin zona; se interpretan como **UTC** (`SERVER_NAIVE_IS_UTC`) y se muestran en **America/Mexico_City** (`DISPLAY_TIME_ZONE`), con la zona rotulada (GMT-6). Si la hora de la BD difiere >5 min de la del evento WSS que acaba de persistirse, la tarjeta lo avisa.

**Indicadores.** Los tres siguen en el encabezado en ambas vistas, con sus fuentes independientes (sesión WSS · `/salud` · `/salud/rds`).

## 4. Local y GitHub Pages
Igual que CONTROL: `python -m http.server 8081` en la carpeta; en Pages las rutas son relativas y la navegación usa hash (`#/monitoreo`), sin configuración extra. URL directa: `https://<usuario>.github.io/<repo>/#/monitoreo`. Asegura `CORS_ORIGINS=https://<usuario>.github.io` en el `.env` del backend.

## 5. Casos de prueba
`api/e2e/e2e_monitoreo.cjs` (76 comprobaciones, navegador real Chromium + API real FastAPI sobre BD simulada + cliente `ws` independiente) y `e2e.cjs` (CONTROL, 48+).

| # | Caso | Tipo | Evidencia |
|---|---|---|---|
| 1 | Carga inicial: tarjeta = `/estado`, tabla = `/historial`, numeración, 3 indicadores | **Real (automática)** | salida del script |
| 2 | Comando desde otro cliente → tarjeta por WSS, «Persistido en RDS #id», fila nueva; el cliente WSS independiente recibe el mismo evento (timestamp idéntico al POST) | **Real** | idem |
| 3 | Comando desde CONTROL (UI) en una pestaña → otra pestaña en MONITOREO se actualiza | **Real** | idem |
| 4 | >10 movimientos: 10 filas, sin duplicados, id descendente, idéntica a la API; filas existentes conservadas en el DOM | **Real** | idem |
| 5 | Fecha/hora UTC→Mexico_City, formato dd/mm/aaaa hh:mm:ss | **Real** | idem |
| 6 | DEMO no contamina: tabla y `/historial` idénticos antes/después; paso de DEMO en tarjeta | **Real** | idem |
| 7 | Respuesta REST vieja descartada (GET retrasado 1.4 s + evento nuevo) | **Real** | idem |
| 8 | Pérdida de WSS → aviso → reconexión → resincronización de lo no oído | **Real** (se cierra el socket del navegador) | idem |
| 9 | Error de red/500: «Error», Reintentar; vehículo sin datos: «Sin registros» | **Real** | idem |
| 10 | XSS: comando `<img onerror>` se muestra como texto | **Real** | idem |
| 11 | Navegación, foco, Atrás, hash inválido, sin listeners duplicados (1 GET por evento tras 20 cambios de vista) | **Real** | idem |
| 12 | Joystick/DETENER intactos; salir de CONTROL con joystick sostenido envía DETENER | **Real** | idem |
| 13 | 11 tamaños de pantalla sin scroll de página/tabla | **Real** | idem |
| P1 | Con el backend **desplegado**: confirmar que `fecha_hora` de RDS está en UTC (crear un movimiento y comparar con la hora real) | **Pendiente (producción)** | captura de `GET /historial` + hora local |
| P2 | Comando desde Postman/Thunder Client a `POST /movimientos` y mensaje recibido en un cliente WSS (`wss://drift-king.duckdns.org/ws/vehiculos/2`) con MONITOREO abierto en GitHub Pages | **Pendiente (producción)** | captura del mensaje WSS + del MONITOREO |
| P3 | CORS desde el origen `https://<usuario>.github.io` y WSS bajo HTTPS | **Pendiente (producción)** | consola del navegador sin errores |
| P4 | Persistencia real en Amazon RDS (consulta `SELECT` en Workbench tras mover) | **Pendiente (producción)** | captura de Workbench |
| P5 | Salud RDS real (apagar/pausar RDS y ver el indicador «No disponible») | **Pendiente (opcional)** | captura |
| — | Ejecución física del vehículo | **No aplica**: aún no hay ESP32 conectado; se necesitaría telemetría/heartbeat del dispositivo | — |

## 6. Checklist
**Seguridad:** HTTPS/WSS (el WSS bloquea `ws://` desde HTTPS) · sin credenciales de AWS/RDS en el código · el navegador nunca toca RDS · todo texto remoto con `textContent` (probado con XSS) · payloads validados · `API_KEY` visible por diseño (solo DEMO/IA; MONITOREO no la usa).
**Accesibilidad:** `nav` con `aria-current` · foco visible y foco a la vista nueva · `role="status"/aria-live` en tarjeta, avisos y tabla · `caption` y `th scope` · región de tabla enfocable por teclado · botones ≥34–40 px · contraste claro sobre negro/rojo · `prefers-reduced-motion`.
**Errores:** Cargando / Sin movimientos / Sin registros / Desconectado·Reconectando / Error (+Reintentar) · timeout y aborto en el cliente REST · reconexión con backoff.
