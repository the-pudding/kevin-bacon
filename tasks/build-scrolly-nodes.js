// Builds src/data/scrolly-nodes.json: the ~1k-actor sample rendered by the
// scrolly framework (see notes/scrolly-framework.md). Deterministic — no RNG.
//
// Inputs live in the references/pudding-post submodule; actor-metrics.sqlite
// is gitignored there, so this script only runs on machines with the
// submodule's data present. The generated JSON is committed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sub = path.join(root, "references/pudding-post");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const intro = readJson(path.join(sub, "design/data/intro-bacon-network.json"));
const hopTree = readJson(path.join(sub, "design/data/hop-tree-shared.json"));
const top200 = readJson(
	path.join(sub, "design/data/closeness-ranking-top200.json")
);
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

const metricsStmt = db.prepare(
	"SELECT total_films, avg_distance FROM actor_metrics WHERE person_id = ?"
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
		avgDistance: Math.round(row.avg_distance * 1e4) / 1e4,
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

const hopByPid = new Map();
hopTree.nodes.forEach((n, i) =>
	hopByPid.set(n.person_id, hopTree.centres[String(KEVIN_BACON)].hop[i])
);

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
for (const [hop, target] of Object.entries(HOP_TARGETS)) {
	const stratum = hopTree.nodes
		.filter(
			(n) => hopByPid.get(n.person_id) === +hop && !introPids.has(n.person_id)
		)
		.sort((a, b) => b.degree - a.degree || a.person_id - b.person_id)
		.slice(0, target === Infinity ? undefined : target);
	for (const n of stratum) {
		sample.push({ pid: n.person_id, name: n.name, hop: +hop });
	}
}

const idByPid = new Map(sample.map((n, id) => [n.pid, id]));
const nodes = sample.map((n) => {
	const { films, avgDistance, rank } = lookupMetrics(n.pid, n.name);
	return [n.pid, n.name, n.hop, films, avgDistance, rank];
});
assert(nodes[0][5] === KEVIN_BACON_RANK, `Kevin Bacon rank ${nodes[0][5]}`);

const edges = intro.edges.map(({ source, target }) => [
	idByPid.get(source),
	idByPid.get(target)
]);
assert(
	edges.every(([s, t]) => s !== undefined && t !== undefined),
	"intro edge endpoint missing from sample"
);

const out = {
	anchorId: 0,
	introIds: intro.nodes.map((_, i) => i),
	// baked planar layout of the intro network, aligned with introIds
	introLayout: {
		w: 860,
		h: 680,
		xy: intro.nodes.map((n) => [n.x, n.y])
	},
	nodes,
	edges
};
const dest = path.join(root, "src/data/scrolly-nodes.json");
fs.writeFileSync(dest, JSON.stringify(out) + "\n");
db.close();

const counts = {};
for (const n of sample) counts[n.hop] = (counts[n.hop] ?? 0) + 1;
console.log(
	`wrote ${dest}: ${nodes.length} nodes (by hop: ${JSON.stringify(counts)}), ` +
		`${edges.length} edges, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`
);
