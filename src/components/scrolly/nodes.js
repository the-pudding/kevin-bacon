import data from "$data/scrolly-nodes.json";

export const NODE_COUNT = data.nodes.length;
export const EDGE_COUNT = data.edges.length;
export const ANCHOR_ID = data.anchorId;
/** ids of the curated intro network, in reveal order (anchor first) */
export const INTRO_IDS = data.introIds;
/** baked planar layout of the intro network — `xy` aligned with INTRO_IDS */
export const INTRO_LAYOUT = data.introLayout;

/**
 * The links as endpoint pairs, in the edge table's own order — `makeNodes`'s
 * edges without the film they come from. A module constant rather than
 * something a caller is handed, so a schedule keyed on the network's SHAPE
 * (`layouts/intro.js`'s reveal walk) can be struck once at load instead of
 * rebuilt per canvas, and its total length can be declared on the state that
 * plays it, before any layout has been built.
 * @type {[number, number][]}
 */
export const EDGE_PAIRS = data.edges.map(([source, target]) => [
	source,
	target
]);

/**
 * @typedef {Object} ActorNode
 * @property {number} id stable index into the attr array — never changes
 * @property {number} pid TMDB person_id
 * @property {string} name
 * @property {number} hop degrees of separation from the anchor, 0–4. Every
 *   actor in the corpus has one: the graph bottoms out at hop 4 (see
 *   tasks/build-scrolly-nodes.js), so no state has an unplaceable dot
 * @property {number} films
 * @property {number} avgDistance
 * @property {number} rank position in the full corpus sorted by avgDistance
 * @property {number|null} conc concurrence (share of costars already worked with)
 * @property {number|null} top50 mean log(films + 1) of the 50 most prolific costars
 * @property {number|null} predFilm predicted avgDistance from film count alone
 * @property {number|null} predFilmConc … + concurrence
 * @property {number|null} predFilmDeg … + top-50 costar degree
 * @property {number|null} predAll … all three features
 * @property {number|null} careerAge years since first corpus film (career
 *   chapter's background cloud x-position; null when unknown)
 *
 * @typedef {Object} Edge
 * @property {number} source node id
 * @property {number} target node id
 * @property {string} film the corpus film linking the pair (the latest one)
 * @property {number|null} year its release year
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
				predAll,
				careerAge
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
			predAll,
			careerAge
		})
	);
	const edges = data.edges.map(([source, target, film, year]) => ({
		source,
		target,
		film,
		year
	}));
	return { nodes, edges };
}

/**
 * The dot lattice's own nudge, in place of `hash01`. hash01 is a sine hash, so
 * stepping its input by a constant — which walking the lattice column by column
 * does — steps the sine's phase by a constant too. At the jitter width the
 * strip needs that period is plainly visible: the dots comb into a repeating
 * wave every few columns. An integer bit-mix (the lowbias32 finaliser) has no
 * such period, and nothing else in the story jitters hard enough to care.
 *
 * Exported for the highlight beat's spoke picker, which walks a candidate
 * counter by one per attempt and so hits exactly the periodicity above.
 * @param {number} key
 * @param {number} salt
 * @returns {number} 0–1
 */
export function dotHash(key, salt) {
	let h = (key ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
	h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
	h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
	return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
