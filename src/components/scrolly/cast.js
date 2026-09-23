// Who is who: the named actors the story picks out, the ranked order over the
// sample, and the casts each chart draws — the race actors, the simulation's
// contenders, the Gen-Z backdrop, the seven the story names, and the crowd the
// sky flies. One list per cast, so "the same actors" is true by construction
// rather than by two lists agreeing.
import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";
import { INTRO_IDS } from "./nodes.js";

const ID_BY_PID = new Map(rawNodes.nodes.map((n, id) => [n[0], id]));

export const idOf = (pid) => {
	const id = ID_BY_PID.get(pid);
	if (id === undefined) throw new Error(`scrolly states: unknown pid ${pid}`);
	return id;
};

export const SLJ = idOf(2231);

export const HANKS = idOf(31);

export const STREEP = idOf(5064);

export const DENIRO = idOf(380);

export const HACKMAN = idOf(193);

export const MIRREN = idOf(15735);

export const CAGE = idOf(2963);

export const OLDMAN = idOf(64);

export const KIDMAN = idOf(2227);

export const SARANDON = idOf(4038);

export const DAFOE = idOf(5293);

export const STARR = idOf(5170);

export const CGM = story.genz.candidates[0].id;

export const SWEENEY = idOf(115440);

export const CHASE = idOf(54812);

export const FREEMAN = idOf(192);

export const JOHANSSON = idOf(1245);

/**
 * The actors step 6's hop chart anchors on, in the order it cycles them.
 *
 * Bacon is deliberately NOT among them. The step arrives resting on him — the
 * anchor its neighbours use, so the arrival moves the rows and nothing else
 * (`resetHopAnchor`) — and the first turn has to be a change, or the chart would
 * sit on its own resting frame for a beat past the one the reader already read.
 * That also makes the loop say what the step says: once it has left Bacon it
 * never goes back to him.
 *
 * Every member must have a `story.rankHopBands` row — true of everyone in
 * `search.js`'s `SEARCH_POOL` by construction (see
 * tasks/build-scrolly-nodes.js); `registry.spec.js` asserts that and the
 * absence of Bacon, because an actor without a row has no breakdown to draw
 * and the layout would divide by nothing — several seconds after any press,
 * on a timer.
 */
export const HOP_CYCLE_IDS = [FREEMAN, STREEP, JOHANSSON];

// ranked order over the sample (ranks are corpus-global and sparse — plot by
// sampled order, never raw rank; see notes/scrolly-framework.md)
export const BY_RANK = rawNodes.nodes
	.map((n, id) => ({ id, rank: n[5] }))
	.sort((a, b) => a.rank - b.rank);

export const ORDER_OF = new Map(BY_RANK.map((n, i) => [n.id, i]));

// how many top-ranked actors RankBars renders — shared with the rank-guess
// search so a search result is never outside the visible/scrollable list
export const RANK_TOP_N = 250;

/** one line per contender, in win order */
export const SIM_SERIES = story.genz.candidates.map((c) => c.id);

/** how many of the leaders carry a name beside their dot. Every line is the same
 * grey (see TRAIL_META), so a name is what makes a line followable — and 99
 * names down one edge is a wall of text rather than a legend. */
export const SIM_LABEL_N = 5;

/** the contenders whose line carries their name */
export const SIM_LABEL_IDS = SIM_SERIES.slice(0, SIM_LABEL_N);

/**
 * The Gen-Z race step's backdrop: a stratified sample of working actors spread
 * across the remoteness the contenders live on, so the camera's pan down lands
 * on a populated plot instead of an empty one. Built in the analysis repo and
 * already stripped of anyone another cast draws (see build-scrolly-nodes.js) —
 * the chart's one-writer-per-node rule means this list and RACE_IDS/SIM_SERIES
 * are disjoint by construction.
 *
 * Sorted, unlike SIM_SERIES: there is no rank among them and nothing labels one,
 * so the only thing an order has to be is stable.
 *
 * Named BACKDROP rather than FIELD because this file already owns a FIELD_*
 * vocabulary for something else entirely — the pull-back crowd (FIELD_IDS below,
 * fieldSpot, FIELD_ALPHA), the hop 1-4 actors hopSeed flies and hopBands
 * sorts. Two unrelated "fields" on one chart module is the kind of collision that
 * reads fine until someone imports the wrong one.
 */
