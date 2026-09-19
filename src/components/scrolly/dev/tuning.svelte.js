// The dev tuners' one reactive signal. The values they tune live in
// `raceTuning` (layouts/race.js), a plain object the per-frame draw path reads
// with nothing reactive in the way; this counter is how ScrollyVisual learns a
// value moved, so it drops its cached layouts and rebuilds the same state,
// params and box. Only the tuners bump it, and they only mount under
// `npm run dev`.
export const tuning = $state({ rev: 0 });

/** a tuner has written raceTuning: have the chart rebuilt */
export function retune() {
	tuning.rev++;
}
