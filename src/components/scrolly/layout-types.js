// The shapes every layout module shares: what a layout returns and the chart
// furniture it can hand the annotation layer. JSDoc only — nothing here runs.
/**
 * @typedef {import("./nodes.js").ActorNode} ActorNode
 * @typedef {import("./nodes.js").Edge} Edge
 *
 * @typedef {Object} Tick
 * @property {number} pos px along the axis
 * @property {string} label the text drawn. On the race chart this is a year,
 *   abbreviated behind a curly apostrophe (`’99`) below `RACE_FULL_YEAR_MIN_W`
 *   and written in full (`1999`) at or above it (see raceTickLabel), so it is
 *   lossy either way — anything keying off a particular year must read
 *   `year`, never this
 * @property {number} [year] the year a race tick stands for
 * @property {number} [alpha] 0-1 opacity; omitted = fully opaque. Only the
 *   future strip's years use it, fading toward the horizon with the block they
 *   sit under (see raceFutureTicks)
 *
 * @typedef {Object} Note
 * @property {number} x px
 * @property {number} y px
 * @property {string} text
 * @property {"left"|"center"|"right"} [align] default "left"
 * @property {boolean} [strong] render emphasised
 * @property {boolean} [wrap] allow multi-line (default nowrap)
 * @property {number} [wrapWidth] px line width, overriding the default cap (wrap
 *   only). Set as a real `width`, not a max: an absolutely-positioned box is
 *   shrink-to-fit within `containing block - left`, so a centred note at x = w/2
 *   would otherwise never wrap wider than half the canvas.
 *
 * @typedef {Object} RaceMoment
 * @property {number} year
 * @property {number} value the avg distance the ring sits at
 * @property {string} text the note's prose
 * @property {number[]} focus the actors whose lines hovering the callout
 *   lights (see ScrollyVisual's calloutFocus)
 *
 * @typedef {Object} RaceCallout
 * @property {{x: number, y: number}} ring px, centre of the ring on the moment
 * @property {{x: number, y: number, width: number}} note px, the note box's
 *   left edge, the edge FACING the ring (its top when `above` is false, its
 *   bottom when true) and its line width. A real `width`, not a max — an
 *   absolutely positioned box is shrink-to-fit, so a max would let the rendered
 *   box run wider than the geometry that placed it (same trap as Note.wrapWidth)
 * @property {boolean} above the note hangs above its ring rather than below it,
 *   anchored by its own bottom edge. The frame writer has no DOM and so no real
 *   note height; anchoring the flipped case from the bottom is what keeps the
 *   assumed height out of where the note lands (see raceCalloutGeometry)
 * @property {string} text the note's prose. Rides the payload rather than
 *   sitting in the component, because the chart has more than one of these and
 *   only one of them is on screen at a time (see raceCallout)
 * @property {number[]} focus the moment's own (see RaceMoment.focus)
 * @property {{ax: number, ay: number, bx: number, by: number, h1x: number,
 *   h1y: number, h2x: number, h2y: number}} arrow the leader — a straight
 *   segment: start, tip, and the head's two trailing corners. Numbers, not path
 *   strings — this is built in the per-frame writer, which documents itself as
 *   allocating nothing per frame
 * @property {number} alpha 0-1, ramped down over the last px of travel at each
 *   plot edge so the callout fades out instead of popping on the cull
 * @property {RaceMark[]} marks the rings of the step's other moments on plot,
 *   drawn without a note (see raceCallout)
 *
 * @typedef {Object} RaceMark
 * @property {number} x px, centre of the ring on the moment
 * @property {number} y px
 * @property {number} alpha 0-1, the same edge ramp as RaceCallout.alpha
 *
 * @typedef {Object} FutureBand
 * @property {number} x px, left edge — the RACE_DATA_END column, where the data
 *   ends. Also the AXIS BREAK: the strip to its right is on its own fitted scale
 *   (raceFutureScale), and this border is the only thing that says so
 * @property {number} y px, top edge (the plot's top)
 * @property {number} width px, x → the frontier's position on that scale. Grows
 *   from 0 as the strip opens
 * @property {number} height px, the plot's full height
 * @property {{x: number, y: number, right: boolean}|null} label px, the anchor
 *   of the block's label, inside the box's top corner — `right` says which
 *   corner, and the markup right-aligns the text to `x` when it's set. Fixed at
 *   the box's FINAL width, not the currently-drawn one, and null until the box
 *   has actually reached that width — so the label never tracks the box's
 *   growing edge and only appears once it is fully drawn
 *
 * @typedef {Object} LegendItem
 * @property {number[]} color rgb triple
 * @property {string} label
 * @property {string} [ink] CSS colour of the label text; omitted = the
 *   legend's default grey
 * @property {number} [x] px, left edge — when set (with `y`), this item renders as
 *   its own pinned label at that position instead of joining the shared bottom row
 * @property {number} [y] px, vertical centre of the pinned label (see `x`)
 *
 * @typedef {Object} Hit
 * @property {number} x px, left edge
 * @property {number} y px, top edge
 * @property {number} w px
 * @property {number} h px
 * @property {string} label accessible name for the region
 * @property {unknown} value handed to the state's `pick` (see STATE_PICK)
 * @property {boolean} [selected] currently the picked region
 * @property {boolean} [round] hover/selected tint is a circle, not a rectangle —
 *   for a region centred on a dot rather than covering a bar
 *
 * @typedef {Object} LayoutResult
 * @property {Float64Array} attrs ATTR_SIZE values, STRIDE per node + STRIDE per edge
 * @property {Float64Array} [delays] DELAY_SIZE per-node/per-edge start delays in ms;
 *   omitted = tweener applies its default hashed jitter
 * @property {{ clear: Float64Array, fadeMs: number, ms: number, windows: Float64Array, labelAt: [number, number][] }} [paramWalk]
 *   a retarget within the state (a params change) run in two stages: a
 *   `fadeMs` tween to the `clear` frame, then a walk of `ms` with each group on
 *   its `[from, to]` share of it (see the tweener's `windows`), each `labelAt`
 *   name held until its ms from the retarget; omitted = a
 *   PARAM_TWEEN_MS tween with everything moving at once
 * @property {Float64Array} [trails] TRAIL_SIZE polyline vertices + alpha +
 *   highlight per trail; omitted = trails fade out in place
 * @property {Float64Array} [trailDelays] per-trail start delays in ms
 * @property {{ x?: Tick[], y?: Tick[], xBase?: number, yBase?: number }} [axes]
 * @property {Note[]} [notes]
 * @property {RaceCallout|null} [callout] the race chart's one live callout — the
 *   most present of the moments its step marks; null when none is on camera
 * @property {FutureBand|null} [band] the race chart's future block (raceFuture);
 *   null on every other step, and for the whole of that step's first leg
 * @property {LegendItem[]} [legend]
 * @property {Hit[]} [hits] tappable regions over the chart (see STATE_PICK)
 * @property {number} [legendY] px, top of the legend row; omitted = pinned to bottom
 *
 * @callback LayoutFn
 * @param {ActorNode[]} nodes
 * @param {number} w width in px
 * @param {number} h height in px
 * @param {Edge[]} edges
 * @param {Object} [params] step params merged with interaction state (see STATE_PARAMS)
 * @param {import("./plot.js").Bleed} [bleed] how far the canvas extends past the column. Almost every
 *   layout ignores this and stays inside [0, w]: `w` is the reading column, and a
 *   chart drawn wider than the prose it belongs to stops being readable. Only the
 *   galaxy states spend it, to author their crowd across the full screen (galaxyBox).
 * @returns {LayoutResult}
 */
export {};
