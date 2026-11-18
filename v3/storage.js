/* Sofa Simulator V3 persistence layer.
 * Browser-native IndexedDB storage. This module is intentionally standalone:
 * integrate it into the game only after its migration and recovery paths are tested.
 */
const DB_NAME = "sofa-simulator-v3";
const DB_VERSION = 1;
const SAVE_FORMAT = "sofa-simulator-save";
const SCHEMA_VERSION = 1;
const BACKUP_LIMIT = 5;
const V2_STORAGE_KEY = "sofasim_v2";

const V2_DEFAULTS = Object.freeze({
  day: 1, hour: 8, tot: 0, lvl: 1, xp: 0, money: 5, beer: 6, snacks: 2, cigs: 10,
  th: 20, hu: 20, bo: 20, chaos: 0, prom: 0, hang: 0, mold: 0,
  empties: 0, basket: 0, pfandStock: 0, bottle: null, right: "empty", cigPuffs: 0,
  butts: 0, packClosed: false, smolderUntil: 0, ch: 0, tvOn: true,
  powerOutUntil: 0, remoteGone: 0, furn: {}, lampOn: false, fridge: 0,
  fridgeColdAt: 0, massageAt: 0, puddles: [], stains: [], splats: [],
  h: {
    neighbor: 0, nice: 0, niceDeeds: 0, jc: 0, inkasso: 0, cutDays: 0,
    police: 0, lf: 0, kowNo: 0, kowYes: 0, crimes: 0, crimesOk: 0, legal: 0,
    caught: 0, ignored: 0, insults: 0, calls: 0, pizza: 0, kowLast: -9,
    cake: false, banUntil: 0, giftDone: false, uweTrades: 0, lfVisit: 0,
    jessLast: -9, jessTv: false
  },
  pukeAt: 2.3, lastPuke: -999, sickSaid: false, taskDone: false, taskIdx: 0,
  diary: 0, diaryNew: false, jobCd: {}, plasmaUntil: 0, vhs: [],
  ach: {},
  st: {
    beers: 0, throws: 0, puke: 0, filmriss: 0, clean: 0, pfandBottles: 0,
    pfandMoney: 0, tvH: 0, films: 0, tasks: 0, games: 0, zaps: [], schnitzel: 0
  },
  best: { flight: 0, pong: 0, catch: 0 },
  sound: true, hintsDone: {}, started: false
});

const clone = value => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const now = () => new Date().toISOString();

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("Storage transaction aborted"));
    tx.onerror = () => reject(tx.error || new Error("Storage transaction failed"));
  });
}

function trimBackupStore(store) {
  const request = store.getAll();
  request.onsuccess = () => {
    const rows = request.result
      .filter(item => item.reason !== "v2-migration")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const old of rows.slice(BACKUP_LIMIT)) store.delete(old.id);
  };
}

function mergeDefaults(value, defaults) {
  if (!isRecord(value)) return clone(defaults);
  const result = clone(value);
  for (const [key, fallback] of Object.entries(defaults)) {
    if (result[key] === undefined || result[key] === null) {
      result[key] = clone(fallback);
    } else if (isRecord(fallback)) {
      result[key] = mergeDefaults(result[key], fallback);
    }
  }
  return result;
}

function validatePayload(payload) {
  if (!isRecord(payload)) throw new Error("Spielstand ist kein gültiges Objekt.");
  const requiredNumbers = ["day", "hour", "tot", "lvl", "xp", "money", "beer", "snacks", "cigs"];
  for (const key of requiredNumbers) {
    if (typeof payload[key] !== "number" || !Number.isFinite(payload[key])) {
      throw new Error("Ungültiger Spielstandwert: " + key);
    }
  }
  if (!isRecord(payload.h) || !isRecord(payload.st) || !isRecord(payload.furn) ||
      !isRecord(payload.best) || !isRecord(payload.ach) || !isRecord(payload.jobCd) ||
      !isRecord(payload.hintsDone) || !Array.isArray(payload.vhs) ||
      !Array.isArray(payload.puddles) || !Array.isArray(payload.stains) ||
      !Array.isArray(payload.splats) || !Array.isArray(payload.st.zaps)) {
    throw new Error("Spielstand enthält ungültige Datenstrukturen.");
  }
  return true;
}

async function digest(text) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function envelope(payload, sourceVersion = "v3") {
  validatePayload(payload);
  const timestamp = now();
  return {
    format: SAVE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    gameVersion: "3.0.0",
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceVersion,
    payload: clone(payload)
  };
}

async function withChecksum(record) {
  const checksum = await digest(JSON.stringify(record));
  return { ...record, checksum };
}

export function openSaveDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB ist in diesem Browser nicht verfügbar."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("currentSave")) db.createObjectStore("currentSave", { keyPath: "id" });
      if (!db.objectStoreNames.contains("backups")) db.createObjectStore("backups", { keyPath: "id" });
      if (!db.objectStoreNames.contains("migration")) db.createObjectStore("migration", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Datenbank konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Datenbank-Upgrade wird von einem anderen geöffneten Tab blockiert."));
  });
}

