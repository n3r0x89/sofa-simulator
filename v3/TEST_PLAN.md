# V3 persistence – verification checklist

The persistence module is isolated and must pass this checklist before it is connected to the game.

## Static/API checks
- [ ] Module parses as an ES module in supported browsers.
- [ ] All exported functions are present and documented.
- [ ] V2 defaults match the current `fresh()` structure in `v2/index.html`.
- [ ] Runtime-only state is excluded from persisted data by the integration layer.

## Migration checks (use a copied V2 save only)
- [ ] Valid V2 save migrates and preserves all known and unknown payload fields.
- [ ] The exact original `localStorage["sofasim_v2"]` string remains unchanged.
- [ ] Migration record contains the exact original string and its SHA-256 when Web Crypto is available.
- [ ] Migration backup is separate from the five rotating backup slots.
- [ ] Running migration a second time returns `already-migrated` and does not overwrite the V3 current save.
- [ ] Missing V2 save returns `no-v2-save`.
- [ ] Malformed JSON and invalid structures fail without writing a V3 save or modifying V2.

## Save and backup checks
- [ ] Current save survives reload.
- [ ] A daily backup is created once when the in-game day advances.
- [ ] Regular autosaves do not create extra backups.
- [ ] At most five rotating backups remain; the V2 migration checkpoint is retained separately.
- [ ] Restore validates the selected snapshot and creates a pre-restore recovery point.
- [ ] Import validates the file and creates a pre-import recovery point.
- [ ] Invalid or oversized imports do not change the current save.
- [ ] Storage quota and IndexedDB failures are surfaced to the caller (never silently reported as success).

## Export/import checks
- [ ] Exported JSON can be imported into a clean V3 database.
- [ ] Corrupted payloads and mismatched SHA-256 checksums are rejected.
- [ ] A browser without Web Crypto still performs structural validation; checksum protection is unavailable there.

## Browser/device checks
- [ ] iOS Safari (current supported iOS release).
- [ ] Android Chrome.
- [ ] Desktop Chrome/Edge and Firefox.
- [ ] Offline reload after the first successful load.
- [ ] Multiple open tabs and blocked database upgrades.
- [ ] Browser storage cleared: recovery guidance is clear and no cloud-backup claim is made.

## Release gate
Do not merge or deploy until the checks above have been executed against representative copied V2 saves and the results have been reviewed. Never test destructive restore/import flows against the user's only live save.
