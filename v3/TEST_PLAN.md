# V3 persistence – verification checklist

V3 is now connected to the persistence module. The browser test lab at `v3/tests/storage.test.html` uses a dedicated test database and should be run before any release.

## Automated checks
- [x] Playwright runs the isolated IndexedDB tests and fresh-game/job/sleep/reload smoke test in Chromium (10 storage checks).
- [x] GitHub Actions JavaScript module syntax check passes.
- [x] Manifest JSON and required V3 files pass the workflow.

## Browser test lab
- [x] Open `/v3/tests/storage.test.html` over HTTP(S) in headless Chromium.
- [x] Confirm all isolated storage tests pass in headless Chromium.
- [x] Confirm the test code targets only `sofa-simulator-v3-test-browser` (the production DB is not opened by the test module).

## Static/API checks
- [x] Module parses as an ES module in Chromium (iOS/Android device coverage remains open).
- [ ] All exported functions are present and documented.
- [ ] V2 defaults match the current `fresh()` structure in `v2/index.html`.
- [ ] Runtime-only UI/animation state is excluded from persisted data.
- [ ] V3 game loads with a fresh save and with a migrated V2 save.
- [ ] Jobs, shop, clean, eat, shower, TV, sleep, diary and menu actions work.
- [ ] Hunger, hygiene and energy meters update after actions.
- [ ] Daily job goal grants its bonus once and resets after sleeping.

## Migration checks (use a copied V2 save only)
- [ ] Valid V2 save migrates and preserves all known and unknown payload fields.
- [x] The exact original `localStorage["sofasim_v2"]` string remains unchanged (isolated migration test).
- [ ] Migration record contains the exact original string and its SHA-256 when Web Crypto is available.
- [x] Migration backup is separate from the five rotating backup slots (isolated rotation test).
- [x] Running migration a second time returns `already-migrated` and does not overwrite the V3 current save.
- [x] Missing V2 save returns `no-v2-save`.
- [ ] Malformed JSON and invalid structures fail without writing a V3 save or modifying V2.

## Save and backup checks
- [x] Current save survives reload in the Chromium smoke test.
- [x] A daily backup is created when the in-game day advances (isolated storage test).
- [x] A new game starting on the same day number triggers a checkpoint via `{ newGame: true }` (isolated storage test).
- [ ] A day-counter reset is detected as a new run even if the explicit signal is missed.
- [x] Regular autosaves do not create extra backups (same-day repeat-save test).
- [x] At most five rotating backups remain; the V2 migration checkpoint is retained separately (isolated storage test).
- [x] Restore validates the selected snapshot and creates a pre-restore recovery point (isolated storage test).
- [ ] Import validates the file and creates a pre-import recovery point.
- [ ] Invalid or oversized imports do not change the current save.
- [ ] Storage quota and IndexedDB failures are surfaced to the caller (never silently reported as success).

## Export/import checks
- [ ] Exported JSON can be imported into a clean V3 database.
- [x] Corrupted payloads and mismatched SHA-256 checksums are rejected (isolated Chromium test).
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
