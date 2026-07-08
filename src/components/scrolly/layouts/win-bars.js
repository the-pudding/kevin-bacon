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
	RED,
	GREEN,
	CROWD
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Win bars: dots pile into waffle columns, one per top candidate — each dot
// ≈ 25 of the 10,000 simulations.
// ---------------------------------------------------------------------------

export const BAR_CANDIDATES = story.genz.candidates.slice(0, 6);
const SIMS_PER_DOT = 25;

const shortName = (name) => {
	const parts = name.split(" ");
	return parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : name;
};

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
	// tall mobile cards swallow the bottom third — raise the baseline there
	const bottom = w < 480 ? h * 0.5 : plotBottom(h);
	const slotW = (w - MARGIN * 2) / BAR_CANDIDATES.length;
	const cols = Math.max(3, Math.floor(Math.min(slotW * 0.6, 40) / 7));
	const cell = 7;
	const used = new Set();
	const notes = [];
	let p = 0;
	BAR_CANDIDATES.forEach((c, b) => {
		const cx = MARGIN + slotW * (b + 0.5);
		const dots = Math.round((c.winPct * story.genz.nSims) / SIMS_PER_DOT);
		const focused = c.id === focusId;
		for (let k = 0; k < dots; k++) {
			const id = pool[p++];
			used.add(id);
			const col = k % cols;
			const row = Math.floor(k / cols);
			set(
				attrs,
				id,
				cx + (col - (cols - 1) / 2) * cell,
				bottom - 14 - row * cell,
				2.6,
				focused ? (c.id === CGM ? RED : GREEN) : CROWD,
				focused ? 0.95 : 0.55
			);
			delays[id] = row * 22; // bars fill from the bottom up
		}
		// the candidate's own dot caps their bar
		const capRows = Math.ceil(dots / cols);
		set(
			attrs,
			c.id,
			cx,
			bottom - 14 - capRows * cell - 10,
			focused ? 6 : 4,
			c.id === CGM ? RED : GREEN,
			focused ? 1 : 0.8
		);
		notes.push({
			x: cx,
			y: bottom + (b % 2 === 0 ? 2 : 16), // stagger to avoid collisions
			align: /** @type {const} */ ("center"),
			strong: focused,
			text: `${shortName(rawNodes.nodes[c.id][1])} ${(c.winPct * 100).toFixed(0)}%`
		});
	});
	const focus = story.genz.candidates.find((c) => c.id === focusId);
	if (focus) {
		notes.push({
			x: w / 2,
			y: MARGIN,
			align: "center",
			wrap: true,
			text:
				`${rawNodes.nodes[focus.id][1]}: ${focus.films} films at career age ${focus.careerAge}, ` +
				`concurrence ${focus.conc}, avg distance ${focus.mad}`
		});
	}
	for (const n of nodes) {
		if (used.has(n.id) || candidateIds.has(n.id)) continue;
		const [x, y] = scatterPosition(n, w, h);
		set(attrs, n.id, x, y, 2, CROWD, 0);
	}
	return { attrs, delays, notes };
}

export const states = {
	winBars: {
		layout: layoutWinBars,
		pulse: CGM,
		params: (s) => ({ focus: s.winFocus ?? CGM })
	}
};
