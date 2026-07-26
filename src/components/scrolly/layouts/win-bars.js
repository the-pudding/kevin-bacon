import { NODE_COUNT, hash01 } from "../nodes.js";
import rawNodes from "$data/scrolly-nodes.json";
import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	DELAY_SIZE,
	MARGIN,
	plotBottom,
	set,
	scatterPosition,
	CGM,
	GREEN,
	CROWD
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Win bars: dots pile into horizontal waffle rows, one per top candidate plus
// an "other" bin for every remaining contender — each dot ≈ 25 of the 10,000
// simulations. Each row is a hit target: tapping it swaps the breakdown note.
// ---------------------------------------------------------------------------

export const BAR_CANDIDATES = story.genz.candidates.slice(0, 8);
const SIMS_PER_DOT = 25;
// win share left over once the named bars are accounted for
const OTHER_PCT = 1 - BAR_CANDIDATES.reduce((sum, c) => sum + c.winPct, 0);
// the contenders folded into the "other" bin — their own dots fill the front of
// that bar, so they arrive there from the scatter rather than vanishing
const OTHER_IDS = story.genz.candidates
	.slice(BAR_CANDIDATES.length)
	.map((c) => c.id);

/** the named bars, then the leftovers — the "other" bin has no named actor */
const BINS = [
	...BAR_CANDIDATES.map((c) => ({ id: c.id, winPct: c.winPct })),
	{ id: null, winPct: OTHER_PCT }
];

const NAME_H = 15; // the name line under each bar
const BIN_GAP = 8;
const PCT_W = 36; // room for the "25%" value label past the bar's end
// the breakdown note wraps to whatever width the plot can spare (wider than the
// default .note.wrap cap), and takes one more line on the narrowest screens
const noteW = (w) => Math.min(w - MARGIN * 2, 420);
const noteH = (w) => (w < 360 ? 80 : 64);

const binName = (id) =>
	id === null ? `${OTHER_IDS.length} others` : rawNodes.nodes[id][1];
const dotsFor = (winPct) =>
	Math.round((winPct * story.genz.nSims) / SIMS_PER_DOT);
// dot sub-rows stacked inside one bar: narrow screens stack the same dots into
// more rows so the longest bar still spans the plot instead of running off it —
// but only while each row still has room for a legible dot, otherwise the extra
// row just shrinks every dot (`barBudget` is the bar's own height in its slot)
const MIN_ROW_PX = 5;
const rowsFor = (w, barBudget) =>
	w < 480 && barBudget / 4 >= MIN_ROW_PX ? 4 : 3;

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutWinBars(nodes, w, h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	const delays = new Float64Array(DELAY_SIZE);
	const focusId = params?.focus ?? CGM;
	const candidateIds = new Set(story.genz.candidates.map((c) => c.id));
	// deterministic pool of crowd dots to stack into the bars
	const pool = [...Array(NODE_COUNT).keys()]
		.filter((id) => !candidateIds.has(id))
		.sort((a, b) => hash01(a, 7) - hash01(b, 7));
	// nine stacked bars need more height than the shared plot area gives, and
	// this state's step card is short enough to lend it
	const bottom = w < 480 ? h * 0.64 : plotBottom(h);
	const top = MARGIN + noteH(w);
	const slotH = (bottom - top) / BINS.length;
	const barBudget = slotH - NAME_H - BIN_GAP;
	const rows = rowsFor(w, barBudget);
	// the longest bar sets the dot size: it has to fit the plot width, and one
	// bar (bar + name + gap) has to fit its vertical slot
	const maxCols = Math.max(
		...BINS.map((bin) => Math.ceil(dotsFor(bin.winPct) / rows))
	);
	const cell = Math.max(
		3,
		Math.min(9, barBudget / rows, (w - MARGIN * 2 - PCT_W) / maxCols)
	);
	const used = new Set();
	const notes = [];
	const hits = [];
	let p = 0;
	BINS.forEach((bin, b) => {
		const barTop = top + slotH * b;
		const dots = dotsFor(bin.winPct);
		const cols = Math.ceil(dots / rows);
		const focused = bin.id === focusId;
		// the picked bar is the green one; every other bar sits back in crowd grey
		const rgb = focused ? GREEN : CROWD;
		for (let k = 0; k < dots; k++) {
			// the candidate's own dot leads their bar, so it travels in from the
			// scatter instead of being replaced by an anonymous crowd dot; the
			// "other" bar leads with the contenders it stands for. It's drawn like
			// every other dot in the bar — one dot is one slice of the simulations,
			// whoever it belongs to
			const id =
				k === 0 && bin.id !== null
					? bin.id
					: bin.id === null && k < OTHER_IDS.length
						? OTHER_IDS[k]
						: pool[p++];
			used.add(id);
			const col = Math.floor(k / rows);
			const row = k % rows;
			set(
				attrs,
				id,
				MARGIN + (col + 0.5) * cell,
				barTop + (row + 0.5) * cell,
				cell * 0.36,
				rgb,
				focused ? 0.95 : 0.5
			);
			delays[id] = col * 12; // bars grow left to right
		}
		notes.push({
			x: MARGIN,
			y: barTop + rows * cell + 4,
			align: /** @type {const} */ ("left"),
			strong: focused,
			text: binName(bin.id)
		});
		notes.push({
			x: MARGIN + cols * cell + 6,
			y: barTop + (rows * cell) / 2 - 7,
			align: /** @type {const} */ ("left"),
			strong: focused,
			text: `${(bin.winPct * 100).toFixed(0)}%`
		});
		// the "other" bin has no breakdown to show, so it isn't selectable
		if (bin.id !== null) {
			hits.push({
				x: MARGIN - 6,
				// the region hugs this bar and its own name — a full slot's height
				// would tint the name of the bar above it
				y: barTop - 4,
				w: w - MARGIN * 2,
				h: rows * cell + NAME_H + 6,
				label: `${rawNodes.nodes[bin.id][1]}, wins ${(bin.winPct * 100).toFixed(0)}% of simulations`,
				value: bin.id,
				selected: focused
			});
		}
	});
	const focus = story.genz.candidates.find((c) => c.id === focusId);
	if (focus) {
		notes.push({
			x: w / 2,
			y: MARGIN,
			align: "center",
			wrap: true,
			wrapWidth: noteW(w),
			text:
				`${rawNodes.nodes[focus.id][1]} wins ${(focus.winPct * 100).toFixed(0)}%: ` +
				`${focus.films} films at career age ${focus.careerAge}, ` +
				`concurrence ${focus.conc}, avg distance ${focus.mad}`
		});
	}
	for (const n of nodes) {
		if (used.has(n.id)) continue;
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
	return { attrs, delays, notes, hits };
}

export const states = {
	winBars: {
		layout: layoutWinBars,
		// no pulse: the green bar + its highlighted row already mark the pick, and a
		// ring pinned to the default winner would go stale the moment one is made
		params: (s) => ({ focus: s.winFocus ?? CGM }),
		pick: (s, value) => (s.winFocus = value)
	}
};
