<script>
	// @ts-check
	import { untrack } from "svelte";
	import { makeNodes } from "./nodes.js";
	import { createTweener } from "./tween.js";
	import { createLabelDecollider } from "./label-decollide.js";
	import {
		galaxyHighlight,
		galaxyLinks,
		resetGalaxyHighlight
	} from "./galaxy-highlight.js";
	import {
		writeRaceSweepFrame,
		racePanBounds,
		racePlot,
		racePanFrame,
		getRacePxPerYear,
		RACE_RECENT_EXTENT,
		RACE_REWIND_WAYPOINT_YEAR,
		RACE_DATA_END,
		raceMaxPlayhead,
		RACE_CAST,
		RACE_LABEL_TOP
	} from "./layouts/race.js";
	import {
		ATTR_SIZE,
		DELAY_SIZE,
		STRIDE,
		EDGE_BASE,
		STATES,
		OVERLAYS,
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
		STATE_TRACKED,
		TRAIL_SIZE,
		TRAIL_STRIDE,
		TRAIL_POINTS,
		TRAIL_META
	} from "./states.js";
	import {
		MARGIN,
		TITLE_BAND,
		plotBottom,
		plotBottomFraction,
		setPlotBottomFrac,
		PLOT_BOTTOM_BESIDE,
		PLOT_BOTTOM_STACKED,
		NO_BLEED,
		EDGE_GREY,
		EDGE_HIGHLIGHT,
		INK
	} from "./layout-shared.js";
	import { story } from "./story.svelte.js";
	import { MediaQuery } from "svelte/reactivity";
	import InfoTerm from "$components/ui/InfoTerm.svelte";

	// undefined until the <Step> registry has populated (first client render)
	/** @type {{ state: import("./states.js").VisualState, params?: Object, stepsHeight?: number, coldStart?: boolean, beside?: boolean }} */
	let {
		state: stateName,
		params,
		stepsHeight = 0,
		coldStart = false,
		beside = false
	} = $props();

	const TAKEOVER_NOTE =
		"Freedomland (2006) - Samuel L. Jackson stars in this crime drama mystery with Julianne Moore. This gives him an average distance of 2.14, overtaking Gene Hackman who's last film was in 2004";

	const TWEEN_MS = 700;
	const ENTER_MS = 900;
	// interaction inside a state (params change): quicker, direct retarget
	const PARAM_TWEEN_MS = 450;
	const TWEEN_JITTER = 0.5;

	const { nodes, edges } = makeNodes();
	// the fallback delays for any arrival with no authored choreography of its
	// own, and for one whose choreography this direction skips (see
	// STATE_REVEAL_FROM below): dots retarget in unison, but edges hold back
	// until the dots have mostly landed — edges draw toward their endpoints'
	// *final* spots, so fading them in earlier strings lines between mid-flight
	// dots and far-away destinations
	const EDGE_LAG_MS = TWEEN_MS * 0.75;
	const EDGE_LAG_DELAYS = new Float64Array(DELAY_SIZE);
	EDGE_LAG_DELAYS.fill(EDGE_LAG_MS, nodes.length);
	// titleGalaxy's own arrival: stepping back onto it from `lone` fades the
	// constellation's links and names out over a frame where nothing moves (the
	// fourteen co-stars shrink/fade in place; only Bacon's sky trip is actually
	// travelling) — the same case `layoutHopSeed` opts out of the lag for, and for
	// the same reason: EDGE_LAG_DELAYS is for links fading IN behind travelling
	// dots, so applying it here left the constellation's links on screen for most
	// of the tween instead of going out with its names. Handled here rather than
	// in `layoutTitleGalaxy` itself, because that layout's own `delays` also feeds
	// the once-only cold-start pop-in (below), where the fallback jitter stagger
	// across the whole crowd is worth keeping.
	const TITLE_GALAXY_STATE = "titleGalaxy";
	const EDGE_UNISON_DELAYS = new Float64Array(DELAY_SIZE);
	// how long a departing trail (one the landing state doesn't draw) takes to
	// fade to invisible, in place, before the arrival's real tween starts — so
	// a stale line from a state the reader has left disappears FIRST instead of
	// visibly sliding or shrinking across the canvas while it crossfades toward
	// wherever the tweener parks it. Short: it's decluttering, not a beat the
	// reader is meant to watch.
	const TRAIL_FADE_MS = 220;

	/**
	 * Two-phase trail arrival. Phase one fades every trail heading to alpha 0
	 * to invisible, geometry untouched (so it doesn't move while it's still
	 * visible); every other trail's "fade target" is just its own current
	 * value, so phase one is a no-op for it. Phase two is the ordinary tween
	 * to `target`, unchanged — so a trail heading to a REAL alpha still morphs
	 * over the whole of `ms` once it starts: on the race/career choreographies
	 * that motion is the object-constancy morph the slot exists for (a
	 * simulation line becoming a race line, say), and phase one never touches
	 * it.
	 */
	function tweenTrails(target, ms, delays = null, onDone = null) {
		const fadeTarget = Float64Array.from(trailTweener.current);
		for (let t = 0; t < TRAIL_META.length; t++) {
			const a = t * TRAIL_STRIDE + TRAIL_POINTS * 2;
			if (target[a] <= 0) fadeTarget[a] = 0;
		}
		trailTweener.to(fadeTarget, TRAIL_FADE_MS, 0, null, () => {
			trailTweener.to(target, ms, 0, delays, onDone);
		});
	}
	// edges draw outward from the anchor: orient each from its lower-hop end so
	// the line grows from Bacon toward the outer actor
	//
	// The baked edges first, then the runtime pool (see GALAXY_LINK_MAX): the
	// chapter card's highlight spokes pick their endpoints per beat, so their
	// pairs cannot be a build-time table like the constellation's. These are the
	// pool's own arrays, mutated in place by the beat's writer, so this table sees
	// each beat's pairs without being rebuilt — and every pool slot the beat isn't
	// using sits at alpha 0, which the draw loop skips before it reads a pair.
	const edgeEnds = [
		...edges.map(({ source, target }) =>
			nodes[source].hop <= nodes[target].hop
				? [source, target]
				: [target, source]
		),
		...galaxyLinks.ends
	];
	// every id any state labels or pulses — tracked out of the attr array each
	// frame so the HTML annotations stay glued to their dots mid-tween.
	// Dynamic label and pulse states (function values) declare their possible
	// ids in STATE_TRACKED instead.
	const TRACKED_IDS = [
		...new Set([
			...Object.values(STATE_LABELS).filter(Array.isArray).flat(),
			...Object.values(STATE_PULSE).filter((p) => typeof p === "number"),
			...STATE_TRACKED
		])
	];
	const tweener = createTweener(ATTR_SIZE, drawScene, STRIDE);
	// trails (race/career lines) tween on their own array so polylines morph
	// with the same interruption-safe semantics as dots
	const trailTweener = createTweener(TRAIL_SIZE, drawScene, TRAIL_STRIDE);
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
	// the two race states singled out below: raceFull's resting camera is the
	// rewind's waypoint, and both it and raceFuture carry the "why 1980?" term on
	// their axis. Every other race-chapter behaviour is the state's own
	// declaration in layouts/race.js.
	const RACE_FULL_STATE = "raceFull";
	const RACE_FUTURE_STATE = "raceFuture";
	// per-frame smoothing factor for the pan glide: renderPlayhead moves this
	// fraction of the remaining distance to the target each frame (exponential
	// ease-out — feels like a weighted reel). Reduced motion uses 1 (snap).
	const SCRUB_EASE = 0.22;
	let sweepRaf = 0;
	// is the sweep being stopped a galaxy flight? Set when one starts (playAmbient)
	// and cleared the moment it is abandoned, so the cache below is dropped once
	// per departure from the sky rather than on every state change in the story.
	let skyFlying = false;
	function stopSweep() {
		cancelAnimationFrame(sweepRaf);
		sweepRaf = 0;
		camPanning = false;
		// The sky has stopped where it stopped, and `skyFlight.t` now holds the
		// moment the reader is stepping off. A layout that READS it — hopBands takes
		// each dot's column off the card, mid-flow — is not pure in the cache key's
		// terms, so the cached layouts go: served a second visit's sort built
		// against the first visit's frame, the crowd would set off from somewhere it
		// is no longer standing.
		//
		// This runs before any layout is built on a state change (see the render
		// effect), which is what makes the frame the bands are struck against the
		// frame the sky was showing at the instant the reader tapped.
		if (skyFlying) {
			skyFlying = false;
			layoutCache.clear();
			// The beat went with the flight. Its spokes fade out through the ordinary
			// departure tween (the next state's layout leaves the pool at zero), but
			// the name is not in the buffer — it is read straight off the published
			// beat — so without this the card's last actor would still be named over
			// whatever the reader stepped onto.
			resetGalaxyHighlight();
		}
	}
	// the rAF spine every entry choreography rides: run `frame(eased)` for `ms`,
	// repaint each tick, then chain `onDone`. Owns sweepRaf, so stopSweep()
	// abandons whatever phase is in flight.
	//
	// `frame` also gets the leg's LINEAR elapsed ms, for a writer whose motion is
	// authored as a schedule in real time rather than as a share of the leg — a
	// replayed delay array, say. `sweepEase` is trapezoidal, so easing such a
	// clock would stretch the schedule's ends and compress its middle.
	function runPhase(ms, frame, onDone) {
		const t0 = performance.now();
		const step = (now) => {
			const p = Math.min(1, (now - t0) / ms);
			frame(sweepEase(p), Math.min(ms, now - t0));
			drawScene();
			if (p < 1) sweepRaf = requestAnimationFrame(step);
			else onDone?.();
		};
		sweepRaf = requestAnimationFrame(step);
	}
	// The ambient counterpart of runPhase: no duration, no easing, no onDone — it
	// runs until something stops it. `frame` is handed elapsed ms since the loop
	// started, so a writer can be a pure function of time and reproduce itself
	// exactly at t = 0. Owns sweepRaf like every other choreography, so a state
	// change's stopSweep abandons it for free.
	function runLoop(frame) {
		const t0 = performance.now();
		const step = (now) => {
			frame(now - t0);
			drawScene();
			sweepRaf = requestAnimationFrame(step);
		};
		sweepRaf = requestAnimationFrame(step);
	}

	// pan glide: one rAF loop that eases `renderPlayhead` toward the input target
	// (story.scrubYear) and writes the panned frame each tick, so a year change
	// glides instead of snapping. Runs while the reader is panning OR until the
	// reel catches up after release; once released AND settled it holds via
	// raceView (one param-tween settle restarts the generic writers).
	function scrubLoop() {
		const extent = raceStep?.extent;
		if (!extent) {
			camPanning = false;
			sweeping = false;
			sweepRaf = 0;
			return;
		}
		// clamp the input target to the pan bounds, or an out-of-range target the
		// eased playhead can never reach would keep this loop alive for good
		const { panMin, panMax } = racePanBounds(
			width,
			height,
			raceStep,
			renderPlayhead
		);
		const target = Math.min(
			panMax,
			Math.max(panMin, story.scrubYear ?? renderPlayhead)
		);
		const k = reducedMotion ? 1 : SCRUB_EASE;
		const diff = target - renderPlayhead;
		const caughtUp = Math.abs(diff) < 0.02;
		renderPlayhead = caughtUp ? target : renderPlayhead + diff * k;
		const { axes, takeover, band, frontier } = writeRaceSweepFrame(
			tweener.current,
			trailTweener.current,
			width,
			height,
			racePanFrame(raceStep, renderPlayhead),
			STATE_YCAP[stateName]
		);
		renderFrontier = frontier;
		decor = { ...decor, axes, takeover, band };
		drawScene();
		if (story.scrubbing || !caughtUp) {
			sweepRaf = requestAnimationFrame(scrubLoop);
		} else {
			camPanning = false;
			sweeping = false;
			sweepRaf = 0;
			story.raceView = raceHoldView();
			publishRaceCam();
		}
	}
	function startScrub() {
		// single-writer discipline: take the rAF from the generic writers, then own
		// it for the glide loop. Land whatever they were tweening toward first: the
		// glide's frame writer only stamps the race slots (writeRaceSweepFrame), so
		// stopping a tween mid-flight would strand every other dot — the crowd of
		// the chapter we just arrived from — wherever it had got to, with nothing
		// left running to finish moving it.
		stopSweep();
		if (tweener.target) tweener.to(tweener.target, 0);
		if (trailTweener.target) trailTweener.to(trailTweener.target, 0);
		tweener.stop();
		trailTweener.stop();
		camPanning = true;
		sweeping = true;
		sweepRaf = requestAnimationFrame(scrubLoop);
	}

	const TAU = Math.PI * 2;
	// one Path2D per (quantised rgb, alpha bucket): batches ~1k dots into a
	// handful of fills instead of a fillStyle + fill per dot
	const dotBuckets = new Map();
	// vertical de-collision for beside-dot name labels (labelDirs "left"/"right"):
	// nudges apart labels whose dots have landed within a line-height of each
	// other, easing the displacement per id so a rank swap slides names past
	// each other instead of snapping. Ported from the pudding-post race-chart.
	const decollideLabelsLeft = createLabelDecollider();
	const decollideLabelsRight = createLabelDecollider();
	// The label de-collider relaxes toward its target a little per DRAWN frame,
	// and the things that drive frames stop once the dots are in place — so the
	// labels need a few frames of their own after that to finish arriving. One
	// pending rAF at a time, cancelled by whoever draws next; it stops on its own
	// as soon as decollide.settled() goes true. Not $state: it is only ever read
	// and written inside drawScene.
	let labelRelaxRaf = null;
	const LABEL_LINE_GAP_PX = 16; // ~11px label line-height * 1.15, matches reference
	// how close a below-dot name may sit to the canvas edge before it stops
	// sliding outward (see the .node-label transform)
	const LABEL_EDGE_GAP_PX = 2;

	// layouts are pure in (state, w, h, params) — cache so re-visited states
	// skip both the recompute and the per-call Float64Array allocation; the
	// tweener only reads the result, never mutates it. `params` merges the
	// step's static params with the interaction fields the state consumes
	// (STATE_PARAMS selector), so an interaction re-runs the current layout.
	//
	// The one exception is a layout that receives the crowd off a galaxy state and
	// so reads the sky's live clock (layout-shared's skyFlight). The whole cache is
	// dropped when a flight stops rather than that key being made to carry a time:
	// the clock moves every frame, a key that tracked it would never hit, and a
	// flight stops a handful of times in a read-through. See stopSweep.
	const layoutCache = new Map();
	// DEV only: last y-band revision the cache was valid for (see the render
	// effect). Always 0 in a build, where the tuning panel doesn't exist.
	let lastBandRev = 0;
	let lastPxRev = 0;
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

	let canvas = $state();
	/** @type {HTMLElement | undefined} */
	let container = $state();
	let width = $state(0);
	let height = $state(0);
	// The canvas's own width, which is the VIEWPORT's, not `.visual`'s: the canvas
	// bleeds past the reading column so a chapter card can fill the screen (see the
	// render transform below and layout-shared's galaxyBox). Measured rather than
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
	 * Deliberately NOT `$state`, for the reason `sweeping` is not (see below): it
	 * describes where the canvas element sits, which is not something the story is
	 * showing. It is measured at the top of the render effect, immediately before
	 * the layout is built, and the canvas element's own offset is written from it
	 * in the same place — one reader, one writer, no reactive round trip to make
	 * the effect that sets it re-run. `resized` carries it, so the backing store
	 * re-fits on a move exactly as it does on a width change.
	 * @type {import("./layout-shared.js").Bleed}
	 */
	let bleed = NO_BLEED;

	/**
	 * Re-measure the column's offset in the viewport.
	 * @returns {number} how far the column's left edge moved, which is also how
	 *   far the drawing origin moved along the canvas. 0 when nothing changed, and
	 *   0 when only the far side did (the window got wider but the column stayed) —
	 *   that case always changes `canvasWidth` too, so the resize branch has it.
	 */
	function measureBleed() {
		if (!container) return 0;
		const l = Math.max(0, container.getBoundingClientRect().left);
		const r = Math.max(0, canvasWidth - width - l);
		if (bleed.l === l && bleed.r === r) return 0;
		const dx = l - bleed.l;
		bleed = { l, r };
		return dx;
	}
	// live, so DevTools' emulation (and a reader changing the OS setting mid-story)
	// stands every animation down straight away
	const motionQuery = new MediaQuery("(prefers-reduced-motion: reduce)", false);
	const reducedMotion = $derived(motionQuery.current);
	// True while a choreography owns the rAF instead of the tweeners — legs
	// (runLegs — an entry or a reader's ask) or a state's ambient
	// drift (playAmbient); the render effect steps aside and drawScene tracks live
	// endpoints.
	//
	// Deliberately NOT $state. Only two things read it — drawScene, per frame off
	// the rAF, and the render effect — and neither wants a re-render when it
	// moves: the effect's job is to react to what the story is SHOWING (state,
	// params, canvas size), never to who currently owns the rAF. As a $state it
	// was a dependency of the very effect that clears it, so abandoning a
	// choreography on a step change re-ran the effect a beat later — and by then
	// prevState/prevParamsKey were already updated, so stateChange and paramChange
	// were both false and it fell into the catch-all `to(attrs, 0)`, snapping the
	// arrival tween it had started microseconds earlier. That is the same trap
	// documented for story.settled in notes/scrolly-framework.md. It only showed
	// up once a state rested in an ambient loop (leaving one, a sweep is ALWAYS in
	// flight), because the race animators re-set it to true within the same run
	// and so hit the early-return guard on the re-run instead.
	let sweeping = false;
	/** @type {{ id: number, name: string, x: number, y: number, r: number, alpha: number, labelAlpha: number, labelOffset: number }[]} */
	let tracked = $state([]);
	// static per-state chart furniture (ticks/callouts/legend) from the layout result
	/** @type {{ axes?: { x?: import("./layout-shared.js").Tick[], y?: import("./layout-shared.js").Tick[], xBase?: number, yBase?: number }, notes?: import("./states.js").Note[], takeover?: import("./layout-shared.js").TakeoverCallout|null, band?: import("./layout-shared.js").FutureBand|null, legend?: import("./layout-shared.js").LegendItem[], legendY?: number, hits?: import("./layout-shared.js").Hit[] } | null} */
	let decor = $state(null);
	// true while an arrival is clearing the previous scene off the canvas before
	// its own chart may appear: the axis furniture (ticks, callouts, legend, axis
	// titles) stays unmounted until it drops, so the graph doesn't sit behind the
	// outgoing scene. Set by the race entry (the rank bar fades out in place
	// there, over the very region the axes occupy) and dropped when the draw-on
	// takes the rAF; reset by every render pass, so an arrival cut short
	// mid-fade can't leave the chart hidden.
	let chartVeiled = $state(false);
	// hopBands' title + labelled bands: unlike every other state's furniture
	// (which mounts alongside the dots and fades in over its own arrival), this
	// one waits for the arrival tween to actually land (story.settled), so the
	// bands read once the crowd has sorted into them rather than over the
	// tween. Steps 4 and 5 both rest in this one state (see layouts/hop-bands.js),
	// so settling once on arrival covers both; a resize/reduced-motion snap still
	// calls settle() immediately, so this never sticks veiled.
	const hopBandsVeiled = $derived(
		stateName === "hopBands" && story.settled !== "hopBands"
	);
	// tappable chart regions (layout `hits` + the state's `pick`): rendered as
	// transparent buttons over the canvas, so a pick is keyboard- and
	// screen-reader-reachable without any canvas hit-testing
	const pick = $derived(STATE_PICK[stateName]);

	let ctx = null;
	let prevState = null;
	let prevParamsKey = null;
	let prevW = 0;
	let prevH = 0;
	let prevCanvasW = 0;
	let entered = false;
	// `camPanning` is true whenever the camera is actively moving (a reader pan, or
	// the rewind phase) — a reader's scrub grab is ignored while it is set, so a
	// choreographed pan is never fought by the scrubber mid-motion.
	let camPanning = $state(false);
	// The live camera playhead — the single source of truth for where the race
	// chapter's camera is. Every camera writer (draw-on, both rewind legs, the pan
	// glide) publishes into it each frame, so a later leg or a reader's grab
	// continues from wherever the previous motion actually got to instead of a
	// hard-coded year. Reset with `raceView` on a state change.
	let renderPlayhead = RACE_RECENT_EXTENT[1];
	// The camera of the race step being LEFT, captured before the state-change
	// effect resets it (it runs first), so a reverse can start from it even when the
	// reader interrupts a pan mid-flight. The axis needs no equivalent: it is a
	// function of this camera, so picking the playhead up picks the axis up with it.
	/** @type {number | null} */
	let raceExitPlayhead = null;
	// The frontier's twin of the two above: how far raceFuture's strip has opened.
	// Published every frame for the same reason the playhead is — the closing leg
	// picks up from where the reader can actually see the strip rather than from a
	// hard-coded year, so a step back out of a half-open block closes it from
	// there instead of jumping to full width first.
	let renderFrontier = RACE_DATA_END;
	let raceExitFrontier = RACE_DATA_END;
	// One hold view, so the playhead and the frontier can never be published apart
	const raceHoldView = () => ({
		playhead: renderPlayhead,
		frontier: renderFrontier
	});
	// While an entry choreography is playing, the set of ids whose names have
	// been introduced so far (see EntryAnim.labelsAfter); null = no gate, every
	// labelled id shows. Deliberately NOT $state: drawScene folds it into
	// `tracked` (which is reassigned every frame and is what the template reads),
	// so the labels stay reactive without the render effect depending on state it
	// also writes. The CSS opacity transition on .node-label does the fade.
	/** @type {Set<number> | null} */
	let entryLabels = null;
	// Names this arrival is introducing — labelled now, but not by the state we
	// came from — held back for the same beat as the edges (EDGE_LAG_MS), so the
	// annotation layer arrives together, once the dots have mostly landed, rather
	// than gliding along beside them. Names carried over from the previous state
	// are never held; blanking one already on screen would blink it off and back
	// on. Not $state, for the same reason as entryLabels above.
	/** @type {Set<number> | null} */
	let heldLabels = null;
	let labelHoldUntil = 0;
	// ids the current state labels, kept so the next arrival can tell an
	// introduced name from a carried-over one
	let prevLabelIds = new Set();

	const overlay = $derived(OVERLAYS[stateName]);
	// Scene identity for the axes and the takeover callout, which the template
	// keys on to replay their mount fade. Every race step draws the same two axes
	// off the same camera and recomputes them per frame through a pan, so the
	// whole chapter is ONE scene here: keyed on stateName instead, stepping
	// raceRecent -> raceFull remounted every tick and faded an identical axis back
	// in from nothing, which is the only motion the reader saw at that step
	// change. The overlay labels below solve the same problem by keying on their
	// own text; ticks change too often for that, so they key on the scene.
	const axesScene = $derived(STATE_RACE[stateName] ? "race" : stateName);
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
	// draw pass culls the race cast against it (see drawScene), so it has to be
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
	// vertical centre of the rotated y-axis title. Every scatter/line layout maps
	// its y-domain onto the full plot area (top ≈ MARGIN+8 → plotBottom), so the
	// plot-area centre IS the axis centre. NB the even-step tick labels don't reach
	// the padded domain edges, so a (firstTick+lastTick)/2 would sit off-centre —
	// use the plot bounds directly. This is the y-range of the plot, not half the
	// tall canvas.
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
	const yLabelTop = $derived(height ? (MARGIN + 8 + plotFloor) / 2 : 0);
	// x-axis title sits just under the plot, but never behind the step card: on
	// long-prose steps the card climbs into the plot, so clamp the title up to
	// stay above it (text-shadow keeps it legible over any dots it then overlaps)
	const xLabelTop = $derived(
		height ? Math.min(plotFloor + 32, height - stepsHeight - 24) : 0
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
	// of the default below-and-centred)
	const labelDirs = $derived.by(() => {
		const spec = STATE_LABEL_DIRS[stateName];
		return (typeof spec === "function" ? spec(layoutParams) : spec) ?? {};
	});
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

	// Pudding's scatter.locate(): the live on-canvas position of a tracked dot, in
	// VIEWPORT coordinates (canvas-relative x/y + the container's bounding rect), so
	// callers don't have to share the canvas's offset parent. Used by the pair-quiz
	// panel to fly option cards onto their true dot positions. null until the id has
	// been tracked at least once. Quiz ids are always tracked (STATE_TRACKED) and
	// never move on a pick, so this is a stable flight target.
	export function locate(id) {
		const t = tracked.find((entry) => entry.id === id);
		if (!t || !container) return null;
		const rect = container.getBoundingClientRect();
		return { x: rect.left + t.x, y: rect.top + t.y };
	}

	// What a frame writer hands back (FrameOutput in states.js): per-frame chart
	// furniture, the camera it drew, and story fields to publish. Applied on
	// every tick of every choreography, so a leg that pans the camera keeps the
	// axes, the callout and the live playhead in step with the dots. `story`
	// writes go through an equality check: a write that changes nothing still
	// invalidates the layout params and would retarget the tweener mid-run.
	/** @type {{ playhead: number, frontier: number } | null} */
	let lastCamera = null;
	function applyFrame(out) {
		if (!out) return;
		if (out.decor) decor = { ...decor, ...out.decor };
		if (out.camera) {
			if (out.camera.playhead != null) renderPlayhead = out.camera.playhead;
			if (out.camera.frontier != null) renderFrontier = out.camera.frontier;
			lastCamera = { playhead: renderPlayhead, frontier: renderFrontier };
		}
		if (out.story) {
			for (const [key, value] of Object.entries(out.story)) {
				if (story[key] !== value) story[key] = value;
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
		exit: { playhead: raceExitPlayhead, frontier: raceExitFrontier },
		camera: { playhead: renderPlayhead, frontier: renderFrontier },
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
		sweeping = false;
		camPanning = false;
		entryLabels = null;
		story.entryHeld = false;
		if (story.running !== null) story.running = null;
		if (anim.finish) {
			anim.finish(story, lastCamera ?? undefined);
		} else {
			tweener.to(finalAttrs, 0);
			trailTweener.to(finalTrails, 0);
			settle(stateName);
		}
		publishRaceCam();
	}

	// One leg after another on the shared rAF (runPhase), each frame written
	// straight into the live buffers and its output published. Single-writer
	// discipline throughout: the tweeners are stopped first and `sweeping` makes
	// the render effect step aside; a state change's stopSweep abandons the run;
	// and a choreography on the race chart owns the camera (camPanning), so a
	// choreographed pan is never fought by the scrubber mid-motion.
	function runLegs(anim, write, ctx, finalAttrs, finalTrails) {
		const phases = phasesOf(anim, ctx);
		tweener.stop();
		trailTweener.stop();
		sweeping = true;
		camPanning = !!raceStep;
		lastCamera = null;
		introduceLabels(anim, 0);
		const runLeg = (i) => {
			if (i >= phases.length) {
				finishChoreography(anim, finalAttrs, finalTrails);
				return;
			}
			runPhase(
				phases[i],
				(e, ms) =>
					applyFrame(write(tweener.current, trailTweener.current, i, e, ms)),
				() => {
					introduceLabels(anim, i + 1);
					// what the step's prose was waiting for is on screen now, so the
					// card can speak (see EntryAnim.cardAfter)
					if (i === anim.cardAfter) story.entryHeld = false;
					runLeg(i + 1);
				}
			);
		};
		runLeg(0);
	}

	// The arrival tween onto a choreography's frame 0, then its legs — which only
	// start if the tween lands: a superseding tween (Next mid-flight) drops the
	// callback, so a reader who steps on skips the choreography like any other.
	// `arrivalJitter` is the state's own (see EntryAnim).
	function startArrival(p) {
		const jitter = p.anim.arrivalJitter ?? TWEEN_JITTER;
		tweener.to(p.startAttrs, TWEEN_MS, jitter, p.stateDelays, () => {
			chartVeiled = false;
			runLegs(p.anim, p.write, p.ctx, p.finalAttrs, p.finalTrails);
		});
		tweenTrails(p.startTrails, TWEEN_MS);
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
	function arrive(anim, from, attrs, trailTarget, stateDelays) {
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
			finishChoreography(anim, attrs, trailTarget);
			return;
		}
		const startAttrs = attrs.slice();
		const startTrails = trailTarget.slice();
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
			finalAttrs: attrs,
			finalTrails: trailTarget
		};
		if (anim.ownsArrival) {
			// frame 0 IS the departing frame, so this snap moves nothing, and the
			// legs own the rAF from the step change at whatever rate they author
			tweener.to(startAttrs, 0);
			trailTweener.to(startTrails, 0);
			runLegs(anim, write, ctx, attrs, trailTarget);
			return;
		}
		chartVeiled = !!anim.veil;
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
		stopSweep();
		if (tweener.running) tweener.to(tweener.target, 0);
		if (trailTweener.running) trailTweener.to(trailTweener.target, 0);
		pendingArrival = null;
		chartVeiled = false;
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
			publishRaceCam();
			return;
		}
		story.running = kind;
		runLegs(anim, write, ctx, tweener.target, trailTweener.target);
	}

	// A state's ambient drift (STATE_AMBIENT): unlike an entry choreography this
	// never ends, so there is no final leg and no settle to land on — the arrival
	// has already settled, and the writer's own t = 0 frame is what it landed on,
	// so the first tick redraws that frame and the join moves nothing. Same
	// single-writer discipline as runLegs (tweeners stopped, `sweeping` makes the
	// render effect step aside) and the same skippability: a state change calls
	// stopSweep, and the next arrival tween then snapshots `current`, so the dots
	// fly on from wherever the drift had them rather than snapping back.
	//
	// Never runs under reduced motion — the static layout is the still frame.
	function playAmbient(anim) {
		if (!width || !height || reducedMotion) return;
		// this loop never ends by itself, so it must never be started twice — a
		// second runLoop would overwrite sweepRaf and leave the first one running
		// and uncancellable, two writers fighting over the same buffer
		stopSweep();
		tweener.stop();
		trailTweener.stop();
		sweeping = true;
		const write = anim.frames(nodes, width, height, edges, layoutParams, bleed);
		// armed AFTER stopSweep above, which would otherwise read the flag this call
		// is about to set and bump a revision for a flight that had not started
		skyFlying = true;
		runLoop((t) => write(tweener.current, trailTweener.current, t));
	}

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

	// The galaxy beat's one name, reused rather than rebuilt: like raceLabelCut
	// this is decided per FRAME, and the per-frame writers on this path document
	// themselves as allocating nothing.
	const galaxyShownSet = new Set();
	/** the chapter card's highlight beat names exactly the actor it is on */
	function galaxyLabelCut() {
		galaxyShownSet.clear();
		galaxyShownSet.add(galaxyHighlight.id);
		return galaxyShownSet;
	}

	/**
	 * The race labels one FRAME shows: the step's own subject, then the labelled
	 * dots nearest the centre of Hollywood, up to RACE_LABEL_TOP in all.
	 *
	 * Ranks on screen-y rather than avg-distance because the two are the same
	 * order — the axis is fitted with the record at the top — and y is already in
	 * the buffer the frame just wrote, so no curve has to be re-read per frame.
	 *
	 * The subject is exempt from the cut — a step's ink dot must never be the
	 * anonymous one, and raceFull rests on cameras where Hackman is outside the
	 * ten nearest the centre — but not from the plot test: a name the draw pass
	 * has culled has nothing left to label.
	 *
	 * @param {Float32Array} attrs the frame's dot buffer
	 */
	function raceLabelCut(attrs) {
		const keep = new Set(
			(raceStep.highlight ?? []).filter((id) => onRacePlot(attrs, id * STRIDE))
		);
		/** @type {[number, number][]} */
		const rest = [];
		for (const id of labelIds) {
			// a name whose dot the frame has faded out — or whose dot the draw pass
			// is culling off the plot — isn't shown either way, and must not eat one
			// of the ten slots on its way off the plot
			if (
				keep.has(id) ||
				attrs[id * STRIDE + 6] <= 0.004 ||
				!onRacePlot(attrs, id * STRIDE)
			)
				continue;
			rest.push([id, attrs[id * STRIDE + 1]]);
		}
		rest.sort((a, b) => a[1] - b[1]);
		for (const [id] of rest) {
			if (keep.size >= RACE_LABEL_TOP) break;
			keep.add(id);
		}
		return keep;
	}

	// slots drawn in drawScene's second trail pass, reused rather than allocated
	// per frame (drawScene runs on every rAF tick of every tween)
	/** @type {number[]} */
	const inkedTrails = [];

	/**
	 * One trail polyline. `hi` (0-1) blends its TRAIL_META colour toward INK and
	 * thickens it — the same treatment slot 2 gives a highlighted edge below, and
	 * the whole of how the race chart marks whoever is leading at its camera.
	 * @param {Float32Array} trailAttrs
	 */
	function strokeTrail(trailAttrs, t, alpha, hi) {
		const base = t * TRAIL_STRIDE;
		const { rgb, width: lw } = TRAIL_META[t];
		ctx.strokeStyle = hi
			? `rgba(${rgb.map((c, k) => Math.round(c + (INK[k] - c) * hi)).join(", ")}, ${alpha})`
			: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
		ctx.lineWidth = lw + hi * 0.5;
		ctx.beginPath();
		ctx.moveTo(trailAttrs[base], trailAttrs[base + 1]);
		for (let k = 1; k < TRAIL_POINTS; k++) {
			ctx.lineTo(trailAttrs[base + k * 2], trailAttrs[base + k * 2 + 1]);
		}
		ctx.stroke();
	}

	function drawScene() {
		if (!ctx) return;
		const attrs = tweener.current;
		const trailAttrs = trailTweener.current;
		// past the column on both sides and above its top edge: the origin sits on
		// `.visual`'s top left corner, so clearing [0, width] x [0, height] would
		// leave the chapter card's sky smeared across the bleed and the title band
		// for the rest of the story
		ctx.clearRect(
			-bleed.l,
			-TITLE_BAND,
			width + bleed.l + bleed.r,
			height + TITLE_BAND
		);
		// trails under everything: race/career lines, prediction diagonal. An INKED
		// line (the race chart's leader — see setTrailHighlight) is held back to a
		// second pass so the crown is drawn over the field rather than buried under
		// whichever grey neighbour happens to own a later slot.
		inkedTrails.length = 0;
		for (let t = 0; t < TRAIL_META.length; t++) {
			const base = t * TRAIL_STRIDE;
			const alpha = trailAttrs[base + TRAIL_POINTS * 2];
			if (alpha <= 0.008) continue;
			const hi = trailAttrs[base + TRAIL_POINTS * 2 + 1];
			if (hi > 0.004) inkedTrails.push(t);
			else strokeTrail(trailAttrs, t, alpha, 0);
		}
		for (const t of inkedTrails) {
			const base = t * TRAIL_STRIDE;
			strokeTrail(
				trailAttrs,
				t,
				trailAttrs[base + TRAIL_POINTS * 2],
				trailAttrs[base + TRAIL_POINTS * 2 + 1]
			);
		}
		ctx.lineWidth = 1;
		// a live (target alpha > 0) line's endpoint is drawn at its final spot
		// (not its live position) so the line points to where the actor is going
		// and the actor slides onto it, instead of the angle swinging as the
		// actor tweens into place; a dying line (faded out in the target frame)
		// tracks both live dots instead — the frame's endpoint positions belong to
		// a layout this edge isn't part of.
		//
		// "Where it is going" is the TWEENER's target, not the state's static
		// layout: an entry choreography arrives onto its own frame 0 first (e.g.
		// hopSeed lands on the full-size network before pulling back from it), and
		// aiming at the static layout through that arrival detaches every link
		// from its dots. While the choreography itself owns the frame
		// (`sweeping`) it is writing positions directly into `current`, so its
		// stale target says nothing and the lines track both live dots.
		const target = tweener.target;
		for (let e = 0; e < edgeEnds.length; e++) {
			const i = EDGE_BASE + e * STRIDE;
			const progress = attrs[i];
			const alpha = attrs[i + 1];
			if (alpha <= 0.004 || progress <= 0.004) continue;
			const [from, to] = edgeEnds[e];
			const liveEnds = sweeping || !target || target[i + 1] <= 0.004;
			const xa = attrs[from * STRIDE];
			const ya = attrs[from * STRIDE + 1];
			const xb = liveEnds ? attrs[to * STRIDE] : target[to * STRIDE];
			const yb = liveEnds ? attrs[to * STRIDE + 1] : target[to * STRIDE + 1];
			// slot 2 blends the stroke toward the highlight colour and thickens it,
			// so a highlighted route animates in with everything else
			const hi = attrs[i + 2];
			ctx.strokeStyle = hi
				? `rgba(${EDGE_GREY.map((c, k) => Math.round(c + (EDGE_HIGHLIGHT[k] - c) * hi)).join(", ")}, ${alpha})`
				: `rgba(${EDGE_GREY.join(", ")}, ${alpha})`;
			ctx.lineWidth = 1 + hi * 1.25;
			ctx.beginPath();
			ctx.moveTo(xa, ya);
			ctx.lineTo(xa + (xb - xa) * progress, ya + (yb - ya) * progress);
			ctx.stroke();
		}
		ctx.lineWidth = 1;
		dotBuckets.clear();
		for (let i = 0; i < EDGE_BASE; i += STRIDE) {
			const alpha = attrs[i + 6];
			if (alpha <= 0.004) continue;
			// mid-chapter, the race cast is drawn only where the chart is (see
			// onRacePlot). Scoped to the cast, so a crowd arriving from — or leaving
			// for — a neighbouring chapter still crosses the whole canvas.
			if (racePlotCulling && RACE_CAST.has(i / STRIDE) && !onRacePlot(attrs, i))
				continue;
			const rB = attrs[i + 3] >> 4;
			const gB = attrs[i + 4] >> 4;
			const bB = attrs[i + 5] >> 4;
			const aB = alpha >= 1 ? 15 : (alpha * 16) | 0;
			const key = (rB << 12) | (gB << 8) | (bB << 4) | aB;
			let bucket = dotBuckets.get(key);
			if (!bucket) {
				bucket = {
					path: new Path2D(),
					style: `rgba(${(rB << 4) | 8}, ${(gB << 4) | 8}, ${(bB << 4) | 8}, ${(aB + 0.5) / 16})`
				};
				dotBuckets.set(key, bucket);
			}
			const x = attrs[i];
			const y = attrs[i + 1];
			const r = attrs[i + 2];
			// moveTo before arc so consecutive circles aren't joined by a chord
			bucket.path.moveTo(x + r, y);
			bucket.path.arc(x, y, r, 0, TAU);
		}
		for (const { path, style } of dotBuckets.values()) {
			ctx.fillStyle = style;
			ctx.fill(path);
		}
		// held names (see heldLabels) are still waiting out their lag; drawScene
		// runs every frame of the arrival tween, which always outlasts the hold, so
		// this flips over mid-tween with no timer of its own
		const holding = heldLabels && performance.now() < labelHoldUntil;
		// On the race chart the step declares every name its camera RANGE can need
		// (a superset — see raceLabelSpec), and the cut to the RACE_LABEL_TOP the
		// current camera puts nearest the centre happens here, against the live dot
		// positions. Doing it per frame rather than per step is what keeps the
		// gutter at ten names on the crowded mid-2000s cameras without the declared
		// set having to know which camera the reader is on; because it reads the
		// dots the frame just wrote, it also slides continuously as the camera pans
		// instead of resolving in one jump at the settle.
		// The galaxy beat is the other per-frame cut: `chapterCenters` declares no
		// names at all, and the flight's writer says who the beat is on as it
		// writes each frame, so the card's one name can only be resolved here.
		const shown = raceStep
			? raceLabelCut(attrs)
			: galaxyHighlight.id != null
				? galaxyLabelCut()
				: labelIds;
		const nextTracked = TRACKED_IDS.map((id) => ({
			id,
			name: labelTexts[id] ?? nodes[id].name,
			x: attrs[id * STRIDE],
			y: attrs[id * STRIDE + 1],
			r: attrs[id * STRIDE + 2],
			alpha: attrs[id * STRIDE + 6],
			// a name rides its dot's alpha, except while an entry choreography is
			// holding it back until the leg that introduces the actor has finished,
			// or while it is waiting out the arrival lag
			labelAlpha:
				shown.has(id) &&
				(!entryLabels || entryLabels.has(id)) &&
				!(holding && heldLabels.has(id))
					? attrs[id * STRIDE + 6]
					: 0,
			labelOffset: 0
		}));
		// only beside-dot labels ("left"/"right") stack vertically — below-dot
		// labels are already x-separated by their own dot, so they're excluded.
		// Left and right labels sit on opposite sides of the cloud and never
		// visually collide with each other, so each side decollides on its own —
		// otherwise a left label can shove a right label down (or vice versa)
		// just for sharing a y, with no actual overlap to avoid.
		const besideDot = nextTracked.filter(
			(t) => t.labelAlpha > 0 && labelDirs[t.id] != null
		);
		if (besideDot.length > 0) {
			const shownOffset = new Map([
				...decollideLabelsLeft(
					besideDot.filter((t) => labelDirs[t.id] === "left"),
					LABEL_LINE_GAP_PX
				),
				...decollideLabelsRight(
					besideDot.filter((t) => labelDirs[t.id] === "right"),
					LABEL_LINE_GAP_PX
				)
			]);
			// The de-collider's stack only ever grows DOWNWARD, which is free when
			// the names sit in the plot's right-hand gutter: an overflowing stack
			// runs off into empty space beside the axis. raceFuture is the one step
			// whose column is pinned at the LEFT instead (tailPx), so its
			// names lie over the plot and an overflow lands on the x-axis tick row
			// — eight names packed into the band's bottom ~70px need ~112px, and on
			// a short viewport the last two land on the year labels.
			//
			// Lift the whole set by the overflow rather than clamping the names that
			// cross the line: a clamped label stops making room for the ones under
			// it and the sweep piles up behind it (the trap LABEL_MAX_OFFSET_PX is
			// sized to avoid), whereas a uniform lift keeps every gap the
			// de-collider just solved for and only moves the stack as a body.
			//
			// Scoped to tailPx rather than to the race chart at large, so no
			// step whose names are safely in the gutter changes behaviour.
			if (raceStep?.tailPx !== undefined && height) {
				const floor = plotBottom(height) - 4;
				let over = 0;
				for (const t of besideDot) {
					over = Math.max(over, t.y + (shownOffset.get(t.id) ?? 0) - floor);
				}
				if (over > 0) {
					for (const [id, off] of shownOffset) shownOffset.set(id, off - over);
				}
			}
			if (labelRelaxRaf != null) cancelAnimationFrame(labelRelaxRaf);
			labelRelaxRaf =
				decollideLabelsLeft.settled() && decollideLabelsRight.settled()
					? null
					: requestAnimationFrame(() => {
							labelRelaxRaf = null;
							drawScene();
						});
			ctx.lineWidth = 1;
			for (const t of besideDot) {
				const offset = shownOffset.get(t.id) ?? 0;
				t.labelOffset = offset;
				// a thin leader connects dot to label only once it's been visibly
				// nudged off the dot's own y, mirroring the reference's stub line
				if (Math.abs(offset) > 0.5) {
					const i = t.id * STRIDE;
					const dir = labelDirs[t.id];
					const gap = 4;
					const lx = dir === "right" ? t.x + t.r + gap : t.x - t.r - gap;
					ctx.strokeStyle = `rgba(${attrs[i + 3]}, ${attrs[i + 4]}, ${attrs[i + 5]}, ${t.labelAlpha * 0.4})`;
					ctx.beginPath();
					ctx.moveTo(t.x + (dir === "right" ? t.r : -t.r), t.y);
					ctx.lineTo(lx, t.y + offset);
					ctx.stroke();
				}
			}
		}
		tracked = nextTracked;
	}

	// The race sweep/pan owns story.raceView; drop it whenever the active state
	// changes so a freshly-entered state rests at its own resting year, not a
	// stale override. The playhead and the pan target go with it — otherwise a pan
	// on one race step leaks into the next one's first grab. Depends on stateName
	// ONLY (untrack the reads) — a sweep setting raceView while the state is
	// unchanged must not re-fire this. Declared before the render effect so it
	// wins the flush when a step change dirties both.
	$effect(() => {
		stateName;
		const step = STATE_RACE[stateName];
		untrack(() => {
			// snapshot the camera we're leaving before resetting it — a backward
			// arrival replays the departing motion in reverse from exactly here
			raceExitPlayhead = renderPlayhead;
			raceExitFrontier = renderFrontier;
			if (story.raceView !== null) story.raceView = null;
			if (story.scrubYear !== null) story.scrubYear = null;
			// a race step's default resting camera is the last year its camera may
			// rest on — its extent's end for every step but raceFuture, which pins
			// its camera by the LEFT edge instead and so rests at a year that
			// depends on the viewport (raceMaxPlayhead). Reading it through that one
			// function is what keeps this agreeing with raceLayout's own fallback.
			// Guarded on width: this runs inside untrack, so on a cold mount the
			// canvas may not be measured yet and a tailPx step would resolve
			// against a zero-width plot. publishRaceCam's clamp corrects it as soon
			// as the dimensions land.
			if (step)
				renderPlayhead =
					width && height
						? raceMaxPlayhead(width, height, step)
						: step.extent[1];
			// ...and its resting frontier: shut on every step but raceFuture, whose
			// own descriptor declares the open one
			renderFrontier = step?.frontier ?? RACE_DATA_END;
			// raceFull's true resting camera is RACE_REWIND_WAYPOINT_YEAR (2006) —
			// every arrival path settles here, animated or not, so the reader
			// always has the slider immediately usable from the same year
			if (stateName === RACE_FULL_STATE && width && height) {
				renderPlayhead = RACE_REWIND_WAYPOINT_YEAR;
			}
		});
	});

	// Nothing else sets raceFull's camera — its arrival is a plain tween, and a
	// cold mount straight into it (the step restored from the URL) has had no
	// arrival at all — so story.raceView is left null and raceLayout's own
	// fallback (extent[1], i.e. 2025) puts the chart on the wrong camera. This effect
	// seeds the real rest playhead as soon as width/height are known — unlike
	// the effect above, it tracks width/height reactively (not via untrack), so
	// it still fires once they're measured even if that happens after mount.
	// Guarded on raceView already being null so it never clobbers a live
	// pan/scrub/entry that has legitimately published its own view.
	$effect(() => {
		if (
			stateName === RACE_FULL_STATE &&
			width &&
			height &&
			story.raceView === null
		) {
			story.raceView = { playhead: RACE_REWIND_WAYPOINT_YEAR };
		}
	});

	// Publishes the live camera for the pan control (RaceScrubber). ScrollyVisual is
	// the only component that knows the canvas width, so the bounds have to come
	// from here. One-way by construction: no layout's `params` selector reads
	// raceCam, so this can never feed back into the render effect. Called at rest
	// points (state change, resize, every choreography settle) rather than per
	// frame — the pan control only needs the camera it can be grabbed from.
	function publishRaceCam() {
		if (!raceStep?.extent || !width || !height) {
			if (story.raceCam !== null) story.raceCam = null;
			return;
		}
		const bounds = racePanBounds(width, height, raceStep, renderPlayhead);
		renderPlayhead = Math.min(
			bounds.panMax,
			Math.max(bounds.panMin, renderPlayhead)
		);
		// a hold written before a resize can now be out of range — retarget it
		// rather than leaving the camera somewhere the reader can't get back to
		if (
			story.raceView &&
			Math.abs(story.raceView.playhead - renderPlayhead) > 0.01
		) {
			story.raceView = raceHoldView();
		}
		story.raceCam = {
			pxPerYear: getRacePxPerYear(),
			playhead: renderPlayhead,
			...bounds
		};
	}
	$effect(() => {
		raceStep;
		width;
		height;
		untrack(publishRaceCam);
	});

	// Scrub (Stage 5): when the reader starts dragging/keying the year control,
	// kick off the glide loop (which then self-drives off story.scrubYear until it
	// settles and hands off to raceView). Bypasses the reactive layout path
	// (raceView/STATE_PARAMS) — that would route through the straight-line tweener
	// and leak a layoutFor cache entry per frame. Declared before the render effect
	// so it wins the flush; the loop-start is untracked.
	$effect(() => {
		if (story.scrubbing) untrack(() => camPanning || startScrub());
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

	// Records the state whose arrival has just landed. A layout can read this to
	// hold an interaction back until its own authored reveal has finished.
	//
	// Set-only, never cleared: it names a state, so stepping away un-arms every
	// gate by itself. That matters — clearing it here would write state this
	// effect derives its params from, re-running the effect with an unchanged
	// params key, which lands in the catch-all below and snaps the reveal it was
	// meant to wait for. Setting it always flips a gate, so that re-run is a
	// param change (the interaction fading in), never the snap.
	//
	// Guarded on the live state so a callback that outlives its step can't arm the
	// wrong one; a superseded tween drops its callback (see tween.js), so a reader
	// who steps on mid-reveal never arms at all.
	//
	// It is also where a state's ambient drift begins — the arrival is over, so the
	// rAF is free. Hooking it here rather than at each arrival branch covers every
	// path into a state at once (a plain state tween's onDone, the cold-start and
	// first-paint branches, and the reduced-motion/resize snap), and expresses the
	// rule: the ambient begins where the reveal ends.
	function settle(name) {
		if (name !== stateName) return;
		story.settled = name;
		// Safe to start from inside the render effect (which the snap branches do):
		// `sweeping` is not reactive, so setting it invalidates nothing — see its
		// declaration for why that matters.
		const ambient = STATE_AMBIENT[name];
		if (ambient) playAmbient(ambient);
	}

	$effect(() => {
		// DEV: the y-band curve editor edits a table inside layouts/race.js, which
		// the layout cache can't see. Read the revision counter FIRST, before any
		// early return, so the dependency is registered on every run, and drop the
		// cached layouts whenever it moves.
		// `cacheDropped` is read by the no-op guard further down, which must not
		// swallow either of these: they edit tables the cache cannot see and then
		// need a rebuild at the SAME state, params and box.
		let cacheDropped = false;
		if (import.meta.env.DEV && story.raceYBandsRev !== lastBandRev) {
			lastBandRev = story.raceYBandsRev;
			layoutCache.clear();
			cacheDropped = true;
		}
		// DEV: same idea for RacePxPerYearDev's x-axis density slider.
		if (import.meta.env.DEV && story.racePxPerYearRev !== lastPxRev) {
			lastPxRev = story.racePxPerYearRev;
			layoutCache.clear();
			cacheDropped = true;
		}
		// canvasWidth is in here with the rest: it sizes the backing store, so a tick
		// where it has not been measured yet would hand the store a width of 0 and
		// blank the canvas until the next resize
		if (!canvas || !width || !height || !canvasWidth || !stateName) return;
		// while the path animator/scrub loop owns the rAF, step aside: a genuine
		// state change (Next) abandons it — dots tween on from wherever they are, so
		// Next stays live and any in-progress scrub ends; a param/raceView change is
		// the animator's own handoff, so ignore it. (Scrubbing implies sweeping, so
		// this one guard covers both.) raceView is dropped by the stateName effect.
		// A resize abandons a sweep too, and must: a frame writer closes over the
		// canvas box it was built for, so a leg that keeps running after a rotate
		// draws the old geometry for the rest of its life — and an ambient loop has
		// no rest of its life, so it would never recover. The snap branch below
		// re-fits, and settle() restarts the ambient at the new size.
		// the plot's share of the column is a property of the PAGE's layout, not of
		// any one state, so it is set here — once, before any layout is built —
		// rather than threaded through ten layout modules. `beside` is a prop, so
		// this effect already re-runs when the breakpoint flips.
		setPlotBottomFrac(plotFrac);
		// Where the column sits in the viewport, which a width change does not
		// always imply: on the chapter-card swap it keeps its width and MOVES.
		// `dx` is how far, and a move on its own is a change of coordinate frame
		// rather than a resize — see the `else if` branch below.
		const dx = measureBleed();
		// A sweep is the one thing a bare move cannot survive: a frame writer closes
		// over the box it was built for, so reframing the buffer under it would
		// leave it writing the old geometry. Nothing in the story does that — the
		// swap lands on a card ARRIVAL, where the state change has already abandoned
		// the previous sweep — so rather than carry a rebuild path that never runs,
		// fall back to the snap.
		const resized =
			width !== prevW ||
			height !== prevH ||
			canvasWidth !== prevCanvasW ||
			(dx !== 0 && sweeping);
		if (sweeping) {
			if (stateName === prevState && !resized) return;
			stopSweep();
			sweeping = false;
			if (story.scrubbing) untrack(() => (story.scrubbing = false));
			// a run the reader stepped away from is over, however far it got —
			// leave its button usable if they step back
			if (story.running !== null) untrack(() => (story.running = null));
		}
		if (resized) {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			// The backing store spans the bled canvas — wider than `.visual` by
			// `bleed.l` to its left and `bleed.r` to its right, taller by
			// TITLE_BAND above it — but the ORIGIN
			// stays on `.visual`'s top left corner: shifting the transform by the
			// same two amounts is what keeps every layout's coordinates meaning the
			// same screen pixels they always did, so only a layout that deliberately
			// authors outside [0, width] x [0, height] — the chapter card's sky —
			// sees any difference. `height` itself is never adjusted: it is the
			// measured box, and making it depend on the band would put the band in
			// `resized` below and snap every tween the band's value crossed.
			// pin the element to the viewport's left edge. It is written here rather
			// than in CSS because only this path knows where the column landed, and
			// the element is already being sized imperatively two lines down — a
			// custom property set from a $state would make the effect that measures
			// it depend on its own output.
			canvas.style.left = `${-bleed.l}px`;
			canvas.width = canvasWidth * dpr;
			canvas.height = (height + TITLE_BAND) * dpr;
			ctx = canvas.getContext("2d");
			ctx.setTransform(dpr, 0, 0, dpr, bleed.l * dpr, TITLE_BAND * dpr);
			prevW = width;
			prevH = height;
			prevCanvasW = canvasWidth;
		} else if (dx !== 0) {
			// THE SWAP, and the whole reason it is invisible. The column has moved to
			// the other side of the screen without changing size, so the backing store
			// is already right and only the ORIGIN has travelled — `dx` px along the
			// canvas. Re-pin the element and the transform by that much, then take the
			// same `dx` back out of the live frame, and every mark the reader can see
			// stays on the pixel it was on: the buffer holds column coordinates, and
			// the column's zero has just moved.
			//
			// Doing it this way is what keeps the arrival onto the card a TWEEN. The
			// snap branch above re-fits and lands instantly, which is right for a
			// resize and would throw away the one transition — a chart dissolving into
			// the full-bleed sky — that the swap is hidden inside.
			//
			// The state's own layout is rebuilt below against the new bleed, so
			// nothing here touches the tween's target: only where the frame is
			// setting off FROM has to be restated.
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.style.left = `${-bleed.l}px`;
			ctx.setTransform(dpr, 0, 0, dpr, bleed.l * dpr, TITLE_BAND * dpr);
			tweener.reframe((buf) => {
				for (let i = 0; i < EDGE_BASE; i += STRIDE) buf[i] -= dx;
			});
			trailTweener.reframe((buf) => {
				for (let t = 0; t < TRAIL_META.length; t++) {
					const base = t * TRAIL_STRIDE;
					for (let k = 0; k < TRAIL_POINTS; k++) buf[base + k * 2] -= dx;
				}
			});
		}
		const paramsKey = JSON.stringify(layoutParams) ?? "";
		// A re-run that changes nothing must DO nothing, and this effect gets them.
		// `layoutParams` is a `$derived` over the `story` proxy, and every branch
		// below paints synchronously — `to()` with ms 0 calls draw() on the spot —
		// so a paint that publishes into `story` invalidates that derived and hands
		// the effect back a params object with identical CONTENTS and a new
		// identity. `paramsKey` compares by value and rightly reports no change;
		// the run itself was caused by identity.
		//
		// Without this guard such a run falls all the way through the arrival chain
		// to its final `else`, whose instant `to(attrs, 0)` cancels whatever tween
		// is in flight and — see tween.js — drops its `onDone` with it. On a cold
		// start that onDone is the ONLY call to `settle()`, so the 900ms entry tween
		// is snapped away at birth: no fade-up, the ambient never arms, and every
		// `story.settled` gate stays shut. The story opens on a still, silent sky.
		//
		// The `sweeping` guard above is the same intent, but it can only arm once a
		// choreography owns the rAF, which is too late for an arrival still tweening.
		if (
			!resized &&
			dx === 0 &&
			!cacheDropped &&
			stateName === prevState &&
			paramsKey === prevParamsKey
		)
			return;
		const layout = layoutFor(stateName, width, height, layoutParams, bleed);
		const { attrs, delays } = layout;
		decor = {
			axes: layout.axes,
			notes: layout.notes,
			takeover: layout.takeover,
			band: layout.band,
			legend: layout.legend,
			legendY: layout.legendY,
			hits: layout.hits
		};
		chartVeiled = false;
		// states without trails fade the previous ones out where they lie
		const trailTarget = layout.trails ?? fadeOutTrails();
		const firstPaint = !entered;
		entered = true;
		if (firstPaint && coldStart) {
			// reader reloaded mid-story (step restored from the URL): this is
			// not their first-ever view, so settle straight onto the state instead
			// of replaying the `lone`-authored pop-in (misread as an empty chart
			// on faint/dense states like scatterQuiz)
			tweener.to(attrs, 0);
			trailTweener.to(trailTarget, 0);
			prevState = stateName;
			prevParamsKey = paramsKey;
			// the names this paint puts up are on screen, so the next arrival has
			// nothing to introduce. Leaving it behind makes that arrival read every
			// carried-over name as new and hold it out for the lag (see heldLabels)
			// — the whole cast blinks off and back on at the first step change.
			prevLabelIds = labelIds;
			settle(stateName);
			return;
		}
		if (firstPaint && !reducedMotion) {
			// entry: seed positions with radius/alpha zeroed so dots grow in place
			const entry = attrs.slice();
			for (let i = 0; i < EDGE_BASE; i += STRIDE) {
				entry[i + 2] = 0;
				entry[i + 6] = 0;
			}
			for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) {
				entry[i] = 0;
				entry[i + 1] = 0;
			}
			tweener.to(entry, 0);
			prevState = stateName;
			prevParamsKey = paramsKey;
			// same reason as the cold-start branch above
			prevLabelIds = labelIds;
			tweener.to(attrs, ENTER_MS, TWEEN_JITTER, delays, () =>
				settle(stateName)
			);
			trailTweener.to(trailTarget, ENTER_MS, 0, layout.trailDelays);
			return;
		}
		const stateChange = stateName !== prevState;
		const paramChange = !stateChange && paramsKey !== prevParamsKey;
		// a state's authored reveal only plays when arriving from the states
		// it was choreographed for (STATE_REVEAL_FROM); any other direction
		// (e.g. scrolling backwards) is one plain tween
		const revealFrom = STATE_REVEAL_FROM[stateName];
		const playReveal = !revealFrom || revealFrom.includes(prevState);
		const stateDelays =
			(playReveal ? delays : null) ??
			(stateName === TITLE_GALAXY_STATE ? EDGE_UNISON_DELAYS : EDGE_LAG_DELAYS);
		// the entry choreography this arrival plays, if the state declares one for
		// where the reader is coming from (see entryFor)
		const entryAnim = stateChange ? entryFor(stateName, prevState) : undefined;
		// drop any gate a previous choreography left behind — an arrival tween
		// superseded before its onDone fired never reaches its legs, and a stale
		// gate would hide the new state's names for good. Re-armed below only if
		// this arrival actually plays an entry. The step card's own gate goes with
		// it, and for the same reason — a choreography the reader taps through
		// must not leave the next step's prose held back. Likewise an arrival a
		// previous pass left waiting on its hold.
		entryLabels = null;
		story.entryHeld = false;
		pendingArrival = null;
		// the names this arrival introduces, for the wait-for-your-dot hold (see
		// heldLabels); armed below only on a plain state tween, so it never fights
		// a choreography's own labelsAfter clock
		const introduced = new Set();
		for (const id of labelIds) if (!prevLabelIds.has(id)) introduced.add(id);
		heldLabels = null;
		prevLabelIds = labelIds;
		// Arm the draw pass's plot cull only for a move that starts and ends on the
		// chart — a step change or a param settle within the chapter, where a dot
		// off the plot is a tween artefact. Crossing INTO the chapter (the rank
		// list's flight, or a backwards step out of the next one) legitimately
		// carries the cast across the canvas, so the cull stays down for it.
		racePlotCulling = !!STATE_RACE[prevState] && !!STATE_RACE[stateName];
		const from = prevState;
		prevState = stateName;
		prevParamsKey = paramsKey;
		if (resized || reducedMotion) {
			tweener.to(attrs, 0);
			trailTweener.to(trailTarget, 0);
			settle(stateName);
		} else if (entryAnim) {
			arrive(entryAnim, from, attrs, trailTarget, stateDelays);
		} else if (stateChange) {
			heldLabels = introduced.size ? introduced : null;
			labelHoldUntil = performance.now() + EDGE_LAG_MS;
			// the tweener only fires onDone once every delayed group has landed, so
			// this is the end of the state's authored reveal — and a superseded tween
			// drops its callback, so a reader who hits Next mid-reveal never settles
			tweener.to(attrs, TWEEN_MS, TWEEN_JITTER, stateDelays, () =>
				settle(stateName)
			);
			tweenTrails(trailTarget, TWEEN_MS, layout.trailDelays);
		} else if (paramChange) {
			// interaction: retarget quickly, no choreography (delays would make
			// a small pan/highlight feel laggy). Still settles on completion —
			// rankFocus's bar only gets its real target once RankBars measures
			// its row (story.rankFocusBar), so this is the one state whose
			// "reveal has landed" moment is a param retarget rather than the
			// state's own arrival tween.
			tweener.to(attrs, PARAM_TWEEN_MS, 0, null, () => settle(stateName));
			trailTweener.to(trailTarget, PARAM_TWEEN_MS, 0);
		} else {
			tweener.to(attrs, 0);
			trailTweener.to(trailTarget, 0);
		}
	});

	$effect(() => () => {
		tweener.stop();
		trailTweener.stop();
		stopSweep();
	});
</script>

<div
	class="visual"
	bind:this={container}
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<canvas bind:this={canvas} bind:clientWidth={canvasWidth}></canvas>
	<div class="annotations">
		<!-- The future block (PRD P-11-2). In the ANNOTATIONS layer, ahead of the
		     node labels, which is what lets it carry a shaded fill: the names sit
		     beside their dots to the right, so with the column pinned at the left they
		     render INSIDE the block, and `.overlay` (where this first lived) paints
		     over `.annotations` — a fill there hid every one of them. Here the wash
		     goes under the names and under the ticks, and only over the canvas, whose
		     ink to the right of the present is nothing at all.

		     It rides the frame writer's per-frame payload next to `axes` and
		     `takeover` rather than the `notes` slot, per the rule on the overlay
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
		{#if decor?.band && !chartVeiled}
			{@const b = decor.band}
			<div class="band fade-in">
				<span
					class="band-box"
					aria-hidden="true"
					style="left: {b.x}px; top: {b.y}px; width: {b.width}px; height: {b.height}px"
				></span>
				<p class="band-label" style="left: {b.label.x}px; top: {b.label.y}px">
					the future
				</p>
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
		{#each tracked as t (t.id)}
			<!-- a per-node override ("left"/"right") sits the label beside the dot,
			     vertically centred; otherwise it hangs below, centred on the dot and
			     clamped to the canvas (.visual clips, so a name must not spill). The
			     clamp is CSS, not px arithmetic here, because the percentages resolve
			     against the name's own rendered box — so it slides only as far as it
			     actually has to. On a phone the graph sits within LABEL_EDGE_GAP_PX of
			     both edges and most names still fit centred; nudging every one of them
			     a fixed distance inward instead threw them across the constellation. -->
			{@const dir = labelDirs[t.id]}
			{@const transform =
				dir === "right"
					? `translate(${t.x + t.r + 4}px, calc(${t.y + t.labelOffset}px - 50%))`
					: dir === "left"
						? `translate(calc(${t.x - t.r - 4}px - 100%), calc(${t.y + t.labelOffset}px - 50%))`
						: `translate(clamp(${LABEL_EDGE_GAP_PX}px, calc(${t.x}px - 50%), calc(${width - LABEL_EDGE_GAP_PX}px - 100%)), ${t.y + t.r + 4}px)`}
			<p
				class="node-label"
				style="transform: {transform}; opacity: {t.labelAlpha}"
			>
				{t.name}
			</p>
		{/each}
	</div>
	<div class="overlay">
		{#key STATE_TITLE[stateName]}
			{#if STATE_TITLE[stateName] && !chartVeiled && !hopBandsVeiled}
				<p class="chart-title fade-in">{STATE_TITLE[stateName]}</p>
			{/if}
		{/key}
		{#key overlay?.xLabel}
			{#if overlay?.xLabel && !chartVeiled}
				<p class="x-label fade-in" style="top: {xLabelTop}px; bottom: auto">
					{overlay.xLabel}
				</p>
			{/if}
		{/key}
		{#key overlay?.yLabel}
			{#if overlay?.yLabel && !chartVeiled}
				<!-- centre the axis title on the graph's y-axis extent, not the tall canvas -->
				<p class="y-label fade-in" style="top: {yLabelTop}px">
					{overlay.yLabel}
				</p>
			{/if}
		{/key}
		{#key overlay?.yTopLabel}
			{#if overlay?.yTopLabel && !chartVeiled}
				<p class="y-hint y-hint-top fade-in" style="top: {yHintTop}px">
					{overlay.yTopLabel}
				</p>
			{/if}
		{/key}
		{#key overlay?.yBottomLabel}
			{#if overlay?.yBottomLabel && !chartVeiled}
				<p class="y-hint y-hint-bottom fade-in" style="top: {yHintBottom}px">
					{overlay.yBottomLabel}
				</p>
			{/if}
		{/key}
		{#key axesScene}
			<!-- axes and the takeover ring are recomputed every frame during the race
			     sweep/scrub animations (see writeRaceSweepFrame), so they stay
			     pixel-accurate throughout and don't need to hide. Anything that comes
			     off the layout result instead — `notes` — has no per-frame equivalent,
			     so its coordinates freeze for the length of a live scrub/pan and jump
			     on release. Nothing emits notes, and the takeover callout below is why
			     the slot is still empty: it is prose positioned on the plot, i.e.
			     exactly what `notes` is for, but it rides `takeover` in the frame
			     writer's payload instead so that it pans. Anything else on the race
			     chart belongs there too.

			     `chartVeiled` holds the whole lot back while an arrival is still
			     fading the previous scene off the canvas; dropping it mounts these,
			     so each one plays its own fade-in then rather than at the step change.
			     `hopBandsVeiled` holds the same lot back on hopBands specifically,
			     until its own arrival tween lands — see its declaration. -->
			{#if !chartVeiled && !hopBandsVeiled}
				{#each decor?.axes?.x ?? [] as tick}
					<!-- raceFuture as well as raceFull: its arrival pan starts from
					     raceFull's camera, so 1980 can be on the plot for the first
					     frames of the leg, and gating this on raceFull alone would blink
					     the term off the moment the reader pressed Next.

					     Keyed off `tick.year`, not the label: every race year now renders
					     in two digits (raceTickLabel), so the text is lossy. -->
					{#if (stateName === RACE_FULL_STATE || stateName === RACE_FUTURE_STATE) && tick.year === 1980}
						<InfoTerm
							class="tick tick-x tick-1980 fade-in"
							style="left: {tick.pos}px; {decor.axes.xBase != null
								? `top: ${decor.axes.xBase}px`
								: ''}"
							title="Why 1980?"
						>
							{tick.label}
							{#snippet info()}
								<!-- TODO(copy): explain why the chart is tracked back to
								     1970 (the lines extend that far) but the interactive
								     window only pans back to 1980. Owen to write final
								     copy. -->
								<p>PLACEHOLDER — copy pending.</p>
							{/snippet}
						</InfoTerm>
					{:else}
						<p
							class="tick tick-x fade-in"
							style="left: {tick.pos}px; {decor.axes.xBase != null
								? `top: ${decor.axes.xBase}px`
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
					{/if}
				{/each}
				{#each decor?.axes?.y ?? [] as tick}
					<p class="tick tick-y fade-in" style="top: {tick.pos}px">
						{tick.label}
					</p>
				{/each}
				<!-- the takeover callout: the one moment the race chapter is about,
				     stated on the crossing itself rather than behind a click. Only the
				     race layout emits `takeover`, and the wholesale decor write above
				     clears it on every other state, so this needs no state gate. Its
				     geometry rides the per-frame payload next to `axes` (see
				     applyFrame/scrubLoop), so the note stays glued to the crossing
				     through a pan instead of freezing the way a `notes` entry would.
				     The wrapper carries the mount fade and the payload's own `alpha`
				     rides each child, because the two must MULTIPLY: an animation with
				     fill-mode `both` outranks an inline opacity for good, so putting
				     both on one element would leave the cull ramp with no effect.

				     `story.running` — the rewind's ask — is what holds it back until the Start rewind
				     has landed. The pan brings the crossing on camera with about a
				     third of its travel still to go, and without this the note mounted
				     there and then rode ~270px across the plot to its resting spot:
				     fine for an 11px ring, seasick for a block of prose. So it waits,
				     and the wrapper's fade-in is then the only motion it makes.
				     `running` and not `story.settled`, which is the usual
				     wait-for-the-reveal gate: both race steps share one state, so
				     `settled` is already open when Start fires, and raceFull's arrival
				     never sets it at all (it is a plain tween onto its resting camera).
				     Not `camPanning`/`sweeping` either — a reader's scrub raises both,
				     and the note should track the crossing through a drag, not blink on
				     every grab. This flag names exactly the one animation in question. -->
				{#if decor?.takeover && story.running !== "rewind"}
					{@const t = decor.takeover}
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
								d="M {t.arrow.bx} {t.arrow.by} L {t.arrow.h1x} {t.arrow
									.h1y} L {t.arrow.h2x} {t.arrow.h2y} Z"
							/>
						</svg>
						<span
							class="takeover-mark"
							aria-hidden="true"
							style="left: {t.ring.x}px; top: {t.ring.y}px; opacity: {t.alpha}"
						></span>
						<p
							class="takeover-note"
							style="left: {t.note.x}px; top: {t.note.y}px; width: {t.note
								.width}px; opacity: {t.alpha}"
						>
							{TAKEOVER_NOTE}
						</p>
					</div>
				{/if}
				{#each decor?.notes ?? [] as note}
					<p
						class="note fade-in {note.align ?? 'left'}"
						class:strong={note.strong}
						class:wrap={note.wrap}
						style="left: {note.x}px; top: {note.y}px{note.wrapWidth
							? `; width: ${note.wrapWidth}px; max-width: none`
							: ''}"
					>
						{note.text}
					</p>
				{/each}
				{#each decor?.legend?.filter((item) => item.x != null) ?? [] as item}
					<p
						class="legend-item pinned fade-in"
						style="left: {item.x}px; top: {item.y}px"
					>
						{item.label}
					</p>
				{/each}
				{#if decor?.legend?.some((item) => item.x == null)}
					<ul
						class="legend fade-in"
						style={decor.legendY != null
							? `top: ${decor.legendY}px; bottom: auto`
							: ""}
					>
						{#each decor.legend as item}
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
			{/if}
		{/key}
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
	   and reaching up through the title band as well: a chapter card's crowd fills
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

	/* the labels stay inside the reading column: a name is set against the prose
	   measure, not the sky behind it */
	.annotations {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
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
		font-size: 11px;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--color-gray-900, #222);
		/* halo, not opaque: a name sits over the dot cloud and its own links,
		   and an opaque tag hides too much of the data underneath it */
		text-shadow:
			0 0 4px var(--color-bg, #fff),
			0 0 4px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 12px var(--color-bg, #fff);
		transition: opacity 0.3s ease;
	}

	.pulse-wrap {
		position: absolute;
		transform: translate(-50%, -50%);
		transition: opacity 0.3s ease;
	}

	.pulse-ring,
	.pulse-ring::after {
		position: absolute;
		inset: 0;
		border: 2px solid rgba(34, 34, 34, 0.45);
		border-radius: 50%;
		animation: ripple 1.8s ease-out infinite;
	}

	.pulse-ring::after {
		content: "";
		animation-delay: -0.9s;
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

	/* Lifted over the tap gutters. Free to do: the container is
	   pointer-events:none and only .hit opts back in, so raising it hands the
	   gutters back everything except the actor targets themselves — which
	   overlap the gutter band at every viewport width (at 320px a target's
	   centre sits inside it), so geometry alone could never have separated
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

		.pulse-ring,
		.pulse-ring::after {
			animation: none;
		}

		.pulse-ring {
			transform: scale(1.3);
		}

		.pulse-ring::after {
			content: none;
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
		   down by --title-band, clearing the dot bar above it — this just
		   centres the title within that reserved strip */
		top: 4px;
		left: 50%;
		transform: translateX(-50%);
		font-weight: 600;
		color: var(--color-gray-800, #222);
	}

	.x-label {
		bottom: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		/* clamps above the step card on long-prose steps — may sit over dots */
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
	}

	.tick {
		font-size: 0.65rem;
		color: var(--color-gray-500, #888);
		/* tick numbers can sit over the dot cloud (tight left margin) — keep them legible */
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
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
		   (Index.svelte mounts the panel after ScrollyVisual) and would
		   otherwise intercept the click before it reaches this trigger — as
		   would the right-hand tap gutter, which is why this is now on the
		   gutters' own layer rather than a bare 1 */
		z-index: var(--z-tap-above);
		font-size: 0.65rem;
		color: var(--color-gray-500, #888);
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
		bottom: 1.6rem; /* fallback when the layout provides no xBase */
		transform: translateX(-50%);
	}

	:global(.tick-1980[style*="top:"]) {
		bottom: auto;
	}

	/* The takeover callout: ring, leader, note. Ordinary scoped selectors — the
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
	   .takeover-note: a lone class loses to `.overlay p`'s font stack.
	   The text is NOT yellow — #ccbb44 on white is ~1.75:1, which fails at any
	   size. A decorative border may be that low-contrast; a label may not. */
	/* A plain class, not `.overlay p.band-label`: this lives in the ANNOTATIONS
	   layer (so the block's wash can sit under the names), where no generic `p`
	   rule competes with it. `position` and `margin` are stated here because
	   nothing else supplies them — without them the label detaches from the
	   payload's coordinates and lands at the top of the layer. */
	.band-label {
		position: absolute;
		margin: 0;
		font-size: 0.65rem;
		letter-spacing: 0.04em;
		color: var(--color-gray-700, #444);
		white-space: nowrap;
		/* it sits in the axis headroom above the plot, and can overhang the box on a
		   narrow strip, so it needs the same legibility halo the ticks carry */
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
	}

	/* the ring has no text: it IS the mark, and the note beside it is what carries
	   the crossing to a screen reader */
	.takeover-mark {
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
	.overlay p.takeover-note {
		font-family: var(--font-form);
		font-size: var(--12px, 12px);
		line-height: 1.35;
		color: var(--color-gray-900, #222);
		/* the node-label halo, not .note's lighter one: this is three or four lines
		   sitting over the chasing field, where two shadow layers leave the lines
		   showing through the counters */
		text-shadow:
			0 0 4px var(--color-bg, #fff),
			0 0 4px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 12px var(--color-bg, #fff);
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
		font-size: 0.7rem;
		color: var(--color-gray-700, #444);
		white-space: nowrap;
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
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
		font-size: 0.65rem;
		font-style: italic;
		color: var(--color-gray-500, #888);
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
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
		font-size: 0.6rem;
		color: var(--color-gray-700, #444);
		white-space: nowrap;
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
		transform: translateY(-50%);
		white-space: nowrap;
		text-shadow:
			0 0 4px var(--color-bg, #fff),
			0 0 4px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 8px var(--color-bg, #fff),
			0 0 12px var(--color-bg, #fff);
	}
</style>
