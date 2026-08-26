// Builds the scrolly framework's committed data (see notes/scrolly-framework.md):
//   src/data/scrolly-nodes.json — every actor dot the canvas ever renders
//   src/data/scrolly-story.json — non-dot story data (hop bands, race chart,
//     career lines, quiz pairs, Gen-Z simulation results)
// Deterministic — no RNG; byte-identical re-runs.
//
// Inputs come from the separate data-analysis repo, located via the
// ANALYSIS_REPO environment variable — this repo holds no data analysis. That
// repo's actor-metrics.sqlite is not distributed, so this script only runs on a
// machine with the full analysis checkout. The generated JSON is committed, so
// the app builds and deploys without any of it.
//
//   ANALYSIS_REPO=~/src/Personal/pudding-post npm run scrolly-data
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The analysis repo's location. Required and never guessed: a wrong or stale
 * path would silently rebuild the committed data from the wrong inputs.
 */
function analysisRepo() {
	const raw = process.env.ANALYSIS_REPO;
	if (!raw) {
		throw new Error(
			"build-scrolly-nodes: ANALYSIS_REPO is not set. Point it at the " +
				"data-analysis checkout, e.g.\n" +
				"  ANALYSIS_REPO=~/src/Personal/pudding-post npm run scrolly-data"
		);
	}
	const dir = path.resolve(
		raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw
	);
	if (!fs.existsSync(path.join(dir, "design/data"))) {
		throw new Error(
			`build-scrolly-nodes: ANALYSIS_REPO=${dir} has no design/data — ` +
				"not an analysis checkout?"
		);
	}
	return dir;
}

const sub = analysisRepo();
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const design = (f) => readJson(path.join(sub, "design/data", f));
const raw = (f) => readJson(path.join(sub, "data", f));
const rawCsv = (f) => {
	const [header, ...lines] = fs
		.readFileSync(path.join(sub, "data", f), "utf8")
		.trim()
		.split("\n")
		.map((line) => line.trimEnd());
	const cols = header.split(",");
	return lines.map((line) => {
		const cells = line.split(",");
		return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
	});
};

const intro = design("intro-bacon-network.json");
const hopTree = design("hop-tree-shared.json");
const top200 = design("closeness-ranking-top200.json");
const db = new DatabaseSync(path.join(sub, "data/actor-metrics.sqlite"), {
	readOnly: true
});

const KEVIN_BACON = 4724;
const KEVIN_BACON_RANK = 175;
// intro's 15 actors + the full shared hop tree ≈ 10k total: every reachable
// actor the shared tree knows, echoing the real bucket proportions (hop 2
// dwarfs the rest). Path2D (rgb, alpha) bucketing keeps this canvas-friendly.
const HOP_TARGETS = { 1: Infinity, 2: Infinity, 3: Infinity, 4: Infinity };

function assert(cond, message) {
	if (!cond) throw new Error(`build-scrolly-nodes: ${message}`);
}

const round4 = (v) => (v == null ? null : Math.round(v * 1e4) / 1e4);

const metricsStmt = db.prepare(
	"SELECT total_films, avg_distance, total_costars, reachable FROM actor_metrics WHERE person_id = ?"
);
// ordinal rank, ties broken by person_id (validated against the published
// top-200 leaderboard below)
const rankStmt = db.prepare(
	`SELECT COUNT(*) + 1 AS rank FROM actor_metrics
	 WHERE avg_distance < ? OR (avg_distance = ? AND person_id < ?)`
);

function lookupMetrics(pid, name) {
	const row = metricsStmt.get(pid);
	assert(row, `no metrics for ${name} (${pid})`);
	assert(
		row.total_films != null && row.avg_distance != null,
		`null metric for ${name} (${pid})`
	);
	const { rank } = rankStmt.get(row.avg_distance, row.avg_distance, pid);
	return {
		films: row.total_films,
		avgDistance: round4(row.avg_distance),
		rank
	};
}

// ranks derived from the sqlite must reproduce the published leaderboard
for (const entry of top200) {
	const { rank } = lookupMetrics(entry.person_id, entry.name);
	assert(
		rank === entry.rank,
		`derived rank ${rank} !== published ${entry.rank} for ${entry.name}`
	);
}

