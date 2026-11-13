# Contrato de la API usado por el frontend

Obtenido del código real de la API (`app.openapi()`), no inventado. Base: `https://drift-king.duckdns.org`. Vehículo: `2`.
🔒 = requiere `X-API-Key`.

| Uso en la app | Método y ruta | Cuerpo | Respuesta |
|---|---|---|---|
| Cargar vehículo, catálogo y DEMO | `GET /vehiculos/{id}` | — | 200 `{id_vehiculo, nombre, activo, comandos[{id_comando,codigo,nombre,activo}], estado, demos[{id_demo,nombre,activo}]}` |
| Movimiento | `POST /vehiculos/{id}/movimientos` | `{"id_comando":N,"origen":"CONTROL_WEB"}` | 201 `{mensaje,id_vehiculo,id_comando,comando,codigo,origen,conectado,timestamp,clientes_notificados}` · 409 si hay DEMO en curso · 404/400 |
| Iniciar DEMO 🔒 | `POST /vehiculos/{id}/demos/{id_demo}/iniciar` | — | 202 `{mensaje,id_vehiculo,id_demo,total_movimientos}` · 409 ya hay DEMO |
| Cancelar DEMO 🔒 | `POST /vehiculos/{id}/ejecucion-demo/cancelar` | — | 200 `{mensaje}` · 409 si no hay DEMO |
| Estado de ejecución | `GET /vehiculos/{id}/ejecucion-demo` | — | 200 `{en_ejecucion,id_demo,inicio,total_movimientos}` |
| Último estado *(MONITOREO)* | `GET /vehiculos/{id}/estado` | — | 200 `{id_vehiculo, vehiculo, id_comando, comando, codigo, conectado, fecha_actualizacion}` |
| Historial *(MONITOREO)* | `GET /vehiculos/{id}/historial` | — | 200 `[{id_historial, id_vehiculo, comando, codigo, fecha_hora, origen}]` (10 más recientes, DESC, sin DEMO) |
| Salud API *(nuevo v1.1)* | `GET /salud` | — | 200 `{"servicio":"api","estado":"disponible"}` |
| Diagnóstico RDS *(nuevo v1.1)* | `GET /salud/rds` | — | 200 `{"servicio":"rds","estado":"disponible","latencia_ms":N}` · 503 `{"estado":"no_disponible"}` |
| WebSocket | `WSS /ws/vehiculos/{id}` | texto `ping` → `pong` | eventos abajo; cierre `4404` si el vehículo no existe |

Equivalentes con los verbos nuevos (v1.1, opcionales): `DELETE …/ejecucion-demo` (cancelar 🔒), `PUT`/`DELETE` para actualizar/eliminar recursos 🔒.
El cliente (`apiClient.js`) soporta GET/POST/PUT/DELETE; la app usa POST para movimientos y DEMO, conforme al backend previo.

## Eventos WSS (campos fijos: `evento, id_vehiculo, comando, codigo, timestamp`)

| `evento` | Campos adicionales |
|---|---|
| `estado_inicial` | `conectado`, `fecha_actualizacion` |
| `movimiento_individual` | `id_comando`, `origen`, `conectado` — su `timestamp` es **idéntico** al de la respuesta 201 |
| `demo_inicio` / `demo_fin` | `id_demo`, `total_movimientos` |
| `demo_movimiento` | `id_demo`, `orden`, `total_movimientos`, `duracion_ms`, `pausa_ms` |
| `demo_cancelada` | `id_demo` |
| `demo_error` | `id_demo`, `detalle` |
| `pong` | respuesta a `ping` |

## Datos que dependen de tu base de datos
El catálogo del **vehículo 2** debe incluir `DETENER` (código 9); sin él la app avisa y no puede detener. Los nombres de comandos se reconocen
con alias (p. ej. `LEVANTAR_GRUA`→Subir brazo, `GIRAR_DERECHA`→joystick derecha). Un comando activo no reconocido aparece como botón genérico con su nombre.
Para giros de 90°/360° crea `GIRO_90_IZQ`, `GIRO_90_DER` y `GIRO_360` (o los alias de `domain/catalog.js`).
