# Sofa Simulator V3

Eigenständiger, mobiloptimierter Neuaufbau. V2-Dateien und der veröffentlichte V2-Pfad bleiben unverändert.

## Aufbau

- `index.html`, `style.css`, `app.js`: eigenständige V3-Oberfläche, Spielschleife und Interaktionen
- `storage.js`: IndexedDB, V2-Migration, Sicherungen, Import/Export
- `assets/sprites/`: kopierte Szenen- und Gegenstandsgrafiken aus dem V2-Projekt, als eigenständige V3-Dateien\n- `assets/audio/`: lokale MP3-Soundeffekte\n- `assets/asset-manifest.json`: vollständige Offline-Assetliste\n- `sound.js`: Lautstärkeschalter und Soundeffekt-Player\n- `sw.js`, `manifest.webmanifest`, `icon.svg`: installierbare Offline-Shell
- `tests/storage.test.html`, `tests/storage.test.js`: isoliertes Browser-Testlabor
- `tests/run-browser-tests.mjs`: Playwright-Lauf für Speichertests und Spielstart
- `TEST_PLAN.md`: manuelle Geräte- und Release-Prüfungen

## Aktueller Funktionsumfang

- Wohnzimmeransicht mit interaktiven Gegenständen
- Spielzeit, Tagwechsel, Stimmung, Energie, Hunger, Hygiene, Chaos, Geld und Vorräte
- Tagesziel mit Job-Bonus und Fortschrittsanzeige
- Jobs, Einkaufen, Aufräumen, Fernsehen, Schlafen und Tagebuch
- Automatisches Speichern und lokale IndexedDB-Sicherung
- Spielstand exportieren/importieren und Sicherungen wiederherstellen
- V2-Übernahme beim ersten V3-Start, ohne den V2-Schlüssel zu löschen oder zu verändern

## Speicher-API

- `loadCurrentSave()`, `saveCurrent(payload, { dailyBackup, newGame })`
- `migrateV2({ storage })`
- `listBackups()`, `restoreBackup(id)`
- `exportSave()`, `importSave(file)`
- `requestPersistentStorage()`

## Speicherregeln

- Datenbank: `sofa-simulator-v3` mit `currentSave`, `backups`, `migration` und `meta`
- Das exakte V2-JSON unter `localStorage["sofasim_v2"]` wird in einem geschützten Migrationsdatensatz bewahrt. V3 löscht und verändert diesen Schlüssel nicht.
- Die V2-Originalsicherung ist von den fünf rotierenden automatischen/Wiederherstellungs-Sicherungen ausgenommen.
- Tages-Sicherungen entstehen beim Tageswechsel; ein neuer Lauf kann zusätzlich explizit mit `{ newGame: true }` markiert werden.
- Wiederherstellung und Import erzeugen vor dem Ersetzen einen Wiederherstellungspunkt.
- Prüfsummen werden beim Laden, Wiederherstellen, Import und Export geprüft, sofern Web Crypto verfügbar ist.

## Lokal testen

1. Repository lokal starten oder den V3-Ordner über einen lokalen HTTP-Server öffnen. ES-Module und IndexedDB funktionieren nicht zuverlässig über `file://`.
2. Spiel: `/v3/`
3. Speicher-Testlabor: `/v3/tests/storage.test.html`

Das Testlabor nutzt ausschließlich die separate Datenbank `sofa-simulator-v3-test-browser`. Es löscht diese Testdatenbank vor dem Lauf und greift nicht auf den Produktiv-Spielstand zu.

## Status und Grenzen

Die neue V3-Spieloberfläche ist mit der V3-Speicher-API verbunden. Ein GitHub-Actions-Workflow prüft JavaScript-Modulsyntax, Manifest-JSON und benötigte Dateien und führt die zwölf isolierten Speicherprüfungen sowie den Spielstart-/Job-/Schlaf-/Reload-Smoke-Test in headless Chromium aus. Der aktuelle Workflow-Lauf ist erfolgreich. Die Tests ersetzen keine zusätzlichen iOS-/Android-Gerätetests. iOS Safari/Android Chrome, Offline-Start, Quota-Verhalten und reale kopierte V2-Spielstände sind noch nicht als bestanden bestätigt.

IndexedDB ist lokaler Gerätespeicher und keine Cloud-Sicherung. Browserdaten können gelöscht werden; wichtige Spielstände daher regelmäßig exportieren.

## Release-Regel

V3 bleibt auf dem separaten Entwicklungsbranch und im Draft-PR. Kein Merge und keine Veröffentlichung ohne gesonderte Freigabe. V2 wird nicht überschrieben.