// hop distance from Kevin Bacon: the shared 10k tree first (same source as
// the network sample), then the KB-specific 10k tree for famous actors the
// shared slice misses; -1 = unknown, hidden in hop-coloured states
const hopByPid = new Map();
const kbTree = raw("hop-tree-kevin-bacon-10000.json");
for (const n of kbTree.nodes) hopByPid.set(n.person_id, n.hop);
hopTree.nodes.forEach((n, i) =>
	hopByPid.set(n.person_id, hopTree.centres[String(KEVIN_BACON)].hop[i])
);

// ---------------------------------------------------------------------------
// Block 1 (ids stable vs. previous builds): curated intro network + the
// hop-stratified network crowd.
// ---------------------------------------------------------------------------

// ids 0–14: the curated intro network, in spec (= reveal) order
assert(intro.anchorId === KEVIN_BACON, "intro anchor is not Kevin Bacon");
assert(intro.nodes[0].id === KEVIN_BACON, "intro node 0 is not the anchor");
const introPids = new Set(intro.nodes.map((n) => n.id));
const sample = intro.nodes.map((n) => {
	const treeHop = hopByPid.get(n.id);
	assert(
		treeHop === undefined || treeHop === n.hop,
		`intro hop ${n.hop} !== hop-tree hop ${treeHop} for ${n.name}`
	);
	return { pid: n.id, name: n.name, hop: n.hop };
});

// remaining ids: stratified by hop, best-connected first, ties by person_id
const sharedHop = new Map();
hopTree.nodes.forEach((n, i) =>
	sharedHop.set(n.person_id, hopTree.centres[String(KEVIN_BACON)].hop[i])
);
for (const [hop, target] of Object.entries(HOP_TARGETS)) {
	const stratum = hopTree.nodes
		.filter(
			(n) => sharedHop.get(n.person_id) === +hop && !introPids.has(n.person_id)
		)
		.sort((a, b) => b.degree - a.degree || a.person_id - b.person_id)
		.slice(0, target === Infinity ? undefined : target);
	for (const n of stratum) {
		sample.push({ pid: n.person_id, name: n.name, hop: +hop });
	}
}

// ---------------------------------------------------------------------------
// Block 2 (appended, sorted by pid): every actor the later chapters plot —
// the prediction-scatter cohort, quiz pairs, Gen-Z candidates, race-chart
// anchors and the career-line trio. Appending keeps block-1 ids stable.
// ---------------------------------------------------------------------------

const predictionPoints = design("prediction-scatter.json").points;
const quizSrc = design("distance-quiz.json");
const genzSrc = raw("genz-mc-knn-bootstrap.json");
// The race chart's cast: everyone who reached a year-end top 50 by avg distance
// between 1980 and 2025, plus every era anchor (analysis/export-yearly-top-n.py
// -> analysis/actor-trajectory.py). Not just the 15 crown-holders the era
// timeline collapses to, so the chart can show the field a centre was pulling
// away from rather than only the winners.
const raceSrc = design("actor-trajectory-race-cast.json");
// avg distance to the WHOLE giant component each year (top_n 0). A run with a
// target cap would put a different, incomparable metric on the same axis.
assert(
	raceSrc.top_n === 0,
	`race trajectories are top_n ${raceSrc.top_n}, not 0`
);
const RACE_CAST_SIZE = 224;
const timeMachine = raw("time-machine.json");
const trajectories = design("actor-trajectories.json");
const distanceFilms = design("distance-films-scatter.json").points;
// career-age cloud: every corpus actor's (career age, film count) — the
// background the Future chapter's career lines are drawn over. career_age =
// years since first corpus film (anchored to 2025).
const careerAgeByPid = new Map(
	design("career-age-scatter.json").points.map((p) => [
		p.person_id,
		p.career_age
	])
);

// ---------------------------------------------------------------------------
// Gender figures. Nothing on the canvas is coloured by gender — these guard the
// four claims the step prose makes, so a copy edit or an upstream data change
// cannot silently leave the numbers wrong. TMDB enum: 1 female, 2 male,
// 3 non-binary, 0 unset.
// ---------------------------------------------------------------------------

const FEMALE = 1;
const MALE = 2;
const genderByPid = new Map();
for (const f of [
	"female-anchor-gender.json",
	"top250-gender.json",
	"genz-mc-candidate-gender.json"
]) {
	for (const [pid, g] of Object.entries(raw(f).genders)) {
		genderByPid.set(Number(pid), g);
	}
}

