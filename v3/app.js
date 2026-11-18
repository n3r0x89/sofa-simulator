import {
  loadCurrentSave, saveCurrent, migrateV2, listBackups, restoreBackup,
  exportSave, importSave, requestPersistentStorage
} from "./storage.js";
import { playSound, soundEnabled, toggleSound, unlockAudio } from "./sound.js";

const $ = selector => document.querySelector(selector);
const fresh = () => ({
  day: 1, hour: 8, tot: 0, lvl: 1, xp: 0, money: 5, beer: 6, snacks: 2, cigs: 10,
  th: 20, hu: 20, bo: 20, chaos: 0, prom: 0, hang: 0, mold: 0, empties: 0,
  basket: 0, pfandStock: 0, bottle: null, right: "empty", cigPuffs: 0, butts: 0,
  packClosed: false, ch: 0, tvOn: true, furn: {}, lampOn: false, fridge: 0,
  puddles: [], stains: [], splats: [], h: {}, st: { beers: 0, throws: 0, puke: 0, clean: 0, zaps: [] },
  best: {}, ach: {}, jobCd: {}, hintsDone: {}, vhs: [], started: true,
  mood: 62, energy: 78, hunger: 42, hygiene: 65, dailyGoalDone: false, inventory: [], diaryEntries: [],
  tvChannel: 0, lastActionAt: Date.now()
});

let state = null;
let dirty = false;
let saving = false;
let newGamePending = false;
let toastTimer = 0;

const channels = [
  ["ASSI VISION", "Heute wieder nichts geschafft. Stark."],
  ["TELESHOP 24", "Kaufen Sie jetzt Dinge, die Sie nicht brauchen."],
  ["DOKU KANAL", "Die Couch: Lebensraum und Endstation."],
  ["SCHWARZBROT TV", "Breaking News: Kühlschrank fast leer."]
];

function hydrate(payload) {
  const defaults = fresh();
  const merged = { ...defaults, ...payload };
  merged.h = { ...defaults.h, ...(payload.h || {}) };
  merged.st = { ...defaults.st, ...(payload.st || {}) };
  merged.inventory = Array.isArray(payload.inventory) ? payload.inventory : [];
  merged.diaryEntries = Array.isArray(payload.diaryEntries) ? payload.diaryEntries : [];
  return merged;
}

function log(message) {
  state.diaryEntries ||= [];
  state.diaryEntries.unshift({ day: state.day, hour: state.hour, text: message });
  state.diaryEntries = state.diaryEntries.slice(0, 60);
  $("#feed").innerHTML = "";
  for (const entry of state.diaryEntries.slice(0, 3)) {
    const p = document.createElement("p");
    p.textContent = entry.text;
    $("#feed").append(p);
  }
  dirty = true;
}

function setSaveLabel(text, error = false) {
  $("#save-state").textContent = text;
  $("#save-state").style.color = error ? "var(--red)" : "var(--green)";
}

function render() {
  $("#clock").textContent = `TAG ${state.day} · ${String(state.hour).padStart(2, "0")}:00`;
  $("#money").textContent = `${Math.floor(state.money)} €`;
  $("#beer").textContent = String(state.beer);
  $("#chaos").textContent = `${Math.min(100, Math.round(state.chaos))}%`;
  const mood = state.mood >= 70 ? "Gut drauf" : state.mood >= 40 ? "Okay" : "Mies";
  $("#mood").textContent = mood;
  $("#energy-bar").style.width = Math.round(state.energy) + "%";
  $("#energy-value").textContent = Math.round(state.energy) + "%";
  $("#hunger-bar").style.width = Math.round(state.hunger) + "%";
  $("#hunger-value").textContent = Math.round(state.hunger) + "%";
  $("#hygiene-bar").style.width = Math.round(state.hygiene) + "%";
  $("#hygiene-value").textContent = Math.round(state.hygiene) + "%";
  $("#snacks").textContent = state.snacks;
  $("#goal-status").textContent = state.dailyGoalDone ? "1 / 1 ✓" : "0 / 1";
  $("#daily-goal").textContent = state.dailyGoalDone ? "Job erledigt – stark gemacht!" : "Erledige einen Job";
  $("#tv-content").textContent = state.tvOn ? channels[state.tvChannel % channels.length][0] : "AUS";
  $("#room-tip").textContent = state.tvOn ? channels[state.tvChannel % channels.length][1] : "Stille. Unheimlich.";
  document.querySelector(".bottle").style.backgroundImage = state.beer > 0 ? 'url("./assets/sprites/bottle_0.webp")' : 'url("./assets/sprites/bottle_lying.webp")';
  $("#sound-toggle").textContent = soundEnabled() ? "🔊 TON" : "🔇 TON";
  document.querySelector(".bottle").disabled = state.beer <= 0;
}

