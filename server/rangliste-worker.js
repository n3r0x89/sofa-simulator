// Assi Simulator – Rangliste (Cloudflare Worker + D1-Datenbank, Bindung "DB")
// GET  /top            -> {players:[{id,n,l,x,d,seen}], total}
// POST /score          -> {id,k,n,l,x,d}   (k = geheimer Schlüssel des Handys)
// POST /import         -> {b:[[id,n,l,x,d,seen],...]}  (alte Spieler übernehmen, nur neue IDs)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const ID = /^[a-z0-9]{6,24}$/;
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(+v || 0)));
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const TABLE = 'CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, k TEXT, n TEXT NOT NULL, l INTEGER NOT NULL, x INTEGER NOT NULL, d INTEGER NOT NULL, seen INTEGER NOT NULL)';

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url), now = Date.now();
    try {
      await env.DB.prepare(TABLE).run();
      if (req.method === 'GET' && url.pathname === '/top') {
        const r = await env.DB.prepare('SELECT id,n,l,x,d,seen FROM players ORDER BY l DESC, x DESC, d DESC LIMIT 200').all();
        const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM players').first();
        return json({ players: r.results || [], total: c ? c.c : 0, now });
      }
      if (req.method === 'POST' && url.pathname === '/score') {
        const p = await req.json().catch(() => null);
        if (!p || !ID.test(p.id || '') || typeof p.k !== 'string' || p.k.length < 16 || p.k.length > 64) return json({ ok: false, e: 'bad' }, 400);
        const n = cleanName(p.n); if (!n) return json({ ok: false, e: 'name' }, 400);
        const l = num(p.l, 1, 999), x = num(p.x, 0, l * 40), d = num(p.d, 1, 100000);
        const kh = await sha('assi:' + p.k);
        const old = await env.DB.prepare('SELECT k,seen FROM players WHERE id=?').bind(p.id).first();
        if (old && old.k && old.k !== kh) return json({ ok: false, e: 'key' }, 403);
        if (old && now - old.seen < 20000) return json({ ok: true, skip: 1 });
        await env.DB.prepare('INSERT INTO players (id,k,n,l,x,d,seen) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET k=excluded.k,n=excluded.n,l=excluded.l,x=excluded.x,d=excluded.d,seen=excluded.seen')
          .bind(p.id, kh, n, l, x, d, now).run();
        return json({ ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/import') {
        const p = await req.json().catch(() => null);
        if (!p || !Array.isArray(p.b)) return json({ ok: false }, 400);
        let added = 0;
        for (const e of p.b.slice(0, 80)) {
          if (!Array.isArray(e) || !ID.test(e[0] || '')) continue;
          const n = cleanName(e[1]); if (!n) continue;
          const l = num(e[2], 1, 200), x = num(e[3], 0, l * 40), d = num(e[4], 1, 5000), seen = num(e[5], 0, now);
          const r = await env.DB.prepare('INSERT OR IGNORE INTO players (id,k,n,l,x,d,seen) VALUES (?,NULL,?,?,?,?,?)').bind(e[0], n, l, x, d, seen).run();
          if (r.meta && r.meta.changes) added++;
        }
        return json({ ok: true, added });
      }
      return json({ ok: false, e: 'not found' }, 404);
    } catch (err) { return json({ ok: false, e: 'server' }, 500); }
  }
};