// rankReveal: "only 16 of the top 100 most connected actors" are female, and
// "Nicole Kidman is the first female in at #21"
const top100 = top200.slice(0, 100);
assert(
	top100.every((e) => genderByPid.has(e.person_id)),
	"gender missing for some of the top 100"
);
const femalesInTop100 = top100.filter(
	(e) => genderByPid.get(e.person_id) === FEMALE
).length;
assert(femalesInTop100 === 16, `${femalesInTop100} females in top 100, not 16`);
const firstFemale = top200.find((e) => genderByPid.get(e.person_id) === FEMALE);
assert(
	firstFemale.name === "Nicole Kidman" && firstFemale.rank === 21,
	`first female is ${firstFemale.name} at #${firstFemale.rank}, not Nicole Kidman at #21`
);

// raceFull: "no female actor has ever been the center"
const anchorPids = [
	...new Set(timeMachine.anchor_timeline.eras.map((e) => e.person_id))
];
assert(
	anchorPids.every((pid) => genderByPid.get(pid) === MALE),
	"an era anchor is not male — the 'no female center' claim no longer holds"
);

// sljFan close: "65% of the wins going to women". The simulation output carries
// its own gender label per candidate, which is what the win share is weighted
// by, so this reads that rather than joining the files above.
{
	const cands = Object.values(genzSrc.candidates);
	const total = cands.reduce((sum, c) => sum + c.sim_win_pct, 0);
	const female = cands
		.filter((c) => c.gender === "female")
		.reduce((sum, c) => sum + c.sim_win_pct, 0);
	const pct = Math.round((100 * female) / total);
	assert(pct === 65, `female win share is ${pct}%, not the 65% the copy cites`);
}

const nameByPid = new Map(distanceFilms.map((p) => [p.person_id, p.name]));
const TRIO_PIDS = { sweeney: 115440, deniro: 380, chase: 54812 };
assert(
	nameByPid.get(TRIO_PIDS.sweeney) === "Sydney Sweeney" &&
		nameByPid.get(TRIO_PIDS.deniro) === "Robert De Niro" &&
		nameByPid.get(TRIO_PIDS.chase) === "Chevy Chase",
	"career-line trio pids drifted"
);

const wantedPids = new Set([
	...predictionPoints.map((p) => p.person_id),
	...quizSrc.pairs.flatMap((p) => p.options.map((o) => o.person_id)),
	...Object.values(genzSrc.candidates).map((c) => c.pid),
	...Object.values(raceSrc.actors).map((a) => a.person_id),
	...Object.values(TRIO_PIDS),
	477 // Julie Walters — highlighted on the distance scatter
]);
const already = new Set(sample.map((n) => n.pid));
const appended = [...wantedPids]
	.filter((pid) => !already.has(pid))
	.sort((a, b) => a - b);
for (const pid of appended) {
	const name =
		nameByPid.get(pid) ??
		db.prepare("SELECT name FROM actor_metrics WHERE person_id = ?").get(pid)
			?.name;
	assert(name, `no name for appended pid ${pid}`);
	sample.push({ pid, name, hop: hopByPid.get(pid) ?? -1 });
}

// ---------------------------------------------------------------------------
// Node rows: join sqlite metrics + scatter-chapter metrics onto every node.
// ---------------------------------------------------------------------------

const concByPid = new Map(
	design("concurrence-films-scatter.json").points.map((p) => [
		p.person_id,
		p.concurrence
	])
);
// Costar strength: mean log(films + 1) over an actor's 50 most prolific
// costars. Replaces the legacy top-50 *degree* metric, which ranked costars by
// connection count instead of films and which the analysis repo retired
// everywhere else. Full corpus, no film floor — the design scatter export it
// supersedes covered only ~4.7k actors above a 10-film threshold.
const top50ByPid = new Map(
	raw("costar-top50-log-films-full.json").map((r) => [
		r.pid,
		r.costar_top50_log_films
	])
);
// guards the units: log(films + 1) lands ~2-5, the retired log-degree ~7-8, so
// a silent swap back (or a raw film count) trips this rather than reaching the
// chart as an unreadable axis
{
	let n = 0;
	let max = -Infinity;
	for (const v of top50ByPid.values()) {
		if (v == null) continue;
		n += 1;
		if (v > max) max = v;
	}
	assert(
		n > 100000 && max < 6,
		`top50 is not a log-films metric (n=${n}, max=${max})`
	);
}
const predByPid = new Map(predictionPoints.map((p) => [p.person_id, p]));

