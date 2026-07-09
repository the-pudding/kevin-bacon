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
// networkLayout: a build-time d3-force graph layout of the full 10k corpus.
// Structure comes from the real costar edges (top10000-edges.json, capped to
// each node's top-K by shared-film count) fed to forceLink, so connected actors
// pull into genre/era communities; charge + collision keep dots apart and a
// weak centring spring bounds the graph — an organic core-plus-filaments shape,
// not a disc. The 10k beeswarm (saved-layout-x.json) is only the SEED. A second
// pull-in pass then drags the sprawl (the spatial islands: filaments + detached
// clumps) toward the core so the whole mass reads tight, holding the core and
// pinned intro actors fixed. The 15 intro actors are pinned (fx/fy) in their
// networkIntro burst arrangement, off-centre, so they hold a recognisable
// constellation and Bacon stays off-centre (the chapter's point) while the ~10k
// crowd settles around them. Dots all render one size — no per-node radius is
// baked. Every 10k actor not already sampled is appended as a minimal "crowd"
// row (hop -1 → appears only in `network`, never in the hop chapter). Deterministic:
// seeded positions, fixed tick counts, d3-force's internal LCG, no RNG.
// ---------------------------------------------------------------------------

const introXY = intro.nodes.map((n) => [n.x, n.y]);
const round1 = (v) => Math.round(v * 10) / 10;

const savedLayout = raw("layout/saved-layout-x.json").actors;
const savedByPid = new Map(savedLayout.map((a) => [a.person_id, a]));
assert(savedByPid.get(KEVIN_BACON), "Kevin Bacon missing from saved layout");

// crowd: every 10k actor not already in the sample, appended pid-sorted so
// block-1/2 ids stay stable. Minimal rows — background dots carry no metrics.
const richCount = nodes.length;
const crowdPids = savedLayout
	.map((a) => a.person_id)
	.filter((pid) => !idByPid.has(pid))
	.sort((a, b) => a - b);
for (const pid of crowdPids) {
	sample.push({ pid, name: "", hop: -1 });
	nodes.push([pid, "", -1]);
}
const networkCount = richCount;

const introCount = intro.nodes.length;

// real costar edges → forceLink links, capped to each node's top-K by weight
// (shared-film count) so the ~1.09M-edge corpus stays tractable. Edge endpoints
// are skeleton array indices; join to our node ids by person_id.
const NETWORK_EDGE_CAP = 8;
const skeleton = raw("layout/01-skeleton-top10000.json").actors;
const edgeCorpus = raw("layout/top10000-edges.json").links;
const idByPidFull = new Map(nodes.map((row, id) => [row[0], id]));
const incident = new Map();
for (const [i, j, w] of edgeCorpus) {
	const a = idByPidFull.get(skeleton[i].person_id);
	const b = idByPidFull.get(skeleton[j].person_id);
	if (a === undefined || b === undefined) continue;
	(incident.get(a) ?? incident.set(a, []).get(a)).push([b, w]);
	(incident.get(b) ?? incident.set(b, []).get(b)).push([a, w]);
}
const linkKeys = new Set();
for (const [id, list] of incident) {
	list.sort((x, y) => y[1] - x[1] || x[0] - y[0]);
	for (const [other] of list.slice(0, NETWORK_EDGE_CAP)) {
		linkKeys.add(id < other ? `${id}_${other}` : `${other}_${id}`);
	}
}

// force-directed layout: costar links pull connected actors together into
// genre/era communities, charge + collision keep dots apart, a weak spring to
// the centre bounds the graph without flattening its structure. Seeded from the
// beeswarm; the 15 intro actors are pinned in their networkIntro burst
// arrangement, off-centre, so they stay a recognisable constellation and Bacon
// lands away from the middle. Deterministic: seeded positions, fixed ticks.
const NETWORK_CHARGE = -18;
const NETWORK_LINK_D = 18;
const NETWORK_LINK_STRENGTH = 0.35;
const NETWORK_COLLIDE = 2.4;
const NETWORK_CENTER = 0.015;
const NETWORK_TICKS = 300;
// pull-in pass: island spring strength toward the core centroid + its ticks,
// plus an island-only charge that de-blobs the tight costar cliques (the core
// is pinned, so this repulsion spreads island clumps without disturbing it)
const NETWORK_PULL = 0.05;
const NETWORK_PULL_TICKS = 160;
const NETWORK_PULL_CHARGE = -6;

