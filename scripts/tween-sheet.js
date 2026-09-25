#!/usr/bin/env node
// A contact sheet of one step transition, frame by frame, on a faked clock.
//
//   npm run sheet -- <from> <to>              both directions: from → to, then to → from
//   npm run sheet -- <from> <to> --dir fwd    one direction only (fwd | back)
//   npm run sheet -- <from> <to> --box wide   mobile (default) | desktop | wide
//   npm run sheet -- <from> <to> --click Start
//                                              leave <from> by its own control (a gated
//                                              step refuses the arrow) instead of the key
//   --frames 12   how many frames across the window       --ms 1600  the window, in ms
//   --settle 5000 how long the arrival at <from> is given to land before the press,
//                 and how long after the window the final "settled" frame is taken
//   --url http://localhost:5173/   drive a dev server that is already running instead
//                                  of starting one                  --out sheets
//   --real-clock  take the frames on the WALL clock instead: nothing faked and
//                 nothing seeked. The only honest way to time the HTML layer —
//                 the prose, the axes, the bar, a panel (see realTimeline). Use
//                 the faked clock for the canvas and this for everything over it.
//                 Its floor is the cost of a screenshot, ~200-250ms, so it
//                 resolves the ORDER things arrive in and not a 200ms fade's
//                 shape; for that, read computed styles at fixed delays instead.
//
// Why a faked clock: the tweens are sub-second and a screenshot taken on the wall
// clock lands wherever it lands. Playwright's clock replaces performance.now,
// Date and requestAnimationFrame in the page — the tweener, the choreographer,
// the sky and the label hold all read those — so `runFor(ms)` advances the whole
// canvas by exactly ms and the frames are the same on every run. CSS animations
// and Svelte transitions run on the compositor, not that clock, so every frame
// also seeks each live Animation to the same elapsed time (see SEEK_ANIMATIONS).
//
// Output, per direction, under <out>/<from>-<to>-<box>/: sheet.png (the tiled
// frames, captioned with their time and the share of pixels that changed since
// the previous frame — a spike is a pop), frames/NN.png at full size, and
// report.json. Exits 1 if the press did not land on <to>.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { startVite, waitForStory } from "./lib/story-page.js";

const BOXES = {
	mobile: { w: 375, h: 667, cols: 5, scale: 1 },
	// a tall phone, where each chart group's px plot reserve (plot.js) gives
	// the plot back more canvas than the 60% floor the mobile box sits on
	tall: { w: 390, h: 844, cols: 5, scale: 1 },
	desktop: { w: 1280, h: 800, cols: 3, scale: 0.5 },
	wide: { w: 1440, h: 900, cols: 3, scale: 0.45 }
};
/** the page's own clock starts here, and is paused this far in once loaded */
const T0 = new Date("2026-01-01T00:00:00Z").getTime();
const PAUSE_AT = T0 + 60_000;

/**
 * Runs in the page. Every Animation (CSS transitions and animations, Svelte 5's
 * WAAPI transitions) is paused and seeked to how long it has been alive in the
 * faked timeline; one that has run its course is finished, so `finished`
 * promises and transitionend still fire. An animation first seen mid-flight
 * (one that started on the real clock before the timeline took over) keeps the
 * time it has already run; one that starts between two frames is dated to the
 * later frame — at most one interval late.
 */
const SEEK_ANIMATIONS = `(() => {
	const born = new Map();
	window.__seekAnimations = (elapsed) => {
		for (const a of document.getAnimations()) {
			if (!born.has(a)) born.set(a, elapsed - (a.currentTime ?? 0));
			const local = elapsed - born.get(a);
			const end = a.effect?.getComputedTiming().endTime ?? 0;
			if (local >= end) {
				if (a.playState !== "finished") a.finish();
				continue;
			}
			a.pause();
			a.currentTime = local;
		}
	};
})();`;

function readOptions() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			dir: { type: "string", default: "both" },
			box: { type: "string", default: "mobile" },
			frames: { type: "string", default: "12" },
			ms: { type: "string", default: "1600" },
			settle: { type: "string", default: "5000" },
			click: { type: "string" },
			url: { type: "string" },
			out: { type: "string", default: "sheets" },
			"real-clock": { type: "boolean", default: false }
		}
	});
	const [from, to] = positionals.map(Number);
	if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) {
		throw new Error("usage: npm run sheet -- <from> <to> [options]");
	}
	if (!BOXES[values.box]) throw new Error(`unknown box: ${values.box}`);
	if (!["both", "fwd", "back"].includes(values.dir)) {
		throw new Error(`unknown dir: ${values.dir}`);
	}
	return {
		from,
		to,
		...values,
		realClock: values["real-clock"],
		frames: Number(values.frames),
		ms: Number(values.ms),
		settle: Number(values.settle)
	};
}

