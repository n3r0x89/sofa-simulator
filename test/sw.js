// Sofa Simulator v2 – Offline-Speicher. Bei jeder neuen Version die Nummer hochzählen.
const C='sofa-test-127';
const CORE=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./sounds/bell1.mp3','./sounds/burp1.mp3','./sounds/burp2.mp3','./sounds/burp3.mp3','./sounds/burp4.mp3','./sounds/clink1.mp3','./sounds/clink2.mp3','./sounds/clink3.mp3','./sounds/cough1.mp3','./sounds/cough2.mp3','./sounds/fart1.mp3','./sounds/fart2.mp3','./sounds/fart3.mp3','./sounds/fart4.mp3','./sounds/fart5.mp3','./sounds/fart6.mp3','./sounds/fart7.mp3','./sounds/gulp1.mp3','./sounds/gulp2.mp3','./sounds/gulp3.mp3','./sounds/gulp4.mp3','./sounds/gulp5.mp3','./sounds/knock1.mp3','./sounds/lighter1.mp3','./sounds/plop1.mp3','./sounds/plop2.mp3','./sounds/puff1.mp3','./sounds/puff2.mp3','./sounds/retch1.mp3','./sounds/retch2.mp3','./sounds/retch3.mp3','./sounds/smash1.mp3','./sounds/smash2.mp3','./sounds/smash3.mp3','./sounds/smash4.mp3','./sounds/buzz1.mp3','./sounds/buzz2.mp3','./sounds/wake1.mp3','./sounds/fail1.mp3','./sounds/slap1.mp3','./sounds/cash1.mp3','./sounds/cash2.mp3','./sounds/ring1.mp3','./sounds/lvl1.mp3','./sounds/coo1.mp3','./sounds/groan1.mp3'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('sofa-test-')&&x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  const font=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if(u.origin!==location.origin&&!font)return;
  if(u.searchParams.has('probe'))return;
  const put=(req,res)=>{if(res&&res.ok){const c2=res.clone();caches.open(C).then(c=>c.put(req,c2))}return res};
  // Seite selbst: immer frisch aus dem Netz, nur offline aus dem Speicher
  if(r.mode==='navigate'||/\/(index\.html)?$/.test(u.pathname)){
    e.respondWith(fetch(r.url,{cache:'no-cache',credentials:'same-origin',redirect:'manual'}).then(res=>{
      // Umgezogen? Dann alte Seite aus dem Speicher zeigen, die nimmt den Spielstand mit zur neuen Adresse
      if(res.type==='opaqueredirect')return caches.match('./index.html').then(m=>m||Response.redirect('https://assi-simulator.de/v2/',302));
      return put(r.url,res)}).catch(()=>caches.match(r.url).then(m=>m||caches.match('./index.html'))));return}
  // Bilder, Töne, Schriften: erst Speicher, sonst Netz (der Speicher wird bei jeder neuen Version geleert)
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>put(r,res))))});
