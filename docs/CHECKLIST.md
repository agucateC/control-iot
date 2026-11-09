# Checklist final

**Seguridad**
- [ ] Ninguna clave/credencial en `js/`, `index.html` ni en el historial de Git
- [ ] `CORS_ORIGINS` con el origen exacto de GitHub Pages (sin `*`)
- [ ] API por HTTPS y socket por WSS (sin mixed content)
- [ ] Sin `innerHTML` con datos remotos

**Funcional**
- [ ] Joystick: 1 POST por transición, DETENER al soltar
- [ ] Botones solo del catálogo; DETENER visible y con prioridad
- [ ] DEMO: iniciar, seguir por WSS, cancelar; no hay dos simultáneas; no entra al historial
- [ ] Tres indicadores cambian ante caída y recuperación; RDS «Sin verificar» sin diagnóstico
- [ ] Verificación independiente con Postman/Thunder Client (mismo `timestamp`)

**Accesibilidad**
- [ ] Teclado completo (Tab, Enter/Espacio, flechas, Escape), foco visible, enlace «Saltar al control»
- [ ] Estados con texto + icono + color (no solo color); regiones `aria-live`
- [ ] Objetivos táctiles ≥ 44 px; contraste adecuado; `prefers-reduced-motion`

**Publicación**
- [ ] `STUDENT_NAME` con tu nombre completo; favicon visible en la pestaña; pie visible sin solaparse
- [ ] Consola sin errores en la URL de GitHub Pages