export const BACKDROP_IDS = Object.keys(story.backdropSeries)
	.map(Number)
	.sort((a, b) => a - b);

/**
 * The seven Gen-Z contenders the story picks out by name — the five likeliest
 * winners plus two from the remote end of the field, so the cloud reads as a
 * range rather than a shortlist.
 *
 * Declared here rather than in either chart because BOTH draw them: the films
 * scatter (`layouts/scatters.js`, where each also carries a hand-tuned label
 * side) and the race chart's Gen-Z step (`layouts/race.js`, where every name
 * sits to the right of its dot like every other race label). One list is what
 * makes "the same seven" true by construction instead of by two lists agreeing.
 *
 * Keyed by TMDB id deliberately, NOT by position in the win-sorted field: a
 * rebuild that reorders the candidates should throw in `idOf` rather than
 * silently rename the people the story is about.
 */
export const GENZ_NAMED_IDS = [
	idOf(56734), // Chloë Grace Moretz
	idOf(1767250), // Ariana Greenblatt
	idOf(1903874), // Maya Hawke
	idOf(1428070), // Isabela Merced
	idOf(2099497), // Fred Hechinger
	idOf(1590797), // Sadie Sink
	idOf(2034418) // Jacob Elordi
];

export const RACE_IDS = Object.keys(story.raceSeries)
	.map(Number)
	.sort((a, b) => a - b);

/**
 * The crowd that arrives as the camera pulls back: every actor at hop 1–4 — the
 * exact set hopBands is about to sort into rows, so the bands sort the crowd the
 * reader just met rather than swapping it for a bigger one.
 *
 * Hop 4 is where the corpus bottoms out, so this is the whole corpus bar the
 * fifteen: the galaxy and the films scatters draw the SAME actors, and crossing
 * between them is one crowd travelling rather than two casts trading places. It
 * used to be two thirds of that, because an actor the hop-tree sample missed was
 * written with no hop and this bound excluded them — see the hop note in
 * tasks/build-scrolly-nodes.js.
 *
 * The intro fifteen are excluded: they are drawn by the constellation writer,
 * and including them would drag them out of the graph into the field.
 */
const INTRO_SET = new Set(INTRO_IDS);

export const FIELD_IDS = rawNodes.nodes.reduce(
	(ids, n, id) =>
		n[2] >= 1 && n[2] <= 4 && !INTRO_SET.has(id) ? (ids.push(id), ids) : ids,
	/** @type {number[]} */ ([])
);

/**
 * Everyone who flies when the sky flies: the crowd plus the intro fifteen.
 *
 * The state where the constellation has stopped being a diagram — the camera's
 * landed pull-back (`hopSeed`) — draws the fifteen as sky and hand them to the same flight as everyone else, so the
 * crowd the reader is looking at is one crowd. A separate export rather than a
 * wider `FIELD_IDS`, because the states that still owe the fifteen their own
 * treatment (`titleGalaxy`'s named anchor, `outro`'s cast) read that one.
 */
export const SKY_IDS = [...FIELD_IDS, ...INTRO_IDS];

/**
 * Is this one of the intro fifteen — the exception `landedSpot` already makes, and
 * the one the contraction above has to make too? They stand at
 * `introPosition(PULLBACK_ZOOM)` in both boxes and are outside the flow
 * entirely, so nothing about them funnels when the sky does.
 */
export const isIntroActor = (id) => INTRO_SET.has(id);
