import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
	CHECKLIST,
	INDEX,
	affectedSteps,
	layoutStatesOf,
	markStale,
	numberingErrors,
	parseRows,
	parseSteps,
	staleSet
} from "../../../../scripts/stale-checklist.js";

const ROOT = new URL("../../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

const MARKUP = `
<script>
	// every <Step> registers itself
	import Step from "./Step.svelte";
</script>
<!-- the panels live beside the <Step>s -->
{#snippet quizPanel()}
	<PairQuiz visual={layout.visual} />
{/snippet}
<Splash state="titleGalaxy">
	{#snippet title()}Name{/snippet}
</Splash>
<Step state="lone"><p>one</p></Step>
<Chapter title="A">
<Step state="hopBands"><p>two</p></Step>
<Step state="rankFocus" gate={() => quizDone(story)} skipback>
	<GuessRank />
</Step>
<Step
	state="scatterQuiz"
	panel={quizPanel}
	gate={() => quizDone(story)}
>
	<p>quiz</p>
</Step>
<Step state="outro" hideBar><p>end</p></Step>
</Chapter>
`;

const LAYOUT = `
const x = { a: {} };
export const states = {
	rankFocus: { layout: layoutRank, params },
	rankReveal: { layout: layoutRank, params }
};
`;

const TABLE = `
| #   | State        | Fwd | Back | Mobile | Notes |
| --- | ------------ | --- | ---- | ------ | ----- |
| 0   | \`titleGalaxy\` | [x] | n/a  | [x]    | title |
| 1   | \`lone\`         | [ ] | [x]  | [!]    | a     |
| 2   | \`hopBands\`     | [x] | [x]  | [x]    | bands |
| 3   | \`rankFocus\` (gate) | [x] bug (see) | n/a | [x] | guess |
| 4   | \`scatterQuiz\`  | [x] | [x]  | [x]    | quiz  |
| 5   | \`outro\`        | [x] | [x]  | [x]    | end   |
`;

const steps = parseSteps(MARKUP);
const statesOf = (m) => (m === "rank" ? layoutStatesOf(LAYOUT) : []);

describe("parseSteps", () => {
	test("reads every step tag in document order, arrows in attributes included", () => {
		expect(steps.map((s) => s.state)).toEqual([
			"titleGalaxy",
			"lone",
			"hopBands",
			"rankFocus",
			"scatterQuiz",
			"outro"
		]);
	});

	test("a <Step> mentioned in the script or a comment, or a <Chapter>, is not a step", () => {
		expect(steps).toHaveLength(6);
	});

	test("a step's body carries the panel snippet it names", () => {
		expect(steps[4].body).toContain("<PairQuiz");
		expect(steps[3].body).toContain("<GuessRank");
		expect(steps[1].body).not.toContain("<PairQuiz");
	});
});

test("layoutStatesOf reads the module's registered state keys", () => {
	expect(layoutStatesOf(LAYOUT)).toEqual(["rankFocus", "rankReveal"]);
	expect(layoutStatesOf("const nothing = 1;")).toEqual([]);
});

describe("affectedSteps", () => {
	test("a layout module stales its states' steps and their neighbours", () => {
		const hit = affectedSteps(
			"src/components/scrolly/layouts/rank.js",
			steps,
			statesOf
		);
		expect([...hit].sort()).toEqual([2, 3, 4]);
	});

	test("a panel stales the steps that mount it and their neighbours", () => {
		const hit = affectedSteps(
			"src/components/scrolly/PairQuiz.svelte",
			steps,
			statesOf
		);
		expect([...hit].sort()).toEqual([3, 4, 5]);
	});

	test("the stage-mounted ladder stales the rank chapter and the handoff", () => {
		const hit = affectedSteps(
			"src/components/scrolly/RankBars.svelte",
			steps,
			statesOf
		);
		expect([...hit].sort()).toEqual([2, 3, 4]);
	});

	test("shared machinery stales everything", () => {
		for (const file of [
			"src/components/scrolly/tween.js",
			"src/components/scrolly/ScrollyVisual.svelte",
			"src/components/scrolly/Stage.svelte",
			"src/components/scrolly/states.js",
			"src/components/scrolly/render.js"
		]) {
			expect(affectedSteps(file, steps, statesOf)).toBe("all");
		}
	});

	test("chrome, dev tuners, tests and files outside the framework stale nothing", () => {
		for (const file of [
			"src/components/scrolly/TapNav.svelte",
			"src/components/scrolly/Step.svelte",
			"src/components/scrolly/dev/RaceSpeedDev.svelte",
			"src/components/scrolly/__tests__/goldens.spec.js",
			"src/components/Index.svelte",
			"notes/tween-checklist.md"
		]) {
			expect(affectedSteps(file, steps, statesOf).size).toBe(0);
		}
	});
});

describe("the table", () => {
	const rows = parseRows(TABLE);

	test("rows are the numbered lines, with their state", () => {
		expect(rows.map((r) => [r.index, r.state])).toEqual([
			[0, "titleGalaxy"],
			[1, "lone"],
			[2, "hopBands"],
			[3, "rankFocus"],
			[4, "scatterQuiz"],
			[5, "outro"]
		]);
	});

	test("numbering agrees with the steps", () => {
		expect(numberingErrors(rows, steps)).toEqual([]);
		expect(numberingErrors(rows, steps.slice(0, 5))).toContain(
			"6 rows for 5 steps — renumber the table"
		);
		const swapped = [steps[1], steps[0], ...steps.slice(2)];
		expect(numberingErrors(rows, swapped)).toEqual([
			"row 0 says titleGalaxy, step 0 is lone",
			"row 1 says lone, step 1 is titleGalaxy"
		]);
	});

	test("marking takes signed-off and unchecked marks back to stale, and nothing else", () => {
		const { text, fresh } = markStale(TABLE, rows, new Set([1, 3]));
		expect(fresh).toEqual([1, 3]);
		const lines = text.split("\n");
		expect(lines[rows[1].line]).toContain("| [!] | [!]  | [!]    |");
		// a note after the mark survives; n/a is left alone
		expect(lines[rows[3].line]).toContain("| [!] bug (see) | n/a | [!] |");
		expect(lines[rows[0].line]).toBe(TABLE.split("\n")[rows[0].line]);
	});

	test("a row already stale is not reported as fresh", () => {
		const { fresh } = markStale(TABLE, rows, new Set([1]));
		expect(fresh).toEqual([1]);
		const { fresh: again } = markStale(
			markStale(TABLE, rows, new Set([1])).text,
			rows,
			new Set([1])
		);
		expect(again).toEqual([]);
	});

	test("staleSet unions the files' radii and short-circuits on shared machinery", () => {
		expect(
			[
				...staleSet(["src/components/scrolly/layouts/rank.js"], steps, statesOf)
			].sort()
		).toEqual([2, 3, 4]);
		expect(
			staleSet(["src/components/scrolly/tween.js"], steps, statesOf).size
		).toBe(steps.length);
	});
});

describe("the real checklist", () => {
	test("has one row per registered step, in the registry's order", () => {
		const real = parseSteps(read(INDEX));
		expect(numberingErrors(parseRows(read(CHECKLIST)), real)).toEqual([]);
	});

	test("every layout module's states resolve", () => {
		const real = parseSteps(read(INDEX));
		const modules = [
			"intro",
			"hop-bands",
			"rank",
			"race",
			"scatters",
			"career",
			"sim-race"
		];
		for (const m of modules) {
			const states = layoutStatesOf(
				read(`src/components/scrolly/layouts/${m}.js`)
			);
			expect(states.length).toBeGreaterThan(0);
			expect(
				affectedSteps(
					`src/components/scrolly/layouts/${m}.js`,
					real,
					() => states
				)
			).toBeInstanceOf(Set);
		}
	});
});
