// จับตั๋วถูก — service worker: เปิดแอพได้แม้เน็ตหลุด (ข้อมูลราคาจะดึงใหม่เสมอเมื่อออนไลน์)
const CACHE = 'fdw-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // GitHub API / ฟอนต์ ไม่ผ่าน cache
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && !u.pathname.endsWith('.json')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
