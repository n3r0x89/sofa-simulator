// Aufräum-Worker: ersetzt den alten V3-Offline-Speicher auf der Startseite.
// Er löscht alte Kopien, meldet sich selbst ab und lädt offene Fenster neu, damit /v2/ frisch geladen wird.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const ks=await caches.keys();await Promise.all(ks.filter(k=>!k.startsWith('sofa-v2-')).map(k=>caches.delete(k)));
  await self.registration.unregister();
  const cs=await self.clients.matchAll({type:'window'});cs.forEach(c=>{try{c.navigate(c.url)}catch(e){}});
})()));