const idByPid = new Map(sample.map((n, id) => [n.pid, id]));
const nodes = sample.map((n) => {
	const { films, avgDistance, rank } = lookupMetrics(n.pid, n.name);
	const pred = predByPid.get(n.pid);
	return [
		n.pid,
		n.name,
		n.hop,
		films,
		avgDistance,
		rank,
		round4(concByPid.get(n.pid) ?? null),
		round4(top50ByPid.get(n.pid) ?? null),
		round4(pred?.pred_film ?? null),
		round4(pred?.pred_film_conc ?? null),
		round4(pred?.pred_film_deg ?? null),
		round4(pred?.pred_all ?? null),
		careerAgeByPid.get(n.pid) ?? null
	];
});
assert(nodes[0][5] === KEVIN_BACON_RANK, `Kevin Bacon rank ${nodes[0][5]}`);
// the career-age cloud (col 12) must cover a real chunk of the sample, or the
// Future chapter's background cloud would be too sparse to read
const careerAgeCount = nodes.filter((r) => r[12] != null).length;
assert(
	careerAgeCount > 3000,
	`only ${careerAgeCount} nodes carry a career age`
);
const idOf = (pid) => {
	const id = idByPid.get(pid);
	assert(id !== undefined, `pid ${pid} missing from sample`);
	return id;
};
const SLJ = 2231;
assert(nodes[idOf(SLJ)][5] === 1, "SLJ is not rank 1");
// the reveal step names the podium: Dafoe #2, De Niro #3
for (const rank of [2, 3]) {
	const entry = top200.find((e) => e.rank === rank);
	assert(
		nodes[idOf(entry.person_id)][5] === rank,
		`${entry.name} should be rank ${rank} in the sample`
	);
}

// [sampleId, sampleId, film, year] — the film is the corpus title linking the
// pair, so step 1 can name a route to Bacon without the analysis graph DB
const edges = intro.edges.map(({ source, target, film, year }) => [
	idByPid.get(source),
	idByPid.get(target),
	film,
	year
]);
assert(
	edges.every(([s, t]) => s !== undefined && t !== undefined),
	"intro edge endpoint missing from sample"
);
assert(
	edges.every(([, , film]) => typeof film === "string" && film.length > 0),
	"intro edge missing its connecting film"
);
// the route step quotes this pair verbatim: Austin Butler → Emma Stone → Bacon
assert(
	edges.some(
		([s, t, film]) =>
			[s, t].every((id) => [idOf(86654), idOf(54693)].includes(id)) &&
			film === "Eddington"
	),
	"Austin Butler ↔ Emma Stone should be linked by Eddington"
);

const introXY = intro.nodes.map((n) => [n.x, n.y]);

// ---------------------------------------------------------------------------
// Story blob.
// ---------------------------------------------------------------------------

// hop bands: true corpus bucket totals must reproduce KB's avg distance
const bacon = metricsStmt.get(KEVIN_BACON);
const bucketTotals = kbTree.bucket_totals;
assert(
	bucketTotals["0"] === 1 && bucketTotals["1"] === bacon.total_costars,
	"bucket totals drifted from KB's costar count"
);
const buckets = [1, 2, 3, 4].map((h) => bucketTotals[String(h)]);
const reachable = buckets.reduce((s, v) => s + v, 0);
const weighted = buckets.reduce((s, v, i) => s + v * (i + 1), 0);
assert(reachable === bacon.reachable, "bucket totals !== KB reachable");
assert(
	round4(weighted / reachable) === bacon.avg_distance,
	`bucket-weighted avg ${weighted / reachable} !== ${bacon.avg_distance}`
);

// rank chapter's per-actor hop breakdown for the top 250 (mirrors the bacon
// bucket blob above, one row per actor instead of one row for Bacon)
const rankHopBands = {};
for (const row of rawCsv("top-250-hop-bands-with-hop-counts.csv")) {
	const id = idOf(Number(row.pid));
	assert(
		nodes[id][5] === Number(row.rank),
		`rank ${row.rank} !== derived ${nodes[id][5]} for ${row.name}`
	);
	assert(
		Math.abs(Number(row.avgDistance_diff)) < 1e-3,
		`hop counts don't reproduce avgDistance for ${row.name}`
	);
	rankHopBands[id] = [
		Number(row.hop1_count),
		Number(row.hop2_count),
		Number(row.hop3_count),
		Number(row.hop4_count)
	];
}

