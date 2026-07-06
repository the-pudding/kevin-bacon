// Builds the scrolly framework's committed data (see notes/scrolly-framework.md):
//   src/data/scrolly-nodes.json — every actor dot the canvas ever renders
//   src/data/scrolly-story.json — non-dot story data (hop bands, race chart,
//     career lines, quiz pairs, Gen-Z simulation results)
// Deterministic — no RNG; byte-identical re-runs.
//
// Inputs live in the references/pudding-post submodule; actor-metrics.sqlite
// is gitignored there, so this script only runs on machines with the
// submodule's data present. The generated JSON is committed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import * as d3 from "d3";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sub = path.join(root, "references/pudding-post");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const design = (f) => readJson(path.join(sub, "design/data", f));
const raw = (f) => readJson(path.join(sub, "data", f));

const intro = design("intro-bacon-network.json");
const hopTree = design("hop-tree-shared.json");
const top200 = design("closeness-ranking-top200.json");
const db = new DatabaseSync(path.join(sub, "data/actor-metrics.sqlite"), {
	readOnly: true
});

const KEVIN_BACON = 4724;
const KEVIN_BACON_RANK = 175;
// intro's 15 actors + these per-hop targets ≈ 1k total, echoing the real
// bucket proportions (hop 2 dwarfs the rest) while staying canvas-friendly
const HOP_TARGETS = { 1: Infinity, 2: 530, 3: 240, 4: Infinity };

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
const networkCount = sample.length;

// ---------------------------------------------------------------------------
// Block 2 (appended, sorted by pid): every actor the later chapters plot —
// the prediction-scatter cohort, quiz pairs, Gen-Z candidates, race-chart
// anchors and the career-line trio. Appending keeps block-1 ids stable.
// ---------------------------------------------------------------------------

const predictionPoints = design("prediction-scatter.json").points;
const quizSrc = design("distance-quiz.json");
const genzSrc = raw("genz-mc-knn-bootstrap.json");
const raceSrc = design("actor-trajectory-anchors.json");
const timeMachine = raw("time-machine.json");
const trajectories = design("actor-trajectories.json");
const distanceFilms = design("distance-films-scatter.json").points;

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
const degByPid = new Map(
	design("top50-degree-films-scatter.json").points.map((p) => [
		p.person_id,
		p.top50_log_degree
	])
);
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
		round4(degByPid.get(n.pid) ?? null),
		round4(pred?.pred_film ?? null),
		round4(pred?.pred_film_conc ?? null),
		round4(pred?.pred_film_deg ?? null),
		round4(pred?.pred_all ?? null)
	];
});
assert(nodes[0][5] === KEVIN_BACON_RANK, `Kevin Bacon rank ${nodes[0][5]}`);
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

const edges = intro.edges.map(({ source, target }) => [
	idByPid.get(source),
	idByPid.get(target)
]);
assert(
	edges.every(([s, t]) => s !== undefined && t !== undefined),
	"intro edge endpoint missing from sample"
);

// ---------------------------------------------------------------------------
// networkLayout: force-directed layout of every hop-mapped node, in the intro
// layout's coordinate space with the 15 intro actors pinned at their baked
// intro positions — so the `network` state reads as the intro graph growing/
// zooming out rather than nodes teleporting to fresh spots. Deterministic:
// d3-force's internal LCG, seeded positions, fixed tick count, no RNG.
// ---------------------------------------------------------------------------

const introXY = intro.nodes.map((n) => [n.x, n.y]);
const [anchorX, anchorY] = introXY[0];
// hop-ring radii calibrated to the intro layout (hop 1 ≈ 180, hop 2 ≈ 330
// units from Bacon), extrapolated outward so the crowd extends the same scale
const HOP_RING = [0, 180, 330, 480, 630];
// stable pseudo-random matching src/components/scrolly/nodes.js hash01
const hash01 = (id, salt) => {
	const x = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453;
	return x - Math.floor(x);
};

const treeIndexByPid = new Map(kbTree.nodes.map((n, i) => [n.person_id, i]));
const simNodes = sample.flatMap((n, id) =>
	n.hop >= 0 ? [{ id, hop: n.hop, pid: n.pid }] : []
);
const simById = new Map(simNodes.map((n) => [n.id, n]));
for (const n of simNodes) {
	if (n.id < intro.nodes.length) {
		[n.fx, n.fy] = introXY[n.id];
	} else {
		const angle = hash01(n.id, 1) * Math.PI * 2;
		const radius = HOP_RING[n.hop] * (0.7 + 0.6 * hash01(n.id, 2));
		n.x = anchorX + Math.cos(angle) * radius;
		n.y = anchorY + Math.sin(angle) * radius;
	}
}

