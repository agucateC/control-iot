// Service worker mínimo: hace la app «instalable» (pantalla completa sin barra del navegador). No guarda nada en caché.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
