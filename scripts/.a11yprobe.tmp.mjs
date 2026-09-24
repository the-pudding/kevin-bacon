import { chromium } from "playwright";
import { preview } from "vite";
import { createHash } from "node:crypto";
const server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const rm = process.argv[2] ?? "no-preference";
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: rm });
await page.goto(base);
await page.waitForTimeout(3000);
const live = async () => (await page.locator(".scrolly-steps").innerText().catch(() => "")).replace(/\s+/g, " ");
const shot = async () => createHash("sha1").update(await page.locator("canvas").first().screenshot()).digest("hex").slice(0, 10);
const focusRing = async (name) => {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const d = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { name: e.getAttribute("aria-label") || e.textContent.trim().slice(0, 40), outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} offset ${s.outlineOffset}` }; });
    if (d.name === name) return d;
  }
  return null;
};
let step = 0;
while (step <= 26) {
  const text = await live();
  const vis = await page.locator(".scrolly-visual").ariaSnapshot();
  console.log(`STEP ${step} live="${text.slice(0, 60)}"\n  visual: ${vis.replace(/\n/g, " ⏎ ").slice(0, 260)}`);
  if (step === 3) {
    console.log("  h1 role count:", await page.getByRole("heading", { level: 1 }).count(),
      JSON.stringify(await page.evaluate(() => { const h = document.querySelector(".splash-card h1"); const s = h && getComputedStyle(h); return h && { opacity: s.opacity, transition: s.transitionDuration }; })));
  }
  const btn = await page.getByRole("button", { name: /^(Go back in time|Start)$/ }).first();
  if (await btn.count()) {
    const name = (await btn.textContent()).trim();
    console.log("  FOCUS", name, JSON.stringify(await focusRing(name)));
    await page.evaluate(() => document.activeElement?.blur());
    if (name === "Start") { await btn.click(); await page.waitForTimeout(15000); }
  }
  const thumb = page.getByRole("slider", { name: "Year" });
  if (await thumb.count()) {
    await page.waitForTimeout(4000);
    const before = { v: await thumb.getAttribute("aria-valuenow"), img: await shot() };
    await thumb.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(3000);
    const after = { v: await thumb.getAttribute("aria-valuenow"), img: await shot() };
    console.log("  SLIDER before", JSON.stringify(before), "after 5x ArrowLeft", JSON.stringify(after));
    await page.evaluate(() => document.activeElement?.blur());
  }
  // advance
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(2500);
  if ((await live()) === text && step !== 26) {
    const skip = page.getByRole("button", { name: "Skip" });
    if (await skip.count()) { await skip.click(); await page.waitForTimeout(2500); }
    if ((await live()) === text) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(2500); }
  }
  step++;
}
await page.waitForTimeout(150);
console.log(`CREDITS ${rm}:`, JSON.stringify(await page.evaluate(() => { const c = document.querySelector("#credits"); return c ? { transform: getComputedStyle(c).transform, top: Math.round(c.getBoundingClientRect().top) } : null; })));
await browser.close();
server.httpServer.close();
