import { expect, test } from "vitest";
import { parseSteps } from "../../../../scripts/story-steps.js";

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

const steps = parseSteps(MARKUP);

test("reads every step tag in document order, arrows in attributes included", () => {
	expect(steps.map((s) => s.state)).toEqual([
		"titleGalaxy",
		"lone",
		"hopBands",
		"rankFocus",
		"scatterQuiz",
		"outro"
	]);
	expect(steps[3].attrs).toContain("skipback");
});

test("a <Step> mentioned in the script or a comment, or a <Chapter>, is not a step", () => {
	expect(steps).toHaveLength(6);
});