async function persist(force = false) {
  if (saving || (!dirty && !force) || !state) return;
  saving = true;
  // Mark only the current change batch as in-flight. Any action during the
  // asynchronous write sets dirty again and must survive this save finishing.
  dirty = false;
  setSaveLabel("● SPEICHERT …");
  try {
    await saveCurrent(state, { dailyBackup: true, newGame: newGamePending });
    newGamePending = false;
    if (!dirty) setSaveLabel("● GESPEICHERT");
  } catch (error) {
    // Do not automatically retry a persistent storage failure in a tight loop.
    // Keep the in-memory state dirty so the next user action or visibility
    // transition can retry, and explain how to protect the current session.
    dirty = true;
    setSaveLabel("● SPEICHERFEHLER", true);
    const message = "Speichern fehlgeschlagen: " + error.message + " – bitte exportiere deinen Spielstand.";
    if (!state.diaryEntries?.some(entry => entry.text === message)) {
      state.diaryEntries ||= [];
      state.diaryEntries.unshift({ day: state.day, hour: state.hour, text: message });
      state.diaryEntries = state.diaryEntries.slice(0, 60);
      $("#feed").replaceChildren();
      for (const entry of state.diaryEntries.slice(0, 3)) {
        const p = document.createElement("p");
        p.textContent = entry.text;
        $("#feed").append(p);
      }
    }
  } finally {
    saving = false;
  }
}

function advance(hours = 1) {
  for (let i = 0; i < hours; i++) {
    state.hour++;
    state.tot++;
    state.energy = Math.max(0, state.energy - 1.7);
    state.hu = Math.min(100, state.hu + 1.2);
    state.hunger = Math.min(100, state.hunger + 2.4);
    state.hygiene = Math.max(0, state.hygiene - 0.8);
    if (state.hour >= 24) {
      state.hour = 0;
      state.day++;
      state.dailyGoalDone = false;
      state.energy = Math.min(100, state.energy + 18);
      log("Ein neuer Tag. Die Sonne geht auf. Du bleibst sitzen.");
    }
  }
  dirty = true;
  render();
}

function reward(amount, xp = 8) {
  state.money += amount;
  state.xp += xp;
  if (state.xp >= state.lvl * 40) {
    state.xp -= state.lvl * 40;
    state.lvl++;
    log("Levelaufstieg! Level " + state.lvl + ". Du bist jetzt offiziell Profi im Rumhängen.");
  }
}