/** @returns {{ from: number, to: number, key: string, click?: string }[]} */
function moves({ from, to, dir, click }) {
	const fwd = {
		from,
		to,
		key: to > from ? "ArrowRight" : "ArrowLeft",
		click
	};
	const back = {
		from: to,
		to: from,
		key: to > from ? "ArrowLeft" : "ArrowRight"
	};
	if (dir === "fwd") return [fwd];
	if (dir === "back") return [back];
	return [fwd, back];
}

/**
 * The page's timeline once the clock is paused: `advance` moves the faked clock
 * and the compositor's animations together, and `elapsed` is where it has got
 * to. Frame times are read against `mark()`, taken at the press.
 */
function timeline(page) {
	let elapsed = 0;
	let origin = 0;
	return {
		async advance(by) {
			elapsed += by;
			await page.clock.runFor(by);
			await page.evaluate((t) => window.__seekAnimations(t), elapsed);
		},
		async sync() {
			await page.evaluate((t) => window.__seekAnimations(t), elapsed);
		},
		mark() {
			origin = elapsed;
		},
		get t() {
			return elapsed - origin;
		}
	};
}

/**
 * The same timeline on the WALL clock: nothing is faked, nothing is seeked, and
 * a frame is taken after really waiting.
 *
 * The faked clock is exact for the canvas, which reads `performance.now`
 * directly, and it seeks every live Animation to the same timeline — but a
 * transition that has not STARTED yet has no Animation to seek, and one that
 * starts between two frames is dated to the later frame. That is enough to
 * mis-time the HTML layer, where the whole question is which of the prose, the
 * furniture, the bar and the panel arrives first, and it is what produced three
 * retracted findings in the 2026-09-19 audit. So the HTML beat is signed off on
 * this clock and the canvas on the other.
 *
 * `t` is the true elapsed time since the press, so a screenshot's own cost
 * shows up honestly as drift in the caption rather than being hidden.
 */
function realTimeline(page) {
	let origin = Date.now();
	return {
		async advance(by) {
			await page.waitForTimeout(by);
		},
		async sync() {},
		mark() {
			origin = Date.now();
		},
		get t() {
			return Date.now() - origin;
		}
	};
}

/**
 * Lands on `move.from` by URL and lets its arrival settle on the paused clock.
 * The clock is paused only once the story has mounted — the tap gutters are
 * TapNav's, rendered after the registry exists — because a press before that
 * has no listener, and module loading is real network time the faked clock
 * cannot hurry.
 */
async function openAt(browser, base, move, opts) {
	const box = BOXES[opts.box];
	const context = await browser.newContext({
		viewport: { width: box.w, height: box.h },
		deviceScaleFactor: 1,
		reducedMotion: "no-preference"
	});
	const page = await context.newPage();
	if (!opts.realClock) {
		await page.clock.install({ time: T0 });
		await page.addInitScript(SEEK_ANIMATIONS);
	}
	await page.goto(`${base}?step=${move.from}`);
	await waitForStory(page);
	if (!opts.realClock) await page.clock.pauseAt(PAUSE_AT);
	const time = opts.realClock ? realTimeline(page) : timeline(page);
	await time.advance(opts.settle);
	return { page, time };
}

async function leave(page, time, move) {
	if (move.click) {
		await page.getByRole("button", { name: move.click }).click();
	} else {
		await page.keyboard.press(move.key);
	}
	time.mark();
	await time.sync();
}

/** @returns {Promise<{ t: number | "settled", png: Buffer }[]>} */
async function captureFrames(page, time, opts) {
	const interval = Math.round(opts.ms / (opts.frames - 1));
	const frames = [];
	for (let i = 0; i < opts.frames; i++) {
		if (i > 0) await time.advance(interval);
		frames.push({ t: time.t, png: await page.screenshot() });
	}
	await time.advance(opts.settle);
	frames.push({ t: "settled", png: await page.screenshot() });
	return frames;
}

/**
 * Runs in the sheet page: decodes every frame, measures how much of each one
 * differs from the frame before (a pixel counts once any channel moves by more
 * than 24) and the box that change fits in, then captions the cells.
 */
