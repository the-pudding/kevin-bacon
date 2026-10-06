import { chromium } from "playwright";
import { startVite, waitForStory } from "./lib/story-page.js";
const vite = await startVite();
const browser = await chromium.launch();
for (const width of [1199, 1250, 1440, 1920]) {
	const page = await browser.newPage({ viewport: { width, height: 800 } });
	await page.goto(vite.url + "?step=0");
	await waitForStory(page);
	await page.waitForTimeout(1500);
	const info = await page.evaluate(() => {
		const n = document.querySelector(".notch.next");
		if (!n) return { notch: null };
		const r = n.getBoundingClientRect();
		const b = n.querySelector(".bits-button").getBoundingClientRect();
		const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
		const hit = document.elementFromPoint(cx, cy);
		return {
			notch: [r.left, r.right, r.top, r.bottom].map(Math.round),
			button: [b.left, b.right].map(Math.round),
			vw: innerWidth,
			hit: hit && (hit.className?.baseVal ?? hit.className) + " <" + hit.tagName + ">",
			hitIsButton: !!hit?.closest(".notch.next")
		};
	});
	const before = new URL(page.url()).searchParams.get("step");
	await page.mouse.click(1, 1); // no-op focus
	const nb = await page.$(".notch.next .bits-button");
	let after = null;
	if (nb) {
		const bb = await nb.boundingBox();
		await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
		await page.waitForTimeout(800);
		after = await page.evaluate(() => document.querySelector("[aria-current='step'], .step.active")?.className ?? null);
		after = { url: new URL(page.url()).searchParams.get("step"), after };
	}
	console.log(width, JSON.stringify(info), "step before", before, "after click", JSON.stringify(after));
	await page.close();
}
await browser.close();
await vite.close();