// quiz pairs, remapped to node ids; answers re-checked against the sqlite
const quiz = quizSrc.pairs.map(({ options, answer }) => {
	const [a, b] = options.map((o) => idOf(o.person_id));
	const better =
		nodes[a][4] < nodes[b][4] ? 0 : nodes[b][4] < nodes[a][4] ? 1 : -1;
	assert(better === answer, `quiz answer mismatch for ${options[0].name}`);
	return { a, b, answer };
});

// race chart: per-actor avg_distance by year + the era timeline annotations
const raceSeries = {};
for (const a of Object.values(raceSrc.actors)) {
	raceSeries[idOf(a.person_id)] = a.trajectory
		.filter((t) => t.in_giant && t.avg_distance != null)
		.map((t) => [t.year, round4(t.avg_distance)]);
}
const eras = timeMachine.anchor_timeline.eras.map((e) => ({
	id: idOf(e.person_id),
	start: e.started_movie.release_date.slice(0, 10),
	end: e.ended_movie ? e.ended_movie.release_date.slice(0, 10) : null
}));
assert(eras.at(-1).end === null, "last era should be open (SLJ now)");
assert(eras.at(-1).id === idOf(SLJ), "last era anchor should be SLJ");
assert(
	eras.every((e) => raceSeries[e.id]),
	"every era anchor needs a race series"
);
// the cast size is a story fact now (it is the field the chart draws), so a
// rebuild that changes it has to fail here rather than quietly redraw the chart
assert(
	Object.keys(raceSeries).length === RACE_CAST_SIZE,
	`${Object.keys(raceSeries).length} race series, not ${RACE_CAST_SIZE}`
);

// career lines: the named trio + a deterministic cohort spread for the
// "add more lines" beat (empirical trajectory table the simulation samples)
const trioAges = Object.fromEntries(
	Object.entries(trajectories).map(([k, series]) => [
		k,
		series.map((r) => [r.career_age, r.num_films])
	])
);
for (const k of Object.keys(TRIO_PIDS)) {
	const at15 = trajectories[k].find((r) => r.career_age === 15);
	assert(at15?.num_films === 16, `${k} is not at 16 films by career age 15`);
}
// cohort: the actual set of actors who — like the trio — reached 16 films by
// career age 15, each as a (career age, film count) trajectory. This is the
// prototype's own "add more lines" fan (cohort-16-at-15-trajectories.json),
// not a synthetic spread.
const cohortSrc = design("cohort-16-at-15-trajectories.json").actors;
const cohort = cohortSrc.map((a) =>
	a.trajectory
		.map((r) => [r.career_age, r.num_films])
		.sort((x, y) => x[0] - y[0])
);
assert(cohort.length >= 100, `cohort has only ${cohort.length} lines`);
assert(
	cohort.every((line) => line.length >= 2),
	"a cohort trajectory has fewer than 2 points"
);
// like the trio, every cohort actor hit 16 films by career age 15 — the
// trajectory only records ages where the count changed, so read the cumulative
// count at 15 as the last point on or before age 15
const filmsAtAge = (traj, age) => {
	let films = null;
	for (const r of traj) if (r.career_age <= age) films = r.num_films;
	return films;
};
assert(
	cohortSrc.every((a) => filmsAtAge(a.trajectory, 15) === 16),
	"a cohort actor is not at 16 films by career age 15"
);

