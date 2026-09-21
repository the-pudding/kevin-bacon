// Instrumentation for the story's quiz interactions (see supabase/schema.sql).
// The writes are fire-and-forget: a failed one must never block or surface to
// the reader, since this is background recording, not a gated step. The one
// read — fetchQuizResults, for the credits' results charts — goes through the
// aggregating `quiz_results` function (supabase/quiz_results.sql), because the
// tables themselves stay insert-only to `anon`.
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

/** Is there a Supabase project configured at all? The credits' results block
 * hides outright without one: there is nothing to read, and nothing of the
 * reader's was ever recorded. */
export const analyticsEnabled = supabase !== null;

/** Below this many finished quiz-takers the crowd histograms are noise dressed
 * up as data, so the whole results block hides. Same $env/dynamic/public as the
 * keys above, for the same reason: a missing value must not fail the build. */
const minTakers = Number(env.PUBLIC_MIN_QUIZ_TAKERS);
export const MIN_QUIZ_TAKERS =
	Number.isFinite(minTakers) && minTakers > 0 ? minTakers : 50;

// Per-browser id so a reader's answers can be grouped later without any PII.
// null during prerender/SSR, where there's no localStorage and nothing to
// record anyway (the writers are only ever called from click handlers).
//
// `create` is load-bearing: minting the id is a side effect of asking for it,
// so the reader below passes false. A reader who never answered anything must
// not be handed a permanent id by the act of reaching the credits.
function sessionId(create = true) {
	if (typeof window === "undefined") return null;
	// Touching localStorage THROWS where site data is blocked — Safari private
	// browsing, "block all cookies", a good few in-app browsers — rather than
	// returning null. That throw used to reach the click handler that called
	// this and take the reader's answer down with it (the write that records the
	// pick came after the analytics call), so the quiz re-asked the same pair and
	// its gate never opened. A reader whose browser won't hold an id is a reader
	// who records nothing, which is the same `null` this already returns during
	// prerender; it is never a reason to break the story.
	try {
		let id = localStorage.getItem(SESSION_KEY);
		if (!id && create) {
			id = crypto.randomUUID();
			localStorage.setItem(SESSION_KEY, id);
		}
		return id;
	} catch {
		return null;
	}
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

/** Record one actor search (src/components/scrolly/ActorSearch.svelte).
 * `chart` names which of the four searchable charts the reader was on, so the
 * same actor picked twice on two charts is two rows: what is being measured is
 * where the reader reached for the control, not just who they looked up. */
export function recordActorSearch({ actorId, chart }) {
	insert("actor_searches", { actor_id: actorId, chart });
}

/** Read both crowd histograms, both taker counts and — keyed by this browser's
 * session id — the reader's own two numbers (see supabase/quiz_results.sql for
 * the shape and for how each number is counted).
 *
 * The one function here that is awaited rather than fired and forgotten: the
 * caller renders from what comes back. Story data goes in as arguments, since
 * the database holds none of it. Returns null when there is no project
 * configured; throws on an RPC error, for the caller to log.
 */
export async function fetchQuizResults({ pairCount, sljActorId = null }) {
	if (!supabase) return null;
	const { data, error } = await supabase.rpc("quiz_results", {
		p_session_id: sessionId(false),
		p_pair_count: pairCount,
		p_slj_actor_id: sljActorId
	});
	if (error) throw error;
	return data;
}