function act(action) {
  switch (action) {
    case "tv":
      state.tvOn = !state.tvOn;
      playSound("plop", 0.4);
      if (state.tvOn) state.tvChannel = (state.tvChannel + 1) % channels.length;
      log(state.tvOn ? channels[state.tvChannel][1] : "Fernseher aus. Du hörst plötzlich deine Gedanken.");
      advance(1); break;
    case "drink":
      if (state.beer <= 0) return log("Der Kühlschrank ist leer. Tragisch, aber vorhersehbar.");
      state.beer--; playSound("gulp"); state.mood = Math.min(100, state.mood + 8); state.chaos += 1;
      state.st.beers = (state.st.beers || 0) + 1;
      log("Du gönnst dir ein Bier. Der Tag wird nicht besser, aber anders.");
      advance(1); break;
    case "clean":
      if (state.energy < 8) return log("Du bist zu platt zum Aufräumen. Erst mal sitzen bleiben.");
      state.chaos = Math.max(0, state.chaos - 18); playSound("plop");
      state.energy -= 8; state.mood = Math.min(100, state.mood + 3);
      state.st.clean = (state.st.clean || 0) + 1;
      log("Du räumst ein bisschen auf. Es sieht fast nach Wohnung aus.");
      advance(1); break;
    case "eat":
      if (state.snacks <= 0) return log("Nichts mehr zu essen. Der Späti ruft.");
      state.snacks--; playSound("plop"); state.hunger = Math.max(0, state.hunger - 28); state.mood = Math.min(100, state.mood + 4);
      log("Du isst einen Snack. Sterneküche ist es nicht, aber der Magen ist ruhig."); advance(1); break;
    case "shower":
      state.hygiene = Math.min(100, state.hygiene + 35); playSound("plop", 0.35); state.energy = Math.max(0, state.energy - 6);
      log("Geduscht. Du riechst wieder wie ein Mensch mit Perspektive."); advance(1); break;
    case "jobs": openJobs(); break;
    case "shop": openShop(); break;
    case "diary": openDiary(); break;
    case "menu": openMenu(); break;
    case "sleep": sleep(); break;
  }
  render();
  persist();
}

function showModal(title, body) {
  $("#modal-content").innerHTML = `<h2>${title}</h2>${body}`;
  $("#modal").showModal();
}

function choice(label, detail, action, disabled = false) {
  return `<button class="choice" data-choice="${action}" ${disabled ? "disabled" : ""}><span>${label}</span><small>${detail}</small></button>`;
}

function openJobs() {
  showModal("KLEINE JOBS, KLEINES GELD", `<p>Du brauchst Geld. Deine Talente sind überschaubar, aber der Markt ist verzweifelt.</p><div class="choice-list">
    ${choice("📦 Paket ausliefern", "+18 € · 2 Stunden", "job-delivery", state.energy < 12)}
    ${choice("🧹 Treppenhaus putzen", "+14 € · 1 Stunde", "job-clean", state.energy < 8)}
    ${choice("🪑 Umzug helfen", "+30 € · 4 Stunden", "job-move", state.energy < 25)}
    ${choice("🎮 Controller testen", "+10 € · 1 Stunde", "job-game", false)}
  </div>`);
}

function openShop() {
  showModal("DER SPÄTI", `<p>Alles frisch. Also frisch genug.</p><div class="choice-list">
    ${choice("🍺 Bier (6 Stück)", "−12 €", "buy-beer", state.money < 12)}
    ${choice("🥨 Snacks (3 Stück)", "−6 €", "buy-snacks", state.money < 6)}
    ${choice("🥤 Wasser (3 Stück)", "−3 €", "buy-water", state.money < 3)}
    ${choice("🧽 Putzzeug", "−8 € · macht Putzen effektiver", "buy-clean", state.money < 8)}
  </div>`);
}

function openDiary() {
  const entries = (state.diaryEntries || []).slice(0, 15).map(e =>
    `<p><b>Tag ${e.day}, ${String(e.hour).padStart(2, "0")}:00</b><br>${escapeHtml(e.text)}</p>`).join("") || "<p>Noch ist nichts passiert. Beeindruckend.</p>";
  showModal("TAGEBUCH", entries);
}

