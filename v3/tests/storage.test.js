import {
  setDatabaseNameForTesting, openSaveDatabase, migrateV2, loadCurrentSave,
  saveCurrent, listBackups, exportSave, importSave, restoreBackup
} from "../storage.js";

const DB = "sofa-simulator-v3-test-browser";
const results = document.querySelector("#results");
const runButton = document.querySelector("#run");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function report(name, ok, detail = "") {
  const row = document.createElement("div");
  row.className = "test-row " + (ok ? "pass" : "fail");
  row.textContent = (ok ? "✓ " : "✗ ") + name + (detail ? " — " + detail : "");
  results.append(row);
}
function sample(day = 1) {
  return {
    day, hour: 8, tot: 0, lvl: 1, xp: 0, money: 5, beer: 6, snacks: 2, cigs: 10,
    h: {}, st: { zaps: [] }, furn: {}, best: {}, ach: {}, jobCd: {}, hintsDone: {},
    vhs: [], puddles: [], stains: [], splats: [], started: true
  };
}
function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Testdatenbank wird noch verwendet."));
  });
}
async function test(name, fn) {
  try { await fn(); report(name, true); return true; }
  catch (error) { report(name, false, error.message); return false; }
}

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  results.replaceChildren();
  let passed = 0, failed = 0;
  const execute = async (name, fn) => {
    const ok = await test(name, fn);
    if (ok) passed++; else failed++;
  };
  try {
    await deleteDatabase(DB);
    setDatabaseNameForTesting(DB);
    await execute("Datenbank lässt sich isoliert öffnen", async () => {
      const db = await openSaveDatabase();
      assert(db.name === DB, "Falscher Datenbankname");
      db.close();
    });
    const legacy = sample(4);
    const raw = JSON.stringify(legacy);
    const storage = { getItem: key => key === "sofasim_v2" ? raw : null };
    await execute("V2-Migration übernimmt den kopierten Spielstand", async () => {
      const result = await migrateV2({ storage });
      assert(result.migrated && result.originalPreserved, "Migration nicht bestätigt");
      const current = await loadCurrentSave();
      assert(current.day === 4, "Tag 4 nicht übernommen");
    });
    await execute("V2-Original bleibt bytegenau erhalten", async () => {
      const db = await openSaveDatabase();
      const tx = db.transaction("migration", "readonly");
      const record = await new Promise((resolve, reject) => {
        const request = tx.objectStore("migration").get("v2-original");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      db.close();
      assert(record.raw === raw, "Original-JSON unterscheidet sich");
    });
    await execute("Wiederholte Migration überschreibt keinen V3-Spielstand", async () => {
      const changed = sample(9);
      await saveCurrent(changed, { dailyBackup: false });
      const result = await migrateV2({ storage });
      assert(result.reason === "already-migrated", "Migration war nicht idempotent");
      assert((await loadCurrentSave()).day === 9, "V3-Spielstand wurde überschrieben");
    });
    await execute("Tages-Sicherungen rotieren auf maximal fünf", async () => {
      for (let day = 10; day <= 16; day++) await saveCurrent(sample(day));
      const backups = await listBackups();
      const rotating = backups.filter(item => item.reason !== "v2-migration");
      assert(rotating.length <= 5, "Mehr als fünf rotierende Sicherungen: " + rotating.length);
      assert(backups.some(item => item.reason === "v2-migration"), "V2-Originalsicherung fehlt");
    });
    await execute("Neustart auf Tag 1 erzeugt eine neue Sicherung", async () => {
      await saveCurrent(sample(1), { newGame: true });
      const backups = await listBackups();
      assert(backups.some(item => item.gameDay === 1), "Sicherung für neuen Lauf fehlt");
    });
    await execute("Export erzeugt eine lesbare JSON-Datei", async () => {
      const blob = await exportSave();
      const parsed = JSON.parse(await blob.text());
      assert(parsed.format === "sofa-simulator-save", "Exportformat falsch");
    });
    await execute("Beschädigter Import wird abgelehnt", async () => {
      const blob = await exportSave();
      const parsed = JSON.parse(await blob.text());
      parsed.payload.money = 999999;
      let rejected = false;
      try { await importSave(new Blob([JSON.stringify(parsed)], { type: "application/json" })); }
      catch { rejected = true; }
      assert(rejected, "Manipulierte Prüfsumme wurde akzeptiert");
    });
    await execute("Import repariert einen strukturell beschädigten aktuellen Spielstand", async () => {
      const validExport = await exportSave();
      const db = await openSaveDatabase();
      const tx = db.transaction("currentSave", "readwrite");
      const store = tx.objectStore("currentSave");
      const current = await new Promise((resolve, reject) => {
        const request = store.get("current");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      store.put({ ...current, payload: { damaged: true } });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      db.close();
      await importSave(validExport);
      assert((await loadCurrentSave()).day > 0, "Import hat den beschädigten Stand nicht ersetzt");
      const backups = await listBackups();
      assert(backups.some(item => item.reason === "pre-import-corrupt"), "Beschädigter Rohstand wurde nicht gesichert");
    });
    await execute("Wiederherstellung setzt einen vorhandenen Snapshot zurück", async () => {
      const backups = await listBackups();
      const target = backups.find(item => item.reason === "daily");
      assert(target, "Kein Tages-Backup vorhanden");
      await restoreBackup(target.id);
      assert((await loadCurrentSave()).day === target.gameDay, "Falscher Tag wiederhergestellt");
    });
  } finally {
    const summary = document.createElement("h2");
    summary.textContent = `${passed} bestanden · ${failed} fehlgeschlagen`;
    results.prepend(summary);
    runButton.disabled = false;
  }
});