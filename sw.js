// La Reine du Bio : permet d'ouvrir l'app même sans internet.
// Pour forcer une mise à jour du cache, changer le numéro de VERSION.
const VERSION = 'rb-v1';
const APP = ['./', './index.html', './apple-touch-icon.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP).catch(() => {});
    await Promise.all(LIBS.map(u =>
      fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Page de l'app : internet d'abord (pour avoir toujours la dernière version),
// mais si internet est absent ou trop lent, on ouvre la copie gardée.
async function page(req) {
  const c = await caches.open(VERSION);
  const net = fetch(req).then(r => {
    if (r && r.ok) c.put('./index.html', r.clone());
    return r;
  });
  const timeout = new Promise(res => setTimeout(res, 4000));
  try {
    const r = await Promise.race([net, timeout]);
    if (r) return r;
  } catch (e) {}
  const cached = await c.match('./index.html');
  if (cached) return cached;
  return net;
}

// Bibliothèques, polices et images : copie gardée d'abord, mise à jour en arrière-plan.
async function asset(req) {
  const c = await caches.open(VERSION);
  const cached = await c.match(req, { ignoreSearch: false });
  const net = fetch(req).then(r => {
    if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
    return r;
  }).catch(() => null);
  return cached || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) return e.respondWith(page(req));
  if (url.origin === location.origin) return e.respondWith(asset(req));
  if (CDN.test(req.url)) return e.respondWith(asset(req));
  // Supabase, WhatsApp, etc. : on ne touche pas.
});
