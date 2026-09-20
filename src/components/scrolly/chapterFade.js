// @ts-check
// Shared timing for the chapter title card's fade — also used by StepProgress
// to crossfade the dot bar against it (see StepProgress.svelte).
export const CHAPTER_IN_MS = 600;
export const CHAPTER_IN_DELAY_MS = 400;
export const CHAPTER_OUT_MS = 300;

/** How long a step's over-canvas panel takes to leave. The same beat the chart
 *  furniture leaves on (ScrollyVisual's DECOR_OUT_MS): a panel is furniture,
 *  and what is leaving goes before the dots move. */
export const PANEL_OUT_MS = 220;
