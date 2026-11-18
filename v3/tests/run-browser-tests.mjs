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
  await game.waitForFunction(() => document.querySelector("#save-state")?.textContent.includes("GESPEICHERT"), null, { timeout: 15000 });
  if (await game.locator("#clock").textContent() !== "TAG 1 · 08:00") {
    throw new Error("Neues V3-Spiel wurde nicht korrekt initialisiert.");
  }
  await game.locator('[data-action="jobs"]').first().click();
  await game.locator('[data-choice="job-delivery"]').click();
  await game.waitForFunction(() => document.querySelector("#money")?.textContent === "28 €");
  console.log("Game smoke test: fresh start and delivery job passed.");

  if (failures.length) throw new Error("Browserfehler: " + failures.join(" | "));
} finally {
  await browser.close();
}