async function measureAndCaption() {
	const imgs = [...document.querySelectorAll("img")];
	await Promise.all(imgs.map((img) => img.decode()));
	const { naturalWidth: w, naturalHeight: h } = imgs[0];
	const read = (img) => {
		const c = document.createElement("canvas");
		c.width = w;
		c.height = h;
		const ctx = c.getContext("2d");
		ctx.drawImage(img, 0, 0);
		return ctx.getImageData(0, 0, w, h).data;
	};
	const diffs = [];
	let prev = read(imgs[0]);
	for (let i = 1; i < imgs.length; i++) {
		const cur = read(imgs[i]);
		let changed = 0;
		let x0 = w;
		let y0 = h;
		let x1 = -1;
		let y1 = -1;
		for (let p = 0; p < cur.length; p += 4) {
			const d =
				Math.abs(cur[p] - prev[p]) +
				Math.abs(cur[p + 1] - prev[p + 1]) +
				Math.abs(cur[p + 2] - prev[p + 2]);
			if (d <= 24) continue;
			changed++;
			const x = (p >> 2) % w;
			const y = (p >> 2) / w;
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		}
		const pct = (100 * changed) / (w * h);
		diffs.push({
			pct,
			box: changed ? [x0, Math.floor(y0), x1, Math.floor(y1)] : null
		});
		imgs[i].nextElementSibling.textContent += ` · Δ ${pct.toFixed(1)}%`;
		prev = cur;
	}
	return diffs;
}

function sheetHtml(frames, box, title) {
	const cells = frames
		.map(
			({ t, png }) =>
				`<figure><img src="data:image/png;base64,${png.toString("base64")}">` +
				`<figcaption>${t === "settled" ? "settled" : `t = ${t} ms`}</figcaption></figure>`
		)
		.join("");
	return `<!doctype html><meta charset="utf-8"><style>
		body { margin: 0; background: #14161a; color: #d6d9de; font: 13px/1.4 ui-monospace, monospace; }
		h1 { font-size: 15px; font-weight: 500; margin: 0; padding: 12px 16px; }
		main { display: grid; grid-template-columns: repeat(${box.cols}, max-content); gap: 8px 12px; padding: 0 16px 16px; }
		figure { margin: 0; }
		img { display: block; width: ${Math.round(box.w * box.scale)}px; outline: 1px solid #2a2e35; }
		figcaption { padding-top: 4px; }
	</style><h1>${title}</h1><main>${cells}</main>`;
}

async function composeSheet(browser, frames, box, title, file) {
	const page = await browser.newPage();
	await page.setContent(sheetHtml(frames, box, title));
	const diffs = await page.evaluate(measureAndCaption);
	await page.screenshot({ path: file, fullPage: true });
	await page.close();
	return diffs;
}

async function writeFrames(dir, frames) {
	await mkdir(path.join(dir, "frames"), { recursive: true });
	await Promise.all(
		frames.map(({ png }, i) =>
			writeFile(
				path.join(dir, "frames", `${String(i).padStart(2, "0")}.png`),
				png
			)
		)
	);
}

function printReport({ title, landed, to, frames, diffs, sheet }) {
	console.log(`\n${title}`);
	console.log(
		landed === to
			? `landed on step ${landed}`
			: `!! landed on step ${landed}, not ${to}`
	);
	frames.forEach(({ t }, i) => {
		const d = i === 0 ? "" : `Δ ${diffs[i - 1].pct.toFixed(1).padStart(5)}%`;
		console.log(`  ${String(t).padStart(8)}  ${d}`);
	});
	console.log(`  ${sheet}`);
}

async function runMove(browser, base, move, opts) {
	const box = BOXES[opts.box];
	const dir = path.join(opts.out, `${move.from}-${move.to}-${opts.box}`);
	const { page, time } = await openAt(browser, base, move, opts);
	await leave(page, time, move);
	const frames = await captureFrames(page, time, opts);
	const landed = Number(
		await page.evaluate(() => new URLSearchParams(location.search).get("step"))
	);
	await page.context().close();
	const via = move.click ? `"${move.click}"` : move.key;
	const title = `step ${move.from} → ${move.to} via ${via} · ${opts.box} ${box.w}×${box.h}`;
	const sheet = path.join(dir, "sheet.png");
	await writeFrames(dir, frames);
	const diffs = await composeSheet(browser, frames, box, title, sheet);
	const report = {
		...move,
		box: opts.box,
		landed,
		frames: frames.map((f) => f.t),
		diffs
	};
	await writeFile(
		path.join(dir, "report.json"),
		JSON.stringify(report, null, "\t")
	);
	printReport({ title, landed, to: move.to, frames, diffs, sheet });
	return landed === move.to;
}

async function main() {
	const opts = readOptions();
	const server = opts.url ? null : await startVite();
	const base = opts.url ?? server.url;
	const browser = await chromium.launch();
	let ok = true;
	try {
		for (const move of moves(opts)) {
			ok = (await runMove(browser, base, move, opts)) && ok;
		}
	} finally {
		await browser.close();
		await server?.close();
	}
	process.exitCode = ok ? 0 : 1;
}

main();
