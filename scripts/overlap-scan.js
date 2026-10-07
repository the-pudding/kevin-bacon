#!/usr/bin/env node
// Text that overprints text on the rendered page, at every step: the prose
// card against the chart's own text (ticks, axis titles, labels, callouts) and
// against the chart title, and the chart title against the chart's text.
//
//   npm run overlap                         every step, every box, 100% and 200%
//                                           text, Chromium and WebKit
//   npm run overlap -- --box mobile         some boxes (mobile 375×667 |
//                                           mobile-tall 390×844 | landscape 667×375)
//   npm run overlap -- --text 200           some text sizes (100 | 200, the
//                                           reader's 200% zoom of text only)
//   npm run overlap -- --engine webkit      some engines (chromium | webkit)
//   npm run overlap -- --steps 0,3,12       only these step indices
//   --settle 3500   how long each step is given to land before the shots, on
//                   the wall clock
//   --min 20        shared ink, in px, that counts as an overlap
//   --url http://localhost:5173/            drive a dev server that is already running
//
// Overlap is measured in ink, not boxes: line boxes overlap wherever a list
// scrolls its rows out of sight (the rank ladder) or a box's padding runs past
// its glyphs, and neither is a defect. The text on screen is sorted into groups
// — prose (in .scrolly-steps), title (.chart-title), chart (any other text over
// the canvas) and cue (.nav-cue) — and a group's ink is the pixels that change
// when its text alone goes transparent. Two groups overlap where their ink is
// shared, less the pixels that change between two identical shots (the canvas
// moving). The hidden measuring copies (.card-measure, .title-measure,
// .cue-measure, .route-measure) are never in a group. Each step is opened by
// URL (?step=N, as `npm run sheet` does), so a gated step is measured at rest.
// Exits 1 when any pair shares more than --min px of ink.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium, webkit } from "playwright";
import { INDEX, parseSteps } from "./stale-checklist.js";
import { startVite, waitForStory } from "./lib/story-page.js";

const BOXES = {
	mobile: { width: 375, height: 667 },
	"mobile-tall": { width: 390, height: 844 },
	landscape: { width: 667, height: 375 }
};
const ENGINES = { chromium, webkit };
const TEXT_SIZES = ["100", "200"];
/** the groups whose shared ink is a defect */
const PAIRS = [
	["prose", "chart"],
	["prose", "title"],
	["title", "chart"]
];
const GROUPS = ["prose", "title", "chart", "cue"];
/** the measuring copies: laid out as the real thing, never seen */
const MEASURES = ".card-measure, .title-measure, .cue-measure, .route-measure";
/** pages measured at once */
const CONCURRENCY = 4;
/** a page that reloads under us (a concurrent edit to src/) is opened again once */
const RELOADED = /Execution context was destroyed|navigat/i;

/** @param {string} value @param {string[]} allowed @param {string} name */
function listOf(value, allowed, name) {
	const list = value.split(",");
	for (const item of list) {
		if (!allowed.includes(item)) throw new Error(`unknown ${name}: ${item}`);
	}
	return list;
}

function readOptions() {
	const { values } = parseArgs({
		options: {
			box: { type: "string", default: Object.keys(BOXES).join(",") },
			text: { type: "string", default: TEXT_SIZES.join(",") },
			engine: { type: "string", default: Object.keys(ENGINES).join(",") },
			steps: { type: "string" },
			settle: { type: "string", default: "3500" },
			min: { type: "string", default: "20" },
			url: { type: "string" }
		}
	});
	const count = parseSteps(readFileSync(INDEX, "utf8")).length;
	const steps = values.steps
		? values.steps.split(",").map(Number)
		: Array.from({ length: count }, (_, i) => i);
	return {
		boxes: listOf(values.box, Object.keys(BOXES), "box"),
		texts: listOf(values.text, TEXT_SIZES, "text size"),
		engines: listOf(values.engine, Object.keys(ENGINES), "engine"),
		steps,
		settle: Number(values.settle),
		min: Number(values.min),
		url: values.url
	};
}

/** Runs in the page before it loads: the reader's text at 200%. */
function enlargeText() {
	const add = () => {
		const style = document.createElement("style");
		style.textContent = "html{font-size:200%!important}";
		document.head.append(style);
	};
	if (document.head) add();
	else document.addEventListener("DOMContentLoaded", add);
}

/**
 * Runs in the page: tags every visible element with text of its own over the
 * canvas with its group (`data-g`), and installs the rule that makes a
 * group's text transparent while `html.hide-<group>` is set.
 * @param {{ groups: string[], measures: string }} args
 * @returns {Record<string, number>} elements per group
 */