// Gen-Z simulation (10k-run k-NN bootstrap — matches the storyboard's
// 25% / 10% / 10% podium)
const genzAll = Object.values(genzSrc.candidates).sort(
	(a, b) => b.sim_win_count - a.sim_win_count || a.pid - b.pid
);
const genz = genzAll.map((c) => ({
	id: idOf(c.pid),
	winPct: round4(c.sim_win_pct),
	films: c.current_films,
	careerAge: c.current_career_age,
	conc: round4(c.current_concurrence),
	top50: round4(c.current_top50_log_films),
	mad: round4(c.current_mad),
	projMedian: round4(c.projected_mad_median),
	projP10: round4(c.projected_mad_p10),
	projP90: round4(c.projected_mad_p90)
}));
// CGM is the Future chapter's protagonist — pulsed and labelled on
// scatterGenZ, and the top bar on winBars — so her leading the field is
// load-bearing. Her *share* is not: it falls as the candidate pool grows
// (24.65% over 32 candidates, 11.59% over 99), and no step cites a figure for
// it, so asserting a magnitude would only pin this build to one pool size.
assert(
	nodes[genz[0].id][1] === "Chloë Grace Moretz" &&
		genz[0].winPct > genz[1].winPct,
	`CGM should top the simulation, not ${nodes[genz[0].id][1]}`
);
// winBars' copy promises 10,000 runs
assert(
	genzSrc.n_sims === 10000,
	`simulation ran ${genzSrc.n_sims} times, but the copy says 10,000`
);
const lowestMad = [...genz].sort((a, b) => a.mad - b.mad)[0];
assert(
	lowestMad.id === genz[0].id,
	"CGM should also have the lowest current avg distance among Gen Z"
);
// Win-weighted mean of the winners' projected medians. NB: the storyboard
// quotes 2.24 as "the average winning score", but the per-sim winner scores
// were not persisted in genz-mc-knn-bootstrap.json, so that exact figure is
// not reproducible — this is the closest sourced statistic (2.33). The step
// copy should cite whichever number editorial settles on.
const avgWinningMad = round4(
	genzAll.reduce((s, c) => s + c.projected_mad_median * c.sim_win_count, 0) /
		genzAll.reduce((s, c) => s + c.sim_win_count, 0)
);
assert(
	avgWinningMad > 2.1 && avgWinningMad < 2.45,
	`winner-weighted projected MAD ${avgWinningMad} out of sane range`
);

// SLJ's own avg-distance trajectory by career age (Future chapter close)
const slj = raceSrc.actors[
	Object.keys(raceSrc.actors).find((k) => raceSrc.actors[k].person_id === SLJ)
].trajectory
	.filter((t) => t.in_giant && t.avg_distance != null)
	.map((t) => [t.career_year, round4(t.avg_distance)]);

// prediction-model correlation (Pearson r, over the prediction cohort)
function pearson(pairs) {
	const n = pairs.length;
	const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
	const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (const [x, y] of pairs) {
		sxy += (x - mx) * (y - my);
		sxx += (x - mx) ** 2;
		syy += (y - my) ** 2;
	}
	return sxy / Math.sqrt(sxx * syy);
}
const corr = Object.fromEntries(
	["pred_film", "pred_film_conc", "pred_film_deg", "pred_all"].map((k) => [
		{
			pred_film: "film",
			pred_film_conc: "filmConc",
			pred_film_deg: "filmDeg",
			pred_all: "all"
		}[k],
		round4(pearson(predictionPoints.map((p) => [p[k], p.actual])))
	])
);
assert(
	corr.film < corr.filmConc &&
		corr.film < corr.filmDeg &&
		corr.all >= corr.filmConc,
	"adding features should improve prediction correlation"
);

// ---------------------------------------------------------------------------
// Write.
// ---------------------------------------------------------------------------

const nodesOut = {
	anchorId: 0,
	introIds: intro.nodes.map((_, i) => i),
	// baked planar layout of the intro network, aligned with introIds
	introLayout: {
		w: 860,
		h: 680,
		xy: introXY
	},
	nodes,
	edges
};
const storyOut = {
	bacon: {
		buckets,
		reachable,
		avgDistance: bacon.avg_distance
	},
	corr,
	rankHopBands,
	quiz,
	eras,
	raceSeries,
	careers: { ...trioAges, cohort },
	genz: { nSims: genzSrc.n_sims, avgWinningMad, candidates: genz },
	slj
};

const nodesDest = path.join(root, "src/data/scrolly-nodes.json");
const storyDest = path.join(root, "src/data/scrolly-story.json");
fs.writeFileSync(nodesDest, JSON.stringify(nodesOut) + "\n");
fs.writeFileSync(storyDest, JSON.stringify(storyOut) + "\n");
db.close();

const counts = {};
for (const n of sample) counts[n.hop] = (counts[n.hop] ?? 0) + 1;
for (const [dest, label] of [
	[
		nodesDest,
		`${nodes.length} nodes (by hop: ${JSON.stringify(counts)}, ${careerAgeCount} with career age), ${edges.length} edges`
	],
	[
		storyDest,
		`race ${Object.keys(raceSeries).length} anchors, ${cohort.length} cohort lines, ${genz.length} Gen-Z candidates`
	]
]) {
	console.log(
		`wrote ${dest}: ${label}, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`
	);
}
