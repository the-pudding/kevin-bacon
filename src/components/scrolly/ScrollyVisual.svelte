<script>
	// @ts-check
	import { untrack } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { fade } from "svelte/transition";
	import { makeNodes } from "./nodes.js";
	import { createTweener, easeCubicInOut } from "./tween.js";
	import { createChoreographer } from "./choreographer.js";
	import { createRaceCamera } from "./race-camera.js";
	import {
		ALPHA_SEEN,
		clearCanvas,
		drawTrails,
		drawEdges,
		drawDots,
		drawLabelLeaders
	} from "./render.js";
	import {
		raceLabelCut,
		trackLabels,
		createLabelStacker
	} from "./annotations.js";
	import {
		galaxyHighlight,
		galaxyLinks,
		resetGalaxyHighlight
	} from "./galaxy-highlight.js";
	import {
		writeRaceSweepFrame,
		racePlot,
		racePanFrame,
		RACE_CAST,
		RACE_LABEL_TOP
	} from "./layouts/race.js";
	import {
		STATES,
		OVERLAYS,
		STATE_SCENE,
		STATE_LABELS,
		STATE_TITLE,
		STATE_LABEL_TEXT,
		STATE_LABEL_DIRS,
		STATE_PICK,
		STATE_PULSE,
		STATE_YCAP,
		STATE_RACE,
		STATE_PARAMS,
		STATE_REVEAL_FROM,
		entryFor,
		STATE_REQUESTS,
		STATE_AMBIENT,
		STATE_TRACKED
	} from "./states.js";
	import {
		ATTR_SIZE,
		DELAY_SIZE,
		STRIDE,
		EDGE_BASE,
		ALPHA_OFFSET
	} from "./attr-buffer.js";
	import {
		TRAIL_SIZE,
		TRAIL_STRIDE,
		TRAIL_POINTS,
		TRAIL_META,
		sameLine
	} from "./trails.js";
	import {
		MARGIN,
		TITLE_BAND,
		plotBottom,
		plotBottomFraction,
		xLabelTop,
		setPlotBottomFrac,
		PLOT_BOTTOM_BESIDE,
		PLOT_BOTTOM_STACKED,
		NO_BLEED
	} from "./plot.js";
	import { story } from "./story.svelte.js";
	import { tuning } from "./dev/tuning.svelte.js";

	// undefined until the <Step> registry has populated (first client render)
	/** @type {{ state: import("./states.js").VisualState, step?: number, params?: Object, stepsHeight?: number, coldStart?: boolean, beside?: boolean }} */
	let {
		state: stateName,
		step = -1,
		params,
		stepsHeight = 0,
		coldStart = false,
		beside = false
	} = $props();

	const TWEEN_MS = 700;
	const ENTER_MS = 900;
	// interaction inside a state (params change): quicker, direct retarget
	const PARAM_TWEEN_MS = 450;
	const TWEEN_JITTER = 0.5;

	const { nodes, edges } = makeNodes();
	// How long a link fading IN holds back: edges draw toward their endpoints'
	// *final* spots, so fading one in earlier strings a line between a mid-flight
	// dot and a far-away destination. It is only ever applied to a link that is
	// arriving — see arrivalDelays, which is where the rule now lives.
	const EDGE_LAG_MS = TWEEN_MS * 0.75;
	// Names this arrival introduces are held back until the dots have mostly
	// landed (motion.md rule 2: a name captioning a dot mid-air is naming empty
	// space). Three quarters of the travel, and NOT the edge lag it used to
	// borrow: that lag is now 0 on most arrivals, and a hold of 0 would put every
	// new name on screen beside a dot still in flight. It must also stay strictly
	// SHORTER than the tween — drawScene has no timer of its own, so a hold that
	// outlasted the tween would never lift.
	const LABEL_HOLD_MS = TWEEN_MS * 0.75;
	// how long a departing mark (one the landing state doesn't draw) takes to
	// fade to invisible, in place, before anything travels — so a stale line or
	// link from a state the reader has left disappears FIRST instead of visibly
	// sliding or shrinking across the canvas while it crossfades toward wherever
	// the tweener parks it. Short: it's decluttering, not a beat the reader is
	// meant to watch.
	const DEPART_FADE_MS = 220;
	// per-frame smoothing factor for the pan glide: the playhead moves this
	// fraction of the remaining distance to the target each frame (exponential
	// ease-out — feels like a weighted reel). Reduced motion uses 1 (snap).
	const SCRUB_EASE = 0.22;
	// how long a name whose text changes takes to cross over with its own new
	// string (see nameSwap, beside reducedMotion below)
	const LABEL_SWAP_MS = 200;
	/** no name shown, allocated once — drawScene runs every frame */
	const EMPTY_LABELS = new Set();
	const LABEL_LINE_GAP_PX = 16; // ~11px label line-height * 1.15, matches reference
	// how close a below-dot name may sit to the canvas edge before it stops
	// sliding outward (see the .node-label transform)
	const LABEL_EDGE_GAP_PX = 2;
	// the two race steps whose 1980 tick carries the "why 1980?" term: raceFull,
	// and raceFuture, whose arrival pan starts from raceFull's camera and so can
	// have 1980 on the plot for its first frames
	const RACE_FULL_STATE = "raceFull";
	const RACE_FUTURE_STATE = "raceFuture";

	// edges draw outward from the anchor: orient each from its lower-hop end so
	// the line grows from Bacon toward the outer actor
	//
	// The baked edges first, then the runtime pool (see GALAXY_LINK_MAX): the
	// title card's highlight spokes pick their endpoints per beat, so their
	// pairs cannot be a build-time table like the constellation's. These are the
	// pool's own arrays, mutated in place by the beat's writer, so this table sees
	// each beat's pairs without being rebuilt — and every pool slot the beat isn't
	// using sits at alpha 0, which the draw loop skips before it reads a pair.
	const edgeEnds = /** @type {[number, number][]} */ ([
		...edges.map(({ source, target }) =>
			nodes[source].hop <= nodes[target].hop
				? [source, target]
				: [target, source]
		),
		...galaxyLinks.ends
	]);
	// every id any state labels or pulses — tracked out of the attr array each
	// frame so the HTML annotations stay glued to their dots mid-tween.
	// Dynamic label and pulse states (function values) declare their possible
	// ids in STATE_TRACKED instead.
	const STATIC_TRACKED = [
		...new Set([
			...Object.values(STATE_LABELS).filter(Array.isArray).flat(),
			...Object.values(STATE_PULSE).filter((p) => typeof p === "number"),
			...STATE_TRACKED
		])
	];
	// …plus the two ids nothing can know at build time: the actor the reader has
	// searched for, and the one step 6's hop chart is currently anchored on.
	// Derived rather than declared because between them the pools are ~1,400
	// actors (search.js) and every tracked id costs a label element walked by
	// trackLabels on every frame — all of them, to show one name. Read by
	// drawScene, which is not a reactive context, so it simply sees the current
	// value on the next frame.
	//
	// The de-duplication is load-bearing, not tidiness: the pools hold plenty of
	// actors the story names itself (SLJ, the intro fifteen, the Gen Z cast), the
	// hop chart's anchor is Bacon for most of its life and he is tracked outright,
	// and the two are free to land on the same person. The label elements are
	// keyed on `id:name`, so a duplicate is a duplicate key, which throws and
	// takes the whole step card — search control included — down with it. Measured
	// on 2026-09-21: searching Samuel L. Jackson unmounted the control; searching
	// Rachel Weisz, who is in the pool but not in the cast, did not.
	const TRACKED_IDS = $derived(
		[
			...new Set([...STATIC_TRACKED, story.search.actorId, story.hops.anchorId])
		].filter((id) => id != null)
	);

	// -- The writers ------------------------------------------------------------
	// Two tweeners (dots and edges in one Float32 frame, trails in another) and
	// one choreographer. The tweeners lerp between two frames; the choreographer
	// runs a writer per tick straight into the tweeners' live buffers. Only one
	// of them owns the rAF at a time — see choreographer.js.
	const tweener = createTweener(ATTR_SIZE, drawScene, STRIDE, ALPHA_OFFSET);
	// trails (race/career lines) tween on their own array so polylines morph
	// with the same interruption-safe semantics as dots
	const trailTweener = createTweener(TRAIL_SIZE, drawScene, TRAIL_STRIDE);

	/**
	 * The attrs half of the out beat: every link the arriving state does not draw
	 * loses its alpha AND its highlight where it stands.
	 *
	 * The highlight goes with it, and that is the whole of the two-fade-rates
	 * reading on a lit route leaving. drawEdges lerps EDGE_GREY toward
	 * EDGE_HIGHLIGHT by that channel and thickens the stroke, so a lit route and
	 * the grey field fading on one ramp from two very different starting weights
	 * read as two rates: a third of the way through, the field's alpha has gone
	 * under the eye's floor and the route is still a black line. Released
	 * together — the route de-inking and thinning as it fades — they read as one.
	 *
	 * Null when nothing is leaving, which is most arrivals.
	 * @returns {Float64Array | null}
	 */
	function departEdges(next) {
		const live = tweener.current;
		let fade = null;
		for (let e = 0; e < edgeEnds.length; e++) {
			const i = EDGE_BASE + e * STRIDE;
			if (live[i + 1] <= ALPHA_SEEN) continue; // nothing visible to release
			if (next[i + 1] > ALPHA_SEEN) continue; // the arriving state draws it
			fade ??= Float64Array.from(live);
			fade[i + 1] = 0;
			fade[i + 2] = 0;
		}
		return fade;
	}

	/**
	 * The trails half of the out beat. A slot loses its alpha where it lies when
	 * the arriving state does not draw it, and ALSO when both states draw it but
	 * they do not agree it is the same line (TRAIL_CONSTANCY) — so a chart change
	 * fades out and re-enters instead of morphing through a shape that is in
	 * neither chart. Geometry is untouched here; `reenter` names the slots whose
	 * geometry is restated once they are invisible.
	 *
	 * The ink is left alone, for fadeOutTrails' reason: a departing leader fades
	 * out in the colour it had rather than crossfading back to grey on its way
	 * off.
	 * @returns {{ fade: Float64Array, reenter: number[] } | null}
	 */
	function departTrails(next, from) {
		const live = trailTweener.current;
		/** @type {number[]} */
		const reenter = [];
		let fade = null;
		for (let t = 0; t < TRAIL_META.length; t++) {
			const a = t * TRAIL_STRIDE + TRAIL_POINTS * 2;
			if (live[a] <= 0) continue;
			const leaving = next[a] <= 0;
			if (!leaving && sameLine(t, from, stateName)) continue;
			fade ??= Float64Array.from(live);
			fade[a] = 0;
			if (!leaving) reenter.push(t);
		}
		return fade && { fade, reenter };
	}

	/**
	 * A re-entering line's geometry, restated while it is invisible: it has just
	 * faded out where it lay, so it can be MOVED to where it will stand without
	 * anything drawn moving — which is what makes the second beat a pure fade-in
	 * rather than a fade-in that travels (motion.md rule 2). `reframe` is the
	 * tweener's own restater and writes both the live frame and the frame a tween
	 * eases from, so the move is not undone on the next tick.
	 */
	function restateTrails(slots, next) {
		trailTweener.reframe((buf) => {
			for (const t of slots) {
				const base = t * TRAIL_STRIDE;
				for (let k = 0; k < TRAIL_POINTS * 2; k++)
					buf[base + k] = next[base + k];
			}
		});
	}

	/**
	 * The out beat. Everything the arriving state will not draw fades where it
	 * stands, and nothing travels until it has — motion.md rule 2, which the
	 * framework asserted but did not implement: the old two-phase trail tween ran
	 * its fade concurrently with the dot tween, and only for trails.
	 *
	 * `then` is the arrival, run at once when there is nothing to release — so
	 * the common arrival is still one 700ms tween and the chain is never delayed
	 * by an empty beat (which is what the old tweenTrails did on every arrival
	 * that had any trail at all).
	 */
	function departFade(target, from, then) {
		const attrs = departEdges(target.attrs);
		const trails = departTrails(target.trails, from);
		if (!attrs && !trails) {
			then();
			return;
		}
		const land = () => {
			if (trails) restateTrails(trails.reenter, target.trails);
			then();
		};
		// chain off whichever tweener has work, so an arrival that releases only
		// links does not also push a full no-op trail target through the tweener
		if (trails) {
			trailTweener.to(
				trails.fade,
				DEPART_FADE_MS,
				0,
				null,
				attrs ? null : land
			);
		}
		if (attrs) tweener.to(attrs, DEPART_FADE_MS, 0, null, land);
	}
	/**
	 * The trail target for a state that draws none: every slot keeps the geometry
	 * it is currently rendering and just loses its alpha, so an outgoing line
	 * fades where it lies instead of retracting into a corner. Geometry comes
	 * from the live tweener rather than the previous target because animated
	 * states (the sim replay) write the canvas directly, so their lines only
	 * exist there.
	 */
	function fadeOutTrails() {
		const target = new Float64Array(TRAIL_SIZE);
		const live = trailTweener.current;
		for (let t = 0; t < TRAIL_META.length; t++) {
			const base = t * TRAIL_STRIDE;
			for (let k = 0; k < TRAIL_POINTS * 2; k++) {
				target[base + k] = live[base + k];
			}
			target[base + TRAIL_POINTS * 2] = 0;
			// the ink goes with the geometry: a departing leader fades out in the
			// colour it had, rather than crossfading back to grey on its way off
			target[base + TRAIL_POINTS * 2 + 1] = live[base + TRAIL_POINTS * 2 + 1];
		}
		return target;
	}

	/**
	 * Park every id the arriving state does not draw where the frame the reader
	 * is looking at has it, so it fades out where it stands instead of being
	 * lerped across the canvas to a park spot it is invisible at anyway — the
	 * career crowd climbing off the top of the plot, the race cast crossing the
	 * chart inside the future block, the sky sliding onto the films scatter.
	 *
	 * The live mark is restated WHOLE — position, radius and colour — so a leaver
	 * crossfades nothing on its way out; exactly what fadeOutTrails does for a
	 * departing line's geometry and its ink. The alpha is left at the layout's
	 * own, because that alpha IS the fade.
	 *
	 * "Does not draw" is the renderer's own floor, so a dot that was already
	 * invisible keeps the park its layout authored and `parkHidden`'s arrival
	 * case is untouched: a dot the reader has never seen still fades in where a
	 * later scatter chapter wants it. On a cold start the live frame is all
	 * zeros, so this is a no-op by construction.
	 *
	 * Writes into the per-arrival copy, never `layout.attrs` — that array is
	 * cached, and mutating it would poison every later visit to the state.
	 */
	function parkLeavers(attrs) {
		const live = tweener.current;
		for (let i = 0; i < EDGE_BASE; i += STRIDE) {
			if (attrs[i + 6] > ALPHA_SEEN || live[i + 6] <= ALPHA_SEEN) continue;
			for (let k = 0; k < 6; k++) attrs[i + k] = live[i + k];
		}
	}

	// trapezoidal speed profile (ported from the reference _animate): R = ramp
	// fraction at each end, V = cruise speed so integrated progress is exactly 1.
	// The phase ramps to zero velocity at each end so the draw-on lands softly.
	const SWEEP_R = 0.18;
	const SWEEP_V = 1 / (1 - SWEEP_R);
	const sweepEase = (p) =>
		p < SWEEP_R
			? (SWEEP_V * p * p) / (2 * SWEEP_R)
			: p > 1 - SWEEP_R
				? 1 - (SWEEP_V * (1 - p) * (1 - p)) / (2 * SWEEP_R)
				: SWEEP_V * (p - SWEEP_R / 2);
	// is the running choreography a galaxy flight? Set when one starts
	// (playAmbient) and cleared the moment it is abandoned, so the layout cache
	// is dropped once per departure from the sky rather than on every state
	// change in the story.
	let skyFlying = false;
	const choreo = createChoreographer({
		ease: sweepEase,
		draw: drawScene,
		onStop: () => {
			camPanning = false;
			// The sky has stopped where it stopped, and `skyFlight.t` now holds the
			// moment the reader is stepping off. A layout that READS it — hopBands
			// takes each dot's column off hopSeed's sky, mid-flow — is not pure in the
			// cache key's terms, so the cached layouts go: served a second visit's
			// sort built against the first visit's frame, the crowd would set off
			// from somewhere it is no longer standing. This runs before any layout is
			// built on a state change (see the render effect), which is what makes
			// the frame the bands are struck against the frame the sky was showing
			// at the instant the reader tapped.
			if (!skyFlying) return;
			skyFlying = false;
			layoutCache.clear();
			// The beat went with the flight. Its spokes fade out through the ordinary
			// departure tween (the next state's layout leaves the pool at zero), but
			// the name is not in the buffer — it is read straight off the published
			// beat — so without this the title card's last actor would still be named over
			// whatever the reader stepped onto.
			resetGalaxyHighlight();
		}
	});
	// the race chapter's live camera — see race-camera.js
	const camera = createRaceCamera(story);

	// -- Layouts ----------------------------------------------------------------
	// layouts are pure in (state, w, h, params) — cache so re-visited states
	// skip both the recompute and the per-call Float64Array allocation; the
	// tweener only reads the result, never mutates it. `params` merges the
	// step's static params with the interaction fields the state consumes
	// (STATE_PARAMS selector), so an interaction re-runs the current layout.
	//
	// The one exception is a layout that receives the crowd off a galaxy state and
	// so reads the sky's live clock (sky.js's skyFlight). The whole cache is
	// dropped when a flight stops rather than that key being made to carry a time:
	// the clock moves every frame, a key that tracked it would never hit, and a
	// flight stops a handful of times in a read-through. See the choreographer's
	// onStop above.
	const layoutCache = new Map();
	// `bleed` is part of the key, not just an argument: it moves with the VIEWPORT
	// while w/h stay pinned to the 700px reading column, so two different screen
	// widths produce the same w:h and would otherwise share one cached sky.
	function layoutFor(name, w, h, layoutParams, bleed) {
		// a race camera hold is a fresh continuous value every time the reader
		// releases a pan, and each entry is ~0.8MB of Float64Array — never a cache
		// hit, so don't keep it
		if (layoutParams?.playhead != null) {
			return STATES[name](nodes, w, h, edges, layoutParams, bleed);
		}
		const key = `${name}:${w}:${h}:${bleed.l}:${bleed.r}:${plotBottomFraction()}:${JSON.stringify(layoutParams) ?? ""}`;
		let result = layoutCache.get(key);
		if (!result) {
			result = STATES[name](nodes, w, h, edges, layoutParams, bleed);
			layoutCache.set(key, result);
		}
		return result;
	}
	// DEV only: the tuning revision the cache was last valid for (see
	// dropStaleLayouts). Always 0 in a build, where the tuners don't exist.
	let lastTuningRev = 0;
	/**
	 * DEV: the race tuners (scrolly/dev) edit `raceTuning` inside layouts/race.js,
	 * which the layout cache can't see. Read their revision FIRST in the render
	 * effect — before any early return, so the dependency is registered on every
	 * run — and drop the cached layouts whenever it moves. The result is what lets
	 * the no-op guard let such a run through: the tables changed and the SAME
	 * state, params and box need a rebuild.
	 */
	function dropStaleLayouts() {
		if (!import.meta.env.DEV || tuning.rev === lastTuningRev) return false;
		lastTuningRev = tuning.rev;
		layoutCache.clear();
		return true;
	}
	/** the static chart furniture a layout hands the template */
	/**
	 * Everything the overlay draws for ONE state, as one value — so the departing
	 * copy goes on rendering its own text at its own coordinates while it fades,
	 * instead of being re-read from whatever the arriving state now says.
	 */
	function furnitureSet(d, name) {
		return {
			decor: d,
			title: STATE_TITLE[name],
			overlay: OVERLAYS[name],
			xTop,
			yTop: yLabelTop,
			hintTop: yHintTop,
			hintBottom: yHintBottom,
			// raceFuture as well as raceFull: its arrival pan starts from raceFull's
			// camera, so 1980 can be on the plot for the leg's first frames
			infoTick: name === RACE_FULL_STATE || name === RACE_FUTURE_STATE,
			callout: story.running !== "rewind"
		};
	}

	/**
	 * A scene change whose x-label text happens to be unchanged (e.g. two
	 * scatter states sharing "Film count (log scale)" with a different
	 * y-metric) would otherwise fade that identical text out with the rest
	 * of the departing furniture, then fade the same text back in with the
	 * arriving set — two animations of a label that never actually
	 * changed. Dropping it from the frozen copy skips the out-fade, so it
	 * plays only the arriving fade-in once the beat lands.
	 */
	function dropUnchangedXLabel(set, arrivingState) {
		if (set.overlay?.xLabel !== OVERLAYS[arrivingState]?.xLabel) return set;
		return { ...set, overlay: { ...set.overlay, xLabel: undefined } };
	}

	/**
	 * The out beat's HTML half. Within one scene the furniture is the same
	 * furniture and simply keeps rendering. Across a scene change the departing
	 * set is frozen and held for one out-fade while the arriving set waits for
	 * the beat — "out, travel, in" in one place rather than per state.
	 *
	 * A resize and reduced motion take neither beat: the coordinates the old
	 * copy would fade at have already moved (rules 7, 12, 13).
	 */
	function swapFurniture(next, from, box, handedOver, ms) {
		// `handedOver`: the arriving state's frames draw their own chart furniture
		// and own it from their first tick (applyFrame), so the three per-frame
		// channels keep what is on screen instead of jumping to the arriving
		// step's RESTING ones. A choreography's frame 0 is the frame the reader is
		// leaving, and the first tick is an rAF away at best and a whole out beat
		// away at worst — long enough that putting the destination's axes and
		// future block up here painted the chart the step PANS TO in front of the
		// one it pans FROM, and then took it away again (motion.md rules 2, 6, 7).
		// Everything else in the set is the static layout's and swaps now, so a
		// legend or a hit region the arriving chart does not draw still goes.
		//
		// Only WITHIN one scene, and only where the frame on screen is still
		// valid. Across a scene change the arriving set is held below and the
		// departing one is a frozen copy, so there is nothing on screen worth
		// keeping — and a kept axis is worse than none: the hold lifts on the
		// arrival's landing, one tick before the choreography's first frame, and
		// the previous CHAPTER's axes got that tick to themselves. A resize and
		// reduced motion have both moved the coordinates the kept frame was drawn
		// at (rules 7, 12, 13).
		const still = box.resized || reducedMotion;
		const sceneChange = sceneOf(stateName) !== sceneOf(from);
		const set =
			handedOver && !sceneChange && !still
				? untrack(() => ({
						...next,
						axes: decor?.axes,
						callout: decor?.callout,
						band: decor?.band
					}))
				: next;
		beginLegendGlide(set, sceneChange, still, ms);
		if (!sceneChange || still) {
			decor = set;
			if (sceneChange) furnitureHeld = true;
			return;
		}
		if (leavingRaf) cancelAnimationFrame(leavingRaf);
		leaving = dropUnchangedXLabel(
			untrack(() => furnitureSet(decor, from)),
			stateName
		);
		decor = set;
		furnitureHeld = true;
		// One frame is all Svelte needs to mount the copy; clearing it then is what
		// plays its out-fade, because a block created and destroyed inside one
		// flush never transitions at all.
		leavingRaf = requestAnimationFrame(() => {
			leavingRaf = 0;
			leaving = null;
		});
	}

	/**
	 * The pinned legend riding its own rows.
	 *
	 * A legend item is parked at the middle of the band it names, and a band's
	 * height is what a change of anchor moves (layouts/hop-bands.js). Decor swaps
	 * in one go, so without this the label jumps to its new row's middle while the
	 * row itself is still 450ms from being there — measured 2026-09-22 on a cycle
	 * turn, the hop-3 label 24px clear of its own band for the whole tween.
	 *
	 * Interpolated rather than transitioned in CSS because it has to stay in
	 * REGISTER with the dots, not merely move at the same time: a dot's y is
	 * affine in the band's top and height, so lerping the label's y on the
	 * tweener's own easing over the tweener's own duration puts it at the exact
	 * middle of the band on every frame. A CSS curve of its own would drift from
	 * the crowd and land back on it, which is worse than not moving.
	 *
	 * Only within a scene, and only for a real tween: across a scene change the
	 * arriving legend is held and then fades in (`furnitureHeld`), so it has
	 * nowhere to glide from, and a resize is a snap.
	 * @type {{ from: number[], to: number[], at: number, ms: number } | null}
	 */
	let legendGlide = null;
	/** this frame's y per pinned legend item, or null when nothing is gliding */
	let legendY = $state(/** @type {number[] | null} */ (null));

	const pinnedYs = (legend) =>
		(legend ?? []).filter((item) => item.x != null).map((item) => item.y);

	/**
	 * Arm the glide for one arrival, or clear it.
	 *
	 * It glides only where the legend is already on screen and something is
	 * actually travelling: across a scene change the arriving legend is held and
	 * then fades in, so it has nowhere to glide from, and a resize or a
	 * reduced-motion read snaps the dots, so it must snap too. Same for a chart
	 * whose legend is a different shape from the one leaving, and for a legend
	 * that pins nothing.
	 * @param {{ legend?: import("./layout-types.js").LegendItem[] }} next the
	 *   arriving furniture @param {boolean} sceneChange @param {boolean} still
	 *   @param {number} ms this arrival's duration
	 */
	function beginLegendGlide(next, sceneChange, still, ms) {
		const from = pinnedYs(decor?.legend);
		const to = pinnedYs(next.legend);
		const glides =
			ms > 0 && !sceneChange && !still && from.length === to.length;
		legendGlide = glides && from.length > 0 ? makeGlide(from, to, ms) : null;
		legendY = legendGlide && from;
	}

	const makeGlide = (from, to, ms) => ({
		from,
		to,
		at: performance.now(),
		ms
	});

	/** one frame of that glide, off the same clock and easing the dots use */
	function stepLegendGlide() {
		if (!legendGlide) return;
		const { from, to, at, ms } = legendGlide;
		const t = Math.min(1, Math.max(0, (performance.now() - at) / ms));
		const eased = easeCubicInOut(t);
		legendY = from.map((y, i) => y + (to[i] - y) * eased);
		if (t >= 1) legendGlide = null;
	}

	const staticDecor = (layout) => ({
		axes: layout.axes,
		notes: layout.notes,
		callout: layout.callout,
		band: layout.band,
		legend: layout.legend,
		legendY: layout.legendY,
		hits: layout.hits
	});

	// -- The canvas -------------------------------------------------------------
	let canvas = $state();
	/** @type {HTMLElement | undefined} */
	let container = $state();
	let width = $state(0);
	let height = $state(0);
	// The canvas's own width, which is the VIEWPORT's, not `.visual`'s: the canvas
	// bleeds past the reading column so a full-bleed state's sky can fill the
	// screen (see the render transform below and sky.js's galaxyBox). Measured rather than
	// taken from the 100vw it is styled with, so what the layouts get is what the
	// browser actually laid out.
	let canvasWidth = $state(0);
	/**
	 * How far the canvas ELEMENT sticks out past `.visual`, per side, in the CSS
	 * pixels every layout is authored in. Two numbers rather than one because the
	 * column is centred in the viewport only while the prose sits OVER it: beside
	 * the prose it is one half of the screen and the canvas reaches much further
	 * out on one side than the other.
	 *
	 * It has to be MEASURED, not derived from `canvasWidth - width`: that
	 * difference says how much bleed there is altogether and never which side of
	 * the column it is on.
	 *
	 * Deliberately NOT `$state`, for the reason the choreographer's `active` is
	 * not: it describes where the canvas element sits, which is not something the
	 * story is showing. It is measured at the top of the render effect,
	 * immediately before the layout is built, and the canvas element's own offset
	 * is written from it in the same place — one reader, one writer, no reactive
	 * round trip to make the effect that sets it re-run. `resized` carries it, so
	 * the backing store re-fits on a move exactly as it does on a width change.
	 * A move never comes without one: the column only shifts in the viewport when
	 * the viewport itself changes size.
	 * @type {import("./plot.js").Bleed}
	 */
	let bleed = NO_BLEED;
	let ctx = null;
	let prevW = 0;
	let prevH = 0;
	let prevCanvasW = 0;
	// the plot's share of the column the live frame was authored against, kept
	// beside the box for the reason isResize gives: it scales every y the layouts
	// write just as the box's own height does. 0 is not a fraction any layout can
	// be built at, so the first run always counts as a change.
	let prevPlotFrac = 0;

	/**
	 * Re-measure the column's offset in the viewport.
	 * @returns {boolean} whether either side moved
	 */
	function measureBleed() {
		if (!container) return false;
		const l = Math.max(0, container.getBoundingClientRect().left);
		const r = Math.max(0, canvasWidth - width - l);
		if (bleed.l === l && bleed.r === r) return false;
		bleed = { l, r };
		return true;
	}
	/**
	 * Re-fit the backing store to the measured box. It spans the bled canvas —
	 * wider than `.visual` by `bleed.l` to its left and `bleed.r` to its right,
	 * taller by TITLE_BAND above it — but the ORIGIN stays on `.visual`'s top left
	 * corner: shifting the transform by the same two amounts is what keeps every
	 * layout's coordinates meaning the same screen pixels they always did, so only
	 * a layout that deliberately authors outside [0, width] x [0, height] — a
	 * full-bleed sky — sees any difference. `height` itself is never
	 * adjusted: it is the measured box, and making it depend on the band would put
	 * the band in `resized` and snap every tween the band's value crossed.
	 *
	 * The element is pinned to the viewport's left edge here rather than in CSS
	 * because only this path knows where the column landed, and the element is
	 * already being sized imperatively — a custom property set from a $state
	 * would make the effect that measures it depend on its own output.
	 */
	function fitCanvas() {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.style.left = `${-bleed.l}px`;
		canvas.width = canvasWidth * dpr;
		canvas.height = (height + TITLE_BAND) * dpr;
		ctx = canvas.getContext("2d");
		ctx.setTransform(dpr, 0, 0, dpr, bleed.l * dpr, TITLE_BAND * dpr);
		prevW = width;
		prevH = height;
		prevCanvasW = canvasWidth;
		prevPlotFrac = plotFrac;
	}

	// live, so DevTools' emulation (and a reader changing the OS setting mid-story)
	// stands every animation down straight away
	const motionQuery = new MediaQuery("(prefers-reduced-motion: reduce)", false);
	const reducedMotion = $derived(motionQuery.current);

	/**
	 * A name swap crossfades on a channel of its OWN, multiplied into the
	 * element's opacity against the dot's live alpha (see .node-label's CSS).
	 *
	 * It cannot be a fade on `opacity` itself: svelte/transition's fade injects
	 * @keyframes on that property, which outranks the inline per-frame write for
	 * the length of the fade and then snaps back to whatever the live alpha has
	 * become. A name introduced while its dot is still fading up would sample
	 * ~0, animate 0 → 0 and pop; and on the race chart, where a name rides its
	 * dot's alpha through a pan, every swap would freeze that ramp and jump.
	 */
	const nameSwap = (_node) => ({
		duration: reducedMotion ? 0 : LABEL_SWAP_MS,
		css: (t) => `--name-alpha: ${t}`
	});

	// -- What the template reads ------------------------------------------------
	/** @type {import("./annotations.js").TrackedLabel[]} */
	let tracked = $state([]);
	// static per-state chart furniture (ticks/callouts/legend) from the layout result
	/** @type {{ axes?: { x?: import("./layout-types.js").Tick[], y?: import("./layout-types.js").Tick[], xBase?: number, yBase?: number }, notes?: import("./states.js").Note[], callout?: import("./layout-types.js").RaceCallout|null, band?: import("./layout-types.js").FutureBand|null, legend?: import("./layout-types.js").LegendItem[], legendY?: number, hits?: import("./layout-types.js").Hit[] } | null} */
	let decor = $state(null);
	/**
	 * The arriving chart's furniture waits for the beat. What is leaving fades
	 * out where it stood, the dots travel, and only then does the new chart's
	 * text appear — motion.md rule 6, applied once here rather than per state.
	 *
	 * Raised by swapFurniture on an arrival that changes scene, and dropped by
	 * land(). Dropped EARLY by the first frame that publishes furniture of its
	 * own (see applyFrame): a choreographed pan IS its axes moving, and a pan
	 * with no ticks says nothing at all.
	 *
	 * This replaces two special cases that each did it for one state — an entry's
	 * `veil` flag, declared by exactly one entry, and a hard-coded test for
	 * hopBands — neither of which could be generalised while the signal was a
	 * state name (see story.settledStep).
	 */
	let furnitureHeld = $state(false);
	/**
	 * The furniture the state the reader has LEFT was showing, kept for one
	 * out-fade at its own coordinates. A frozen snapshot, not a live read: it has
	 * to go on rendering its own text at its own places while the arriving state
	 * is already building.
	 * @type {ReturnType<typeof furnitureSet> | null}
	 */
	let leaving = $state.raw(null);
	let leavingRaf = 0;
	// tappable chart regions (layout `hits` + the state's `pick`): rendered as
	// transparent buttons over the canvas, so a pick is keyboard- and
	// screen-reader-reachable without any canvas hit-testing
	const pick = $derived(STATE_PICK[stateName]);
	// `camPanning` is true whenever the camera is actively moving (a reader pan, or
	// a choreography on the race chart) — a reader's scrub grab is ignored while
	// it is set, so a choreographed pan is never fought by the scrubber mid-motion.
	let camPanning = $state(false);
	/** the furniture the state the reader is ON wants drawn */
	const arriving = $derived(furnitureSet(decor, stateName));
	/** how long the departing furniture keeps its place before it goes. The HTML
	 *  twin of DEPART_FADE_MS: decluttering, not a beat the reader watches. */
	const DECOR_OUT_MS = 220;
	const furnitureOut = $derived(
		reducedMotion ? { duration: 0 } : { duration: DECOR_OUT_MS }
	);
	// Which states share one set of chart furniture, so a step change INSIDE one
	// neither fades it out nor mounts it again. Every race step draws the same two
	// axes off the same camera and recomputes them per frame through a pan, so
	// those steps are one scene: treated as separate, stepping raceRecent ->
	// raceFull faded an identical axis out and back in, which was the only motion
	// the reader saw at that step change.
	//
	// This is also the only declaration the overlay's gate needs. It replaces an
	// exemption list, because two rules cover the rest: a scene that has not
	// changed is not swapped at all, and a frame that publishes furniture owns it.
	const sceneOf = (name) => STATE_SCENE[name] ?? name;
	// the active state's race descriptor — its camera extent and the actors the
	// step is about — or undefined off the race chapter, whose presence is what
	// makes a step pannable
	// Typed off the registry rather than restating its shape: STATE_RACE's own
	// JSDoc is the one place a race descriptor's fields are described, and a
	// second copy here silently went stale when raceFuture gained `tailPx`.
	const raceStep = $derived(
		/** @type {(typeof STATE_RACE)[keyof typeof STATE_RACE]} */ (
			STATE_RACE[stateName]
		)
	);
	// The plot rectangle of the active race step, or null off the chapter. The
	// draw pass culls the race cast against it (see onRacePlot), so it has to be
	// the live one — same (w, h) the frame writer fits its camera to.
	const racePlotRect = $derived(
		raceStep && width && height ? racePlot(width, height) : null
	);
	// ...and how far right that cull reaches. The data plot's right edge on every
	// step but the closing one, whose marks sit out on the future strip — which
	// runs to `fullRight`, past the name gutter. Without this the projection dots
	// are inside the plot the frame drew and outside the rectangle the cull
	// tests: they survive the step change (the cull is down for an arrival from
	// outside the chapter) and vanish on the first RESIZE, where the previous and
	// the next state are both this one.
	// Read off the STEP, whose `proj` is its RESTING progress (1), never off a
	// frame — and tested against undefined rather than for truth, as everywhere
	// else, because 0 is a real progress on that step.
	const racePlotCullRight = $derived(
		raceStep?.proj !== undefined ? racePlotRect?.fullRight : racePlotRect?.right
	);
	// Whether that cull is armed: only for a move WITHIN the race chapter, where
	// both frames are the chart's own (see onRacePlot). An arrival from outside it
	// has to cross the canvas — above all the flight out of the rank list, which
	// departs from row centres far below the plot and would otherwise be culled
	// away to nothing. Written by the render effect, which knows the state the
	// buffers are coming from; not $state, since only the draw pass reads it.
	let racePlotCulling = false;
	// what the active layout actually varies on: the state's selector plucks
	// the interaction fields it consumes (reading the `story` $state proxy
	// here makes the layout effect re-run when those fields change)
	const layoutParams = $derived(
		STATE_PARAMS[stateName]?.(story, params) ?? params ?? null
	);
	/**
	 * The plot's share of the column, and the floor it puts on the chart — as
	 * something Svelte can TRACK.
	 *
	 * `plotBottom()` reads a module variable. The layout modules need it that way
	 * (they are plain functions, and none of them is handed the page's layout
	 * mode), and the layout cache coped by naming the fraction in its key. A
	 * `$derived` cannot: a module variable is not a signal, so a derived that
	 * called `plotBottom()` kept whatever fraction happened to be current when its
	 * real dependency — `height` — last changed, and the axis furniture stayed
	 * pinned to the stacked plot for the whole of a beside layout.
	 *
	 * So everything in THIS component goes through these two, and the setter in
	 * the render effect is handed the same `plotFrac`: one expression, both
	 * readers.
	 */
	const plotFrac = $derived(beside ? PLOT_BOTTOM_BESIDE : PLOT_BOTTOM_STACKED);
	const plotFloor = $derived(height * plotFrac);
	// vertical centre of the rotated y-axis title: every scatter/line layout maps
	// its y-domain onto the full plot area (top ≈ MARGIN+8 → plotBottom), so the
	// plot-area centre IS the axis centre
	const yLabelTop = $derived(height ? (MARGIN + 8 + plotFloor) / 2 : 0);
	// x-axis title sits just under the plot, but never behind the step card: on
	// long-prose steps the card climbs into the plot and the title moves to the
	// far side of the tick row instead, over the bottom of the plot (text-shadow
	// keeps it legible over any dots it then overlaps). Which side it takes is
	// the ONLY question — the two rows are a line apart, so there is no third
	// place to put it and `plot.js` answers with one row or the other rather
	// than a coordinate between them. See the note there for what a clamp did.
	const xTop = $derived(
		height ? xLabelTop(height, stepsHeight, decor?.axes?.xBase) : 0
	);
	// pinned homes for the "lower"/"higher" mini-labels — the same plot-rect
	// top/bottom that yLabelTop above centres the axis title within
	const yHintTop = $derived(height ? MARGIN + 8 : 0);
	const yHintBottom = $derived(height ? plotFloor : 0);
	const labelIds = $derived.by(() => {
		const spec = STATE_LABELS[stateName];
		return new Set(
			typeof spec === "function" ? spec(layoutParams) : (spec ?? [])
		);
	});
	// per-node label placement overrides ("left"/"right" beside the dot instead
	// of the default below-and-centred) for the state the reader is ARRIVING on
	const labelDirs = $derived.by(() => {
		const spec = STATE_LABEL_DIRS[stateName];
		return (typeof spec === "function" ? spec(layoutParams) : spec) ?? {};
	});
	/**
	 * ...and the side each name is actually DRAWN on this frame, which the
	 * template and the leader lines read instead. The two differ for a name the
	 * arriving state no longer labels: it is still on screen for the length of
	 * its fade-out, and the stacker keeps it on the side it left from rather
	 * than letting the new state drop it back under its dot (see frameSides in
	 * annotations.js). Written by drawScene, once per drawn frame.
	 * @type {Record<number, "left" | "right">}
	 */
	let frameDirs = $state({});
	/**
	 * ...and the bleed that frame was drawn against, which the label layer needs
	 * for two things the reading column cannot give it: the box it clips to, and
	 * the box a name's x is clamped into. Both are the CANVAS, not the column.
	 *
	 * Published here rather than read from `bleed` directly because `bleed` is
	 * deliberately not $state: this is a copy of the value the last DRAWN frame
	 * used, written by drawScene, and nothing the render effect reads.
	 * @type {import("./plot.js").Bleed}
	 */
	let labelBleed = $state.raw(NO_BLEED);
	// per-node label text overrides, so a name can carry the step's number
	const labelTexts = $derived(
		STATE_LABEL_TEXT[stateName]?.(nodes, layoutParams) ?? {}
	);
	const pulseId = $derived.by(() => {
		const spec = STATE_PULSE[stateName];
		return (typeof spec === "function" ? spec(layoutParams) : spec) ?? null;
	});
	// keeps the ring anchored to the last center actor while it fades out
	let lastPulseId = $state(null);
	$effect(() => {
		if (pulseId != null) lastPulseId = pulseId;
	});
	const ring = $derived(tracked.find((t) => t.id === lastPulseId));

	// Pudding's scatter.locate(): the live on-canvas position of one dot, in
	// VIEWPORT coordinates (canvas-relative x/y + the container's bounding rect), so
	// callers don't have to share the canvas's offset parent. Used by the step
	// card's controls — the pair quiz's chips, the actor search's result row — to
	// fly onto their true dot positions, which is why viewport coordinates and not
	// canvas ones.
	//
	// Read straight out of the live buffer rather than out of `tracked`. Those are
	// the same two numbers for a tracked id (trackLabels sets x/y from exactly
	// these slots), but the buffer answers for EVERY node, and the searched actor
	// is tracked only from the tick after the reader names them — the flight
	// target has to exist at the moment of the press. Alpha is not consulted: a
	// hidden dot still has a position (that is the framework's own rule, so a
	// later fade-in never teleports), and flying onto a dot that is about to fade
	// in is exactly what both callers do.
	export function locate(id) {
		return spotIn(tweener.current, id);
	}

	// ...and where that dot is GOING: the same two numbers read out of the frame
	// the tweener is heading for rather than the one it is drawing. For a control
	// whose own pick MOVES the dot it names — the hop chart's anchor search, where
	// the named actor climbs out of the crowd into the header row — the live
	// position is the row the actor is LEAVING, and a chip flown there lands in the
	// crowd and then has its dot climb out from under it.
	//
	// Only meaningful once the pick has been committed and the retarget it causes
	// has flushed; before the first `to()` there is no target at all, and the
	// caller gets null.
	export function locateTarget(id) {
		return tweener.target ? spotIn(tweener.target, id) : null;
	}

	/**
	 * Take one mark out of the live frame — alpha 0, where it stands — with
	 * nothing drawn appearing to move and no tween to wait for.
	 *
	 * The one caller is the hop chart's anchor search, and this is what that
	 * gesture is built on: the actor the reader names has to cross the canvas to
	 * the top of the stack UNSEEN, because what arrives up there is the chip, not
	 * a dot climbing out of the crowd to meet its own name. A layout can park a
	 * mark invisible where it wants it, but `parkLeavers` overrides that park for
	 * any dot the reader can currently SEE — deliberately, so a departing crowd
	 * fades where it stands instead of being lerped across the chart. Dropping
	 * this one dot out of the live frame first is what makes it a dot the reader
	 * cannot see, so the layout's park stands and the travel happens at alpha 0.
	 *
	 * Through `reframe` rather than a bare write to `current`, so the frame an
	 * in-flight tween is easing FROM agrees and the next tick does not ease it
	 * straight back in (see tween.js).
	 */
	export function conceal(id) {
		if (!Number.isInteger(id) || id < 0 || id >= nodes.length) return;
		tweener.reframe((buf) => {
			buf[id * STRIDE + ALPHA_OFFSET] = 0;
		});
	}

	/** one node's position out of `buf`, in viewport coordinates */
	function spotIn(buf, id) {
		if (!container || !Number.isInteger(id) || id < 0 || id >= nodes.length) {
			return null;
		}
		const rect = container.getBoundingClientRect();
		return {
			x: rect.left + buf[id * STRIDE],
			y: rect.top + buf[id * STRIDE + 1]
		};
	}

	// -- Arrival state ----------------------------------------------------------
	let prevState = null;
	let prevParamsKey = null;
	let prevStep = -1;
	let entered = false;
	// While an entry choreography is playing, the set of ids whose names have
	// been introduced so far (see EntryAnim.labelsAfter); null = no gate, every
	// labelled id shows. Deliberately NOT $state: drawScene folds it into
	// `tracked` (which is reassigned every frame and is what the template reads),
	// so the labels stay reactive without the render effect depending on state it
	// also writes. The CSS opacity transition on .node-label does the fade.
	/** @type {Set<number> | null} */
	let entryLabels = null;
	// Names this arrival is introducing — labelled now, but not by the state we
	// came from — held back for LABEL_HOLD_MS, so the
	// annotation layer arrives together, once the dots have mostly landed, rather
	// than gliding along beside them. Names carried over from the previous state
	// are never held; blanking one already on screen would blink it off and back
	// on. Each name is held to its own time, because a route walk (`paramWalk`)
	// releases its co-stars one by one, as the line reaches each. Not $state,
	// for the same reason as entryLabels above.
	/** @type {Map<number, number> | null} id → performance.now() it is released at */
	let labelHolds = null;
	/** hold every one of `ids` until `until` */
	const holdLabels = (ids, until) => {
		labelHolds = ids.size ? new Map([...ids].map((id) => [id, until])) : null;
	};
	/** the names still waiting out their hold at `now`, or null for none */
	function heldAt(now) {
		if (!labelHolds) return null;
		const held = new Set();
		for (const [id, until] of labelHolds) if (now < until) held.add(id);
		return held.size ? held : null;
	}
	// ids the current state labels, kept so the next arrival can tell an
	// introduced name from a carried-over one
	let prevLabelIds = new Set();

	// -- The runner -------------------------------------------------------------
	// What a frame writer hands back (FrameOutput in states.js): per-frame chart
	// furniture, the camera it drew, and story fields to publish. Applied on
	// every tick of every choreography, so a leg that pans the camera keeps the
	// axes, the callout and the live playhead in step with the dots.
	/** @type {{ playhead: number, frontier: number } | null} */
	let lastCamera = null;
	function applyFrame(out) {
		if (!out) return;
		if (out.decor) {
			decor = { ...decor, ...out.decor };
			// This frame is drawing its own furniture, so it owns it: a choreographed
			// pan IS its axes moving, and holding the ticks back would pan an empty
			// chart. The generalisation of what `veil` used to do for one entry.
			furnitureHeld = false;
		}
		if (out.camera) {
			camera.apply(out.camera);
			lastCamera = camera.hold();
		}
		if (out.story) publish(out.story);
	}

	/**
	 * The story fields a frame publishes, by interaction group (see
	 * FrameOutput in states.js). Every write goes through an equality check: a
	 * write that changes nothing still invalidates the layout params and would
	 * retarget the tweener mid-run.
	 * @param {Record<string, Record<string, unknown>>} groups
	 */
	function publish(groups) {
		for (const [group, fields] of Object.entries(groups)) {
			for (const [key, value] of Object.entries(fields)) {
				if (story[group][key] !== value) story[group][key] = value;
			}
		}
	}

	// The context a choreography is planned against (ArrivalContext in
	// states.js). Built inside the render effect or a request's untracked run,
	// so the story it hands over is read untracked: nothing a plan reads can
	// re-run the effect that built it.
	const arrivalContext = (from) => ({
		w: width,
		h: height,
		from,
		exit: camera.exit,
		camera: camera.hold(),
		live: { attrs: tweener.current, trails: trailTweener.current },
		story
	});
	const phasesOf = (anim, ctx) =>
		typeof anim.phases === "function" ? anim.phases(ctx) : anim.phases;

	// Names introduced by beat `beat` of a choreography — 0 is the arrival, i + 1
	// is leg i (see EntryAnim.labelsAfter). The gate lifts entirely once the last
	// listed beat has landed.
	function introduceLabels(anim, beat) {
		const after = anim.labelsAfter;
		if (!after || !entryLabels || beat >= after.length) return;
		for (const id of after[beat]) entryLabels.add(id);
		if (beat === after.length - 1) entryLabels = null;
	}

	// The end of a choreography. One with a `finish` hands off through the story:
	// its last frame is the layout at the params it publishes (a race camera hold,
	// the simulation's playhead), so the param retarget that follows moves
	// nothing and settles. One without lands on the static layout it was authored
	// onto and settles here — which is also where the state's ambient begins.
	function finishChoreography(anim, finalAttrs, finalTrails) {
		camPanning = false;
		entryLabels = null;
		story.entryHeld = false;
		if (anim.finish) {
			anim.finish(story, lastCamera ?? undefined);
			// A finish that publishes a hold is naming where the chart now IS, so
			// the camera has to agree with it. `camera.publish` below resolves a
			// disagreement in the CAMERA's favour, so a finish that names a year the
			// camera was never moved to — `landAt`, which the backward retrace ends
			// on — had its hold overwritten and the step rested nineteen years away
			// from the one its prose reads out. `holdCamera` publishes the live
			// camera, so this is a no-op for every other finish.
			if (story.race.view) camera.apply(story.race.view);
		} else {
			tweener.to(finalAttrs, 0);
			trailTweener.to(finalTrails, 0);
			settle(stateName);
		}
		camera.publish(raceStep, width, height);
		// The last frame IS the layout, so the beat is over here rather than after
		// the param retarget a `finish` hands off to — otherwise the words waited
		// out another 450ms of a tween that moves nothing.
		land();
		// Last, so the button's `disabled` and the step's own `advanceon` flip in
		// the SAME flush as everything above. Cleared first, it left the button
		// live and pressable for the flush between the clear and the step change.
		if (story.running !== null) story.running = null;
	}

	// One leg after another on the choreographer, each frame written straight
	// into the live buffers and its output published. Single-writer discipline
	// throughout: the tweeners are stopped first and the choreographer's `active`
	// makes the render effect step aside; a state change's stop abandons the run;
	// and a choreography on the race chart owns the camera (camPanning), so a
	// choreographed pan is never fought by the scrubber mid-motion.
	function runLegs(anim, write, ctx, finalAttrs, finalTrails) {
		tweener.stop();
		trailTweener.stop();
		camPanning = !!raceStep;
		lastCamera = null;
		introduceLabels(anim, 0);
		choreo.legs(
			phasesOf(anim, ctx),
			(i, e, ms) =>
				applyFrame(write(tweener.current, trailTweener.current, i, e, ms)),
			(i) => {
				introduceLabels(anim, i + 1);
				// what the step's prose was waiting for is on screen now, so the
				// card can speak (see EntryAnim.cardAfter) — and the beat counts as
				// landed, which is what stops a long opening flight holding the
				// words back for the whole of it
				if (i === anim.cardAfter) {
					story.entryHeld = false;
					land();
				}
			},
			() => finishChoreography(anim, finalAttrs, finalTrails)
		);
	}

	// The arrival tween onto a choreography's frame 0, then its legs — which only
	// start if the tween lands: a superseding tween (Next mid-flight) drops the
	// callback, so a reader who steps on skips the choreography like any other.
	// `arrivalJitter` is the state's own (see EntryAnim).
	function startArrival(p) {
		const jitter = p.anim.arrivalJitter ?? TWEEN_JITTER;
		tweener.to(p.startAttrs, TWEEN_MS, jitter, p.stateDelays, () => {
			// The dots are in place: THIS is the landing the words were waiting for,
			// not the end of the legs that follow. The legs are the step's authored
			// reveal and its prose describes them, so holding the card for the whole
			// of a 1.6s fan or a 4s sweep leaves it blank over the very motion it is
			// captioning. An entry that genuinely needs the words later says so with
			// cardAfter, which runLegs honours at its own beat.
			if (p.anim.cardAfter == null) land();
			runLegs(p.anim, p.write, p.ctx, p.finalAttrs, p.finalTrails);
		});
		// coterminous with the attrs tween, so runLegs' trailTweener.stop() can no
		// longer strand a slot part-way: the old two-phase fade pushed the real
		// trail tween out past the legs' start and left every slot the entry's
		// writer does not itself stamp frozen at whatever fraction it had reached
		trailTweener.to(p.startTrails, TWEEN_MS, 0);
	}

	// An arrival that plays an entry choreography (EntryAnim in states.js). The
	// legs' frame 0 — stamped over the static layout by the writer, or by the
	// entry's own `seed` — is what the arrival lands on; a plan with no legs
	// finishes at once. Then one of three ways in: the choreography owns the
	// arrival and its legs take the rAF straight from the step change; it holds
	// on a frame of its own until the story opens the way (`hold`, fired by the
	// effect on pendingArrival); or the ordinary arrival tween carries the buffers
	// onto frame 0 and hands over on its onDone. Only reached with real motion —
	// reduced motion and resize take the render effect's snap branch first.
	function arrive(anim, from, target, stateDelays) {
		const ctx = arrivalContext(from);
		const phases = phasesOf(anim, ctx);
		const write = anim.frames(
			nodes,
			width,
			height,
			edges,
			layoutParams,
			bleed,
			ctx
		);
		// no name is on the chart until its beat lands, and the step card waits
		// for the leg that earns it
		if (anim.labelsAfter) entryLabels = new Set();
		if (anim.cardAfter != null) story.entryHeld = true;
		if (phases.length === 0) {
			lastCamera = null;
			finishChoreography(anim, target.attrs, target.trails);
			return;
		}
		const startAttrs = target.attrs.slice();
		const startTrails = target.trails.slice();
		if (anim.seed) {
			anim.seed(
				nodes,
				width,
				height,
				edges,
				layoutParams,
				bleed,
				ctx
			)(startAttrs, startTrails);
		} else {
			write(startAttrs, startTrails, 0, 0, 0);
		}
		const pending = {
			anim,
			write,
			ctx,
			startAttrs,
			startTrails,
			stateDelays,
			finalAttrs: target.attrs,
			finalTrails: target.trails
		};
		if (anim.ownsArrival) {
			// frame 0 IS the departing frame, so this snap moves nothing, and the
			// legs own the rAF from the step change at whatever rate they author
			tweener.to(startAttrs, 0);
			trailTweener.to(startTrails, 0);
			// frame 0 IS the departing frame, so nothing is travelling and there is
			// no landing to wait for: the legs ARE this step's subject and its words
			// are their caption. Unless the entry names a later beat (cardAfter),
			// which is how the opening flight holds its card for three seconds.
			if (anim.cardAfter == null) land();
			runLegs(anim, write, ctx, target.attrs, target.trails);
			return;
		}
		if (!anim.hold) {
			startArrival(pending);
			return;
		}
		// park on the hold frame — invisible under whatever is covering it — and
		// wait for the story to open the way. The flight is armed here rather than
		// run here so the canvas can never be moving while the HTML the reader is
		// watching isn't.
		const holdAttrs = new Float64Array(tweener.current);
		const holdTrails = new Float64Array(trailTweener.current);
		anim.hold.frame(
			nodes,
			width,
			height,
			edges,
			layoutParams,
			bleed,
			ctx
		)(holdAttrs, holdTrails);
		tweener.to(holdAttrs, 0);
		trailTweener.to(holdTrails, 0);
		pendingArrival = pending;
	}

	// A reader's ask (RequestAnim in states.js): the active state's
	// `requests[kind]`, run from wherever the canvas is. Lands any tween still in
	// flight first — the writer stamps only the slots it animates, so a tween
	// stopped mid-flight would strand every other dot where it had got to — and
	// abandons a pending or running arrival, gates included, so an ask that lands
	// before the chapter's own arrival has finished supersedes it cleanly. A plan
	// with no legs is a dropped ask. Under reduced motion the last frame is
	// written and the finish published, so the layout path snaps onto the same
	// end state the run would have reached.
	function playRequest(kind, anim) {
		if (!width || !height) return;
		const ctx = arrivalContext(prevState);
		const phases = phasesOf(anim, ctx);
		if (phases.length === 0) return;
		anim.start?.(story);
		choreo.stop();
		if (tweener.running) tweener.to(tweener.target, 0);
		if (trailTweener.running) trailTweener.to(trailTweener.target, 0);
		pendingArrival = null;
		entryLabels = null;
		story.entryHeld = false;
		const write = anim.frames(
			nodes,
			width,
			height,
			edges,
			layoutParams,
			bleed,
			ctx
		);
		if (reducedMotion) {
			const last = phases.length - 1;
			lastCamera = null;
			applyFrame(
				write(tweener.current, trailTweener.current, last, 1, phases[last])
			);
			anim.finish?.(story, lastCamera ?? undefined);
			camera.publish(raceStep, width, height);
			return;
		}
		story.running = kind;
		runLegs(anim, write, ctx, tweener.target, trailTweener.target);
	}

	// A state's ambient drift (STATE_AMBIENT): unlike an entry choreography this
	// never ends, so there is no final leg and no settle to land on — the arrival
	// has already settled, and the writer's own t = 0 frame is what it landed on,
	// so the first tick redraws that frame and the join moves nothing. Same
	// single-writer discipline as runLegs and the same skippability: a state
	// change stops it, and the next arrival tween then snapshots `current`, so the
	// dots fly on from wherever the drift had them rather than snapping back.
	//
	// Never runs under reduced motion — the static layout is the still frame.
	function playAmbient(anim) {
		if (!width || !height || reducedMotion) return;
		// this loop never ends by itself, so it must never be started twice — a
		// second loop would leave the first one running and uncancellable, two
		// writers fighting over the same buffer
		choreo.stop();
		tweener.stop();
		trailTweener.stop();
		const write = anim.frames(nodes, width, height, edges, layoutParams, bleed);
		// armed AFTER stop() above, which would otherwise read the flag this call
		// is about to set and drop the cache for a flight that had not started
		skyFlying = true;
		choreo.loop((t) => write(tweener.current, trailTweener.current, t));
	}

	// Records the state whose arrival has just landed. A layout can read this to
	// hold an interaction back until its own authored reveal has finished.
	//
	// Never cleared here: the arrival rules clear it on a change of state, before
	// the step moves (see arrivals.js), so a round trip back into a state cannot
	// find it already armed.
	//
	// Guarded on the live state so a callback that outlives its step can't arm the
	// wrong one; a superseded tween drops its callback (see tween.js), so a reader
	// who steps on mid-reveal never arms at all.
	//
	// It is also where a state's ambient drift begins — the arrival is over, so the
	// rAF is free. Hooking it here rather than at each arrival covers every path
	// into a state at once (a plain state tween's onDone, an entry's end, the
	// cold-start and first-paint branches, and the reduced-motion/resize snap),
	// and expresses the rule: the ambient begins where the reveal ends.
	function settle(name) {
		if (name !== stateName) return;
		story.settled = name;
		land();
		// Safe to start from inside the render effect (which the snap branches do):
		// the choreographer's `active` is not reactive, so setting it invalidates
		// nothing — see its declaration for why that matters.
		const ambient = STATE_AMBIENT[name];
		if (ambient) playAmbient(ambient);
	}

	/**
	 * The BEAT has landed: the step's words may speak, the arriving furniture may
	 * mount and the step's panel may come up.
	 *
	 * Step-scoped, not state-scoped — see story.settledStep for why a state name
	 * cannot answer this. Idempotent, and guarded by the live step, so a callback
	 * that outlived its beat cannot land the wrong one.
	 */
	function land() {
		furnitureHeld = false;
		if (story.settledStep !== step) story.settledStep = step;
	}

	/** how long the reader watches each kind of arrival before it settles */
	const ARRIVAL_MS = {
		cold: 0,
		snap: 0,
		liveIn: 0,
		popIn: ENTER_MS,
		state: TWEEN_MS,
		params: PARAM_TWEEN_MS,
		entry: TWEEN_MS
	};

	// -- The reader's pan -------------------------------------------------------
	// One glide loop that eases the camera toward the reader's target
	// (story.race.scrubYear) and writes the panned frame each tick, so a year change
	// glides instead of snapping. Runs while the reader is panning OR until the
	// reel catches up after release; once released AND settled it holds via
	// raceView (one param-tween settle restarts the generic writers). Bypasses
	// the reactive layout path — that would route through the straight-line
	// tweener and leak a layoutFor cache entry per frame.
	function startScrub() {
		// single-writer discipline: take the rAF from the generic writers, then own
		// it for the glide loop. Land whatever they were tweening toward first: the
		// glide's frame writer only stamps the race slots (writeRaceSweepFrame), so
		// stopping a tween mid-flight would strand every other dot — the crowd of
		// the chapter we just arrived from — wherever it had got to, with nothing
		// left running to finish moving it.
		choreo.stop();
		if (tweener.target) tweener.to(tweener.target, 0);
		if (trailTweener.target) trailTweener.to(trailTweener.target, 0);
		tweener.stop();
		trailTweener.stop();
		camPanning = true;
		choreo.loop(scrubTick, () => {
			camPanning = false;
			if (!raceStep?.extent) return;
			story.race.view = camera.hold();
			camera.publish(raceStep, width, height);
		});
	}
	/** one tick of the glide; false once the reader has let go and the reel has caught up */
	function scrubTick() {
		if (!raceStep?.extent) return false;
		const caughtUp = camera.glide(
			raceStep,
			width,
			height,
			story.race.scrubYear,
			reducedMotion ? 1 : SCRUB_EASE
		);
		const { axes, callout, band, frontier } = writeRaceSweepFrame(
			tweener.current,
			trailTweener.current,
			width,
			height,
			racePanFrame(raceStep, camera.playhead),
			STATE_YCAP[stateName]
		);
		applyFrame({ decor: { axes, callout, band }, camera: { frontier } });
		return story.race.scrubbing || !caughtUp;
	}

	// -- Drawing ----------------------------------------------------------------
	/**
	 * Is a dot's centre on the active race step's plot?
	 *
	 * The frame writer never puts one off it — writeRaceSweepFrame hides any cast
	 * dot whose value has left the fitted band — but the tweener that carries the
	 * reader between two race steps does: it eases alpha and position together, so
	 * an actor the arriving step drops is drawn out on its own curve, above or
	 * below the plot, for the whole of the tween. Testing the CENTRE rather than
	 * clipping the canvas is what keeps the dots that legitimately ride the plot's
	 * right edge whole instead of sliced in half.
	 *
	 * Both the draw pass and the label cut go through here, so a name can never
	 * outlive the dot it belongs to.
	 *
	 * Answers yes unconditionally unless the cull is armed (racePlotCulling): a
	 * dot on its way in from another chapter is off the plot for good reason.
	 *
	 * @param {Float32Array} attrs the frame's dot buffer
	 * @param {number} i the dot's base index into `attrs`
	 */
	function onRacePlot(attrs, i) {
		if (!racePlotRect || !racePlotCulling) return true;
		const x = attrs[i];
		const y = attrs[i + 1];
		return (
			x >= racePlotRect.left - 0.5 &&
			x <= racePlotCullRight + 0.5 &&
			y >= racePlotRect.top - 0.5 &&
			y <= racePlotRect.bottom + 0.5
		);
	}
	// The galaxy beat's names, reused rather than rebuilt: like raceLabelCut
	// this is decided per FRAME, and the per-frame writers on this path document
	// themselves as allocating nothing.
	const galaxyShownSet = new Set();
	/** the title card's highlight beat names exactly the actors it is on (up to two at once) */
	function galaxyLabelCut() {
		galaxyShownSet.clear();
		for (const id of galaxyHighlight.ids) galaxyShownSet.add(id);
		return galaxyShownSet;
	}
	/**
	 * The names one FRAME shows. On the race chart the step declares every name
	 * its camera RANGE can need (a superset — see raceLabelSpec), and the cut to
	 * the RACE_LABEL_TOP the current camera puts nearest the centre happens here,
	 * against the live dot positions. Doing it per frame rather than per step is
	 * what keeps the gutter at ten names on the crowded mid-2000s cameras without
	 * the declared set having to know which camera the reader is on; because it
	 * reads the dots the frame just wrote, it also slides continuously as the
	 * camera pans instead of resolving in one jump at the settle. The galaxy beat
	 * is the other per-frame cut: the title card declares no names at all, and the
	 * flight's writer says who the beat is on as it writes each frame, so the
	 * card's one name can only be resolved here.
	 */
	function shownLabels(attrs) {
		if (raceStep) {
			return raceLabelCut(attrs, {
				highlight: raceStep.highlight,
				labelIds,
				onPlot: (id) => onRacePlot(attrs, id * STRIDE),
				top: RACE_LABEL_TOP
			});
		}
		return galaxyHighlight.ids.length > 0 ? galaxyLabelCut() : labelIds;
	}
	const stacker = createLabelStacker(LABEL_LINE_GAP_PX);
	// The label de-collider relaxes toward its target a little per DRAWN frame,
	// and the things that drive frames stop once the dots are in place — so the
	// labels need a few frames of their own after that to finish arriving. One
	// pending rAF at a time, cancelled by whoever draws next; it stops on its own
	// as soon as the stack has settled. Not $state: it is only ever read and
	// written inside drawScene.
	let labelRelaxRaf = null;

	/** the race cast's cull mid-chapter (see onRacePlot), or nothing to cull */
	function dotCull(attrs) {
		if (!racePlotCulling || !racePlotRect) return null;
		// scoped to the cast, so a crowd arriving from — or leaving for — a
		// neighbouring chapter still crosses the whole canvas
		return (i) => RACE_CAST.has(i / STRIDE) && !onRacePlot(attrs, i);
	}
	// raceFuture is the one step whose name column is pinned at the LEFT
	// (tailPx), so its names lie over the plot and an overflowing stack would
	// land on the x-axis tick row — eight names packed into the band's bottom
	// ~70px need ~112px, and on a short viewport the last two land on the year
	// labels. The stacker lifts the whole set off the plot floor for it.
	function labelFloor() {
		return raceStep?.tailPx !== undefined && height
			? plotBottom(height) - 4
			: null;
	}
	/** owe the labels another frame while their stack is still relaxing */
	function relaxLabels(settled) {
		if (labelRelaxRaf != null) cancelAnimationFrame(labelRelaxRaf);
		labelRelaxRaf = settled
			? null
			: requestAnimationFrame(() => {
					labelRelaxRaf = null;
					drawScene();
				});
	}

	function drawScene() {
		if (!ctx) return;
		const attrs = tweener.current;
		clearCanvas(ctx, width, height, bleed);
		drawTrails(ctx, trailTweener.current);
		drawEdges(
			ctx,
			attrs,
			tweener.target,
			tweener.start,
			edgeEnds,
			choreo.active
		);
		drawDots(ctx, attrs, dotCull(attrs));
		// held names (see labelHolds) are still waiting out their lag; drawScene
		// runs every frame of the arrival tween, which always outlasts the hold, so
		// this flips over mid-tween with no timer of its own
		const held = heldAt(performance.now());
		stepLegendGlide();
		const nextTracked = trackLabels(attrs, TRACKED_IDS, {
			names: (id) => labelTexts[id] ?? nodes[id].name,
			// A name is overlay furniture like any other, so it waits for the beat.
			// The four states the audit named (hopBands, careerMany, scatterQuiz,
			// raceClose) declare neither `labelsAfter` nor an entry, so nothing held
			// their names and they rode their dots for the whole of the travel —
			// up to 558px of it. `furnitureHeld` is dropped by land(), and by the
			// first frame that publishes furniture of its own, so a choreographed
			// pan still carries its names.
			shown: furnitureHeld ? EMPTY_LABELS : shownLabels(attrs),
			gate: entryLabels,
			held
		});
		const { moved, dirs, settled } = stacker.stack(
			nextTracked,
			labelDirs,
			labelFloor()
		);
		if (moved.length > 0) {
			relaxLabels(settled);
			drawLabelLeaders(ctx, attrs, moved, dirs);
		}
		frameDirs = dirs;
		labelBleed = bleed;
		tracked = nextTracked;
	}

	// -- Effects ----------------------------------------------------------------
	// The race camera on a state change: drop the hold, remember the departing
	// camera, rest on the arriving step's. Depends on stateName ONLY (the reads
	// are untracked) — a choreography publishing raceView while the state is
	// unchanged must not re-fire this. Declared before the render effect so it
	// wins the flush when a step change dirties both.
	$effect(() => {
		stateName;
		const step = STATE_RACE[stateName];
		untrack(() => camera.reset(step, width, height));
	});
	// ...and its bounds for the pan control, at every rest point the state or
	// the box gives it (the choreographies publish their own on finishing)
	$effect(() => {
		raceStep;
		width;
		height;
		untrack(() => camera.publish(raceStep, width, height));
	});

	// When the reader starts dragging/keying the year control, kick off the glide
	// loop (which then self-drives off story.race.scrubYear until it settles and hands
	// off to raceView). Declared before the render effect so it wins the flush;
	// the loop-start is untracked.
	//
	// Keyed on the target year as well as `scrubbing`: an arrow key on the slider
	// raises and drops `scrubbing` inside one keydown (bits-ui commits on every
	// key), so by the time this runs the flag is already down and only the year
	// says the reader moved. camera.reset() clears the year on a state change, so
	// a new step never inherits a glide.
	$effect(() => {
		if (story.race.scrubbing || story.race.scrubYear !== null)
			untrack(() => camPanning || startScrub());
	});

	// A reader's ask: a StartButton bumps `story.request` (see request() in
	// story.svelte.js) and the active state's `requests[kind]` plays. Watched as a
	// counter, so a second press of the same kind is a fresh ask and the reset
	// back to nonce 0 is not one; gated on the active state, so a press whose
	// step the reader has already left is a no-op. Declared before the render
	// effect so it wins the flush: it has to own the rAF before a param change
	// the ask itself makes (the simulation's playhead reset) would tween the
	// chart on. Everything else about the run is the state's own declaration.
	let requestSeen = 0;
	$effect(() => {
		const { kind, nonce } = story.request;
		if (nonce === requestSeen) return;
		requestSeen = nonce;
		const anim = STATE_REQUESTS[stateName]?.[kind];
		if (nonce === 0 || !anim) return;
		untrack(() => playRequest(kind, anim));
	});

	// An arrival held on a frame until the story lets it go (EntryAnim.hold): the
	// rank list's collapse into the race chart, where the canvas parks on a copy
	// of what the HTML overlay is showing and must not move until that overlay
	// has stood down. `$state.raw`, because the payload is buffers, which must
	// not be proxied — and reactive so this fires on whichever lands last, the
	// gate opening or the arrival arming; waiting only on the gate would strand
	// the canvas on the hold frame for good on any arrival that finds it already
	// open. Cleared by every render pass, so a state change mid-hold disarms it.
	/** @type {{ anim: import("./states.js").EntryAnim, write: Function, ctx: import("./states.js").ArrivalContext, startAttrs: Float64Array, startTrails: Float64Array, stateDelays: Float64Array, finalAttrs: Float64Array, finalTrails: Float64Array } | null} */
	let pendingArrival = $state.raw(null);
	$effect(() => {
		const pending = pendingArrival;
		if (!pending) return;
		const open = pending.anim.hold.until(story);
		untrack(() => {
			if (!open || pending !== pendingArrival) return;
			pendingArrival = null;
			startArrival(pending);
		});
	});

	// -- The render effect ------------------------------------------------------
	// Reacts to what the story is SHOWING — state, params, canvas size — and to
	// nothing else. It classifies the arrival and hands it to one of the writers
	// below; everything about HOW a state arrives is the state's own declaration.

	/**
	 * A choreography owned the rAF when the story changed under it: a genuine
	 * state change (Next) abandons it — dots tween on from wherever they are, so
	 * Next stays live and any in-progress scrub ends. A resize abandons it too,
	 * and must: a frame writer closes over the canvas box it was built for, so a
	 * leg that kept running after a rotate would draw the old geometry for the
	 * rest of its life — and an ambient loop has no rest of its life, so it would
	 * never recover. The snap branch re-fits, and settle() restarts the ambient
	 * at the new size. A run the reader stepped away from is over, however far it
	 * got — its button is left usable for a reader who steps back.
	 */
	function abandonChoreography() {
		choreo.stop();
		if (story.race.scrubbing) untrack(() => (story.race.scrubbing = false));
		if (story.running !== null) untrack(() => (story.running = null));
	}

	/**
	 * Which arrival this run is. `firstPaint` is the visual's first frame ever:
	 * a reader who reloaded mid-story (the step restored from the URL) settles
	 * straight onto the state, since this is not their first-ever view and the
	 * pop-in reads as an empty chart on faint states; everyone else gets the
	 * grow-in — unless the state's own ambient declares `liveReveal` (only
	 * `titleGalaxy` today), which starts the loop immediately instead: its
	 * ambient authors its own fade-up, so a dot is already moving by the time
	 * it is visible rather than static and then set going (see
	 * `withTitleReveal` in `layouts/intro.js`). After that a resize or reduced
	 * motion snaps, a declared entry plays, a state change tweens, a params
	 * change retargets, and a run that rebuilt the same layout (a dev tuner's
	 * edit) holds the frame.
	 */
	function firstPaintKind() {
		if (coldStart) return "cold";
		if (reducedMotion) return "snap";
		if (STATE_AMBIENT[stateName]?.liveReveal) return "liveIn";
		return "popIn";
	}
	function arrivalKind({ firstPaint, resized, stateChange, entryAnim }) {
		if (firstPaint) return firstPaintKind();
		if (resized || reducedMotion) return "snap";
		if (entryAnim) return "entry";
		if (stateChange) return "state";
		return "params";
	}

	/**
	 * Drop any gate a previous choreography left behind — an arrival tween
	 * superseded before its onDone fired never reaches its legs, and a stale gate
	 * would hide the new state's names for good. Re-armed only if this arrival
	 * actually plays an entry. The step card's own gate goes with it, and for the
	 * same reason — a choreography the reader taps through must not leave the
	 * next step's prose held back. Likewise an arrival a previous pass left
	 * waiting on its hold.
	 *
	 * Returns the names this arrival introduces — labelled now, but not by the
	 * state we came from — for the wait-for-your-dot hold (see labelHolds).
	 */
	function resetArrivalGates(from) {
		entryLabels = null;
		story.entryHeld = false;
		pendingArrival = null;
		const introduced = new Set();
		for (const id of labelIds) if (!prevLabelIds.has(id)) introduced.add(id);
		labelHolds = null;
		prevLabelIds = labelIds;
		// Arm the draw pass's plot cull only for a move that starts and ends on the
		// chart — a step change or a param settle within the chapter, where a dot
		// off the plot is a tween artefact. Crossing INTO the chapter (the rank
		// list's flight, or a backwards step out of the next one) legitimately
		// carries the cast across the canvas, so the cull stays down for it.
		racePlotCulling = !!STATE_RACE[from] && !!STATE_RACE[stateName];
		return introduced;
	}

	/** @typedef {{ attrs: Float64Array, trails: Float64Array, delays?: Float64Array, paramWalk?: { clear: Float64Array, fadeMs: number, ms: number, windows: Float64Array, labelAt: [number, number][] }, trailDelays?: Float64Array }} Target */

	/** land on the state and settle, with no motion */
	function snapTo(target) {
		tweener.to(target.attrs, 0);
		trailTweener.to(target.trails, 0);
		settle(stateName);
	}
	/** the first paint's grow-in: positions seeded instantly with radius and alpha zeroed, so visible dots grow in place instead of popping */
	function popIn(target) {
		const entry = target.attrs.slice();
		for (let i = 0; i < EDGE_BASE; i += STRIDE) {
			entry[i + 2] = 0;
			entry[i + 6] = 0;
		}
		for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) {
			entry[i] = 0;
			entry[i + 1] = 0;
		}
		tweener.to(entry, 0);
		tweener.to(target.attrs, ENTER_MS, TWEEN_JITTER, target.delays, () =>
			settle(stateName)
		);
		trailTweener.to(target.trails, ENTER_MS, 0, target.trailDelays);
	}
	/**
	 * A plain state change: one tween, on the state's authored delays where it
	 * declares them for this direction, else the edge lag. The tweener only fires
	 * onDone once every delayed group has landed, so that is the end of the
	 * state's authored reveal — and a superseded tween drops its callback, so a
	 * reader who hits Next mid-reveal never settles.
	 */
	function tweenToState(target, stateDelays, introduced) {
		holdLabels(introduced, performance.now() + LABEL_HOLD_MS);
		tweener.to(target.attrs, TWEEN_MS, TWEEN_JITTER, stateDelays, () =>
			settle(stateName)
		);
		trailTweener.to(target.trails, TWEEN_MS, 0, target.trailDelays);
	}
	/**
	 * An interaction: retarget quickly, with no choreography of its own (delays
	 * would make a small pan/highlight feel laggy). A layout that authors a
	 * walk for the retarget (`paramWalk`) gets it instead, in two stages: a
	 * tween to its `clear` frame, then the walk itself, each group on its own
	 * linear share of it — the constellation's old route fades out whole, and
	 * the new one travels from the picked actor in to Bacon without pausing at
	 * the co-stars between. A retarget mid-way supersedes whichever stage is
	 * running, and the clear's onDone with it. Still
	 * settles on completion — rankFocus's bar only gets its real target once
	 * RankBars measures its row (story.rank.focusBar), so this is the one state
	 * whose "reveal has landed" moment is a param retarget rather than the
	 * state's own arrival tween.
	 */
	function tweenToParams(target) {
		trailTweener.to(target.trails, PARAM_TWEEN_MS, 0);
		const walk = target.paramWalk;
		if (!walk) {
			tweener.to(target.attrs, PARAM_TWEEN_MS, 0, null, () =>
				settle(stateName)
			);
			return;
		}
		// each co-star's name waits for the line reaching them
		const now = performance.now();
		labelHolds = new Map(walk.labelAt.map(([id, ms]) => [id, now + ms]));
		// a copy, parked like the target, because `walk.clear` is cached
		const clear = walk.clear.slice();
		parkLeavers(clear);
		tweener.to(clear, walk.fadeMs, 0, null, () =>
			tweener.to(
				target.attrs,
				walk.ms,
				0,
				null,
				() => settle(stateName),
				walk.windows
			)
		);
	}

	/** everything the render effect needs measured before it can build a layout */
	const canvasReady = () =>
		!!(canvas && width && height && canvasWidth && stateName);

	/**
	 * Whether the backing store has to be re-fitted, which is also what makes the
	 * arrival a snap. A change of the measured box is one, and so is a move of
	 * the column in the viewport (`moved`, see measureBleed).
	 *
	 * The plot's share of the column counts as well, box or no box: `plotBottom`
	 * scales every y a layout writes, so the frame on screen is as wrong after a
	 * bare flip of it as it is after the box changed height. That flip happens on
	 * every cold load past the side-by-side breakpoint — `dimensions.width` is 0
	 * until its effect runs, so the first layout is built stacked and `beside`
	 * only turns true afterwards, with the measured box unmoved. Without this term
	 * `unchanged` early-returned on that run and the chart kept the stacked plot's
	 * height for the rest of the session, until some other change happened to
	 * rebuild it — which is how answering the quiz's first pair came to jump the
	 * scatter's y-axis half a chart down the screen.
	 */
	function isResize(moved) {
		return (
			moved ||
			width !== prevW ||
			height !== prevH ||
			canvasWidth !== prevCanvasW ||
			plotFrac !== prevPlotFrac
		);
	}

	/**
	 * Fit the canvas to the box the story is showing. Returns whether it resized
	 * (the backing store re-fitted), or null when a choreography owns the frame
	 * and nothing about the state or box changed under it: a param/raceView
	 * change while a choreography owns the rAF is its own handoff, and the effect
	 * steps aside (scrubbing implies active, so this one guard covers both).
	 */
	function fitBox() {
		// the plot's share of the column is a property of the PAGE's layout, not of
		// any one state, so it is set here — once, before any layout is built —
		// rather than threaded through ten layout modules. `beside` is a prop, so
		// the effect already re-runs when the breakpoint flips, and `isResize`
		// is what stops that re-run being discarded as a no-op.
		setPlotBottomFrac(plotFrac);
		// where the column sits in the viewport, which the full-bleed layouts
		// author their sky against
		const resized = isResize(measureBleed());
		if (choreo.active) {
			if (stateName === prevState && !resized) return null;
			abandonChoreography();
		}
		if (resized) fitCanvas();
		return { resized };
	}

	/**
	 * A re-run that changes nothing must DO nothing, and this effect gets them.
	 * `layoutParams` is a `$derived` over the `story` proxy, and every arrival
	 * paints synchronously — `to()` with ms 0 calls draw() on the spot — so a
	 * paint that publishes into `story` invalidates that derived and hands the
	 * effect back a params object with identical CONTENTS and a new identity.
	 * `paramsKey` compares by value and rightly reports no change; the run itself
	 * was caused by identity. Without this guard such a run would retarget the
	 * tween in flight and — see tween.js — drop its `onDone` with it; on a cold
	 * start that onDone is the ONLY call to `settle()`, so the 900ms entry tween
	 * would be snapped away at birth.
	 */
	const unchanged = (box, cacheDropped, paramsKey) =>
		!box.resized &&
		!cacheDropped &&
		stateName === prevState &&
		paramsKey === prevParamsKey;

	/**
	 * The arrival's own clock. Node slots are the state's authored reveal, where
	 * it was choreographed for the direction the reader is coming from
	 * (STATE_REVEAL_FROM); edge slots are the lag, and ONLY where a link is
	 * fading IN — that is the one thing the lag is for.
	 *
	 * A link fading OUT goes with the names (motion.md rule 2), so an arrival
	 * with no link arriving carries an all-zero array. That is what makes the
	 * tween settle on time: `tick` holds `onDone` back until the LAST delayed
	 * group lands, so a shared 525ms edge lag meant a nominally 700ms arrival did
	 * not settle for 1225ms — on states with no arriving edges at all — and
	 * everything chained off the settle (an entry's legs, the sky, the prose)
	 * inherited the dead half-second.
	 *
	 * One array per arrival, never per frame: `to()` copies it into the tweener's
	 * own `delays`, so nothing retains this.
	 */
	function arrivalDelays(from, target) {
		const revealFrom = STATE_REVEAL_FROM[stateName];
		const playReveal = !revealFrom || revealFrom.includes(from);
		const delays = new Float64Array(DELAY_SIZE);
		if (playReveal && target.delays != null) {
			// node slots only: the one layout that authors edge delays is
			// layoutNetworkIntro, whose own entry replays them inside its leg writer
			delays.set(target.delays.subarray(0, nodes.length));
		}
		const live = tweener.current;
		for (let e = 0; e < edgeEnds.length; e++) {
			const i = EDGE_BASE + e * STRIDE + 1;
			// `+ ALPHA_SEEN`, not a bare `>`: `live` is Float32 and the target is
			// Float64, so an unchanged alpha differs by rounding and a bare compare
			// would hand a 525ms lag to a link that is not moving
			if (target.attrs[i] > live[i] + ALPHA_SEEN) {
				delays[nodes.length + e] = EDGE_LAG_MS;
			}
		}
		return delays;
	}

	// How each arrival kind lands. The first paint's names are on screen at
	// once, so the next arrival has nothing to introduce (leaving them behind
	// would make it read every carried-over name as new and hold it out for the
	// lag); every later arrival resets the gates a previous choreography may
	// have left behind.
	const ARRIVE = {
		cold: (target) => {
			prevLabelIds = labelIds;
			snapTo(target);
		},
		popIn: (target) => {
			prevLabelIds = labelIds;
			popIn(target);
		},
		// `liveReveal`'s own arrival: the ambient authors its own fade-up (see
		// `withTitleReveal`), so there is nothing for a tween to carry — settle
		// immediately and let the loop's own t = 0 frame be what the reader
		// sees first, exactly as an ambient's contract already promises.
		liveIn: () => {
			prevLabelIds = labelIds;
			settle(stateName);
		},
		snap: (target, from) => {
			resetArrivalGates(from);
			snapTo(target);
		},
		// The two kinds that are transitions get the out beat in front: what the
		// arriving state does not draw fades where it stands before anything
		// travels. `snap`, `cold` and `popIn` do not — a resize, a cold start and
		// reduced motion are where motion is impossible (rules 7, 12, 13) — and
		// neither does `params`, a 450ms retarget inside one state that kills no
		// link and changes no chart.
		//
		// The beat wraps `arrive` rather than sitting inside `startArrival`
		// because `ownsArrival` bypasses the arrival tween entirely: without it,
		// stepping off the title card snapped up to eighty highlight-beat spokes
		// off in a single frame.
		entry: (target, from, entryAnim) => {
			// threaded through the way ARRIVE.state does: an entry arrival used to
			// discard this and so never got the introduced-name hold at all, which
			// meant an entry was the one arrival whose new names rode the dots
			const introduced = resetArrivalGates(from);
			holdLabels(introduced, performance.now() + LABEL_HOLD_MS);
			const delays = arrivalDelays(from, target);
			departFade(target, from, () => arrive(entryAnim, from, target, delays));
		},
		state: (target, from) => {
			const introduced = resetArrivalGates(from);
			// Armed HERE and not only inside tweenToState, exactly as the entry
			// arrival above does it: the out beat runs first, and a name this
			// arrival introduces must not be on screen for it. Left until the beat
			// had finished, such a name faded in over the chart being left, faded
			// straight back out when the hold was finally armed, and faded in a
			// third time when it lifted — three fades for one arrival (rules 2, 7).
			// The deadline is restamped when the travel actually begins, so the
			// hold still lifts three quarters of the way through the tween rather
			// than three quarters of the way through the beat in front of it.
			holdLabels(
				introduced,
				performance.now() + DEPART_FADE_MS + LABEL_HOLD_MS
			);
			const delays = arrivalDelays(from, target);
			departFade(target, from, () => tweenToState(target, delays, introduced));
		},
		params: (target, from) => {
			resetArrivalGates(from);
			tweenToParams(target);
		}
	};

	$effect(() => {
		const cacheDropped = dropStaleLayouts();
		// canvasWidth is in here with the rest: it sizes the backing store, so a tick
		// where it has not been measured yet would hand the store a width of 0 and
		// blank the canvas until the next resize
		if (!canvasReady()) return;
		const box = fitBox();
		// A new beat, taken before the early returns below and independently of
		// the state: a step change is a beat even where the state and its params
		// are identical, which is exactly the case six steps in this story are.
		const beat = step !== prevStep;
		prevStep = step;
		if (!box) return;
		const paramsKey = JSON.stringify(layoutParams) ?? "";
		if (unchanged(box, cacheDropped, paramsKey)) {
			// Two steps resting on one layout: nothing travels, so nothing is kept
			// waiting. `beat` is load-bearing — the identity-only re-runs this guard
			// exists for must NOT land, or a publish mid-arrival would release the
			// words early.
			if (beat) land();
			return;
		}
		const from = prevState;
		const firstPaint = !entered;
		entered = true;
		const stateChange = stateName !== from;
		const entryAnim = stateChange ? entryFor(stateName, from) : undefined;
		const kind = arrivalKind({
			firstPaint,
			resized: box.resized,
			stateChange,
			entryAnim
		});
		prevState = stateName;
		prevParamsKey = paramsKey;
		const layout = layoutFor(stateName, width, height, layoutParams, bleed);
		swapFurniture(
			staticDecor(layout),
			from,
			box,
			kind === "entry" && !!entryAnim.ownsFurniture,
			ARRIVAL_MS[kind]
		);
		// a copy, because parkLeavers rewrites it and `layout.attrs` is cached
		const attrs = layout.attrs.slice();
		parkLeavers(attrs);
		/** @type {Target} */
		const target = {
			attrs,
			// states without trails fade the previous ones out where they lie
			trails: layout.trails ?? fadeOutTrails(),
			delays: layout.delays,
			paramWalk: layout.paramWalk,
			trailDelays: layout.trailDelays
		};
		ARRIVE[kind](target, from, entryAnim);
	});

	$effect(() => () => {
		tweener.stop();
		trailTweener.stop();
		choreo.stop();
		if (leavingRaf) cancelAnimationFrame(leavingRaf);
	});