function markGroups({ groups, measures }) {
	const style = document.createElement("style");
	style.textContent = groups
		.map(
			(g) =>
				`html.hide-${g} [data-g=${g}], html.hide-${g} [data-g=${g}] *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-decoration-color:transparent!important}`
		)
		.join("\n");
	document.head.append(style);
	const canvas = document
		.querySelector(".scrolly-visual canvas")
		.getBoundingClientRect();
	const ownText = (el) =>
		[...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
	const opacity = (el) => {
		let o = 1;
		for (let e = el; e; e = e.parentElement)
			o *= parseFloat(getComputedStyle(e).opacity);
		return o;
	};
	const shown = (el) => {
		const cs = getComputedStyle(el);
		if (cs.visibility !== "visible" || cs.display === "none") return false;
		if (el.closest(`${measures}, .sr-only, .skip-to-main`)) return false;
		return opacity(el) >= 0.3;
	};
	const overCanvas = (el) => {
		const r = el.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) return false;
		if (r.bottom <= 0 || r.top >= innerHeight) return false;
		return !(
			r.right <= canvas.left ||
			r.left >= canvas.right ||
			r.bottom <= canvas.top ||
			r.top >= canvas.bottom
		);
	};
	const groupOf = (el) => {
		if (el.closest(".nav-cue")) return "cue";
		if (el.closest(".scrolly-steps")) return "prose";
		if (el.closest(".chart-title")) return "title";
		return "chart";
	};
	const counts = Object.fromEntries(groups.map((g) => [g, 0]));
	for (const el of document.querySelectorAll("body *")) {
		if (["SCRIPT", "STYLE", "CANVAS"].includes(el.tagName)) continue;
		if (!ownText(el) || !overCanvas(el) || !shown(el)) continue;
		const g = groupOf(el);
		el.setAttribute("data-g", g);
		counts[g]++;
	}
	return counts;
}

/**
 * A screenshot with these groups' text transparent, as base64 PNG.
 * @param {import("playwright").Page} page
 * @param {string[]} hidden
 */
async function shot(page, hidden) {
	await page.evaluate((groups) => {
		const list = document.documentElement.classList;
		for (const c of [...list]) if (c.startsWith("hide-")) list.remove(c);
		for (const g of groups) list.add(`hide-${g}`);
		return new Promise((done) =>
			requestAnimationFrame(() => requestAnimationFrame(done))
		);
	}, hidden);
	return (await page.screenshot()).toString("base64");
}

/**
 * Runs in the page: decodes the shots and counts each pair's shared ink.
 * `base` and `again` have every group hidden; each group's shot shows that
 * group alone. Pixels that differ between `base` and `again`, and their
 * neighbours, are motion, not ink.
 * @param {{ shots: Record<string, string>, pairs: string[][] }} args
 * @returns {Promise<Record<string, number>>} shared px per "a×b"
 */
async function countInk({ shots, pairs }) {
	const decode = async (b64) => {
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([bytes]), {
			colorSpaceConversion: "none",
			premultiplyAlpha: "none"
		});
		const { width: w, height: h } = bitmap;
		const ctx = new OffscreenCanvas(w, h).getContext("2d", {
			willReadFrequently: true
		});
		ctx.drawImage(bitmap, 0, 0);
		return { data: ctx.getImageData(0, 0, w, h).data, w, h };
	};
	const changed = (x, y) => {
		const mask = new Uint8Array(x.w * x.h);
		for (let i = 0; i < mask.length; i++) {
			let d = 0;
			for (let c = 0; c < 3; c++)
				d += Math.abs(x.data[i * 4 + c] - y.data[i * 4 + c]);
			mask[i] = d >= 60 ? 1 : 0;
		}
		return mask;
	};
	const dilate = (mask, w) => {
		const out = new Uint8Array(mask.length);
		mask.forEach((on, i) => {
			if (!on) return;
			const x = i % w;
			const dxs = [-1, 0, 1].filter((dx) => x + dx >= 0 && x + dx < w);
			for (const dy of [-w, 0, w]) for (const dx of dxs) out[i + dy + dx] = 1;
		});
		return out;
	};
	const img = {};
	for (const [name, b64] of Object.entries(shots))
		img[name] = await decode(b64);
	const noise = dilate(changed(img.base, img.again), img.base.w);
	const ink = {};
	for (const [a, b] of pairs) {
		const ma = changed(img[a], img.base);
		const mb = changed(img[b], img.base);
		let n = 0;
		for (let i = 0; i < ma.length; i++) if (ma[i] && mb[i] && !noise[i]) n++;
		ink[`${a}×${b}`] = n;
	}
	return ink;
}

