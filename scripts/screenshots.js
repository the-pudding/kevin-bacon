#!/usr/bin/env node
// A screenshot of every step at rest, on a phone, a tablet and a desktop: the
// evidence pack to send round, written to screenshots/<date>/<box>/NN-<state>.png
// and zipped to screenshots/<date>.zip.
//
//   npm run screenshots                       every step, every box
//   npm run screenshots -- --box mobile       some boxes (mobile 375×667 |
//                                             tablet 768×1024 | desktop 1440×900)
//   npm run screenshots -- --steps 0,3,12     only these step indices
//   --settle 3500   how long each step is given to land before the shot, on the
//                   wall clock
//   --url http://localhost:5173/              drive a dev server that is already running
//
// Each step is opened by URL (?step=N, as `npm run sheet` does), so a gated
// step is shot at rest without being unlocked. Shots are of the viewport, at
// 2× pixel density. A page that fails fails the run, and nothing is zipped.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { INDEX, parseSteps } from "./stale-checklist.js";
import { startVite, waitForStory } from "./lib/story-page.js";

const BOXES = {
	mobile: { width: 375, height: 667 },
	tablet: { width: 768, height: 1024 },
	desktop: { width: 1440, height: 900 }
};
const ROOT = "screenshots";
/** pages shot at once */
const CONCURRENCY = 4;

function readOptions() {
	const { values } = parseArgs({
		options: {
			box: { type: "string", default: Object.keys(BOXES).join(",") },
			steps: { type: "string" },
			settle: { type: "string", default: "3500" },
			url: { type: "string" }
		}
	});
	const states = parseSteps(readFileSync(INDEX, "utf8")).map((s) => s.state);
	const steps = values.steps
		? values.steps.split(",").map(Number)
		: states.map((_, i) => i);
	const boxes = values.box.split(",");
	for (const box of boxes) {
		if (!BOXES[box]) throw new Error(`unknown box: ${box}`);
	}
	return {
		boxes,
		steps,
		states,
		settle: Number(values.settle),
		url: values.url
	};
}

/** today's date on the local clock, as YYYY-MM-DD */
function today() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function shoot(browser, base, job, settle) {
	const context = await browser.newContext({
		viewport: BOXES[job.box],
		deviceScaleFactor: 2,
		reducedMotion: "no-preference"
	});
	const page = await context.newPage();
	try {
		await page.goto(`${base}?step=${job.step}`);
		await waitForStory(page);
		await page.waitForTimeout(settle);
		writeFileSync(job.file, await page.screenshot());
	} finally {
		await context.close();
	}
}

async function pool(jobs, run) {
	let next = 0;
	const worker = async () => {
		while (next < jobs.length) await run(jobs[next++]);
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function main() {
	const opts = readOptions();
	const date = today();
	const dir = path.join(ROOT, date);
	const jobs = opts.boxes.flatMap((box) => {
		mkdirSync(path.join(dir, box), { recursive: true });
		return opts.steps.map((step) => {
			const name = `${String(step).padStart(2, "0")}-${opts.states[step]}.png`;
			return { box, step, file: path.join(dir, box, name) };
		});
	});
	const server = opts.url ? null : await startVite();
	const base = opts.url ?? server.url;
	const browser = await chromium.launch();
	try {
		await pool(jobs, async (job) => {
			await shoot(browser, base, job, opts.settle);
			console.log(`ok   ${job.file}`);
		});
	} finally {
		await browser.close();
		await server?.close();
	}
	// -FS drops entries whose file is gone, so a rerun never ships a stale shot
	execFileSync("zip", ["-rqFS", `${date}.zip`, date], { cwd: ROOT });
	console.log(`\n${jobs.length} shots in ${dir}, zipped to ${dir}.zip`);
}

main();