// crowd seed = beeswarm positions (null for later-chapter actors outside 10k)
const crowdSeed = nodes.map((row, id) =>
	id < introCount ? null : (savedByPid.get(row[0]) ?? null)
);
const positioned = crowdSeed.filter(Boolean);
const cx = positioned.reduce((a, s) => a + s.x, 0) / positioned.length;
const cy = positioned.reduce((a, s) => a + s.y, 0) / positioned.length;

const INTRO_BURST_SCALE = 0.35;
const INTRO_BURST_OFFSET = [-260, -560]; // from the crowd centre, up and left
const baconIntro = introXY[0];
const introSeed = (id) => [
	cx +
		INTRO_BURST_OFFSET[0] +
		(introXY[id][0] - baconIntro[0]) * INTRO_BURST_SCALE,
	cy +
		INTRO_BURST_OFFSET[1] +
		(introXY[id][1] - baconIntro[1]) * INTRO_BURST_SCALE
];

const seed = nodes.map((_, id) => {
	if (id < introCount) return introSeed(id);
	const s = crowdSeed[id];
	return s ? [s.x, s.y] : null;
});
const simNodes = seed.flatMap((p, id) => (p ? [{ id, x: p[0], y: p[1] }] : []));
for (const n of simNodes) {
	if (n.id < introCount) {
		n.fx = n.x;
		n.fy = n.y;
	}
}
const simIds = new Set(simNodes.map((n) => n.id));
const linkPairs = [...linkKeys]
	.map((k) => k.split("_").map(Number))
	.filter(([s, t]) => simIds.has(s) && simIds.has(t));

const sim = d3
	.forceSimulation(simNodes)
	.force(
		"link",
		d3
			.forceLink(linkPairs.map(([source, target]) => ({ source, target })))
			.id((n) => n.id)
			.distance(NETWORK_LINK_D)
			.strength(NETWORK_LINK_STRENGTH)
	)
	.force("charge", d3.forceManyBody().strength(NETWORK_CHARGE))
	.force("collide", d3.forceCollide(NETWORK_COLLIDE))
	.force("x", d3.forceX(cx).strength(NETWORK_CENTER))
	.force("y", d3.forceY(cy).strength(NETWORK_CENTER))
	.stop();
for (let i = 0; i < NETWORK_TICKS; i++) sim.tick();

const relaxed = new Map(simNodes.map((n) => [n.id, n]));

// spatial islands = everything that isn't part of the dense central mass. Bin
// the settled layout into a grid; a cell is "core-dense" if it holds at least
// ISLAND_MIN nodes. The core is the giant 8-connected blob of core-dense cells
// (plus cells directly touching it, so the mass's fuzzy edge isn't clipped).
// Any node outside that is an island: far clumps (dense but detached) and the
// thin filaments/strays alike (sparse cells). Tunables: ISLAND_CELL (grid
// scale), ISLAND_MIN (density that counts as "the mass").
const ISLAND_CELL = 55;
const ISLAND_MIN = 6;
const cellKey = (n) =>
	`${Math.floor(n.x / ISLAND_CELL)}_${Math.floor(n.y / ISLAND_CELL)}`;
const cellNodes = new Map();
for (const n of simNodes) {
	const k = cellKey(n);
	(cellNodes.get(k) ?? cellNodes.set(k, []).get(k)).push(n.id);
}
const neighbours = (k) => {
	const [gx, gy] = k.split("_").map(Number);
	const out = [];
	for (let dx = -1; dx <= 1; dx++) {
		for (let dy = -1; dy <= 1; dy++) {
			if (dx || dy) out.push(`${gx + dx}_${gy + dy}`);
		}
	}
	return out;
};
const dense = new Set(
	[...cellNodes].filter(([, ids]) => ids.length >= ISLAND_MIN).map(([k]) => k)
);
const denseComp = new Map();
const compNodeCount = [];
for (const k of dense) {
	if (denseComp.has(k)) continue;
	const cid = compNodeCount.length;
	let count = 0;
	const stack = [k];
	denseComp.set(k, cid);
	while (stack.length) {
		const cur = stack.pop();
		count += cellNodes.get(cur).length;
		for (const nk of neighbours(cur)) {
			if (dense.has(nk) && !denseComp.has(nk)) {
				denseComp.set(nk, cid);
				stack.push(nk);
			}
		}
	}
	compNodeCount.push(count);
}
const giantCell = compNodeCount.indexOf(Math.max(...compNodeCount));
const coreCells = new Set(
	[...denseComp].filter(([, cid]) => cid === giantCell).map(([k]) => k)
);
const isCore = (k) =>
	coreCells.has(k) || neighbours(k).some((nk) => coreCells.has(nk));
