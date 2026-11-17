// Sofa Simulator v2 – Offline-Speicher. Bei jeder neuen Version die Nummer hochzählen.
const C='sofa-v2-5';
const CORE=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('sofa-v2-')&&x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  const font=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if(u.origin!==location.origin&&!font)return;
  if(font){e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const c2=res.clone();caches.open(C).then(c=>c.put(r,c2));return res})));return}
  // Seite und Dateien: erst Netz (für Updates), sonst Offline-Kopie
  e.respondWith(fetch(r).then(res=>{if(res.ok){const c2=res.clone();caches.open(C).then(c=>c.put(r,c2))}return res}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))))});
