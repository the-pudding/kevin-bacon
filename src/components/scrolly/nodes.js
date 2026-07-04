const SEED = 20260704;
const HOP_COUNTS = [1, 40, 350, 480, 129];

export const NODE_COUNT = HOP_COUNTS.reduce((sum, n) => sum + n, 0);

/**
 * @typedef {Object} ActorNode
 * @property {number} id stable index into the attr array — never changes
 * @property {number} hop degrees of separation from the anchor (0–4)
 * @property {number} films
 * @property {number} avgDistance
 * @property {number} rank position when sorted by avgDistance ascending
 *
 * @typedef {Object} Edge
 * @property {number} source node id
 * @property {number} target node id
 */

/**
 * Deterministic pseudo-random in [0, 1) — stable per (id, salt) across runs.
 * @param {number} id
 * @param {number} salt
 */
export function hash01(id, salt) {
	const x = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453;
	return x - Math.floor(x);
}

function mulberry32(seed) {
	let a = seed;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** @returns {{ nodes: ActorNode[], edges: Edge[] }} */
export function makeNodes() {
	const rand = mulberry32(SEED);
	const nodes = [];
	for (let hop = 0; hop < HOP_COUNTS.length; hop++) {
		for (let i = 0; i < HOP_COUNTS[hop]; i++) {
			const films = Math.max(1, Math.round(Math.exp(1 + rand() * 3.6)));
			const avgDistance =
				1.9 + hop * 0.18 - Math.log(films) * 0.09 + rand() * 0.35;
			nodes.push({ id: nodes.length, hop, films, avgDistance });
		}
	}
	nodes[0].films = 80;
	nodes[0].avgDistance = 2.28;

	const byDistance = [...nodes].sort((a, b) => a.avgDistance - b.avgDistance);
	byDistance.forEach((node, rank) => (node.rank = rank));

	const hop1 = nodes.filter((n) => n.hop === 1);
	const edges = hop1.map((n) => ({ source: 0, target: n.id }));
	for (const node of nodes) {
		if (node.hop === 2 && rand() < 0.45) {
			const parent = hop1[Math.floor(rand() * hop1.length)];
			edges.push({ source: parent.id, target: node.id });
		}
	}

	return { nodes, edges };
}