const islandIds = simNodes.filter((n) => !isCore(cellKey(n))).map((n) => n.id);
console.log(
	`spatial islands: ${islandIds.length} of ${simNodes.length} (core ${Math.max(...compNodeCount)})`
);

// pull-in pass: drag the island sprawl (filaments + detached clumps) toward the
// core so the whole mass reads tight, without disturbing the core's organic
// structure. The core + pinned intro nodes are held fixed (fx/fy); islands get
// a spring to the core centroid, keep their costar links (connected filaments
// retract along real edges), and collide (pack into gaps, not stacks). Islands
// with no path to the core over the capped link set are first wired to their
// strongest real costar in the core, so links pull them in too. Deterministic:
// seeded from the settled layout, fixed ticks, d3's internal LCG, no RNG.
const islandSet = new Set(islandIds);
const coreNodes = simNodes.filter((n) => !islandSet.has(n.id));
const coreCx = coreNodes.reduce((a, n) => a + n.x, 0) / coreNodes.length;
const coreCy = coreNodes.reduce((a, n) => a + n.y, 0) / coreNodes.length;

// graph components over the capped link set; the largest is the core component
const adj = new Map();
for (const [s, t] of linkPairs) {
	(adj.get(s) ?? adj.set(s, []).get(s)).push(t);
	(adj.get(t) ?? adj.set(t, []).get(t)).push(s);
}
const compOf = new Map();
let comp = 0;
for (const n of simNodes) {
	if (compOf.has(n.id)) continue;
	const cid = comp++;
	const stack = [n.id];
	compOf.set(n.id, cid);
	while (stack.length) {
		for (const nb of adj.get(stack.pop()) ?? []) {
			if (!compOf.has(nb)) {
				compOf.set(nb, cid);
				stack.push(nb);
			}
		}
	}
}
const compSize = new Map();
for (const cid of compOf.values())
	compSize.set(cid, (compSize.get(cid) ?? 0) + 1);
const coreComp = [...compSize].sort((a, b) => b[1] - a[1])[0][0];
// severed islands (own component): reconnect each to its strongest core costar
const extraLinks = [];
for (const n of simNodes) {
	if (compOf.get(n.id) === coreComp) continue;
	const costar = (incident.get(n.id) ?? []).find(
		([other]) => compOf.get(other) === coreComp
	);
	if (costar) extraLinks.push({ source: n.id, target: costar[0] });
}
console.log(`reconnected ${extraLinks.length} severed islands to the core`);

for (const n of simNodes) {
	if (!islandSet.has(n.id) || n.id < introCount) {
		n.fx = n.x;
		n.fy = n.y;
	}
}
const pull = d3
	.forceSimulation(simNodes)
	.force(
		"link",
		d3
			.forceLink([
				...linkPairs.map(([source, target]) => ({ source, target })),
				...extraLinks
			])
			.id((n) => n.id)
			.distance(NETWORK_LINK_D)
			.strength(NETWORK_LINK_STRENGTH)
	)
	.force("collide", d3.forceCollide(NETWORK_COLLIDE))
	.force(
		"charge",
		d3
			.forceManyBody()
			.strength((n) => (islandSet.has(n.id) ? NETWORK_PULL_CHARGE : 0))
	)
	.force(
		"x",
		d3.forceX(coreCx).strength((n) => (islandSet.has(n.id) ? NETWORK_PULL : 0))
	)
	.force(
		"y",
		d3.forceY(coreCy).strength((n) => (islandSet.has(n.id) ? NETWORK_PULL : 0))
	)
	.stop();
for (let i = 0; i < NETWORK_PULL_TICKS; i++) pull.tick();

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

// xy[id] = [x, y] in translated relaxed units (min → 0), or null for the ~600
// later-chapter actors outside the 10k corpus (hidden in `network`, shown in
// their own chapters)
const networkXY = nodes.map((_, id) => {
	const n = relaxed.get(id);
	return n ? [round1(n.x - minX), round1(n.y - minY)] : null;
});
assert(
	Array.from({ length: introCount }, (_, id) => id).every(
		(id) => networkXY[id] !== null
	),
	"every intro actor needs a network position"
);
assert(networkXY.length === nodes.length, "networkXY not aligned with nodes");
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
	// the reused 10k prototype layout: xy[id] = [x, y, radius] in translated
	// saved-layout units (null where an actor is outside the 10k corpus)
	networkLayout,
	// nodes with id < networkCount carry full metrics (intro + hop sample +
	// later-chapter cohort); ids from networkCount up are minimal crowd rows
	// that exist only for the `network` map
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