export async function loadCurrentSave() {
  const db = await openSaveDatabase();
  try {
    const tx = db.transaction("currentSave", "readonly");
    const record = await requestResult(tx.objectStore("currentSave").get("current"));
    await transactionDone(tx);
    if (!record) return null;
    if (record.format !== SAVE_FORMAT || record.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("Dieses Speicherformat wird von dieser Version nicht unterstützt.");
    }
    validatePayload(record.payload);
    const { checksum, ...unsigned } = record;
    const actual = await digest(JSON.stringify(unsigned));
    if (checksum && actual && checksum !== actual) throw new Error("Die gespeicherten Daten haben eine ungültige Prüfsumme.");
    return clone(record.payload);
  } finally {
    db.close();
  }
}

export async function saveCurrent(payload, { dailyBackup = true } = {}) {
  const normalized = mergeDefaults(payload, V2_DEFAULTS);
  validatePayload(normalized);
  const db = await openSaveDatabase();
  try {
    const readTx = db.transaction(["meta", "currentSave"], "readonly");
    const metaStore = readTx.objectStore("meta");
    const [lastDay, previousRecord] = await Promise.all([
      requestResult(metaStore.get("lastBackupDay")),
      requestResult(readTx.objectStore("currentSave").get("current"))
    ]);
    await transactionDone(readTx);

    // A lower day than the previous save signals a fresh game run. This resets
    // the daily checkpoint baseline without requiring game UI integration.
    const previousDay = Number(previousRecord?.payload?.day);
    const currentDay = Number(normalized.day);
    const newRun = Number.isFinite(previousDay) && currentDay < previousDay;
    const shouldBackup = dailyBackup && (newRun || currentDay > Number(lastDay?.value ?? -1));
    const record = await withChecksum({ ...envelope(normalized), id: "current" });
    const backup = shouldBackup ? await withChecksum({
      ...envelope(normalized), id: "backup-" + Date.now(), reason: "daily", gameDay: normalized.day
    }) : null;
    const tx = db.transaction(["currentSave", "backups", "meta"], "readwrite");
    tx.objectStore("currentSave").put(record);
    if (backup) {
      tx.objectStore("backups").put(backup);
      trimBackupStore(tx.objectStore("backups"));
      tx.objectStore("meta").put({ key: "lastBackupDay", value: normalized.day });
    }
    await transactionDone(tx);
    return { saved: true, backupCreated: shouldBackup };
  } finally {
    db.close();
  }
}

export async function migrateV2({ storage = globalThis.localStorage } = {}) {
  const existingDb = await openSaveDatabase();
  try {
    const tx = existingDb.transaction("migration", "readonly");
    const prior = await requestResult(tx.objectStore("migration").get("v2-original"));
    await transactionDone(tx);
    if (prior?.status === "completed") {
      return { migrated: false, reason: "already-migrated", originalPreserved: true };
    }
  } finally {
    existingDb.close();
  }

  let raw;
  try { raw = storage?.getItem(V2_STORAGE_KEY); }
  catch { throw new Error("Der V2-Spielstand ist wegen einer Browser-Speicherbeschränkung nicht lesbar."); }
  if (!raw) return { migrated: false, reason: "no-v2-save" };

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Der vorhandene V2-Spielstand ist beschädigt. Das Original wurde nicht verändert."); }
  if (!isRecord(parsed)) throw new Error("Der V2-Spielstand hat ein ungültiges Format.");

  const payload = mergeDefaults(parsed, V2_DEFAULTS);
  validatePayload(payload);
  const rawHash = await digest(raw);
  const migration = {
    id: "v2-original",
    sourceKey: V2_STORAGE_KEY,
    capturedAt: now(),
    raw,
    checksum: rawHash,
    status: "completed"
  };
  const initialBackup = await withChecksum({
    ...envelope(payload, "v2"),
    id: "backup-v2-migration",
    reason: "v2-migration",
    gameDay: payload.day
  });
  const current = await withChecksum({ ...envelope(payload, "v2"), id: "current" });

  const db = await openSaveDatabase();
  try {
    const tx = db.transaction(["currentSave", "backups", "migration", "meta"], "readwrite");
    tx.objectStore("migration").put(migration);
    tx.objectStore("backups").put(initialBackup);
    tx.objectStore("currentSave").put(current);
    tx.objectStore("meta").put({ key: "lastBackupDay", value: payload.day });
    tx.objectStore("meta").put({ key: "migrationStatus", value: "completed" });
    await transactionDone(tx);
    const verifyTx = db.transaction(["currentSave", "migration"], "readonly");
    const [saved, original] = await Promise.all([
      requestResult(verifyTx.objectStore("currentSave").get("current")),
      requestResult(verifyTx.objectStore("migration").get("v2-original"))
    ]);
    await transactionDone(verifyTx);
    if (!saved || !original || saved.checksum !== current.checksum || original.raw !== raw) {
      throw new Error("Die V2-Migration konnte nicht verifiziert werden.");
    }
    return { migrated: true, day: payload.day, originalPreserved: true };
  } finally {
    db.close();
  }
}

