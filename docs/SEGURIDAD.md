# Seguridad

- **Sin credenciales de infraestructura**: el repositorio no contiene claves de AWS ni credenciales de RDS.
- **`X-API-Key` en el código (decisión del autor)**: `API_KEY` está en `assets/js/config.js` y se publica con el sitio, por lo que cualquiera que abra el código la puede leer y ejecutar DEMO. Es una limitación asumida; si se filtra, cámbiala en el servidor (`.env`) y en `config.js`. Para control multiusuario real, el backend debería emitir tokens de sesión de corta duración.
- **CORS no es autenticación**: solo indica al navegador qué orígenes pueden leer respuestas. Se configura con `CORS_ORIGINS` (sin comodín, sin credenciales, métodos GET/POST/PUT/DELETE/OPTIONS, headers `Content-Type` y `X-API-Key`). La protección real es la `X-API-Key` en el servidor.
- **HTTPS/WSS**: la página es HTTPS, la API HTTPS y el socket WSS. `?api=` solo acepta `https://` o `http://localhost`; `socketClient` bloquea `ws://` desde páginas HTTPS (mixed content) y lo indica.
- **JSON remoto no confiable**: se valida forma y tipos antes de usar; solo se aceptan eventos del vehículo propio y tipos conocidos; strings acotados.
- **Anti-inyección DOM**: todo texto remoto entra con `textContent`/`createElement`; no se usa `innerHTML`.
- **RDS**: el navegador jamás se conecta a MySQL; su estado sale solo de `/salud/rds`, y si no existe se muestra «Sin verificar».
- **Vehículo físico**: ni WSS abierto ni API disponible implican vehículo en línea; no se muestra tal estado.
- **Resiliencia**: timeouts con `AbortController`, `credentials: 'omit'`, `cache: 'no-store'`, reintentos acotados solo para DETENER, reconexión con backoff, respuestas tardías correlacionadas por `timestamp`.