/**
 * Every pair's shared ink on the page as it stands; a pair whose groups are
 * not both on screen is null.
 * @param {import("playwright").Page} page
 */
async function measureInk(page) {
	const counts = await page.evaluate(markGroups, {
		groups: GROUPS,
		measures: MEASURES
	});
	const present = PAIRS.filter(([a, b]) => counts[a] && counts[b]);
	const shown = [...new Set(present.flat())];
	const shots = { base: await shot(page, GROUPS) };
	for (const g of shown)
		shots[g] = await shot(
			page,
			GROUPS.filter((other) => other !== g)
		);
	shots.again = await shot(page, GROUPS);
	const ink = present.length
		? await page.evaluate(countInk, { shots, pairs: present })
		: {};
	return Object.fromEntries(
		PAIRS.map(([a, b]) => [`${a}×${b}`, ink[`${a}×${b}`] ?? null])
	);
}

async function measureStep(browsers, base, job, settle) {
	const { engine, box, text, step } = job;
	const context = await browsers[engine].newContext({
		viewport: BOXES[box],
		hasTouch: true,
		isMobile: engine === "chromium",
		reducedMotion: "no-preference"
	});
	const page = await context.newPage();
	try {
		if (text === "200") await page.addInitScript(enlargeText);
		await page.goto(`${base}?step=${step}`);
		await waitForStory(page);
		await page.waitForTimeout(settle);
		return await measureInk(page);
	} finally {
		await context.close();
	}
}

/** One job, opened again once if the page reloaded under it. */
async function scan(browsers, base, job, settle) {
	for (let attempt = 0; ; attempt++) {
		try {
			return { ...job, ink: await measureStep(browsers, base, job, settle) };
		} catch (error) {
			if (attempt === 0 && RELOADED.test(error.message)) continue;
			return { ...job, error: error.message.split("\n")[0] };
		}
	}
}

async function pool(jobs, run) {
	const results = [];
	let next = 0;
	const worker = async () => {
		while (next < jobs.length) {
			const job = jobs[next++];
			results.push(await run(job));
		}
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	const key = (r) => [r.engine, r.box, r.text];
	return results.sort(
		(a, b) => key(a).join().localeCompare(key(b).join()) || a.step - b.step
	);
}

/** the pairs of one result over the threshold, as "a×b Npx" */
function overlapsOf(result, min) {
	if (result.error) return [`error: ${result.error}`];
	return Object.entries(result.ink)
		.filter(([, px]) => px > min)
		.map(([pair, px]) => `${pair} ${px}px`);
}

function report(results, min) {
	const failures = [];
	for (const result of results) {
		const { engine, box, text, step, ink, error } = result;
		const where = `${engine} ${box} ${text}% step ${step}`;
		const over = overlapsOf(result, min);
		const pairs = error
			? `error: ${error}`
			: Object.entries(ink)
					.map(([pair, px]) => `${pair} ${px ?? "-"}`)
					.join(", ");
		console.log(`${over.length ? "FAIL" : "ok  "} ${where}: ${pairs}`);
		for (const line of over) failures.push(`${where}: ${line}`);
	}
	console.log(
		failures.length
			? `\n${failures.length} overlaps over ${min}px of shared ink across ${results.length} scans:\n${failures.map((f) => `  ✗ ${f}`).join("\n")}`
			: `\nno overlaps over ${min}px of shared ink across ${results.length} scans`
	);
	return failures.length === 0;
}

async function main() {
	const opts = readOptions();
	const server = opts.url ? null : await startVite();
	const base = opts.url ?? server.url;
	const browsers = {};
	for (const engine of opts.engines)
		browsers[engine] = await ENGINES[engine].launch();
	try {
		const jobs = opts.engines.flatMap((engine) =>
			opts.boxes.flatMap((box) =>
				opts.texts.flatMap((text) =>
					opts.steps.map((step) => ({ engine, box, text, step }))
				)
			)
		);
		const results = await pool(jobs, (job) =>
			scan(browsers, base, job, opts.settle)
		);
		process.exitCode = report(results, opts.min) ? 0 : 1;
	} finally {
		for (const browser of Object.values(browsers)) await browser.close();
		await server?.close();
	}
}

main();
