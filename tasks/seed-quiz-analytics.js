// Dev-only: fill the Supabase quiz tables with a plausible crowd, so the
// credits' results histograms (src/components/results/QuizResults.svelte) have
// something to draw before real readers arrive.
//
//   SEED_ALLOW_REMOTE=1 npm run seed-analytics
//
// It authenticates with the ordinary publishable key and only ever INSERTs,
// which is exactly what the "anon insert only" policies in supabase/schema.sql
// permit. It must NOT be given the secret key.
//
// That also means it cannot clean up after itself. Every seeded session id is
// minted in a reserved namespace so the rows stay identifiable — to remove
// them, run this in the Supabase SQL editor (service role):
//
//   delete from rank_guesses    where session_id::text like '5eed0000-%';
//   delete from pair_quiz_picks where session_id::text like '5eed0000-%';
//
// Seeding is irreversible from here and permanently shifts every histogram the
// story will ever show, so a non-local project needs SEED_ALLOW_REMOTE=1 —
// the same "never guess, never silently do the destructive thing" discipline
// ANALYSIS_REPO gets in build-scrolly-nodes.js.
//
// Deliberately NOT deterministic: the point is a lifelike spread, and a fixed
// seed would make repeat runs pile identical shapes on top of each other.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
process.loadEnvFile(fileURLToPath(new URL(".env", root)));

const { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } = process.env;

const SESSION_PREFIX = "5eed0000-0000-4000-8000-";
const PAIR_COUNT = 5;
const CHUNK = 200;

// rank_guesses.actor_id holds the NODE INDEX into scrolly-nodes.json, which is
// what GuessRank hands recordRankGuess — not the tmdb id. Derived here for the
// same reason layout-shared.js derives SLJ with idOf(2231): the index moves
// whenever the data is rebuilt, and a hardcoded one would silently seed a
// different actor.
const nodes = JSON.parse(
	fs.readFileSync(fileURLToPath(new URL("src/data/scrolly-nodes.json", root)))
);
const SLJ_ACTOR_ID = nodes.nodes.findIndex((node) => node[0] === 2231);
if (SLJ_ACTOR_ID < 0)
	throw new Error("Samuel L. Jackson not found in scrolly-nodes.json");

// Per-pair success rates rather than one p: a single p gives a clean binomial,
// and real quiz scores are lumpier than that.
const PAIR_DIFFICULTY = [0.78, 0.55, 0.42, 0.68, 0.5];

// How many guesses a solver took, as relative weights. The tail past 5 is what
// fills the "5 or more" bucket — visible, without swamping the mode.
const GUESS_WEIGHTS = [
	[1, 28],
	[2, 22],
	[3, 16],
	[4, 11],
	[5, 8],
	[6, 5],
	[7, 4],
	[8, 3],
	[9, 2],
	[12, 1]
];

const SOLVE_RATE = 0.85;
const BASE_SESSIONS = 118;

/** Sessions planted with a known id and a known outcome, one per copy variant,
 * so every sentence can be read in the browser. The give-up session shows the
 * rank chart hidden: a give-up is not counted, so it has no rank result. */
const PLANTED = [
	{ id: 1, label: "fast solver", rank: { solved: 1 }, pairScore: 5 },
	{ id: 2, label: "gave up", rank: { gaveUp: true, wrong: 2 }, pairScore: 3 },
	{ id: 3, label: "4 of 5", rank: { solved: 3 }, pairScore: 4 },
	{ id: 4, label: "0 of 5", rank: { solved: 6 }, pairScore: 0 }
];

// -- helpers -----------------------------------------------------------------

let nextSession = PLANTED.length + 1;

/** A v4-shaped uuid in the reserved namespace, so the cleanup above catches it. */
function sessionId(n = nextSession++) {
	return SESSION_PREFIX + n.toString(16).padStart(12, "0");
}

