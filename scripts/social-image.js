#!/usr/bin/env node
// The share image (og:image and twitter:image, see src/components/Meta.svelte):
// the canvas at one step, framed by scripts/social-image.css, as a 1200×630 JPEG.
//
//   npm run social                     step 0 into static/assets/social.jpg
//   npm run social -- --step 12 --out sheets/social/12.jpg
//                                      try another step without replacing it
//   --settle 5000   how long the step is given to land before the picture, on
//                   the wall clock
//   --url http://127.0.0.1:5173/       drive a dev server that is already running
//
// A dev server, as for `npm run sheet`: a production build ignores ?step. The
// page renders at 2× and the picture is taken at CSS size, so the dots and the
// type are downsampled rather than drawn at 1×.
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { startVite, waitForStory } from "./lib/story-page.js";

/** the size Meta.svelte declares in og:image:width and og:image:height */
const SIZE = { width: 1200, height: 630 };
const FRAME_CSS = readFileSync(
	new URL("social-image.css", import.meta.url),
	"utf8"
);

function readOptions() {
	const { values } = parseArgs({
		options: {
			step: { type: "string", default: "0" },
			settle: { type: "string", default: "5000" },
			out: { type: "string", default: "static/assets/social.jpg" },
			url: { type: "string" }
		}
	});
	return {
		step: Number(values.step),
		settle: Number(values.settle),
		out: values.out,
		url: values.url
	};
}

/** the story's HTML with the frame's stylesheet in its <head> */
async function withFrame(route) {
	const response = await route.fetch();
	const html = await response.text();
	await route.fulfill({
		response,
		body: html.replace("</head>", `<style>${FRAME_CSS}</style></head>`)
	});
}

async function capture(browser, base, { step, settle, out }) {
	const context = await browser.newContext({
		viewport: SIZE,
		deviceScaleFactor: 2,
		reducedMotion: "no-preference"
	});
	const page = await context.newPage();
	const story = new URL(`?step=${step}`, base);
	await page.route((url) => url.href === story.href, withFrame);
	await page.goto(story.href);
	await waitForStory(page);
	await page.waitForTimeout(settle);
	mkdirSync(dirname(out), { recursive: true });
	await page.screenshot({ path: out, type: "jpeg", quality: 90, scale: "css" });
	await context.close();
}

async function main() {
	const opts = readOptions();
	const server = opts.url ? null : await startVite();
	const browser = await chromium.launch();
	try {
		await capture(browser, opts.url ?? server.url, opts);
		console.log(`step ${opts.step} → ${opts.out}`);
	} finally {
		await browser.close();
		await server?.close();
	}
}

main();
