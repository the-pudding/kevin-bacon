// The canvas palette: the mark.* role tokens (properties/role/mark.json) as
// rgb triples, which `npm run style` generates into $styles/tokens.js because
// canvas can't read CSS custom properties, and the one alpha a packed crowd is
// drawn at.
import {
	MARK_CAREER,
	MARK_CROWD,
	MARK_EDGE,
	MARK_EDGE_HIGHLIGHT,
	MARK_FOCUS,
	MARK_HOP_0,
	MARK_HOP_1,
	MARK_HOP_2,
	MARK_HOP_3,
	MARK_HOP_4,
	MARK_INK,
	MARK_QUIZ_RIGHT,
	MARK_QUIZ_WRONG,
	MARK_SEARCH,
	MARK_TRAIL_ACCENT
} from "$styles/tokens.js";

// What a hop crowd's dots are drawn at wherever they are packed tightly enough
// to overlap — the hopBands rows and the rank ladder's strips both. At this
// alpha the overlap is the point: two dots on the same spot read darker, so a
// dense band shows its own density instead of flattening into a solid block.
// Shared so the ladder inherits the chart it dissolves out of; the anchor and
// anything drawn as a single node stay opaque.
export const HOP_DOT_ALPHA = 0.5;

/** `rgb(r, g, b)` from a palette triple, for DOM that mirrors a canvas mark */
export const rgb = (c) => `rgb(${c.join(", ")})`;

export const HOP_RGB = [
	MARK_HOP_0,
	MARK_HOP_1,
	MARK_HOP_2,
	MARK_HOP_3,
	MARK_HOP_4
];

// A hop row's label: its dots' hue, darkened to text weight. The labels are
// DOM, so these are the tokens themselves rather than rgb copies. Hop 0 is
// the anchor, whose name is a node label and not a row's.
export const HOP_INK = [
	null,
	"var(--mark-hop-1-label)",
	"var(--mark-hop-2-label)",
	"var(--mark-hop-3-label)",
	"var(--mark-hop-4-label)"
];

// a named dot, the anchor, the leader
export const INK = MARK_INK;

// the background crowd every chart is drawn against
export const CROWD = MARK_CROWD;

// the Sweeney and Bacon race lines
export const TRAIL_ACCENT = MARK_TRAIL_ACCENT;

// the pair quiz's verdicts
export const QUIZ_RIGHT = MARK_QUIZ_RIGHT;
export const QUIZ_WRONG = MARK_QUIZ_WRONG;

// the career chart's highlighted actor
export const CAREER = MARK_CAREER;

// network links at rest
export const EDGE_GREY = MARK_EDGE;

// A highlighted link, and the actor a highlight is about (see setEdge's
// `highlight`). Ink, not a colour: step 1 is the only user, and the route it
// picks out already reads against the crowd's grey through weight and
// darkness alone — a hue there would be the story's only decorative colour.
export const EDGE_HIGHLIGHT = MARK_EDGE_HIGHLIGHT;

// The race line a hovered callout refers to (see drawTrails' `focus`). The
// same value as INK for now, kept its own so it can take a colour of its own
// without touching the leader's ink.
export const FOCUS = MARK_FOCUS;

// the dot a search result flies to
export const SEARCH = MARK_SEARCH;
