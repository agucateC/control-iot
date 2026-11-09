# Arquitectura y flujo de datos

```
Navegador (GitHub Pages, HTTPS)
┌────────────────────────────────────────────────────────────────────┐
│ ui/ (vista y eventos)                                              │
│   joystick ─┐                                                      │
│   botones  ─┼─► CommandController ──► VehicleService ──► ApiClient ─┼─ HTTPS ─► API FastAPI (AWS)
│   DETENER  ─┘   (única tubería)                                    │            POST /vehiculos/2/movimientos
│   demoPanel ───► DemoController ────► VehicleService ──► ApiClient ─┼─ HTTPS ─► POST …/demos/{id}/iniciar
│                                                                    │            POST …/ejecucion-demo/cancelar
│   statusPanel ◄── SocketClient  ◄──────────────────────────────────┼─ WSS ───► /ws/vehiculos/2 (eventos)
│   statusPanel ◄── HealthMonitor ───────────────► ApiClient ────────┼─ HTTPS ─► GET /salud, GET /salud/rds
└────────────────────────────────────────────────────────────────────┘
                                         API ──► Amazon RDS (solo el backend; el navegador nunca toca RDS)
```

## Responsabilidades

| Capa | Módulos | Regla |
|---|---|---|
| Vista | `index.html`, `css/`, `ui/*` | Solo DOM y gestos; contenido remoto con `textContent` |
| Dominio | `domain/*` | Reglas de negocio; sin DOM ni `fetch` |
| Servicios | `services/*` | Red: REST, WSS, salud. Validan JSON remoto |
| Estado | `state/store.js`, emisores | Observables simples |
| Utilidades | `utils/*` | DOM seguro, validadores, errores |
| Composición | `app.js` | Único lugar que conecta módulos |

## Flujo de un movimiento

1. Gesto (joystick/botón) → `CommandController.press|pulse|release|stop`.
2. Cola de 1 elemento + una POST en vuelo: se **coalescen** cambios intermedios y se omite el comando ya activo.
3. `DETENER` se envía **antes** que cualquier movimiento pendiente y se reintenta (3 intentos) ante fallos de red.
4. `POST /movimientos` → 201 con `timestamp`. El servidor emite el evento WSS **antes** de responder el POST; por eso el controlador conserva los últimos eventos y correlaciona por `timestamp` en cualquier orden.
5. Fases visibles: Solicitado → Aceptado por la API → Evento WSS. Nunca «ejecutado».

## Flujo de una DEMO

`POST iniciar` (202) → el servidor emite `demo_inicio`, `demo_movimiento`×N (con `orden`, `total_movimientos`, `duracion_ms`, `pausa_ms`) y `demo_fin`.
`POST cancelar` (o DETENER) → `demo_cancelada` y estado `DETENER` sin historial. Tras recargar o reconectar, `GET …/ejecucion-demo` recupera el estado.