export async function listBackups() {
  const db = await openSaveDatabase();
  try {
    const tx = db.transaction("backups", "readonly");
    const rows = await requestResult(tx.objectStore("backups").getAll());
    await transactionDone(tx);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, createdAt, reason, gameDay, sourceVersion }) =>
        ({ id, createdAt, reason, gameDay, sourceVersion }));
  } finally { db.close(); }
}

export async function restoreBackup(id) {
  const db = await openSaveDatabase();
  try {
    const read = db.transaction("backups", "readonly");
    const backup = await requestResult(read.objectStore("backups").get(id));
    await transactionDone(read);
    if (!backup) throw new Error("Sicherung nicht gefunden.");
    if (backup.format !== SAVE_FORMAT || backup.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("Diese Sicherung hat ein nicht unterstütztes Format.");
    }
    validatePayload(backup.payload);
    const { checksum: backupChecksum, ...backupUnsigned } = backup;
    const backupActual = await digest(JSON.stringify(backupUnsigned));
    if (backupChecksum && backupActual && backupChecksum !== backupActual) {
      throw new Error("Die Sicherung ist beschädigt (Prüfsumme stimmt nicht).");
    }
    const currentRead = db.transaction("currentSave", "readonly");
    const previous = await requestResult(currentRead.objectStore("currentSave").get("current"));
    await transactionDone(currentRead);
    const recovery = previous ? await withChecksum({
      ...envelope(previous.payload, "pre-restore-recovery"),
      id: "backup-pre-restore-" + Date.now(), reason: "pre-restore", gameDay: previous.payload.day
    }) : null;
    const current = await withChecksum({ ...envelope(backup.payload, "backup-restore"), id: "current" });
    const write = db.transaction(["currentSave", "backups"], "readwrite");
    write.objectStore("currentSave").put(current);
    const backupStore = write.objectStore("backups");
    if (recovery) backupStore.put(recovery);
    trimBackupStore(backupStore);
    await transactionDone(write);
    return true;
  } finally { db.close(); }
}

export async function exportSave() {
  const db = await openSaveDatabase();
  try {
    const tx = db.transaction("currentSave", "readonly");
    const record = await requestResult(tx.objectStore("currentSave").get("current"));
    await transactionDone(tx);
    if (!record) throw new Error("Es gibt noch keinen Spielstand zum Exportieren.");
    if (record.format !== SAVE_FORMAT || record.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("Der Spielstand hat ein nicht unterstütztes Format.");
    }
    validatePayload(record.payload);
    const { checksum, ...unsigned } = record;
    const actual = await digest(JSON.stringify(unsigned));
    if (checksum && actual && checksum !== actual) throw new Error("Der Spielstand ist beschädigt und kann nicht exportiert werden.");
    return new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  } finally { db.close(); }
}

export async function importSave(file) {
  if (!(file instanceof Blob)) throw new Error("Keine gültige Sicherungsdatei ausgewählt.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Die Sicherungsdatei ist ungewöhnlich groß (über 10 MB).");
  let record;
  try { record = JSON.parse(await file.text()); }
  catch { throw new Error("Die Sicherungsdatei enthält kein gültiges JSON."); }
  if (record?.format !== SAVE_FORMAT || record?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("Die Sicherungsdatei stammt aus einem unbekannten oder nicht unterstützten Format.");
  }
  validatePayload(record.payload);
  const { checksum, ...unsigned } = record;
  const actual = await digest(JSON.stringify(unsigned));
  if (checksum && actual && checksum !== actual) throw new Error("Die Sicherungsdatei ist beschädigt (Prüfsumme stimmt nicht).");
  const clean = await withChecksum({ ...envelope(record.payload, "import"), id: "current" });
  const db = await openSaveDatabase();
  try {
    const read = db.transaction("currentSave", "readonly");
    const previous = await requestResult(read.objectStore("currentSave").get("current"));
    await transactionDone(read);
    const recovery = previous ? await withChecksum({
      ...envelope(previous.payload, "pre-import-recovery"),
      id: "backup-pre-import-" + Date.now(),
      reason: "pre-import",
      gameDay: previous.payload.day
    }) : null;
    const tx = db.transaction(["currentSave", "backups"], "readwrite");
    tx.objectStore("currentSave").put(clean);
    const backupStore = tx.objectStore("backups");
    if (recovery) backupStore.put(recovery);
    trimBackupStore(backupStore);
    await transactionDone(tx);
    return true;
  } finally { db.close(); }
}

export async function requestPersistentStorage() {
  if (!globalThis.navigator?.storage?.persist) return false;
  try { return await globalThis.navigator.storage.persist(); }
  catch { return false; }
}
