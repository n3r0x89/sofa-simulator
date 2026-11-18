# Sofa Simulator V3 – persistence layer

This folder is the isolated V3 development area. V2 is not modified.

## Current status

- `storage.js` provides an IndexedDB persistence layer.
- The module is not yet connected to the V2 game loop or a V3 interface.
- No deployment, merge, or change to the published V2 version has been made.

## API

- `openSaveDatabase()`
- `loadCurrentSave()`
- `saveCurrent(payload, { dailyBackup })`
- `migrateV2({ storage })`
- `listBackups()`
- `restoreBackup(id)`
- `exportSave()`
- `importSave(file)`
- `requestPersistentStorage()`

## Storage rules

- IndexedDB database: `sofa-simulator-v3`
- Object stores: `currentSave`, `backups`, `migration`, `meta`
- The exact V2 LocalStorage value at `sofasim_v2` is copied into a protected migration record. Migration never deletes or overwrites that key.
- The V2 migration checkpoint is excluded from normal backup rotation.
- Normal saves update the current record. A daily checkpoint is created only when the in-game day advances.
- Automatic/recovery checkpoints are limited to five; the protected V2 migration checkpoint is additional.
- Export/import and restore validate format, schema, payload structure and SHA-256 when the browser supports Web Crypto. Migration is marked complete only after its saved copy and preserved V2 original have been read back and verified.

## Important integration notes

The V2 state defaults were transcribed from `v2/index.html`'s `fresh()` function. V2 also creates some fields at runtime (for example `pendingDay` and `lastToastDelay`); those need a deliberate persistence decision during integration. Temporary UI, animation, timer and modal state must not be serialized.

## Current verification status

The persistence layer has received code-level hardening for new-game day resets, bounded backup rotation, restore/export checksum checks, and migration read-back verification. These are implementation changes, not proof of successful browser/device execution. The checklist in `TEST_PLAN.md` remains open until those tests are run.

Before connecting this module to the game:
1. Test in a real browser with a copy of a V2 save.
2. Exercise corrupt JSON, malformed payloads, quota errors and interrupted transactions.
3. Verify the migration copy and V2 LocalStorage key remain unchanged.
4. Verify the protected migration checkpoint survives all normal backup rotations.
5. Test export/import and restore on iOS Safari and desktop/mobile Chromium.

IndexedDB is browser-local storage, not a cloud backup. Browser data deletion can still remove it; users should export important saves.
