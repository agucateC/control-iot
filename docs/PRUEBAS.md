# Casos de prueba (manuales) y verificación independiente de WebSocket

Prerrequisitos: API en AWS con v1.1 (o la anterior), `CORS_ORIGINS` con tu origen, vehículo 2 con `DETENER`, y la página abierta.

## A. Verificación independiente de WSS (Postman / Thunder Client / extensión de Chrome)
1. Abre una conexión **WebSocket** a `wss://drift-king.duckdns.org/ws/vehiculos/2`. Debe llegar `estado_inicial`. (Envía `ping` → `pong`.)
2. En la app presiona **Avanzar** (mantén y suelta). En Postman deben llegar `movimiento_individual` con `id_vehiculo=2`, `comando=AVANZAR`, `codigo=1` y otro con `DETENER`/`9`.
3. Compara el `timestamp` del evento con el de la respuesta `201` (pestaña Network → `movimientos` → Response): **son idénticos**.
4. Eso confirma API + WSS. **No** confirma que el vehículo se haya movido.

## B. Joystick
| # | Acción | Resultado esperado |
|---|---|---|
| B1 | Arrastrar hacia arriba y mover el dedo por muchos píxeles | **1** POST (`AVANZAR`); no hay POST por fotograma |
| B2 | Pasar de arriba a la derecha sin soltar | `AVANZAR` → `GIRAR_DERECHA` (una POST por transición) |
| B3 | Soltar / sacar el dedo / cambiar de pestaña | Perilla vuelve al centro, «Neutral», POST `DETENER` |
| B4 | Mantener dentro de la zona central | Sin envíos |
| B5 | Teclado: enfocar el joystick y usar flechas / WASD; soltar | Igual que B1–B3. `Escape` detiene |
| B6 | Catálogo sin `RETROCEDER` | La flecha ↓ se atenúa y no envía nada |

## C. Botones y DETENER
| # | Acción | Resultado esperado |
|---|---|---|
| C1 | Mantener «Subir brazo»; soltar | POST subir brazo; al soltar `DETENER` |
| C2 | Mientras se mantiene, tocar otro botón/joystick | Están deshabilitados (un solo comando activo) |
| C3 | «90° izq.» | **Una** solicitud (acción puntual); botón «Enviando…» → verde |
| C4 | DETENER mientras algo está en vuelo/pendiente | `DETENER` es lo último que se envía; el movimiento pendiente se descarta |
| C5 | DETENER por teclado (Tab + Enter) y `Escape` | Envía `DETENER` |
| C6 | Estados visibles | normal · presionado · enviando · aceptado (verde) · error (rojo) · deshabilitado (punteado) |

## D. DEMO
| # | Acción | Resultado esperado |
|---|---|---|
| D3 | Ejecutar DEMO | En Postman: `demo_inicio`, N×`demo_movimiento` (orden 1..N), `demo_fin`. La barra avanza. Controles manuales deshabilitados; «Ejecutar» deshabilitado |
| D4 | Cancelar a mitad (o DETENER) | `demo_cancelada`; controles se rehabilitan |
| D5 | Revisar `GET /vehiculos/2/historial` antes/después | **Idéntico**: los pasos de DEMO no son movimientos individuales |
| D6 | Recargar la página con una DEMO en curso | La app detecta la ejecución (`ejecucion-demo`) y habilita Cancelar |

## E. Errores y conectividad
| # | Acción | Resultado esperado |
|---|---|---|
| E1 | Detener el servidor de la API | API «No disponible», RDS «Sin verificar», WSS «Reconectando…/Desconectado»; un movimiento muestra error de red y se solicita DETENER |
| E2 | Reiniciar la API | WSS «En línea», API y RDS «Disponible» sin recargar |
| E3 | RDS caída (backend responde `503 no_disponible` en `/salud/rds`) | RDS «No disponible», API «Disponible» |
| E4 | Backend sin `/salud/rds` | RDS «Sin verificar» |
| E5 | Modo avión en el celular y volver | WSS se reconecta solo |

## F. Diseño
Probar en F12 (modo dispositivo) a 320×568, 360×640, 390×844, 568×320, 667×375, 844×390 (horizontal), 768×1024 y 1280×800: **todo visible en una sola pantalla, sin scroll** (ni vertical ni horizontal), joystick completo, DETENER visible, pie sin superponerse, objetivos táctiles ≥ 38 px, estados de conectividad sin recortar.

## G. Pruebas automatizadas (opcional)
En el ZIP del backend: `pytest` (30 pruebas) y `e2e/` (Playwright + cliente WS independiente, 107 comprobaciones, incluida la regla de una sola pantalla en 13 tamaños). Ver `e2e/README.md`.
