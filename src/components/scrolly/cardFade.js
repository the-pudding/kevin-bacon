// @ts-check
// Shared timing for the title card's fade (Stage.svelte), which the opening
// flight's own clearing leg is timed off (layouts/intro.js).
export const CARD_IN_MS = 600;
export const CARD_IN_DELAY_MS = 400;
export const CARD_OUT_MS = 300;

/** How long a step's over-canvas panel takes to leave. The same beat the chart
 *  furniture leaves on (ScrollyVisual's DECOR_OUT_MS): a panel is furniture,
 *  and what is leaving goes before the dots move. */
export const PANEL_OUT_MS = 220;

// The splash's COLD-LOAD reveal, in CSS rather than `in:fade`: SvelteKit's
// client entry never plays a hydrated element's `in:` transition on the very
// first paint (no `intro: true` passed to `mount()`), so Stage's `cardIn`
// never actually fires on a fresh load — only on a later navigation back to
// step 0. A plain CSS opacity transition, triggered by a class added a tick
// after mount, has no such exemption. Staggered per element (logo, title,
// byline, cue) so the cold-load cascade reads as one composed reveal rather
// than the whole card fading as a block.
export const SPLASH_REVEAL_MS = 700;
export const SPLASH_REVEAL_STEP_MS = 200;
