import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const failures = [];
page.on("pageerror", error => failures.push(error.message));
try {
  await page.goto("http://127.0.0.1:4173/v3/tests/storage.test.html");
  await page.locator("#run").click();
  await page.waitForFunction(() => {
    const summary = document.querySelector("#results h2");
    return summary && summary.textContent.includes("fehlgeschlagen");
  }, null, { timeout: 30000 });
  const summary = await page.locator("#results h2").textContent();
  console.log("Storage browser tests:", summary);
  if (!summary.includes("0 fehlgeschlagen")) {
    throw new Error("Mindestens ein IndexedDB-Browser-Test ist fehlgeschlagen.");
  }

  const game = await browser.newPage();
  game.on("pageerror", error => failures.push(error.message));
  await game.goto("http://127.0.0.1:4173/v3/");
  await game.waitForFunction(() => /GESPEICHERT|GELADEN/.test(document.querySelector("#save-state")?.textContent || ""), null, { timeout: 15000 });
  if (await game.locator("#clock").textContent() !== "TAG 1 · 08:00") {
    throw new Error("Neues V3-Spiel wurde nicht korrekt initialisiert.");
  }
  await game.locator('[data-action="jobs"]').first().click();
  await game.locator('[data-choice="job-delivery"]').click();
  await game.waitForFunction(() => document.querySelector("#money")?.textContent === "28 €");
  await game.waitForFunction(() => document.querySelector("#goal-status")?.textContent.includes("1 / 1"));
  await game.waitForFunction(() => document.querySelector("#save-state")?.textContent.includes("GESPEICHERT"));
  await game.locator("#sound-toggle").click();
  if (await game.locator("#sound-toggle").textContent() !== "🔇 TON") throw new Error("Ton-Einstellung ließ sich nicht ausschalten.");
  await game.locator("#sound-toggle").click();
  if (await game.locator("#sound-toggle").textContent() !== "🔊 TON") throw new Error("Ton-Einstellung ließ sich nicht einschalten.");
  await game.locator("#sleep").click();
  await game.waitForFunction(() => document.querySelector("#clock")?.textContent === "TAG 2 · 08:00");
  await game.waitForFunction(() => document.querySelector("#goal-status")?.textContent.includes("0 / 1"));
  await game.waitForFunction(() => document.querySelector("#save-state")?.textContent.includes("GESPEICHERT"));
  await game.reload();
  await game.waitForFunction(() => /GESPEICHERT|GELADEN/.test(document.querySelector("#save-state")?.textContent || ""));
  if (await game.locator("#money").textContent() !== "28 €" || await game.locator("#clock").textContent() !== "TAG 2 · 08:00") {
    throw new Error("Spielstand hat Job/Schlaf oder Reload nicht überlebt.");
  }
  await game.evaluate(() => navigator.serviceWorker.ready);
  await game.context().setOffline(true);
  await game.reload();
  const offlineAssets = await game.evaluate(async () => {
    const room = await fetch("./assets/sprites/room.jpg");
    const sound = await fetch("./assets/audio/gulp1.mp3");
    return { room: room.ok, sound: sound.ok, controlled: !!navigator.serviceWorker.controller };
  });
  await game.context().setOffline(false);
  if (!offlineAssets.room || !offlineAssets.sound || !offlineAssets.controlled) {
    throw new Error("V3-Art oder Sound ist offline nicht verfügbar: " + JSON.stringify(offlineAssets));
  }
  console.log("Game smoke test: fresh start, job, daily goal, sound toggle, sleep, reload and offline artwork/audio passed.");

  if (failures.length) throw new Error("Browserfehler: " + failures.join(" | "));
} finally {
  await browser.close();
}