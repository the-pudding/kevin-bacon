// The canvas palette: rgb values of the tokens in src/styles/variables.css
// (canvas can't read CSS custom properties), and the one alpha a packed crowd
// is drawn at.

// What a hop crowd's dots are drawn at wherever they are packed tightly enough
// to overlap — the hopBands rows and the rank ladder's strips both. At this
// alpha the overlap is the point: two dots on the same spot read darker, so a
// dense band shows its own density instead of flattening into a solid block.
// Shared so the ladder inherits the chart it dissolves out of; the anchor and
// anything drawn as a single node stay opaque.
export const HOP_DOT_ALPHA = 0.5;

// rgb values of the tokens in src/styles/variables.css (canvas can't read CSS custom properties)
export const HOP_RGB = [
	[34, 34, 34], // hop 0 — --color-gray-900
	[238, 102, 119], // hop 1 — --category-red
	[68, 119, 170], // hop 2 — --category-blue
	[102, 204, 238], // hop 3 — --category-cyan
	[187, 187, 187] // hop 4 — --category-gray
];

// A hop row's label: its dots' hue, darkened to text weight. The labels are
// DOM, so these are the tokens themselves rather than rgb copies. Hop 0 is
// the anchor, whose name is a node label and not a row's.
export const HOP_INK = [
	null,
	"var(--category-red-dark)",
	"var(--category-blue-dark)",
	"var(--category-cyan-dark)",
	"var(--category-gray-dark)"
];

export const INK = [34, 34, 34];

// --color-gray-900
export const CROWD = [187, 187, 187];

// --category-gray
export const RED = [238, 102, 119];

// --category-red
export const BLUE = [68, 119, 170];

// --category-blue
export const GREEN = [34, 136, 51];

// --category-green
// --category-yellow. No layout reads this one: its only user is raceFuture's
// future block, which is DOM rather than canvas and so takes the colour from
// --category-yellow directly. Kept for parity with the rest of the palette.
export const YELLOW = [204, 187, 68];

export const PURPLE = [170, 51, 119];

// --category-purple
export const CYAN = [102, 204, 238];

// --category-cyan
export const EDGE_GREY = [120, 120, 120];

// network links at rest
// A highlighted link, and the actor a highlight is about (see setEdge's
// `highlight`). Ink, not a colour: step 1 is the only user, and the route it
// picks out already reads against the crowd's grey through weight and
// darkness alone — a hue there would be the story's only decorative colour.
export const EDGE_HIGHLIGHT = INK;

// The race line a hovered callout refers to (see drawTrails' `focus`). The
// same value as INK for now, kept its own so it can take a colour of its own
// without touching the leader's ink.
export const FOCUS = [34, 34, 34];
