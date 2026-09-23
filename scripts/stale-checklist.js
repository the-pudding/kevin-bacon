#!/usr/bin/env node
// The tween checklist's blast radius, computed instead of worked out by hand.
//
//   node scripts/stale-checklist.js                 mark rows stale from the staged diff
//   node scripts/stale-checklist.js --since <ref>   …from <ref> to the working tree
//   node scripts/stale-checklist.js --check [...]   write nothing; fail if a row the
//                                                   diff stales is not `[!]`, or the
//                                                   table no longer matches the steps
//
// The rules are the ones notes/tween-checklist.md states under "Marking steps
// stale": a layout module stales every step on one of its states and the step
// either side; an over-canvas panel stales the steps that mount it (RankBars is
// mounted by Stage.svelte across the rank chapter and raceRecent); anything else
// under src/components/scrolly/ that draws — the buffers, the visual and its
// modules, the state registry — stales the whole table; navigation chrome, the
// dev tuners and the tests stale nothing. A change to Index.svelte is checked
// against the table's numbering, since a <Step> added, removed or reordered
// renumbers every row after it. Only Owen signs a row off ([x]); this only ever
// takes a mark back to [!].
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
export const INDEX = "src/components/Index.svelte";
export const CHECKLIST = "notes/tween-checklist.md";
const SCROLLY = "src/components/scrolly/";
/** components that are the story's chrome, not its canvas */
const CHROME = new Set(["TapNav", "StepProgress", "Step", "Chapter", "Splash"]);
/** the panel Stage.svelte mounts itself, and the states it is up for */
const STAGE_PANELS = {
	RankBars: ["rankFocus", "rankReveal", "raceRecent"]
};

/** @typedef {{ state: string, body: string }} StepTag */

/**
 * Reads one tag from `<Name` to its closing `>`, past any `{…}` attribute value
 * (an arrow in `gate={() => …}` is not the end of the tag).
 * @returns {{ attrs: string, end: number, selfClosing: boolean }}
 */
function readTag(markup, start) {
	let depth = 0;
	let i = start;
	for (; i < markup.length; i++) {
		const ch = markup[i];
		if (ch === "{") depth++;
		else if (ch === "}") depth--;
		else if (ch === ">" && depth === 0) break;
	}
	const attrs = markup.slice(start, i);
	return { attrs, end: i + 1, selfClosing: attrs.endsWith("/") };
}

/** the template alone — no script block and no HTML comments, both of which
 * talk about <Step> in prose */
const templateOf = (source) =>
	source
		.replace(/<script[\s\S]*?<\/script>/g, "")
		.replace(/<!--[\s\S]*?-->/g, "");

