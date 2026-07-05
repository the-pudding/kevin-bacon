import data from "$data/scrolly-nodes.json";

export const NODE_COUNT = data.nodes.length;
export const EDGE_COUNT = data.edges.length;
export const ANCHOR_ID = data.anchorId;
/** ids of the curated intro network, in reveal order (anchor first) */
export const INTRO_IDS = data.introIds;
/** baked planar layout of the intro network — `xy` aligned with INTRO_IDS */
export const INTRO_LAYOUT = data.introLayout;
/**
 * ids < NETWORK_COUNT are the hop-stratified network-chapter sample; ids from
 * NETWORK_COUNT up are appended actors the later chapters plot (prediction
 * cohort, quiz pairs, Gen-Z candidates, race anchors…).
 */
export const NETWORK_COUNT = data.networkCount;

/**
 * @typedef {Object} ActorNode
 * @property {number} id stable index into the attr array — never changes
 * @property {number} pid TMDB person_id
 * @property {string} name
 * @property {number} hop degrees of separation from the anchor (0–4; -1 =
 *   unknown, hide in hop-coloured states)
 * @property {number} films
 * @property {number} avgDistance
 * @property {number} rank position in the full corpus sorted by avgDistance
 * @property {number|null} conc concurrence (share of costars already worked with)
 * @property {number|null} top50 log mean degree of top-50 costars
 * @property {number|null} predFilm predicted avgDistance from film count alone
 * @property {number|null} predFilmConc … + concurrence
 * @property {number|null} predFilmDeg … + top-50 costar degree
 * @property {number|null} predAll … all three features
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

/**
 * Decodes the sample built by `npm run scrolly-data` (tasks/build-scrolly-nodes.js).
 * @returns {{ nodes: ActorNode[], edges: Edge[] }}
 */
export function makeNodes() {
	const nodes = data.nodes.map(
		(
			[
				pid,
				name,
				hop,
				films,
				avgDistance,
				rank,
				conc,
				top50,
				predFilm,
				predFilmConc,
				predFilmDeg,
				predAll
			],
			id
		) => ({
			id,
			pid,
			name,
			hop,
			films,
			avgDistance,
			rank,
			conc,
			top50,
			predFilm,
			predFilmConc,
			predFilmDeg,
			predAll
		})
	);
	const edges = data.edges.map(([source, target]) => ({ source, target }));
	return { nodes, edges };
}
