# Publicación en GitHub Pages (solo el frontend)

1. Edita `assets/js/config.js` → `STUDENT_NAME` con tu nombre completo y revisa `API_BASE_URL` y `VEHICLE_ID`.
2. Crea un repositorio (p. ej. `control-iot`) y sube **el contenido de la carpeta `control-iot/`** a la raíz:
   ```bash
   git init && git add . && git commit -m "feat: aplicación de control IoT (etapa 1)"
   git branch -M main && git remote add origin https://github.com/USUARIO/control-iot.git && git push -u origin main
   ```
3. GitHub → *Settings → Pages* → *Deploy from a branch* → `main` / `/ (root)`. URL final: `https://USUARIO.github.io/control-iot/`.
4. **Permite el origen en el backend** (en el `.env` del servidor, sin barra final ni ruta):
   ```
   CORS_ORIGINS=https://USUARIO.github.io
   ```
   Sube la versión 1.1 del backend (`backend-api-v1.1.zip`), reinicia `uvicorn app.main:app` (Windows/AWS) y verifica `https://drift-king.duckdns.org/salud` y `/salud/rds`.
5. Crea en el vehículo 2 el comando `DETENER` (código 9) si no existe (Swagger: `POST /vehiculos/2/comandos`).
6. Verifica en la URL publicada: favicon en la pestaña, pie con tu nombre, tres indicadores y consola sin errores (F12).

Las rutas son **relativas** (`assets/css/…`, `assets/js/…`, `assets/img/…`), por eso funcionan en la subruta `/control-iot/`. `.nojekyll` evita que Pages procese los archivos.
Solo se publica el frontend: no subas `.env`, claves ni el backend a este repositorio.
