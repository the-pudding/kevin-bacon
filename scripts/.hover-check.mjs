import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { INDEX, parseSteps } from "./story-steps.js";
import { startVite, waitForStory } from "./lib/story-page.js";
const OUT = process.argv[2];
const tag = process.argv[3];
const steps = parseSteps(readFileSync(INDEX, "utf8"));
const vite = await startVite();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
let found = -1;
for (let i = 0; i < steps.length && found < 0; i++) {
  if (!/race/i.test(steps[i].state)) continue;
  await page.goto(`${vite.url}?step=${i}`);
  await waitForStory(page);
  await page.waitForTimeout(3500);
  const txt = await page.locator(".callout-note").allTextContents().catch(() => []);
  if (txt.some((t) => t.includes("1994"))) found = i;
}
console.log("step", found);
const note = page.locator(".callout-note").last();
const box = await note.boundingBox();
await page.screenshot({ path: `${OUT}/${tag}-rest.png` });
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/${tag}-hover.png` });
await browser.close();
await vite.close();
