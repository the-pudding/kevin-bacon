// Write-only instrumentation for the story's quiz interactions (see
// supabase/schema.sql). Fire-and-forget: a failed write must never block or
// surface to the reader, since this is background recording, not a gated
// step.
import { createClient } from "@supabase/supabase-js";
import { env } from "$env/dynamic/public";

const SESSION_KEY = "kb-session-id";

// $env/dynamic/public (not /static/public) so a missing config warns instead
// of failing the build: /static/public throws at build time for any var it
// doesn't find, which would break `npm run build` for anyone without
// Supabase set up.
const { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env;
const supabase =
	PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_PUBLISHABLE_KEY
		? createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY)
		: null;

if (!supabase) {
	console.warn(
		"analytics: PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_PUBLISHABLE_KEY not set — quiz answers will not be recorded"
	);
}

// Per-browser id so a reader's answers can be grouped later without any PII.
// null during prerender/SSR, where there's no localStorage and nothing to
// record anyway (these helpers are only ever called from click handlers).
function sessionId() {
	if (typeof window === "undefined") return null;
	let id = localStorage.getItem(SESSION_KEY);
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem(SESSION_KEY, id);
	}
	return id;
}

function insert(table, row) {
	if (!supabase) return;
	const session_id = sessionId();
	if (!session_id) return;
	supabase
		.from(table)
		.insert({ session_id, ...row })
		.then(({ error }) => {
			if (error) console.error(`analytics: ${table} insert failed`, error);
		});
}

/** Record one rank-guess attempt (src/components/scrolly/GuessRank.svelte).
 * `actorId` is null when the reader gave up instead of guessing; `correct`
 * is whether that actor actually ranks #1 (closest to the center of
 * Hollywood) — always false for a give-up. */
export function recordRankGuess({ actorId = null, gaveUp = false, correct }) {
	insert("rank_guesses", { actor_id: actorId, gave_up: gaveUp, correct });
}

/** Record one pair-quiz pick (src/components/scrolly/PairQuiz.svelte).
 * `correct` is whether the picked actor is actually closer to the center of
 * Hollywood (lower avg distance) than the other option. */
export function recordPairPick({ pairIndex, pickedId, otherId, correct }) {
	insert("pair_quiz_picks", {
		pair_index: pairIndex,
		picked_id: pickedId,
		other_id: otherId,
		correct
	});
}
