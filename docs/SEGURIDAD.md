# Seguridad

- **Sin secretos públicos**: el repositorio no contiene claves de AWS, credenciales de RDS, tokens ni la `X-API-Key`. Verificado con búsqueda automática en las pruebas.
- **Clave de API para cliente público**: se teclea en tiempo de uso (memoria; `sessionStorage` solo si se pide). Solo se necesita para ejecutar/cancelar DEMO; los movimientos no la requieren. Limitación asumida: cualquier clave tecleada en un navegador es visible para esa persona; por eso no se publica ni se incrusta. Para control multiusuario real, el backend debería emitir tokens de sesión de corta vida (fuera del alcance de esta etapa).
- **CORS no es autenticación**: solo indica al navegador qué orígenes pueden leer respuestas. Se configura con `CORS_ORIGINS` (sin comodín, sin credenciales, métodos GET/POST/PUT/DELETE/OPTIONS, headers `Content-Type` y `X-API-Key`). La protección real es la `X-API-Key` en el servidor.
- **HTTPS/WSS**: la página es HTTPS, la API HTTPS y el socket WSS. `?api=` solo acepta `https://` o `http://localhost`; `socketClient` bloquea `ws://` desde páginas HTTPS (mixed content) y lo indica.
- **JSON remoto no confiable**: se valida forma y tipos antes de usar; solo se aceptan eventos del vehículo propio y tipos conocidos; strings acotados.
- **Anti-inyección DOM**: todo texto remoto entra con `textContent`/`createElement`; no se usa `innerHTML`.
- **RDS**: el navegador jamás se conecta a MySQL; su estado sale solo de `/salud/rds`, y si no existe se muestra «Sin verificar».
- **Vehículo físico**: ni WSS abierto ni API disponible implican vehículo en línea; no se muestra tal estado.
- **Resiliencia**: timeouts con `AbortController`, `credentials: 'omit'`, `cache: 'no-store'`, reintentos acotados solo para DETENER, reconexión con backoff, respuestas tardías correlacionadas por `timestamp`.