function pick(weights) {
	const total = weights.reduce((sum, [, w]) => sum + w, 0);
	let roll = Math.random() * total;
	for (const [value, weight] of weights) {
		roll -= weight;
		if (roll <= 0) return value;
	}
	return weights.at(-1)[0];
}

/** An actor id that is not SLJ — the wrong guesses are never read back, they
 * only have to be distinct within a session. */
function wrongActor(used) {
	let id;
	do {
		id = 10000 + Math.floor(Math.random() * 2000);
	} while (id === SLJ_ACTOR_ID || used.has(id));
	used.add(id);
	return id;
}

/** A clock for one session: a random moment in the last 30 days, then a few
 * seconds per row.
 *
 * Every row gets an explicit created_at, and that matters more than it looks:
 * a batch insert would give every row in a session the same `default now()`,
 * so `distinct on … order by created_at, id` would break its tie on a random
 * uuid — and the duplicate-pair_index sessions seeded below to TEST that rule
 * would stop testing it. */
function clock() {
	let t = Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000;
	return () => {
		t += 2000 + Math.random() * 6000;
		return new Date(t).toISOString();
	};
}

// -- row builders ------------------------------------------------------------

const rankRows = [];
const pairRows = [];

/** one session's rank-guess rows, each a wrong guess unless said otherwise */
function rankSession(session_id) {
	const tick = clock();
	const used = new Set();
	const row = (fields) =>
		rankRows.push({ session_id, ...fields, created_at: tick() });
	const wrong = (actor_id = wrongActor(used)) =>
		row({ actor_id, gave_up: false, correct: false });
	return { row, wrong };
}

/** @param {{ solved?: number, gaveUp?: boolean, wrong?: number, repeat?: boolean, legacyNull?: boolean, unresolved?: number }} shape */
function seedRank(session_id, shape) {
	const session = rankSession(session_id);
	if (shape.unresolved) {
		// guessed, then wandered off: no correct row and no give-up, so the
		// function must drop this session entirely
		for (let i = 0; i < shape.unresolved; i++) session.wrong();
		return;
	}
	if (shape.gaveUp) {
		for (let i = 0; i < (shape.wrong ?? 0); i++) session.wrong();
		session.row({ actor_id: null, gave_up: true, correct: false });
		return;
	}
	seedSolved(session, shape);
}

/** a session that got there: `solved - 1` wrong guesses, then SLJ */
function seedSolved(session, shape) {
	const wrongIds = [];
	for (let i = 0; i < shape.solved - 1; i++) {
		const actor_id = wrongActor(new Set(wrongIds));
		wrongIds.push(actor_id);
		session.wrong(actor_id);
	}
	// re-picking an actor already guessed: the bucket must still count it once
	if (shape.repeat && wrongIds.length) session.wrong(wrongIds[0]);
	// legacyNull: a row from before the `correct` column existed, recoverable
	// only because the actor is SLJ
	session.row({
		actor_id: SLJ_ACTOR_ID,
		gave_up: false,
		correct: shape.legacyNull ? null : true
	});
}

/** @param {{ score?: number, answered?: number, duplicate?: boolean, legacyNull?: boolean }} shape */
function seedPairs(session_id, shape) {
	const tick = clock();
	const answered = shape.answered ?? PAIR_COUNT;
	const row = (fields) =>
		pairRows.push({ session_id, ...fields, created_at: tick() });

	// which pairs this session got right: a fixed score when one was asked for,
	// otherwise a roll against each pair's own difficulty
	let correctness;
	if (shape.score === undefined) {
		correctness = PAIR_DIFFICULTY.map((p) => Math.random() < p);
	} else {
		correctness = PAIR_DIFFICULTY.map((_, i) => i < shape.score);
	}

	for (let i = 0; i < answered; i++) {
		row({
			pair_index: i,
			picked_id: 10000 + i * 2,
			other_id: 10001 + i * 2,
			correct: shape.legacyNull && i === 0 ? null : correctness[i]
		});
	}
	// a reader who stepped back and answered again, after the flight had already
	// shown them the answer: the FIRST row must be the one that scores
	if (shape.duplicate) {
		row({
			pair_index: 0,
			picked_id: 10001,
			other_id: 10000,
			correct: !correctness[0]
		});
	}
}