function openMenu() {
  showModal("SPIELMENÜ", `<p>Dein Spielstand liegt lokal auf diesem Gerät. Exportiere ihn regelmäßig als zusätzliche Sicherung.</p><div class="choice-list">
    ${choice("⬇️ Spielstand exportieren", "JSON-Datei herunterladen", "export")}
    ${choice("⬆️ Spielstand importieren", "JSON-Datei einspielen", "import")}
    ${choice("🛟 Sicherung wiederherstellen", "Eine der letzten Sicherungen wählen", "backups")}
    ${choice("🔄 Neues Spiel beginnen", "Aktuellen Stand vorher automatisch sichern", "new-game")}
  </div><p class="muted">Sofa Simulator V3 · Version 3.0 · Nur lokal, kein Cloud-Speicher.</p>`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function sleep() {
  state.day++;
  playSound("bell");
  state.hour = 8;
  state.energy = 100;
  state.mood = Math.min(100, state.mood + 12);
  state.hu = Math.max(0, state.hu - 8);
  state.chaos = Math.min(100, state.chaos + 2);
  state.dailyGoalDone = false;
  log("Du wachst auf. Neuer Tag, gleiche vier Wände.");
  render();
  persist(true);
}

async function handleChoice(action) {
  if (!action) return;
  if (action.startsWith("job-")) {
    const jobs = {
      "job-delivery": [18, 2, "Du lieferst ein Paket aus. Der Empfänger schaut enttäuscht."],
      "job-clean": [14, 1, "Das Treppenhaus ist sauber. Deine Schuhe nicht."],
      "job-move": [30, 4, "Der Umzug ist geschafft. Dein Rücken reicht die Kündigung ein."],
      "job-game": [10, 1, "Du testest einen Controller. Er funktioniert. Du bist überrascht."]
    };
    const [money, hours, text] = jobs[action];
    if (state.energy < hours * 6) return;
    state.energy -= hours * 6; playSound("clink"); reward(money);
    if (!state.dailyGoalDone) { state.dailyGoalDone = true; reward(5, 4); log("Tagesziel geschafft: Bonus +5 €!"); }
    log(text); advance(hours); $("#modal").close(); await persist(true); return;
  }
  if (action.startsWith("buy-")) {
    const items = {
      "buy-beer": [12, () => state.beer += 6, "Sechs Bier. Die Zukunft ist gesichert."],
      "buy-snacks": [6, () => state.snacks += 3, "Drei Snacks. Haute Cuisine."],
      "buy-water": [3, () => state.inventory.push("Wasser"), "Wasser gekauft. Eine mutige Entscheidung."],
      "buy-clean": [8, () => state.inventory.push("Putzzeug"), "Putzzeug gekauft. Jetzt gibt es keine Ausreden mehr."]
    };
    const [price, grant, text] = items[action];
    if (state.money < price) return;
    state.money -= price; playSound("clink"); grant(); log(text); $("#modal").close(); render(); await persist(true); return;
  }
  if (action === "export") {
    const blob = await exportSave();
    downloadBlob(blob, `sofa-simulator-v3-tag-${state.day}.json`);
    log("Spielstand exportiert. Leg die Datei an einen sicheren Ort.");
    return;
  }
  if (action === "import") {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json,.json";
    input.onchange = async () => {
      if (!input.files?.[0]) return;
      try {
        await importSave(input.files[0]);
        state = hydrate(await loadCurrentSave());
        log("Spielstand importiert. Vorheriger Stand wurde als Wiederherstellungspunkt gesichert.");
        render(); $("#modal").close();
      } catch (error) { showModal("IMPORT NICHT MÖGLICH", `<p>${escapeHtml(error.message)}</p>`); }
    };
    input.click(); return;
  }
  if (action === "backups") {
    const backups = await listBackups();
    const options = backups.map(item => choice(
      item.reason === "v2-migration" ? "🛡️ V2-Original" : "🕘 " + item.reason,
      `Tag ${item.gameDay ?? "–"} · ${new Date(item.createdAt).toLocaleString("de-DE")}`,
      "restore:" + item.id
    )).join("");
    showModal("SICHERUNGEN", options || "<p>Keine Sicherungen vorhanden.</p>");
    return;
  }
  if (action.startsWith("restore:")) {
    const id = action.slice(8);
    await restoreBackup(id);
    state = hydrate(await loadCurrentSave());
    log("Sicherung wiederhergestellt. Der vorherige Stand wurde zusätzlich gesichert.");
    $("#modal").close(); render(); return;
  }
  if (action === "new-game") {
    showModal("WIRKLICH NEU ANFANGEN?", `<p>Dein aktueller Spielstand bleibt als Sicherung erhalten. Das neue Spiel startet bei Tag 1.</p><div class="choice-list">${choice("Ja, neues Leben", "Alten Stand vorher sichern", "confirm-new")}${choice("Lieber nicht", "Zurück zum Spiel", "cancel")}</div>`);
    return;
  }
  if (action === "confirm-new") {
    await persist(true);
    state = fresh(); newGamePending = true; dirty = true;
    log("Neues Spiel. Gleiches Sofa.");
    render(); await persist(true); $("#modal").close(); return;
  }
  if (action === "cancel") { $("#modal").close(); return; }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener("click", event => {
  unlockAudio();
  if (event.target.closest("#sound-toggle")) { toggleSound(); render(); return; }

  // Navigation buttons also carry data-action. Handle them here and return,
  // otherwise the generic action handler would execute the same action twice.
  const tab = event.target.closest("[data-tab]");
  if (tab) {
    document.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("selected", button === tab));
    if (tab.dataset.action) act(tab.dataset.action);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) { act(actionButton.dataset.action); return; }

  const choiceButton = event.target.closest("[data-choice]");
  if (choiceButton && !choiceButton.disabled) {
    handleChoice(choiceButton.dataset.choice).catch(error => showModal("FEHLER", `<p>${escapeHtml(error.message)}</p>`));
  }
});
$("#sleep").addEventListener("click", sleep);
$("#close-modal").addEventListener("click", () => $("#modal").close());
window.addEventListener("pagehide", () => { if (dirty) persist(true); });
document.addEventListener("visibilitychange", () => { if (document.hidden && dirty) persist(true); });

async function boot() {
  try {
    const stored = await loadCurrentSave();
    state = stored ? hydrate(stored) : null;
    if (!state) {
      const migration = await migrateV2();
      state = hydrate(await loadCurrentSave() || fresh());
      if (migration.migrated) log("Dein V2-Spielstand wurde übernommen. Das Original bleibt unangetastet.");
      else log("Willkommen in V3. Das Sofa hat schon auf dich gewartet.");
      dirty = !migration.migrated;
    } else {
      state.diaryEntries ||= [];
      log("Spielstand geladen. Willkommen zurück.");
    }
    state.started = true;
    render();
    await requestPersistentStorage();
    if (dirty) await persist(true);
    else setSaveLabel("● GELADEN");
    setInterval(() => persist(), 10000);
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(() => setSaveLabel("● OFFLINE-MODUS NICHT AKTIV", true));
    }
  } catch (error) {
    setSaveLabel("● SPEICHER NICHT VERFÜGBAR", true);
    const backups = await listBackups().catch(() => []);
    const recoveryChoices = backups.map(item => choice(
      item.reason === "v2-migration" ? "🛡️ V2-Original" : "🕘 " + item.reason,
      `Tag ${item.gameDay ?? "–"} · ${new Date(item.createdAt).toLocaleString("de-DE")}`,
      "restore:" + item.id
    )).join("");
    showModal("SPIELSTAND NICHT LESBAR", `<p>${escapeHtml(error.message)}</p><p>V3 hat deine Daten nicht absichtlich überschrieben. Du kannst eine vorhandene Sicherung wiederherstellen oder eine Exportdatei importieren.</p><div class="choice-list">${recoveryChoices}${choice("⬆️ Exportdatei importieren", "Vorhandenen Spielstand einspielen", "import")}</div>`);
  }
}

boot();
