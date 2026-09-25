#!/usr/bin/env node
// WCAG colour contrast of the rendered page, at every step, with axe-core.
//
//   npm run a11y                       every step, mobile and desktop boxes
//   npm run a11y -- --box desktop      one box (mobile | desktop | wide)
//   npm run a11y -- --steps 0,3,12     only these step indices
//   --settle 3000   how long each step is given to land before the scan, on the
//                   wall clock (fades must have finished: a half-faded label
//                   measures as low contrast)
//   --url http://localhost:5173/       drive a dev server that is already running
//
// Each step is opened by URL (?step=N, as `npm run sheet` does), so a gated
// step is scanned at rest without being unlocked. Only the DOM is checked: axe
// cannot see the canvas's marks, and where text lies over the canvas it may be
// unable to resolve the background — those nodes are "incomplete" and listed,
// not failed. The token pairs in src/styles/__tests__/contrast.spec.js cover
// both. The dev server mounts the dev tuners (scrolly/dev/, marked
// `data-dev-only`), which a production build never ships, so they are left out
// of the scan. Exits 1 on any violation.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { INDEX, parseSteps } from "./stale-checklist.js";
import { startVite, waitForStory } from "./lib/story-page.js";

const BOXES = {
	mobile: { width: 375, height: 667 },
	desktop: { width: 1280, height: 800 },
	wide: { width: 1440, height: 900 }
};
/** pages scanned at once */
const CONCURRENCY = 4;

function readOptions() {
	const { values } = parseArgs({
		options: {
			box: { type: "string", default: "mobile,desktop" },
			steps: { type: "string" },
			settle: { type: "string", default: "3000" },
			url: { type: "string" }
		}
	});
	const count = parseSteps(readFileSync(INDEX, "utf8")).length;
	const steps = values.steps
		? values.steps.split(",").map(Number)
		: Array.from({ length: count }, (_, i) => i);
	const boxes = values.box.split(",");
	for (const box of boxes) {
		if (!BOXES[box]) throw new Error(`unknown box: ${box}`);
	}
	return { boxes, steps, settle: Number(values.settle), url: values.url };
}

/** a node's own account of its contrast, from axe's check data: the measured
 * ratio when axe could resolve the background, and why not when it could not */
function describe(node) {
	const data = node.any.find((check) => check.data)?.data ?? {};
	const target = node.target.join(" ");
	if (!data.contrastRatio)
		return `${target} (${data.messageKey ?? "unresolved"})`;
	return `${target} — ${data.contrastRatio}:1, needs ${data.expectedContrastRatio} (${data.fgColor} on ${data.bgColor})`;
}

async function scan(browser, base, box, step, settle) {
	const context = await browser.newContext({
		viewport: BOXES[box],
		reducedMotion: "no-preference"
	});
	const page = await context.newPage();
	try {
		await page.goto(`${base}?step=${step}`);
		await waitForStory(page);
		await page.waitForTimeout(settle);
		const result = await new AxeBuilder({ page })
			.withRules(["color-contrast"])
			.exclude("[data-dev-only]")
			.analyze();
		const nodes = (list) => list.flatMap((rule) => rule.nodes).map(describe);
		return {
			box,
			step,
			violations: nodes(result.violations),
			incomplete: nodes(result.incomplete)
		};
	} finally {
		await context.close();
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
	return results.sort((a, b) => a.step - b.step || a.box.localeCompare(b.box));
}

function report(results) {
	for (const { box, step, violations, incomplete } of results) {
		const status = violations.length ? "FAIL" : "ok  ";
		console.log(
			`${status} step ${step} @${box}: ${violations.length} violations, ${incomplete.length} unresolved`
		);
		for (const line of violations) console.log(`       ✗ ${line}`);
		for (const line of incomplete) console.log(`       ? ${line}`);
	}
	const failed = results.filter((r) => r.violations.length).length;
	console.log(
		failed
			? `\n${failed} of ${results.length} scans have contrast violations`
			: `\nno contrast violations across ${results.length} scans`
	);
	return failed === 0;
}

async function main() {
	const opts = readOptions();
	const server = opts.url ? null : await startVite();
	const base = opts.url ?? server.url;
	const browser = await chromium.launch();
	try {
		const jobs = opts.boxes.flatMap((box) =>
			opts.steps.map((step) => ({ box, step }))
		);
		const results = await pool(jobs, ({ box, step }) =>
			scan(browser, base, box, step, opts.settle)
		);
		process.exitCode = report(results) ? 0 : 1;
	} finally {
		await browser.close();
		await server?.close();
	}
}

main();
