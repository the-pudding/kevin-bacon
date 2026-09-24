// @ts-check
// The read behind the credits' "Your results" block, started ahead of the
// credits themselves: Index.svelte calls load() once the reader lands on the
// story's last step, so the answer is normally in by the time the credits roll
// and the charts never land in a section already moving up the screen.
import { fetchQuizResults } from "$utils/analytics.js";
import { INTERACTIVE_IDS } from "$components/scrolly/states.js";
import { SLJ } from "$components/scrolly/cast.js";

// long enough for an insert that was in flight as the reader tapped onto the
// last step to have landed
const RETRY_MS = 1500;

export function createQuizResults() {
	/** @type {any} */
	let data = $state(null);
	let loading = $state(false);
	let started = false;

	const read = () =>
		fetchQuizResults({
			pairCount: INTERACTIVE_IDS.quiz.length,
			sljActorId: SLJ
		});

	return {
		get data() {
			return data;
		},
		// true from load() until the read settles, however it settles — the
		// credits show a placeholder for a reader who outran it
		get loading() {
			return loading;
		},
		// Once per page: stepping back off the last step and onto it again does
		// not read again. Browser-only by way of its caller, an $effect, which
		// never runs during SSR — the page is prerendered (+layout.js), so there
		// is no build-time fetch and nothing to bake into the HTML.
		async load() {
			if (started) return;
			started = true;
			loading = true;
			try {
				let result = await read();
				// One retry when the reader appears to have no result at all: the
				// writes in analytics.js are fire-and-forget, so a reader who sprints
				// from the last pick to the end can outrun their own row landing in
				// Postgres, and the block hides on a null `you`.
				if (result && !result.rank?.you && !result.pairs?.you) {
					await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
					result = await read();
				}
				data = result;
			} catch (error) {
				// same failure idiom as the writers: log, show nothing, never throw
				// at the reader
				console.error("analytics: quiz_results failed", error);
			} finally {
				loading = false;
			}
		}
	};
}
