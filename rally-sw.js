// Only Rally assets are handled. No credentials, API responses, or other site pages.
const CACHE = 'rally-shell-offline-8';
const ASSETS = ['/tools/rally/', '/tools/rally/app.js', '/tools/rally/offline.js', '/tools/rally/keyboard.js', '/tools/rally/styles.css', '/tools/rally/boot.css', '/lost-lands-2026-lineup/', '/lost-lands-2026-lineup/mobile.css', '/lost-lands-2026-lineup/set-times.js', '/lost-lands-2026-lineup/assets/lost-lands-2026-lineup.jpg'];
ASSETS.push('/tools/rally/meetup-timing.js', '/tools/rally/meetups.js', '/tools/rally/meetups.css', '/tools/rally/assets/lost-lands-2026-map.png');
ASSETS.push('/tools/rally/lineup.js','/tools/rally/lineup-template.js','/lost-lands-2026-lineup/controller.js');
ASSETS.push('/tools/rally/note-rich-text.js','/tools/rally/note-editor.js','/tools/rally/note-editor.css');
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('rally-shell-offline-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, {signal: AbortSignal.timeout(4000)});
      if (!response.ok) throw new Error('Asset unavailable');
      await cache.put(url.pathname, response.clone());
      return response;
    } catch {
      return (await cache.match(url.pathname)) || Response.error();
    }
  })());
});
