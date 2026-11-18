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

  // Exercise the remaining everyday actions and their visible state changes.
  await game.locator('[data-action="shop"]').first().click();
  await game.locator('[data-choice="buy-snacks"]').click();
  await game.waitForFunction(() => document.querySelector("#snacks")?.textContent === "5");
  if (await game.locator("#money").textContent() !== "22 €") throw new Error("Späti-Kauf hat Geld/Vorrat nicht korrekt aktualisiert.");

  const energyBeforeClean = Number((await game.locator("#energy-value").textContent()).replace("%", ""));
  await game.locator('[data-action="clean"]').first().click();
  const energyAfterClean = Number((await game.locator("#energy-value").textContent()).replace("%", ""));
  if (!(energyAfterClean < energyBeforeClean)) throw new Error("Aufräumen hat Energie nicht reduziert.");

  const hungerBeforeEat = Number((await game.locator("#hunger-value").textContent()).replace("%", ""));
  await game.locator('[data-action="eat"]').click();
  const hungerAfterEat = Number((await game.locator("#hunger-value").textContent()).replace("%", ""));
  if (!(hungerAfterEat < hungerBeforeEat)) throw new Error("Essen hat den Hunger nicht reduziert.");

  const hygieneBeforeShower = Number((await game.locator("#hygiene-value").textContent()).replace("%", ""));
  await game.locator('[data-action="shower"]').click();
  const hygieneAfterShower = Number((await game.locator("#hygiene-value").textContent()).replace("%", ""));
  if (!(hygieneAfterShower > hygieneBeforeShower)) throw new Error("Duschen hat Hygiene nicht erhöht.");

  const tvBefore = await game.locator("#tv-content").textContent();
  await game.locator('[data-action="tv"]').first().click();
  if (await game.locator("#tv-content").textContent() === tvBefore) throw new Error("TV-Aktion hat den Bildschirm nicht verändert.");

  await game.locator('[data-action="diary"]').click();
  if (!(await game.locator("#modal-content").textContent()).includes("TAGEBUCH")) throw new Error("Tagebuch öffnet sich nicht.");
  await game.locator("#close-modal").click();
  await game.locator('[data-action="menu"]').click();
  if (!(await game.locator("#modal-content").textContent()).includes("SPIELMENÜ")) throw new Error("Spielmenü öffnet sich nicht.");
  await game.locator("#close-modal").click();
  await game.waitForFunction(() => document.querySelector("#save-state")?.textContent.includes("GESPEICHERT"));

  await game.locator("#sound-toggle").click();
  if (await game.locator("#sound-toggle").textContent() !== "🔇 TON") throw new Error("Ton-Einstellung ließ sich nicht ausschalten.");
  await game.locator("#sound-toggle").click();
  if (await game.locator("#sound-toggle").textContent() !== "🔊 TON") throw new Error("Ton-Einstellung ließ sich nicht einschalten.");
  await game.locator("#sound-toggle").click();
  if (await game.locator("#sound-toggle").textContent() !== "🔇 TON") throw new Error("Ton-Einstellung ließ sich nicht erneut ausschalten.");
  await game.reload();
  await game.waitForFunction(() => /GESPEICHERT|GELADEN/.test(document.querySelector("#save-state")?.textContent || ""));
  if (await game.locator("#sound-toggle").textContent() !== "🔇 TON") throw new Error("Ton-Einstellung blieb nach Reload nicht gespeichert.");
  await game.locator("#sound-toggle").click();
  if (await game.locator("#sound-toggle").textContent() !== "🔊 TON") throw new Error("Ton-Einstellung ließ sich nach Reload nicht einschalten.");
  await game.locator("#sleep").click();
  await game.waitForFunction(() => document.querySelector("#clock")?.textContent === "TAG 2 · 08:00");
  await game.waitForFunction(() => document.querySelector("#goal-status")?.textContent.includes("0 / 1"));
  await game.waitForFunction(() => document.querySelector("#save-state")?.textContent.includes("GESPEICHERT"));
  await game.reload();
  await game.waitForFunction(() => /GESPEICHERT|GELADEN/.test(document.querySelector("#save-state")?.textContent || ""));
  if (await game.locator("#money").textContent() !== "22 €" || await game.locator("#clock").textContent() !== "TAG 2 · 08:00") {
    throw new Error("Spielstand hat Job/Schlaf oder Reload nicht überlebt.");
  }
  await game.evaluate(() => navigator.serviceWorker.ready);
  await game.context().setOffline(true);
  await game.reload();
  const offlineAssets = await game.evaluate(async () => {
    const manifestResponse = await fetch("./assets/asset-manifest.json");
    const manifest = await manifestResponse.json();
    const checks = await Promise.all(manifest.assets.map(async path => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        return { path, ok: response.ok };
      } catch {
        return { path, ok: false };
      }
    }));
    return {
      total: checks.length,
      available: checks.filter(item => item.ok).length,
      missing: checks.filter(item => !item.ok).map(item => item.path),
      controlled: !!navigator.serviceWorker.controller
    };
  });
  await game.context().setOffline(false);
  if (!offlineAssets.controlled || offlineAssets.missing.length) {
    throw new Error("Nicht alle V3-Medien sind offline verfügbar: " + JSON.stringify(offlineAssets));
  }
  console.log(`Game smoke test: fresh start, job, daily goal, sound preference reload, sleep, save reload and all ${offlineAssets.available}/${offlineAssets.total} manifest assets offline passed.`);

  if (failures.length) throw new Error("Browserfehler: " + failures.join(" | "));
} finally {
  await browser.close();
}