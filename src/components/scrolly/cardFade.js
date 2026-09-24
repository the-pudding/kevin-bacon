// @ts-check
// Shared timing for the title card's fade and the step-0 nav cue's exit
// (Stage.svelte).
export const CARD_IN_MS = 600;
export const CARD_IN_DELAY_MS = 400;
export const CARD_OUT_MS = 300;

// The prose's own swap (Step.svelte), out and then in with a beat between, so
// the column is never showing two steps at once and the words read as one
// thing leaving and another arriving rather than a cut. Brisker than the title
// card's fade: a card is the only thing on screen and can take its time, a
// paragraph is being read. Both ends drift the same way — the outgoing copy
// rises as it goes and the incoming one rises into place — so the column reads
// as moving through the step rather than swapping in place. Shared because the
// step-0 nav cue (Stage.svelte) arrives on the same rise, once the prose has.
export const PROSE_OUT_MS = 200;
export const PROSE_IN_DELAY_MS = 260;
export const PROSE_IN_MS = 300;
export const PROSE_RISE_PX = 8;

/** The beat the step-0 nav cue waits after the prose has fully arrived before
 *  it rises in (Stage.svelte): long enough that the reader has started on the
 *  words, so the instruction reads as the next thing rather than as part of
 *  the paragraph's own entrance. */
export const NAV_CUE_BEAT_MS = 1000;

/** How long a step's over-canvas panel takes to leave. The same beat the chart
 *  furniture leaves on (ScrollyVisual's DECOR_OUT_MS): a panel is furniture,
 *  and what is leaving goes before the dots move. */
export const PANEL_OUT_MS = 220;

// The splash's COLD-LOAD reveal, in CSS rather than `in:fade`: SvelteKit's
// client entry never plays a hydrated element's `in:` transition on the very
// first paint (no `intro: true` passed to `mount()`), so Stage's `cardIn`
// never actually fires on a fresh load — only on a later navigation onto the
// card. A plain CSS opacity transition, triggered by a class added a tick after
// mount, has no such exemption. Staggered per element (logo, title, subtitle, byline) so
// a cold `?step=3` reads as one composed reveal rather than the whole card
// fading as a block.
export const SPLASH_REVEAL_MS = 700;
export const SPLASH_REVEAL_STEP_MS = 200;
