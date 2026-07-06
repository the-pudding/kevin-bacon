import { ANCHOR_ID, hash01 } from "../nodes.js";
import {
	ATTR_SIZE,
	MARGIN,
	plotBottom,
	lin,
	INK,
	CROWD,
	PURPLE,
	SLJ,
	BY_RANK,
	ORDER_OF,
	set
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Rank ladder (fisheye): every sampled actor in one vertical line by rank
// order; a window around the focus actor is magnified with rank callouts.
// ---------------------------------------------------------------------------

const LADDER_GAP = 26;
const LADDER_WIN = 3;

/** @type {import("../layout-shared.js").LayoutFn} */
function layoutRank(nodes, w, h, _edges, params) {
	const attrs = new Float64Array(ATTR_SIZE);
	const focusId = params?.focusId ?? ANCHOR_ID;
	const focusOrder = ORDER_OF.get(focusId) ?? 0;
	// the ladder sits right of centre so the rank callouts fit on its left
	const cx = Math.min(Math.max(w / 2, 205), w - 60);
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	// focus sits mid-plot unless it's near an end of the ranking
	const span = LADDER_WIN * LADDER_GAP;
	const yFocus = Math.max(
		top + Math.min(focusOrder, LADDER_WIN) * LADDER_GAP,
		Math.min((top + bottom) / 2, bottom - span - 8)
	);
	const yFor = (order) => {
		const d = order - focusOrder;
		if (Math.abs(d) <= LADDER_WIN) return yFocus + d * LADDER_GAP;
		if (d < 0) {
			// compress everyone above the window into [top, window top)
			return lin(order, 0, focusOrder - LADDER_WIN, top, yFocus - span - 10);
		}
		return lin(
			order,
			focusOrder + LADDER_WIN,
			BY_RANK.length - 1,
			yFocus + span + 10,
			bottom
		);
	};
	const notes = [];
	for (const n of nodes) {
		const order = ORDER_OF.get(n.id);
		const d = Math.abs(order - focusOrder);
		const isFocus = n.id === focusId;
		const inWin = d <= LADDER_WIN;
		set(
			attrs,
			n.id,
			cx + (inWin ? 0 : (hash01(n.id, 5) - 0.5) * 5),
			yFor(order),
			isFocus ? 7 : inWin ? 3.5 : 1.2,
			isFocus ? (n.id === SLJ ? PURPLE : INK) : inWin ? INK : CROWD,
			isFocus ? 1 : inWin ? 0.85 : 0.3
		);
		if (inWin) {
			notes.push({
				x: cx - 18,
				y: yFor(order) - 7,
				align: /** @type {const} */ ("right"),
				strong: isFocus,
				text: isFocus
					? `#${n.rank} ${n.name} (${n.avgDistance})`
					: `#${n.rank} ${n.name}`
			});
		}
	}
	return { attrs, notes };
}

export const states = {
	rankFocus: {
		layout: layoutRank,
		params: (s) => ({ focusId: s.rankGuess ?? ANCHOR_ID }),
		overlay: { caption: "All actors, ranked by average distance" }
	},
	rankReveal: {
		layout: (n, w, h, e) => layoutRank(n, w, h, e, { focusId: SLJ }),
		pulse: SLJ,
		overlay: { caption: "All actors, ranked by average distance" }
	}
};