</script>

<div
	class="visual"
	bind:this={container}
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<!-- The drawn chart — canvas, names and axis furniture — is hidden from
	     assistive tech: read in DOM order it is a heap of axis ticks and a
	     hundred names with no relations between them. Each step says what its
	     chart shows instead, in the prose column (Step's `alt`). What stays
	     reachable is what is not just the chart restated: the race callout's
	     note, the actor targets (.hits) and the step's panel. -->
	<canvas bind:this={canvas} bind:clientWidth={canvasWidth} aria-hidden="true"
	></canvas>
	<!-- The clip spans the CANVAS (see labelBleed); the box inside it puts the
	     origin every label transform is written against back on the COLUMN's top
	     left corner, which is where the layouts author. -->
	<div
		class="annotations"
		aria-hidden="true"
		style="left: {-labelBleed.l}px; right: {-labelBleed.r}px"
	>
		<div
			class="annotation-origin"
			style="left: {labelBleed.l}px; width: {width}px"
		>
			<!-- The future block (PRD P-11-2). In the ANNOTATIONS layer, ahead of the
		     node labels, which is what lets it carry a shaded fill: the names sit
		     beside their dots to the right, so with the column pinned at the left they
		     render INSIDE the block, and `.overlay` (where this first lived) paints
		     over `.annotations` — a fill there hid every one of them. Here the wash
		     goes under the names and under the ticks, and only over the canvas, whose
		     ink to the right of the present is nothing at all.

		     It rides the frame writer's per-frame payload next to `axes` and
		     `callout` rather than the `notes` slot, per the rule on the overlay
		     below — its own camera is parked whenever it exists, so it needs the
		     per-frame channel less than the callout does, but the frontier that sizes
		     it IS animated.

		     A <span> with a dashed border, not SVG: it is an axis-aligned rectangle,
		     so it needs none of what put the callout's leader in an <svg> (an
		     arbitrary-angle line, a head, and a halo pass SVG has no text-shadow for),
		     and it sidesteps the global `svg { width: 100% }` fight documented on
		     .callout-arrow.

		     Yellow is the chapter's first and only hue, and a deliberate exception:
		     the field is monochrome-plus-ink by design (see layouts/race.js) because
		     no actor is identified BY a colour. This colours a REGION, not an actor,
		     so that rule survives intact. -->
			{#if decor?.band && !furnitureHeld}
				{@const b = decor.band}
				<div class="band fade-in">
					<span
						class="band-box"
						aria-hidden="true"
						style="left: {b.x}px; top: {b.y}px; width: {b.width}px; height: {b.height}px"
					></span>
					{#if b.label}
						<p
							class="band-label fade-in"
							class:band-label-right={b.label.right}
							style="left: {b.label.x}px; top: {b.label.y}px"
						>
							the future
						</p>
					{/if}
				</div>
			{/if}
			{#if ring}
				<div
					class="pulse-wrap"
					style="left: {ring.x}px; top: {ring.y}px; width: {ring.r *
						2}px; height: {ring.r * 2}px; opacity: {pulseId != null
						? ring.alpha
						: 0}"
				>
					<div class="pulse-ring"></div>
				</div>
			{/if}
			<!-- Keyed on the TEXT as well as the id, so a name whose string changes is
		     two elements for the length of a crossfade rather than one text node
		     mutated in place at full opacity. Both copies sit at the same
		     transform, so they cross over where the name already is and nothing
		     moves; on the scatter that swap is the whole beat, because the number
		     in the name is what the sentence is about. -->
			{#each tracked as t (`${t.id}:${t.name}`)}
				<!-- a per-node override ("left"/"right") sits the label beside the dot,
			     vertically centred; otherwise it hangs below, centred on the dot. All
			     three are clamped to the canvas: .annotations clips, so an unclamped
			     name is simply cut, which is what took the last letters off the race
			     chart's right-hand gutter and off the quiz's left-hand names. The
			     clamp is CSS, not px arithmetic here, because the percentages resolve
			     against the name's own rendered box — so it slides only as far as it
			     actually has to. On a phone the graph sits within LABEL_EDGE_GAP_PX of
			     both edges and most names still fit centred; nudging every one of them
			     a fixed distance inward instead threw them across the constellation. -->
				{@const dir = frameDirs[t.id]}
				{@const gap = LABEL_EDGE_GAP_PX - labelBleed.l}
				{@const edge = `calc(${width + labelBleed.r - LABEL_EDGE_GAP_PX}px - 100%)`}
				{@const transform =
					dir === "right"
						? `translate(clamp(${gap}px, ${t.x + t.r + 4}px, ${edge}), calc(${t.y + t.labelOffset}px - 50%))`
						: dir === "left"
							? `translate(clamp(${gap}px, calc(${t.x - t.r - 4}px - 100%), ${edge}), calc(${t.y + t.labelOffset}px - 50%))`
							: `translate(clamp(${gap}px, calc(${t.x}px - 50%), ${edge}), ${t.y + t.r + 4}px)`}
				<p
					class="node-label"
					style="transform: {transform}; --dot-alpha: {t.labelAlpha}"
					in:nameSwap
					out:nameSwap
				>
					{t.name}
				</p>
			{/each}
		</div>
	</div>
	<!-- ONE set of chart furniture, rendered twice: the arriving state's, held
	     until its beat lands, and the departing state's, frozen and fading out at
	     its own coordinates. That is "out, travel, in" (motion.md rule 6) for the
	     HTML layer, in one place instead of a per-state opt-in.

	     Nothing here is `{#key}`ed any more. Those blocks existed to replay a
	     mount fade when a string changed, and cut the old string in the same
	     frame; the gate below now unmounts and remounts the whole set on a scene
	     change, which IS the crossfade they were approximating, and within a
	     scene the strings do not change (registry.spec.js checks that). -->
	{#snippet chartFurniture(set, live = false)}
		{#if set.title}
			<p class="chart-title fade-in" aria-hidden="true">{set.title}</p>
		{/if}
		{#if set.overlay?.xLabel}
			<p
				class="x-label fade-in"
				aria-hidden="true"
				style="top: {set.xTop}px; bottom: auto"
			>
				{set.overlay.xLabel}
			</p>
		{/if}
		{#if set.overlay?.yLabel}
			<!-- centre the axis title on the graph's y-axis extent, not the tall canvas -->
			<p class="y-label fade-in" aria-hidden="true" style="top: {set.yTop}px">
				{set.overlay.yLabel}
			</p>
		{/if}
		{#if set.overlay?.yTopLabel}
			<p
				class="y-hint y-hint-top fade-in"
				aria-hidden="true"
				style="top: {set.hintTop}px"
			>
				{set.overlay.yTopLabel}
			</p>
		{/if}
		{#if set.overlay?.yBottomLabel}
			<p
				class="y-hint y-hint-bottom fade-in"
				aria-hidden="true"
				style="top: {set.hintBottom}px"
			>
				{set.overlay.yBottomLabel}
			</p>
		{/if}
		<!-- axes and the callout ring are recomputed every frame during the race
		     sweep/scrub animations (see writeRaceSweepFrame), so they stay
		     pixel-accurate throughout and don't need to hide. Anything that comes
		     off the layout result instead — `notes` — has no per-frame equivalent,
		     so its coordinates freeze for the length of a live scrub/pan and jump
		     on release. Nothing emits notes, and the callout below is why the slot
		     is still empty: it is prose positioned on the plot, i.e. exactly what
		     `notes` is for, but it rides `callout` in the frame writer's payload
		     instead so that it pans. Anything else on the race chart belongs there
		     too. -->
		{#each set.decor?.axes?.x ?? [] as tick}
			<p
				class="tick tick-x fade-in"
				aria-hidden="true"
				style="left: {tick.pos}px; {set.decor.axes.xBase != null
					? `top: ${set.decor.axes.xBase}px`
					: ''}"
			>
				<!-- the strip's years recede toward the horizon with the block above
					     them (raceFutureTicks); historical years carry no alpha and render
					     flat. On an inner span so it MULTIPLIES with .fade-in's mount
					     animation rather than being outranked by it — that animation
					     targets opacity on the <p> with fill-mode `both`. -->
				<span style={tick.alpha != null ? `opacity: ${tick.alpha}` : null}
					>{tick.label}</span
				>
			</p>
		{/each}
		{#each set.decor?.axes?.y ?? [] as tick}
			<p
				class="tick tick-y fade-in"
				aria-hidden="true"
				style="top: {tick.pos}px"
			>
				{tick.label}
			</p>
		{/each}
		<!-- the callout: the moment the step is about, stated on the plot itself
		     rather than behind a click. ONE at a time, and the layout has already
		     picked it (raceCallout, most present wins), so this renders whatever
		     it was handed and never chooses. Only the race layout emits `callout`,
		     and the wholesale decor write above clears it on every other state, so
		     this needs no state gate. Its geometry rides the per-frame payload
		     next to `axes` (see applyFrame/scrubLoop), so the note stays glued to
		     its ring through a pan instead of freezing the way a `notes` entry
		     would. The wrapper carries the mount fade and the payload's own
		     `alpha` rides each child, because the two must MULTIPLY: an animation
		     with fill-mode `both` outranks an inline opacity for good, so putting
		     both on one element would leave the cull ramp with no effect.

		     `set.callout` is the rewind's ask (`story.running`), which holds the
		     note back until the Start rewind has landed. The pan brings the
		     crossing on camera with about a third of its travel still to go, and
		     without this the note mounted there and then rode ~270px across the
		     plot to its resting spot: fine for an 11px ring, seasick for a block
		     of prose. So it waits, and the wrapper's fade-in is then the only
		     motion it makes. Not `camPanning`/`sweeping` either — a reader's
		     scrub raises both, and the note should track its ring through a drag,
		     not blink on every grab. The camera LEGS need no gate here: they pin
		     the frame's own callout list back to the chapter's one (rewindFrame),
		     so there is nothing for a pan to carry across the plot. -->
		{#if set.decor?.callout && set.callout}
			{@const t = set.decor.callout}
			{@const arrowD = `M ${t.arrow.ax} ${t.arrow.ay} L ${t.arrow.bx} ${t.arrow.by}`}
			<div class="callout fade-in">
				<!-- decoration: the ring marks where, the note says what, and the
				     note is real text, so it is the note that carries this to AT -->
				<svg
					class="callout-arrow"
					viewBox="0 0 {width} {height}"
					aria-hidden="true"
					style="opacity: {t.alpha}"
				>
					<!-- the halo pass, under the stroke: the leader crosses live
					     chart lines, and SVG has no text-shadow to lean on -->
					<path class="arrow-halo" d={arrowD} />
					<path class="arrow-line" d={arrowD} />
					<path
						class="arrow-head"
						d="M {t.arrow.bx} {t.arrow.by} L {t.arrow.h1x} {t.arrow.h1y} L {t
							.arrow.h2x} {t.arrow.h2y} Z"
					/>
				</svg>
				<span
					class="callout-mark"
					aria-hidden="true"
					style="left: {t.ring.x}px; top: {t.ring.y}px; opacity: {t.alpha}"
				></span>
				<!-- `above` anchors the box by its own BOTTOM edge, which is what
				     keeps the frame writer's assumed note height out of where a
				     flipped note lands: translateY(-100%) is the rendered height,
				     and the writer has no DOM to measure one with. -->
				<p
					class="callout-note"
					class:above={t.above}
					style="left: {t.note.x}px; top: {t.note.y}px; width: {t.note
						.width}px; opacity: {t.alpha}"
				>
					{t.text}
				</p>
			</div>
		{/if}
		{#each set.decor?.notes ?? [] as note}
			<p
				class="note fade-in {note.align ?? 'left'}"
				aria-hidden="true"
				class:strong={note.strong}
				class:wrap={note.wrap}
				style="left: {note.x}px; top: {note.y}px{note.wrapWidth
					? `; width: ${note.wrapWidth}px; max-width: none`
					: ''}"
			>
				{note.text}
			</p>
		{/each}
		{#each set.decor?.legend?.filter((item) => item.x != null) ?? [] as item, i}
			<p
				class="legend-item pinned fade-in"
				aria-hidden="true"
				style="left: {item.x}px; top: {(live ? legendY?.[i] : null) ??
					item.y}px"
				style:color={item.ink}
			>
				<!-- The row's share changes with the anchor (step 6 cycles through
				     actors), so the text crossfades with its own new string rather
				     than cutting — the same swap a node label carrying a number
				     makes, off the same transition. On an inner span for the reason
				     the x tick's alpha is: `.fade-in` animates opacity on the <p>
				     with fill-mode `both` and would outrank anything written there.
				     The two copies overlay because .pinned is a single-cell grid,
				     the idiom .scrolly-steps uses for the prose swap. -->
				{#key item.label}
					<span in:nameSwap out:nameSwap>{item.label}</span>
				{/key}
			</p>
		{/each}
		{#if set.decor?.legend?.some((item) => item.x == null)}
			<ul
				class="legend fade-in"
				aria-hidden="true"
				style={set.decor.legendY != null
					? `top: ${set.decor.legendY}px; bottom: auto`
					: ""}
			>
				{#each set.decor.legend as item}
					<li class="legend-item">
						<span
							class="legend-swatch"
							style="background: rgb({item.color.join(',')})"
						></span>
						{item.label}
					</li>
				{/each}
			</ul>
		{/if}
	{/snippet}
	<div class="overlay" style="--plot-margin: {MARGIN}px">
		<!-- The arriving layer carries no transition of its own: its children
		     already fade in with .fade-in, and an opacity transition on this
		     wrapper would form a stacking context that the 1980 tick's own z-lift
		     could not escape at any value. -->
		{#if !furnitureHeld}
			<div class="layer">{@render chartFurniture(arriving, true)}</div>
		{/if}
		{#if leaving}
			<div class="layer gone" aria-hidden="true" out:fade={furnitureOut}>
				{@render chartFurniture(leaving)}
			</div>
		{/if}
	</div>
	{#if pick}
		<div class="hits">
			{#each decor?.hits ?? [] as hit (hit.label)}
				<button
					class="hit"
					class:round={hit.round}
					aria-pressed={hit.selected ?? false}
					style="left: {hit.x}px; top: {hit.y}px; width: {hit.w}px; height: {hit.h}px"
					onclick={() => pick(story, hit.value)}
				>
					<span class="sr-only">{hit.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Deliberately NOT overflow:hidden — the canvas below is wider than this box
	   and has to escape it. The clipping that was here has moved onto
	   .annotations, which is what actually needed it: this box is still the
	   coordinate frame every panel, hit target and label is positioned against,
	   and every hit test still measures it (see the getBoundingClientRect in
	   drawScene's neighbours), so nothing about it may move. */
	.visual {
		position: relative;
		width: 100%;
		height: 100%;
	}

	/* Full-bleed, pinned to the VIEWPORT rather than sized by the reading column,
	   and reaching up through the title band as well: a full-bleed sky fills
	   the screen, and a canvas clipped to the column — or stopping where
	   .scrolly-visual starts, --title-band below the top of the window — could
	   only ever draw a rectangle of dots in the middle of it. The drawing origin
	   is put back on this box's top left corner by the render transform, so
	   every other state is unaffected — see `bleed` and TITLE_BAND.

	   `left` is a placeholder: the render path writes it from the measured bleed
	   on every re-fit (see the resize branch). It used to be `left: 50%` with a
	   -50% translate, which pins the canvas to the COLUMN's centre — right only
	   while the column is itself centred in the viewport, which it is not once the
	   prose sits beside it rather than over it.

	   .visual's own height stays out of this deliberately: it is bound to
	   `height`, which sizes the backing store, so growing it would resize the
	   canvas. Only the canvas element grows.

	   100vw is exact here because the page is a single 100svh section with no
	   vertical scrollbar to take a gutter out of it; the width the layouts use
	   is measured off this element regardless, never assumed. */
	canvas {
		display: block;
		position: absolute;
		top: calc(-1 * var(--title-band));
		left: 0;
		width: 100vw;
		height: calc(100% + var(--title-band));
	}

	/* The names are clipped to the CANVAS, not to the reading column: they belong
	   to the picture, and for the length of a column swap the picture reaches
	   outside the column (see labelBleed, which writes the two horizontal insets).
	   Vertically it is still the column's box, which is what keeps the race
	   chart's off-plot names — y up to ~2700 — out of the page's scroll height. */
	.annotations {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	/* Exactly the box .annotations used to be — the reading column — so every
	   inset and percentage inside it resolves as it always did. It exists only to
	   hold that origin while the clip around it reaches out over the bleed. */
	.annotation-origin {
		position: absolute;
		top: 0;
		bottom: 0;
	}

	.node-label {
		position: absolute;
		top: 0;
		left: 0;
		margin: 0;
		/* positioned via inline transform (compositor-only), not left/top */
		will-change: transform, opacity;
		padding: 0 3px;
		font-family: var(--font-mono);
		/* NODE_LABEL_PX in layouts/intro.js is this line box */
		font-size: var(--12px, 12px);
		line-height: 1.2;
		white-space: nowrap;
		color: var(--color-gray-900, #222);
		/* halo, not opaque: a name sits over the dot cloud and its own links,
		   and an opaque tag hides too much of the data underneath it */
		text-shadow: var(--text-halo);
		/* two channels multiplied: --dot-alpha is the dot's own alpha, written
		   inline every frame, and --name-alpha is a text swap crossfading over it
		   (see nameSwap). The transition rides --dot-alpha as it always did. */
		opacity: calc(var(--dot-alpha, 1) * var(--name-alpha, 1));
		transition: opacity 0.3s ease;
	}

	.pulse-wrap {
		position: absolute;
		transform: translate(-50%, -50%);
		transition: opacity 0.3s ease;
	}

	/* One ring, once, on arrival — not two rings repeating forever. A target lock
	   says "this one" and then stops; a repeating ripple is the only thing still
	   moving once the story is at rest, which is the one thing ambient motion is
	   allowed to be (motion.md rule 9, and the sky is already it). `both` holds
	   the ring at its final frame, so it ends invisible rather than snapping back
	   to full. */
	.pulse-ring {
		position: absolute;
		inset: 0;
		border: 2px solid rgba(34, 34, 34, 0.45);
		border-radius: 50%;
		animation: ripple 1.8s ease-out both;
	}

	@keyframes ripple {
		from {
			transform: scale(1);
			opacity: 0.6;
		}
		to {
			transform: scale(2.2);
			opacity: 0;
		}
	}

	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	/* The two furniture sets stack in the same box, so the departing one fades
	   out over exactly the ground the arriving one will occupy. No colour, no
	   size: every rule below is a descendant selector, so nesting is inert. */
	.layer {
		position: absolute;
		inset: 0;
	}

	.layer.gone {
		pointer-events: none;
	}

	/* Lifted over the tap halves. Free to do: the container is
	   pointer-events:none and only .hit opts back in, so raising it hands the
	   halves back everything except the actor targets themselves — which the
	   halves cover wherever they stand, so geometry could never have separated
	   them. Same idiom as .quiz and .route. */
	.hits {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: var(--z-tap-above);
	}

	.hit {
		position: absolute;
		pointer-events: auto;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
	}

	.hit:hover,
	.hit[aria-pressed="true"] {
		/* translucent: the tint sits over the canvas dots, so it can't be opaque */
		background: rgba(34, 34, 34, 0.05);
	}

	/* a region centred on a single dot reads as a halo, not a box */
	.hit.round {
		border-radius: 50%;
	}

	.fade-in {
		animation: fade-in 0.4s ease both;
	}

	@media (prefers-reduced-motion: reduce) {
		.fade-in {
			animation: none;
		}

		.node-label,
		.pulse-wrap {
			transition: none;
		}

		/* the ring's resting state, which is the ripple's last frame held still */
		.pulse-ring {
			animation: none;
			transform: scale(1.3);
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.overlay p {
		position: absolute;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-gray-600, #666);
	}

	.chart-title {
		/* .scrolly-visual (this component's containing box) is already offset
		   down by --title-band, clearing the progress bar above it; the title
		   sits a little further down still (--chart-title-top, Stage.svelte) */
		top: var(--chart-title-top);
		left: 50%;
		transform: translateX(-50%);
		/* max-content, or `left: 50%` caps the shrink-to-fit width at the box's
		   right half and a mobile title wraps at half the screen. Capped at the
		   plot's own width. */
		width: max-content;
		max-width: calc(100% - 2 * var(--plot-margin));
		text-align: center;
		font-weight: 600;
		color: var(--color-gray-800, #222);
	}

	/* A searchable step puts ActorSearch's glyph (1.75rem, at the plot's right
	   margin) on this line: pulled in either side by it, so the title stays
	   centred and wraps before it reaches the glyph. */
	:global(.scrolly-visual:has(.search__glyph)) .chart-title {
		max-width: calc(100% - 2 * (var(--plot-margin) + 1.75rem));
	}

	.x-label {
		bottom: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		/* clamps above the step card on long-prose steps — may sit over dots */
		text-shadow: var(--text-halo);
	}

	.tick {
		font-size: 0.75rem;
		color: var(--color-gray-500, #888);
		/* tick numbers can sit over the dot cloud (tight left margin) — keep them legible */
		text-shadow: var(--text-halo);
	}

	.tick-x {
		bottom: 1.6rem; /* fallback when the layout provides no xBase */
		transform: translateX(-50%);
	}

	/* the 1980 tick is an InfoTerm trigger — its <button> is rendered inside
	   InfoTerm.svelte's own template, so it never carries ScrollyVisual's
	   scoped style hash: none of .overlay p/.tick/.tick-x/.fade-in (all scoped
	   selectors) match it, so :global() is required, and every property those
	   would have supplied has to be restated here instead of layered on top. */
	:global(.tick-1980) {
		position: absolute;
		margin: 0;
		pointer-events: auto;
		/* RaceScrubber's own full-bleed .drag-surface sits later in the DOM
		   (Stage.svelte mounts the panel after ScrollyVisual) and would
		   otherwise intercept the click before it reaches this trigger — as
		   would the right-hand tap half, which is why this is now on the
		   halves' own layer rather than a bare 1 */
		z-index: var(--z-tap-above);
		font-size: 0.75rem;
		color: var(--color-gray-500, #888);
		text-shadow: var(--text-halo);
		bottom: 1.6rem; /* fallback when the layout provides no xBase */
		transform: translateX(-50%);
	}

	:global(.tick-1980[style*="top:"]) {
		bottom: auto;
	}

	/* The callout: ring, leader, note. Ordinary scoped selectors — the
	   ring was an InfoTerm trigger until the callout replaced the popover, and a
	   trigger's <button> is rendered inside InfoTerm's own template, so it carried
	   none of this component's style hash and its rule had to be :global() with
	   every inherited property restated (see .tick-1980 above, which still does).
	   As plain elements these inherit .overlay's furniture styling and pick up
	   .fade-in, and they no longer need `pointer-events: auto` or the z-index that
	   only existed to win the click back from RaceScrubber's full-bleed
	   .drag-surface. */
	.callout {
		position: absolute;
		inset: 0;
	}

	/* The future block. Same wrapper pattern as .callout: one positioned layer, so
	   each child can be placed in canvas coordinates straight off the payload. */
	.band {
		position: absolute;
		inset: 0;
	}

	.band-box {
		position: absolute;
		border: 2px dashed var(--category-yellow, #ccbb44);
		/* --category-yellow at 13%. A wash rather than nothing: the block reads as
		   ground the chart has no data for, and an outline alone left it looking like
		   an empty frame drawn over the plot. It can be this faint and still register
		   because it is a large area — and it HAS to be faint, and has to sit in the
		   annotations layer under the names, because this step's ten names render
		   inside it. */
		background: rgba(204, 187, 68, 0.13);
		/* The right-edge fade, and it works on the border too: a mask applies to the
		   element's whole rendered box, so the top and bottom rules fade out along
		   their length and the RIGHT rule disappears entirely — which is exactly the
		   read we want, a block with no far wall. It also composes multiplicatively
		   with any opacity, unlike the animation trap noted on .callout's children.
		   -webkit- for Safari < 15.4; without either the box simply keeps its right
		   wall, which is degraded rather than broken. */
		-webkit-mask-image: linear-gradient(to right, #000 0 45%, transparent 100%);
		mask-image: linear-gradient(to right, #000 0 45%, transparent 100%);
	}

	/* Selected as `.overlay p` + a class for the specificity reason spelled out on
	   .callout-note: a lone class loses to `.overlay p`'s font stack.
	   The text is a darkened tint of --category-yellow rather than the raw token —
	   #ccbb44 on white is ~1.75:1, which fails at any size; #6b5f15 clears AA
	   (~6.4:1) while still reading as yellow, not ink. */
	/* A plain class, not `.overlay p.band-label`: this lives in the ANNOTATIONS
	   layer (so the block's wash can sit under the names), where no generic `p`
	   rule competes with it. `position` and `margin` are stated here because
	   nothing else supplies them — without them the label detaches from the
	   payload's coordinates and lands at the top of the layer. It mounts only
	   once the box is fully drawn (raceFutureBand withholds it until then), so
	   its own `.fade-in` reads as the label arriving, not as it sliding along
	   with the box's growing edge. */
	.band-label {
		position: absolute;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		color: #6b5f15;
		white-space: nowrap;
		/* it sits just inside the box, and can crowd the border on a narrow strip,
		   so it needs the same legibility halo the ticks carry */
		text-shadow: var(--text-halo);
	}

	/* the top-right corner: the anchor `x` is the box's right edge, so the text
	   is pulled back by its own rendered width to sit inside it */
	.band-label-right {
		transform: translateX(-100%);
	}

	/* the ring has no text: it IS the mark, and the note beside it is what carries
	   the moment to a screen reader */
	.callout-mark {
		position: absolute;
		width: 11px;
		height: 11px;
		border: 1.5px solid var(--color-gray-700, #444);
		border-radius: 50%;
		/* the halo the rest of the chart furniture uses, so the ring reads where it
		   sits: over the two lines it is pointing at */
		box-shadow:
			0 0 0 1.5px var(--color-bg, #fff),
			0 0 4px var(--color-bg, #fff);
		transform: translate(-50%, -50%);
	}

	/* app.css has a global `svg { display: block; width: 100%; height: auto }`.
	   `height: auto` against a viewBox is aspect-ratio sizing, which would scale
	   every coordinate the frame writer emitted — so both axes are stated here,
	   where the scoped hash and the extra specificity both win. The box is the
	   canvas, so with `viewBox="0 0 width height"` one user unit is one px. */
	.callout-arrow {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		/* the head can sit a hair outside the box on the frames before a cull */
		overflow: visible;
	}

	.arrow-line,
	.arrow-halo {
		fill: none;
	}

	.arrow-line {
		stroke: var(--color-gray-600, #666);
		stroke-width: 1;
	}

	/* the leader crosses live chart lines and SVG has no text-shadow to lean on,
	   so the halo is a fatter pass of the same path underneath it */
	.arrow-halo {
		stroke: var(--color-bg, #fff);
		stroke-width: 3.5;
	}

	.arrow-head {
		fill: var(--color-gray-600, #666);
		/* its own halo, same reason as the line's — and paint-order keeps the
		   stroke behind the fill so it haloes the head instead of thinning it */
		stroke: var(--color-bg, #fff);
		stroke-width: 1.5;
		paint-order: stroke fill;
	}

	/* Prose, not tick furniture: .overlay p's --font-mono at 0.75rem is right for
	   a 4-digit year and wrong for a sentence, so this takes the sans face and a
	   size that reads at three or four lines. `width` arrives inline from the
	   payload and is load-bearing — an absolutely positioned box is shrink-to-fit,
	   so a max-width would let the rendered box run wider than the geometry that
	   placed it (the same trap Note.wrapWidth documents).

	   Selected as `.overlay p` + a class, not the class alone: `.overlay p` is a
	   class plus a type, so it out-specifies a lone class and its --font-mono
	   silently wins. */
	.overlay p.callout-note {
		font-family: var(--font-form);
		font-size: var(--12px, 12px);
		line-height: 1.35;
		color: var(--color-gray-900, #222);
		/* three or four lines sitting over the chasing field, which would
		   otherwise show through the counters */
		text-shadow: var(--text-halo);
	}

	/* A note ABOVE its ring is positioned by its bottom edge: the payload's `top`
	   is where that edge goes, and this lifts the box by its own rendered height.
	   The frame writer has no DOM, so its note height is an assumption — doing the
	   lift here is what keeps that assumption out of where the note lands, leaving
	   it to decide only whether the note flips at all (raceCalloutGeometry). */
	.overlay p.callout-note.above {
		transform: translateY(-100%);
	}

	.tick-x[style*="top:"] {
		bottom: auto;
	}

	.note.strong {
		font-weight: 700;
		color: var(--color-gray-900, #222);
	}

	.tick-y {
		/* indented past the rotated axis title (.y-label sits in the x: 0 column) */
		left: 1.1rem;
		transform: translateY(-50%);
	}

	.note {
		font-size: 0.75rem;
		color: var(--color-gray-700, #444);
		white-space: nowrap;
		text-shadow: var(--text-halo);
	}

	.note.wrap {
		white-space: normal;
		max-width: 16rem;
	}

	.note.center {
		transform: translateX(-50%);
	}

	.note.right {
		transform: translateX(-100%);
		text-align: right;
	}

	.y-label {
		top: 50%;
		left: 0;
		/* rotate INSIDE transform (not the `rotate:` property): the property applies
		   before `transform`, flipping the Y axis so translateY(-50%) would push the
		   label DOWN by half its length instead of centring it. Order it here so the
		   translate stays in screen space. */
		transform: translateY(-50%) rotate(180deg);
		writing-mode: vertical-rl;
	}

	.y-hint {
		left: 0;
		font-size: 0.75rem;
		font-style: italic;
		color: var(--color-gray-500, #888);
		text-shadow: var(--text-halo);
		/* same rotated column as .y-label, so "lower"/"Remoteness"/"higher"
		   read as one vertical line; rotate INSIDE transform (see .y-label) */
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}

	.y-hint-bottom {
		/* anchors its bottom edge to the plot's bottom edge, growing upward,
		   mirroring y-hint-top's default top-anchored growth */
		transform: translateY(-100%) rotate(180deg);
	}

	.legend {
		position: absolute;
		bottom: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-wrap: nowrap;
		justify-content: center;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
		white-space: nowrap;
		font-family: var(--font-mono);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
		color: var(--color-gray-700, #444);
		white-space: nowrap;
	}

	/* the crossfading copy: --name-alpha is nameSwap's channel, multiplied here
	   rather than written as a fade on opacity, which .fade-in would outrank */
	.legend-item.pinned > span {
		grid-area: 1 / 1;
		opacity: var(--name-alpha, 1);
	}

	.legend-swatch {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-item.pinned {
		position: absolute;
		margin: 0;
		/* one cell, so a text swap's two copies sit on top of each other instead
		   of side by side (see the {#key} above) */
		display: grid;
		transform: translateY(-50%);
		white-space: nowrap;
		text-shadow: var(--text-halo);
	}
</style>