// links: each node's nearest sampled ancestor along the KB spanning tree
let unlinked = 0;
const simLinks = [];
for (const n of simNodes) {
	if (n.id === 0) continue;
	let ti = treeIndexByPid.get(n.pid);
	let ancestor = null;
	while (ti != null && kbTree.nodes[ti].parent != null) {
		ti = kbTree.nodes[ti].parent;
		const aid = idByPid.get(kbTree.nodes[ti].person_id);
		if (aid !== undefined && simById.has(aid)) {
			ancestor = aid;
			break;
		}
	}
	if (ancestor == null && ti != null) ancestor = 0; // tree root = Bacon
	if (ancestor == null) {
		// most of the sample comes from the shared hop tree, which has no parent
		// links — those nodes are placed by the radial + charge forces alone
		unlinked++;
		continue;
	}
	simLinks.push({ source: n.id, target: ancestor });
}
assert(
	unlinked < simNodes.length / 2,
	`${unlinked} of ${simNodes.length} network nodes missing from the KB tree`
);

const sim = d3
	.forceSimulation(simNodes)
	.force(
		"link",
		d3
			.forceLink(simLinks)
			.id((n) => n.id)
			.distance(
				({ source, target }) =>
					Math.max(40, Math.abs(HOP_RING[source.hop] - HOP_RING[target.hop])) *
					(0.6 + 0.8 * hash01(source.id, 3))
			)
			.strength(0.25)
	)
	.force("charge", d3.forceManyBody().strength(-30))
	// per-node jittered target radius: keeps the hop strata loosely ordered
	// without collapsing each hop onto a clean ring (which reads as artifice)
	.force(
		"radial",
		d3
			.forceRadial(
				(n) => HOP_RING[n.hop] * (0.7 + 0.6 * hash01(n.id, 4)),
				anchorX,
				anchorY
			)
			.strength(0.12)
	)
	.force("collide", d3.forceCollide(4.5).iterations(2))
	.stop();
for (let i = 0; i < 400; i++) sim.tick();

const round1 = (v) => Math.round(v * 10) / 10;
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const n of simNodes) {
	minX = Math.min(minX, n.x);
	minY = Math.min(minY, n.y);
	maxX = Math.max(maxX, n.x);
	maxY = Math.max(maxY, n.y);
}
const networkXY = sample.map((_, id) => {
	const s = simById.get(id);
	return s ? [round1(s.x - minX), round1(s.y - minY)] : null;
});
assert(
	sample.every((n, id) => n.hop >= 0 === (networkXY[id] !== null)),
	"networkLayout coverage !== hop-mapped nodes"
);
const networkLayout = {
	w: round1(maxX - minX),
	h: round1(maxY - minY),
	xy: networkXY
};

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

// quiz pairs, remapped to node ids; answers re-checked against the sqlite
const quiz = quizSrc.pairs.map(({ options, answer }) => {
	const [a, b] = options.map((o) => idOf(o.person_id));
	const better =
		nodes[a][4] < nodes[b][4] ? 0 : nodes[b][4] < nodes[a][4] ? 1 : -1;
	assert(better === answer, `quiz answer mismatch for ${options[0].name}`);
	return { a, b, answer };
});

// race chart: per-anchor avg_distance by year + the era timeline annotations
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
const yearRows = raw("actor-year-rows.json");
const cols = Object.fromEntries(yearRows.columns.map((c, i) => [c, i]));
const seriesByPid = new Map();
for (const r of yearRows.rows) {
	const pid = r[cols.person_id];
	if (!seriesByPid.has(pid)) seriesByPid.set(pid, []);
	seriesByPid.get(pid).push([r[cols.career_age], r[cols.cumulative_films]]);
}
const cohortPids = [...seriesByPid.keys()]
	.filter((pid) => seriesByPid.get(pid).length >= 25)
	.sort((a, b) => a - b);
// every Nth pid: spread across the cohort without RNG
const COHORT_LINES = 40;
const step = Math.floor(cohortPids.length / COHORT_LINES);
const cohort = Array.from({ length: COHORT_LINES }, (_, i) =>
	seriesByPid.get(cohortPids[i * step]).sort((a, b) => a[0] - b[0])
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
	top50: round4(c.current_top50_log_deg),
	mad: round4(c.current_mad),
	projMedian: round4(c.projected_mad_median),
	projP10: round4(c.projected_mad_p10),
	projP90: round4(c.projected_mad_p90)
}));
assert(
	nodes[genz[0].id][1] === "Chloë Grace Moretz" && genz[0].winPct > 0.2,
	"CGM should top the simulation with ~25%"
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
	// force-directed layout of every hop-mapped node (null for hop -1), same
	// coordinate units as introLayout with the intro actors pinned in place
	networkLayout,
	networkCount,
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
		`${nodes.length} nodes (by hop: ${JSON.stringify(counts)}), ${edges.length} edges`
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