// Edge cases, seeded on top of the base sessions so the function's filters are
// exercised rather than assumed. Each says what the histograms must do with
// the session.
const EDGE_CASES = [
	// partial quiz — absent from histogram B and from pairs.takers
	{ n: 6, seed: (i) => seedPairs(sessionId(), { answered: 2 + (i % 2) }) },
	// duplicate pair_index, later row flipped — first row wins
	{ n: 5, seed: () => seedPairs(sessionId(), { duplicate: true }) },
	// unscorable legacy pick — whole session drops out
	{ n: 3, seed: () => seedPairs(sessionId(), { legacyNull: true }) },
	// guessed, then gave up — not a data point, so excluded from rank.takers
	{ n: 3, seed: (i) => seedRank(sessionId(), { gaveUp: true, wrong: 2 + i }) },
	// same wrong actor twice before solving — counts once
	{ n: 3, seed: () => seedRank(sessionId(), { solved: 3, repeat: true }) },
	// never resolved — excluded from rank.takers
	{ n: 4, seed: () => seedRank(sessionId(), { unresolved: 2 }) },
	// pre-`correct` row, recovered from the actor id
	{ n: 2, seed: () => seedRank(sessionId(), { solved: 2, legacyNull: true }) }
];

function build() {
	for (const planted of PLANTED) {
		const id = sessionId(planted.id);
		seedRank(id, planted.rank);
		seedPairs(id, { score: planted.pairScore });
	}
	for (let i = 0; i < BASE_SESSIONS; i++) {
		const id = sessionId();
		if (Math.random() < SOLVE_RATE) {
			seedRank(id, { solved: pick(GUESS_WEIGHTS) });
		} else {
			seedRank(id, { gaveUp: true, wrong: Math.floor(Math.random() * 4) });
		}
		seedPairs(id, {});
	}
	for (const { n, seed } of EDGE_CASES) {
		for (let i = 0; i < n; i++) seed(i);
	}
}

// -- run ---------------------------------------------------------------------

async function insertAll(supabase, table, rows) {
	for (let i = 0; i < rows.length; i += CHUNK) {
		const { error } = await supabase
			.from(table)
			.insert(rows.slice(i, i + CHUNK));
		if (error) throw new Error(`${table} insert failed: ${error.message}`);
	}
	console.log(`  ${table}: ${rows.length} rows`);
}

async function main() {
	if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
		throw new Error(
			"PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY missing from .env"
		);
	}

	const isLocal = /localhost|127\.0\.0\.1/.test(PUBLIC_SUPABASE_URL);
	if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
		throw new Error(
			"refusing to seed a non-local Supabase project: these rows cannot be " +
				"removed with the publishable key and they shift every histogram the " +
				"story shows.\nRe-run with SEED_ALLOW_REMOTE=1 if that is what you want."
		);
	}

	build();

	const supabase = createClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_PUBLISHABLE_KEY
	);
	console.log("seeding:");
	await insertAll(supabase, "rank_guesses", rankRows);
	await insertAll(supabase, "pair_quiz_picks", pairRows);

	console.log("\nplanted sessions — paste one into devtools and reload:");
	for (const planted of PLANTED) {
		console.log(
			`  ${planted.label.padEnd(12)} localStorage.setItem("kb-session-id", "${sessionId(planted.id)}")`
		);
	}
	console.log(
		`\nto undo, in the Supabase SQL editor:\n` +
			`  delete from rank_guesses    where session_id::text like '${SESSION_PREFIX.slice(0, 9)}%';\n` +
			`  delete from pair_quiz_picks where session_id::text like '${SESSION_PREFIX.slice(0, 9)}%';`
	);
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