/** the top-level `{#snippet name()}` blocks, by name */
function snippetsOf(markup) {
	const out = {};
	for (const m of markup.matchAll(
		/\{#snippet (\w+)\(\)\}([\s\S]*?)\{\/snippet\}/g
	)) {
		out[m[1]] = m[2];
	}
	return out;
}

/**
 * The story's steps in document order — what the registry receives — each with
 * the markup it renders (its prose and the panel snippet it names), so a panel
 * component can be traced to the steps that mount it.
 * @param {string} source Index.svelte
 * @returns {StepTag[]}
 */
export function parseSteps(source) {
	const markup = templateOf(source);
	const snippets = snippetsOf(markup);
	const steps = [];
	const open = /<(Step|Splash)(?=[\s/>])/g;
	for (const m of markup.matchAll(open)) {
		const { attrs, end, selfClosing } = readTag(markup, m.index);
		const state = attrs.match(/\bstate="(\w+)"/)?.[1];
		if (!state) throw new Error(`a <${m[1]}> without a state at ${m.index}`);
		const close = selfClosing ? end : markup.indexOf(`</${m[1]}>`, end);
		const panel = attrs.match(/\bpanel=\{(\w+)\}/)?.[1];
		const body = markup.slice(end, close) + (snippets[panel] ?? "");
		steps.push({ state, body });
	}
	return steps;
}

/** the state keys a layout module registers (`export const states = { … }`) */
export function layoutStatesOf(source) {
	const start = source.indexOf("export const states = {");
	if (start < 0) return [];
	const block = source.slice(start, source.indexOf("\n};", start));
	return [...block.matchAll(/^\t(\w+): \{/gm)].map((m) => m[1]);
}

/** the step indices on any of `states`, plus the step either side of each */
function stepsOn(states, steps) {
	const hit = new Set();
	steps.forEach((s, i) => {
		if (!states.includes(s.state)) return;
		for (const j of [i - 1, i, i + 1])
			if (j >= 0 && j < steps.length) hit.add(j);
	});
	return hit;
}

/** the steps whose markup mounts `<Name` */
function stepsMounting(name, steps) {
	return steps
		.map((s, i) => (s.body.includes(`<${name}`) ? i : -1))
		.filter((i) => i >= 0);
}

/**
 * Which rows a change to `file` stales: a set of step indices, `"all"`, or an
 * empty set when the file does not draw.
 * @param {string} file repo-relative path
 * @param {StepTag[]} steps
 * @param {(module: string) => string[]} statesOf a layout module's state keys
 * @returns {Set<number> | "all"}
 */
export function affectedSteps(file, steps, statesOf) {
	if (!file.startsWith(SCROLLY)) return new Set();
	const rel = file.slice(SCROLLY.length);
	const layout = rel.match(/^layouts\/([\w-]+)\.js$/);
	if (layout) return stepsOn(statesOf(layout[1]), steps);
	if (rel.startsWith("dev/") || rel.startsWith("__tests__/")) return new Set();
	const component = rel.match(/^(\w+)\.svelte$/)?.[1];
	return component ? componentSteps(component, steps) : "all";
}

/** which rows a change to one component stales: chrome none, the visual and
 * the stage all, a panel the steps that mount it */
function componentSteps(name, steps) {
	if (CHROME.has(name)) return new Set();
	if (STAGE_PANELS[name]) return stepsOn(STAGE_PANELS[name], steps);
	if (name === "ScrollyVisual" || name === "Stage") return "all";
	const mounted = stepsMounting(name, steps).map((i) => steps[i].state);
	return stepsOn(mounted, steps);
}

/** @typedef {{ index: number, state: string, line: number }} Row */

/** the table's step rows: `| N | \`state\` … | Fwd | Back | Mobile | Notes |` */
export function parseRows(checklist) {
	const rows = [];
	checklist.split("\n").forEach((line, i) => {
		const cells = line.split("|");
		const index = Number(cells[1]?.trim());
		if (cells.length < 7 || !Number.isInteger(index)) return;
		const state = cells[2].match(/`(\w+)`/)?.[1] ?? "";
		rows.push({ index, state, line: i });
	});
	return rows;
}

/** the mismatches between the table's rows and the steps, as messages */
export function numberingErrors(rows, steps) {
	const errors = [];
	if (rows.length !== steps.length) {
		errors.push(
			`${rows.length} rows for ${steps.length} steps — renumber the table`
		);
	}
	rows.forEach((row, i) => {
		if (row.index !== i) errors.push(`row ${i} is numbered ${row.index}`);
		if (steps[i] && row.state !== steps[i].state) {
			errors.push(`row ${i} says ${row.state}, step ${i} is ${steps[i].state}`);
		}
	});
	return errors;
}

/** the row's three arrival cells (Fwd, Back, Mobile) with signed-off and unchecked marks taken back to stale */
function staleLine(line) {
	const cells = line.split("|");
	for (const c of [3, 4, 5]) cells[c] = cells[c].replace(/\[[x ]\]/, "[!]");
	return cells.join("|");
}

/**
 * The checklist with the given rows marked stale, and which rows were not
 * already — the check mode's findings.
 * @returns {{ text: string, fresh: number[] }}
 */
export function markStale(checklist, rows, indices) {
	const lines = checklist.split("\n");
	const fresh = [];
	for (const row of rows) {
		if (!indices.has(row.index)) continue;
		const next = staleLine(lines[row.line]);
		if (next !== lines[row.line]) fresh.push(row.index);
		lines[row.line] = next;
	}
	return { text: lines.join("\n"), fresh };
}

/** every row a set of changed files stales, resolved against the steps */
export function staleSet(files, steps, statesOf) {
	const out = new Set();
	for (const file of files) {
		const hit = affectedSteps(file, steps, statesOf);
		if (hit === "all") return new Set(steps.map((_, i) => i));
		for (const i of hit) out.add(i);
	}
	return out;
}

function changedFiles(args) {
	const since = args.indexOf("--since");
	const range = since >= 0 ? [args[since + 1]] : ["--cached"];
	const out = execFileSync("git", ["diff", "--name-only", ...range], {
		cwd: fileURLToPath(ROOT),
		encoding: "utf8"
	});
	return out.split("\n").filter(Boolean);
}

function main(args) {
	const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
	const check = args.includes("--check");
	const files = changedFiles(args);
	const steps = parseSteps(read(INDEX));
	const checklist = read(CHECKLIST);
	const rows = parseRows(checklist);
	// a module the diff deleted has no states left to stale
	const statesOf = (m) => {
		const path = new URL(`${SCROLLY}layouts/${m}.js`, ROOT);
		return existsSync(path) ? layoutStatesOf(readFileSync(path, "utf8")) : [];
	};
	const errors = files.includes(INDEX) ? numberingErrors(rows, steps) : [];
	const { text, fresh } = markStale(
		checklist,
		rows,
		staleSet(files, steps, statesOf)
	);
	if (!check && text !== checklist)
		writeFileSync(new URL(CHECKLIST, ROOT), text);
	process.exit(report(check, errors, fresh));
}

/** prints the findings and returns the exit code */
function report(check, errors, fresh) {
	for (const e of errors) console.error(`checklist: ${e}`);
	if (check && fresh.length) {
		console.error(
			`checklist: steps ${fresh.join(", ")} are affected by the staged changes but not marked [!] — run \`npm run stale\``
		);
	}
	if (!check) {
		console.log(
			fresh.length ? `staled steps ${fresh.join(", ")}` : "nothing to stale"
		);
	}
	return errors.length || (check && fresh.length) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
	main(process.argv.slice(2));
