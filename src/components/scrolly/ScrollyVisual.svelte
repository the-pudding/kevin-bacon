<script>
	// @ts-check
	import { untrack } from "svelte";
	import { makeNodes } from "./nodes.js";
	import { createTweener } from "./tween.js";
	import { createLabelDecollider } from "./label-decollide.js";
	import {
		writeRaceSweepFrame,
		raceVisibleSpan,
		racePanBounds,
		racePlot,
		raceStepVisible,
		raceDotSpec,
		getRacePxPerYear,
		getRaceSpeedScale,
		RACE_RECENT_EXTENT,
		RACE_RECENT_STEP,
		RACE_RECENT_VISIBLE,
		RACE_RECENT_LEAD,
		RACE_REWIND_WAYPOINT_YEAR,
		RACE_FULL_STEP,
		RACE_FUTURE_STEP,
		RACE_FUTURE_YEAR,
		raceMaxPlayhead,
		RACE_CAST,
		RACE_TRAIL_SLOTS,
		RACE_LABEL_TOP,
		raceFullRestPlayhead
	} from "./layouts/race.js";
	import {
		writeSimFrame,
		simNamesDue,
		SIM_N_SIMS
	} from "./layouts/sim-race.js";
	import {
		ATTR_SIZE,
		DELAY_SIZE,
		STRIDE,
		EDGE_BASE,
		STATES,
		OVERLAYS,
		STATE_LABELS,
		STATE_LABEL_TEXT,
		STATE_LABEL_DIRS,
		STATE_PICK,
		STATE_PULSE,
		STATE_YCAP,
		STATE_RACE,
		STATE_PARAMS,
		STATE_REVEAL_FROM,
		STATE_ENTRY,
		STATE_AMBIENT,
		STATE_TRACKED,
		TRAIL_SIZE,
		TRAIL_STRIDE,
		TRAIL_POINTS,
		TRAIL_META
	} from "./states.js";
	import {
		MARGIN,
		plotBottom,
		set,
		EDGE_GREY,
		EDGE_HIGHLIGHT,
		INK,
		ORDER_OF
	} from "./layout-shared.js";
	import { story } from "./story.svelte.js";
	import { MediaQuery } from "svelte/reactivity";
	import InfoTerm from "$components/ui/InfoTerm.svelte";

	// undefined until the <Step> registry has populated (first client render)
	/** @type {{ state: import("./states.js").VisualState, params?: Object, stepsHeight?: number, coldStart?: boolean }} */
	let {
		state: stateName,
		params,
		stepsHeight = 0,
		coldStart = false
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
	// edges draw outward from the anchor: orient each from its lower-hop end so
	// the line grows from Bacon toward the outer actor
	const edgeEnds = edges.map(({ source, target }) =>
		nodes[source].hop <= nodes[target].hop ? [source, target] : [target, source]
	);
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

	// -- Race path animator ("time machine") -------------------------------------
	// A third rAF writer. Unlike the two tweeners it does NOT lerp between two
	// endpoints: each frame it evaluates the race layout at a moving window and
	// writes the race cast's dots + their trails straight into the live tweener
	// buffers, then repaints. Entry choreography draws the actors' lines on from
	// the present edge. See delivery-plan Stage 4.
	const SWEEP_MS = 4000;
	// px/sec the camera pans during a rewind leg (playRaceRewind/playRaceReverse/
	// playRaceFullEntry/playRaceFullReverse) — one consistent on-screen speed for
	// every leg, rather than the fixed SWEEP_MS duration those legs used to
	// share regardless of how many years they cover (19yr and 12yr legs at the
	// same duration read as two different speeds). Deriving the duration from
	// distance also keeps that speed constant if pxPerYear is retuned live (see
	// RacePxPerYearDev) — the pixel distance a leg travels is `years *
	// getRacePxPerYear()`, so a wider x scale gets a proportionally longer pan
	// instead of covering the same time in more pixels (which is what made the
	// rewind look like it sped up when pxPerYear doubled).
	const REWIND_PX_PER_SEC = 300;
	const REWIND_MS_MIN = 1200;
	const REWIND_MS_MAX = 6000;
	// every duration below (this one and SWEEP_MS, via runSweepPhase's default
	// `ms` param) is multiplied by getRaceSpeedScale() — see its definition in
	// layouts/race.js for why a plain function call rather than a cached value.
	function rewindMs(fromP, toP) {
		const px = Math.abs(toP - fromP) * getRacePxPerYear();
		const scale = getRaceSpeedScale();
		return Math.min(
			REWIND_MS_MAX * scale,
			Math.max(REWIND_MS_MIN * scale, (px / REWIND_PX_PER_SEC) * 1000 * scale)
		);
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
	// The three race frame builders. All of them hold the state's content extent
	// fixed — only the camera (playhead) or the reveal moves — so what's shown, the
	// y-fit and the x scale are constant for a whole phase.
	//
	// draw-on entry: the camera stands still at the resting playhead while the
	// lines unspool leftward across the visible span, so e=1 is byte-identical to
	// the static layout (both sample exactly [camLeft, playhead]).
	// (`step` is the state's race descriptor from STATE_RACE — its extent AND its
	// highlight, so an animated frame dims exactly what its settle dims.)
	const entryFrame = (step) => (e) => ({
		...step,
		playhead: step.extent[1],
		reveal: e
	});
	// rewind (chained after the draw-on, in two legs — see playRaceEntry/
	// playRaceRewind): a camera pan back through time from fromP to toP. At a
	// fixed px-per-year this is a pure translation by construction — dots stay
	// pinned to the plot's right edge (see writeRaceSweepFrame's dotYr) while the
	// ticks and curves slide beneath them.
	const rewindFrame = (step, legExtent, fromP, toP) => (e) => ({
		...step,
		extent: legExtent,
		playhead: fromP + (toP - fromP) * e
	});
	// The content extent a leg runs under: every year the camera will put on the
	// plot across the whole pan, whichever direction it travels. Held constant for
	// the leg (rather than tracking the moving camera) so what the leg shows, its
	// y fit and its tick range can't change under the reader mid-pan — the same
	// reason every other frame builder above fixes its extent.
	const raceLegExtent = (fromP, toP) =>
		/** @type {[number, number]} */ ([
			Math.min(fromP, toP) - raceVisibleSpan(width, height),
			Math.max(fromP, toP)
		]);
	// reader-driven pan / settled hold: the camera at one playhead year
	const panFrame = (step) => (playhead) => ({ ...step, playhead });
	// the one state whose arrival plays the draw-on entry (scoped by revealFrom)
	const RACE_ENTRY_STATE = "raceRecent";
	// (RACE_RECENT_VISIBLE — what raceRecent shows at its extent, and so the set
	// the draw-on reveals from its first frame — comes from race.js: the rank
	// list's collapsed nodes need the same set, so there is one definition.)
	// how far into a phase a departing actor is fully gone. Departures finish EARLY
	// rather than riding the whole phase for the way it reads: the modern crowd drops
	// away first, leaving the actors the step is about. (This used to be a
	// correctness rule too — the axis was fitted per step, so a line still fading at
	// the end of a pan could be drawn outside the plot the leg was landing on. The
	// axis is now fitted to the camera rather than to a cast, and an off-scale dot is
	// hidden by the frame writer's own gate, so only the aesthetic reason is left.)
	const SHOWN_DEPART_END = 0.35;
	// how far into raceRecent's draw-on its actors fade fully in. Short, relative
	// to the 4s sweep — they should read as "arriving" once the rank crowd has
	// cleared, not as a second slow reveal riding the whole draw-on
	const SHOWN_ARRIVE_END = 0.15;
	// per-frame alpha for one sweep phase. `shown` is {from, to}: what the step
	// being left showed and what the landing step shows — NOT cast membership,
	// which is RACE_CAST on every race step. Actors the landing step adds fade in
	// over the phase, ones it drops fade out over SHOWN_DEPART_END, everyone else
	// rides at full strength, so a visibility change glides across the phase
	// instead of popping when the settle layout's filter kicks in.
	const shownAlpha = (shown, e) =>
		shown &&
		((id) =>
			shown.to.has(id)
				? shown.from.has(id)
					? 1
					: e
				: shown.from.has(id)
					? Math.max(0, 1 - e / SHOWN_DEPART_END)
					: 0);
	// the one state whose arrival plays the rewind's second and final leg (scoped
	// by revealFrom) — see playRaceFullEntry
	const RACE_FULL_STATE = "raceFull";
	// the chapter's last step: the same chart with the camera carried forward past
	// the end of the data — see playRaceFuture
	const RACE_FUTURE_STATE = "raceFuture";
	// per-frame smoothing factor for the pan glide: renderPlayhead moves this
	// fraction of the remaining distance to the target each frame (exponential
	// ease-out — feels like a weighted reel). Reduced motion uses 1 (snap).
	const SCRUB_EASE = 0.22;
	let sweepRaf = 0;
	function stopSweep() {
		cancelAnimationFrame(sweepRaf);
		sweepRaf = 0;
		camPanning = false;
	}
	// the rAF spine every entry choreography rides: run `frame(eased)` for `ms`,
	// repaint each tick, then chain `onDone`. Owns sweepRaf, so stopSweep()
	// abandons whatever phase is in flight.
	function runPhase(ms, frame, onDone) {
		const t0 = performance.now();
		const step = (now) => {
			const p = Math.min(1, (now - t0) / ms);
			frame(sweepEase(p));
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
	// run one eased race phase; map(e) → the frame; onDone chains the next; `shown`
	// ({from, to} Sets of who each end of the leg shows) fades visibility changes
	// over the phase (see shownAlpha) — or, for a phase with nothing prior to
	// compare against (the entry draw-on's first arrival), a plain
	// `(e) => (id) => alpha` function of its own. Every frame publishes its camera
	// into renderPlayhead, so a later leg (or a reader's grab) continues from
	// wherever this one actually got to. Nothing here says anything about the y
	// axis: writeRaceSweepFrame fits it to the camera of the frame it is given, so
	// a leg's axis follows its own pan and lands on its settle's by construction.
	function runSweepPhase(
		map,
		yCap,
		onDone,
		shown = null,
		ms = SWEEP_MS * getRaceSpeedScale()
	) {
		const alphaAt =
			typeof shown === "function" ? shown : (e) => shownAlpha(shown, e);
		runPhase(
			ms,
			(e) => {
				const { axes, takeover, cam } = writeRaceSweepFrame(
					tweener.current,
					trailTweener.current,
					width,
					height,
					map(e),
					yCap,
					alphaAt(e)
				);
				renderPlayhead = cam.playhead;
				decor = { ...decor, axes, takeover };
			},
			onDone
		);
	}
	// Single-writer handoff into a race leg. A sweep's frame writer stamps only
	// the cast's dots and their trail slots (writeRaceSweepFrame), so a leg that
	// takes the rAF off a tween still in flight strands every OTHER slot wherever
	// that tween had got to, for the whole leg — for a reader stepping faster than
	// the tweens run, that means the chapter they came from (and, from a fast
	// enough start, the intro network's links) hanging over the chart. Land those
	// slots on the arriving layout, which is where the settle puts them anyway —
	// so an uninterrupted arrival moves nothing — and keep the live cast values,
	// leaving the sweep's own first frame the only thing that changes.
	function landOffChart(attrs, trails) {
		const frame = attrs.slice();
		for (const id of RACE_CAST) {
			const i = id * STRIDE;
			for (let k = 0; k < STRIDE; k++) frame[i + k] = tweener.current[i + k];
		}
		const trailFrame = trails.slice();
		for (const slot of RACE_TRAIL_SLOTS) {
			const i = slot * TRAIL_STRIDE;
			for (let k = 0; k < TRAIL_STRIDE; k++) {
				trailFrame[i + k] = trailTweener.current[i + k];
			}
		}
		tweener.to(frame, 0);
		trailTweener.to(trailFrame, 0);
		tweener.stop();
		trailTweener.stop();
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
		const { axes, takeover } = writeRaceSweepFrame(
			tweener.current,
			trailTweener.current,
			width,
			height,
			panFrame(raceStep)(renderPlayhead),
			STATE_YCAP[stateName]
		);
		decor = { ...decor, axes, takeover };
		drawScene();
		if (story.scrubbing || !caughtUp) {
			sweepRaf = requestAnimationFrame(scrubLoop);
		} else {
			camPanning = false;
			sweeping = false;
			sweepRaf = 0;
			story.raceView = { playhead: renderPlayhead };
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
	const layoutCache = new Map();
	// DEV only: last y-band revision the cache was valid for (see the render
	// effect). Always 0 in a build, where the tuning panel doesn't exist.
	let lastBandRev = 0;
	let lastPxRev = 0;
	let lastFixedYRev = 0;
	function layoutFor(name, w, h, layoutParams) {
		// a race camera hold is a fresh continuous value every time the reader
		// releases a pan, and each entry is ~0.8MB of Float64Array — never a cache
		// hit, so don't keep it
		if (layoutParams?.playhead != null) {
			return STATES[name](nodes, w, h, edges, layoutParams);
		}
		const key = `${name}:${w}:${h}:${JSON.stringify(layoutParams) ?? ""}`;
		let result = layoutCache.get(key);
		if (!result) {
			result = STATES[name](nodes, w, h, edges, layoutParams);
			layoutCache.set(key, result);
		}
		return result;
	}

	let canvas = $state();
	/** @type {HTMLElement | undefined} */
	let container = $state();
	let width = $state(0);
	let height = $state(0);
	// live, so DevTools' emulation (and a reader changing the OS setting mid-story)
	// stands every animation down straight away
	const motionQuery = new MediaQuery("(prefers-reduced-motion: reduce)", false);
	const reducedMotion = $derived(motionQuery.current);
	// True while a choreography owns the rAF instead of the tweeners — a race path
	// animator (playRaceEntry), a generic entry (playEntry), or a state's ambient
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
	/** @type {{ axes?: { x?: {pos:number,label:string}[], y?: {pos:number,label:string}[], xBase?: number, yBase?: number }, notes?: import("./states.js").Note[], takeover?: import("./layout-shared.js").TakeoverCallout|null, legend?: import("./layout-shared.js").LegendItem[], legendY?: number, hits?: import("./layout-shared.js").Hit[] } | null} */
	let decor = $state(null);
	// true while an arrival is clearing the previous scene off the canvas before
	// its own chart may appear: the axis furniture (ticks, callouts, legend, axis
	// titles) stays unmounted until it drops, so the graph doesn't sit behind the
	// outgoing scene. Set by the race entry (the rank bar fades out in place
	// there, over the very region the axes occupy) and dropped when the draw-on
	// takes the rAF; reset by every render pass, so an arrival cut short
	// mid-fade can't leave the chart hidden.
	let chartVeiled = $state(false);
	// tappable chart regions (layout `hits` + the state's `pick`): rendered as
	// transparent buttons over the canvas, so a pick is keyboard- and
	// screen-reader-reachable without any canvas hit-testing
	const pick = $derived(STATE_PICK[stateName]);

	let ctx = null;
	let prevState = null;
	let prevParamsKey = null;
	let prevW = 0;
	let prevH = 0;
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
	// the active state's race descriptor — its camera extent and the actors the
	// step is about — or undefined off the race chapter, whose presence is what
	// makes a step pannable
	const raceStep = $derived(
		/** @type {{extent: [number, number], minPlayhead?: number, maxPlayhead?: number, highlight?: number[]} | undefined} */ (
			STATE_RACE[stateName]
		)
	);
	// The plot rectangle of the active race step, or null off the chapter. The
	// draw pass culls the race cast against it (see drawScene), so it has to be
	// the live one — same (w, h) the frame writer fits its camera to.
	const racePlotRect = $derived(
		raceStep && width && height ? racePlot(width, height) : null
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
	const yLabelTop = $derived(
		height ? (MARGIN + 8 + plotBottom(height)) / 2 : 0
	);
	// x-axis title sits just under the plot, but never behind the step card: on
	// long-prose steps the card climbs into the plot, so clamp the title up to
	// stay above it (text-shadow keeps it legible over any dots it then overlaps)
	const xLabelTop = $derived(
		height ? Math.min(plotBottom(height) + 32, height - stepsHeight - 24) : 0
	);
	// pinned homes for the "lower"/"higher" mini-labels — the same plot-rect
	// top/bottom that yLabelTop above centres the axis title within
	const yHintTop = $derived(height ? MARGIN + 8 : 0);
	const yHintBottom = $derived(height ? plotBottom(height) : 0);
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

	// Race-chapter entry: draw the actors' lines on across the visible span,
	// landing on the static race frame. The render effect first tweens the buffers
	// onto the empty e=0 frame (dots pinned at the present edge, lines undrawn),
	// so this owns the rAF straight from there — no pre-roll. Skippable (a state
	// change abandons the sweep) and reduced-motion safe. The draw-on settles on
	// the present-day view and stops there — it does not remove any information,
	// so it needs no reader consent. The rewind's first leg (panning the camera
	// back from the present through time) only starts once the reader presses
	// Start (see the raceRewindNonce effect below, and RaceRewindStart.svelte).
	/**
	 * @param {any} step
	 * @param {boolean} flownIn whether the arrival tween already flew the cast in
	 *   from the rank list (see the raceEntry branch of the render effect), so
	 *   they are on screen at full strength before the draw-on starts
	 */
	function playRaceEntry(step, flownIn) {
		if (!width || !height) return;
		// the arrival's label gate is done: from here the cast fades in at its
		// chart spot, so the names can ride those dots again (see the raceEntry
		// branch of the render effect)
		entryLabels = null;
		const finalView = { playhead: step.extent[1] };
		if (reducedMotion) {
			// defensive: the effect's reduced-motion branch normally jumps before
			// this runs, so the draw-on is skipped and we land on the static frame
			story.raceView = finalView;
			return;
		}
		// single-writer discipline: stop the generic writers before the sweep owns
		// the rAF; on completion pin the chart via raceView, which triggers one
		// param-tween settle. The sweep shows only raceRecent's contenders
		// (RACE_RECENT_VISIBLE), so its frames always agree with the yCap-
		// filtered static layouts and nobody pops out at the settle.
		//
		// alpha is a plain fade-in over SHOWN_ARRIVE_END, not shownAlpha's from/to
		// comparison — every contender here is arriving fresh (there is no prior
		// membership to compare against), so they should tween in rather than pop
		// straight to full strength on this phase's first frame. Unless the arrival
		// already flew them here out of the rank list: they are visible dots that
		// have just landed, and dipping them back to nothing to re-fade would blink
		// the whole cast off.
		const arrive = (e) => (id) =>
			RACE_RECENT_VISIBLE.has(id)
				? flownIn
					? 1
					: Math.min(1, e / SHOWN_ARRIVE_END)
				: 0;
		tweener.stop();
		trailTweener.stop();
		sweeping = true;
		runSweepPhase(
			entryFrame(step),
			STATE_YCAP[RACE_ENTRY_STATE],
			() => {
				sweeping = false;
				story.raceView = finalView;
				publishRaceCam();
			},
			arrive
		);
	}

	// Race-chapter rewind, leg 1: fired by the raceRewindNonce effect below, once
	// the reader presses Start. Pans the camera back from the present to
	// RACE_REWIND_WAYPOINT_YEAR and stops there, within raceRecent — the second
	// leg (playRaceFullEntry) continues the same pan on from wherever this one
	// got to when the reader arrives at raceFull, so the "camera moving back in
	// time" motion is visible in two beats instead of happening all at once. At a
	// fixed px-per-year the leg is pure x-translation — the camera can never zoom.
	//
	// `toStep`/`toCap` describe the LANDING state: the leg fades out actors who
	// stop being contenders there (and fades in any who start), so its last frame
	// matches the yCap-filtered static settle exactly instead of dropping them in
	// one pop. The frame's own extent is the leg's camera travel instead, so the
	// visible line always runs right up to the dot mid-pan; the visible set is
	// passed in, so that wider extent never leaks into it.
	//
	// Says nothing about the y axis: it is fitted to each frame's own camera, so
	// it pans with the leg and arrives on the settle's axis by construction.
	function playRaceRewind(fromP, toP, toStep, toCap) {
		if (!width || !height) return;
		const finalView = { playhead: toP };
		if (reducedMotion) {
			story.raceView = finalView;
			story.raceRewinding = false;
			return;
		}
		// starts from a frame showing raceRecent's set (the entry draw-on)
		const shown = {
			from: RACE_RECENT_VISIBLE,
			// raceStepVisible, not raceContenders: it is the single reader of a step's
			// visible set, so anyone the landing step drops fades out across the leg
			// like any other departure instead of popping at the settle
			to: raceStepVisible(toStep, toCap)
		};
		sweeping = true;
		camPanning = true;
		runSweepPhase(
			rewindFrame(toStep, raceLegExtent(fromP, toP), fromP, toP),
			STATE_YCAP[RACE_ENTRY_STATE],
			() => {
				sweeping = false;
				camPanning = false;
				story.raceView = finalView;
				story.raceRewinding = false;
				publishRaceCam();
			},
			shown,
			rewindMs(fromP, toP)
		);
	}

	// Race-chapter arrival at raceFull from raceRecent: no scripted pan — the
	// reader lands with the camera already resting on RACE_REWIND_WAYPOINT_YEAR
	// (2006, SLJ's takeover) and RaceScrubber usable immediately, rather than
	// watching a forced rewind before getting control. Kept as a function
	// (rather than inlined at the call site) because publishRaceCam() has to be
	// called after renderPlayhead is set, matching every other settle path.
	function playRaceFullEntry() {
		if (!width || !height) return;
		renderPlayhead = RACE_REWIND_WAYPOINT_YEAR;
		story.raceView = { playhead: RACE_REWIND_WAYPOINT_YEAR };
		publishRaceCam();
	}

	// The rewind run backwards, played when the reader steps back from raceFull to
	// raceRecent, so going back retraces the pan that brought them here instead of
	// cutting to a tween. It lands on RACE_REWIND_WAYPOINT_YEAR, which is where
	// raceRecent rests once its own leg-1 choreography has run — so stepping
	// forward again replays leg 2 from the same place the first pass did.
	//
	// Starts from `raceExitPlayhead` — raceFull's camera, snapshotted before the
	// state-change effect reset it — so Prev out of a reader's own pan (or out of
	// leg 2 mid-flight) reverses from wherever the camera actually is, instead of
	// jumping to raceFull's resting year first.
	function playRaceReverse() {
		if (!width || !height) return;
		const fromP = raceExitPlayhead ?? raceFullRestPlayhead(width, height);
		const toP = RACE_REWIND_WAYPOINT_YEAR;
		const finalView = { playhead: toP };
		// no reducedMotion guard: the render effect's snap branch takes that case
		// before any arrival branch runs
		if (fromP >= toP) {
			// the camera already sits at or ahead of the waypoint — on a viewport
			// wide enough for that, playRaceFullEntry skipped leg 2 too, so there is
			// no motion to retrace
			story.raceView = finalView;
			publishRaceCam();
			return;
		}
		// the mirror of leg 2's fade: the whole cast raceFull shows drops back to
		// the field raceRecent does, over the same early departure window
		const shown = {
			from: raceStepVisible(RACE_FULL_STEP, STATE_YCAP[RACE_FULL_STATE]),
			to: RACE_RECENT_VISIBLE
		};
		sweeping = true;
		camPanning = true;
		runSweepPhase(
			rewindFrame(RACE_RECENT_STEP, raceLegExtent(fromP, toP), fromP, toP),
			STATE_YCAP[RACE_ENTRY_STATE],
			() => {
				sweeping = false;
				camPanning = false;
				story.raceView = finalView;
				publishRaceCam();
			},
			shown,
			rewindMs(fromP, toP)
		);
	}

	// The rewind run FORWARDS, played on arrival at raceFuture: the camera leaves
	// the past, crosses the present and carries on to rest with 2030 on the plot's
	// right edge, so the step's copy ("now imagine us taking this into the future")
	// lands on a chart that actually has a future on it.
	//
	// Nothing here caps the lines to 2025. At a fixed px-per-year the pan is a
	// pure translation, and writeRaceSweepFrame already ends every line at the
	// actor's own last data year — so the empty strip opens up on its own as the
	// camera runs off the end of the data. What the leg does carry across is the
	// x ticks, which keep being emitted up to the leg extent's end (2030).
	//
	// Starts from `raceExitPlayhead` for the same reason every other leg does: the
	// reader may have panned raceFull anywhere before pressing Next.
	function playRaceFuture() {
		if (!width || !height) return;
		const fromP = raceExitPlayhead ?? RACE_REWIND_WAYPOINT_YEAR;
		const toP = RACE_FUTURE_YEAR;
		const finalView = { playhead: toP };
		// no reducedMotion guard: the render effect's snap branch takes that case
		// before any arrival branch runs
		if (fromP >= toP) {
			story.raceView = finalView;
			publishRaceCam();
			return;
		}
		sweeping = true;
		camPanning = true;
		runSweepPhase(
			rewindFrame(RACE_FUTURE_STEP, raceLegExtent(fromP, toP), fromP, toP),
			STATE_YCAP[RACE_FUTURE_STATE],
			() => {
				sweeping = false;
				camPanning = false;
				story.raceView = finalView;
				publishRaceCam();
			},
			// no `shown`: raceFull and raceFuture both show the whole cast, so
			// there is nothing to fade in or out across the leg
			null,
			rewindMs(fromP, toP)
		);
	}

	// The forward leg retraced, played when the reader steps back from raceFuture
	// to raceFull — the same relationship playRaceReverse has to leg 2. Lands on
	// RACE_REWIND_WAYPOINT_YEAR, which is where raceFull rests by every path, so
	// stepping forward again replays the forward leg from where it first started.
	function playRaceFutureReverse() {
		if (!width || !height) return;
		const fromP = raceExitPlayhead ?? RACE_FUTURE_YEAR;
		const toP = RACE_REWIND_WAYPOINT_YEAR;
		const finalView = { playhead: toP };
		// mirrored guard: this leg travels backwards, so it is a camera already at
		// or behind the waypoint that has nothing to retrace
		if (fromP <= toP) {
			story.raceView = finalView;
			publishRaceCam();
			return;
		}
		sweeping = true;
		camPanning = true;
		runSweepPhase(
			// RACE_FULL_STEP, not RACE_FUTURE_STEP: the leg is landing on raceFull,
			// so its highlight has to be the one the settle uses. The leg extent
			// still ends at 2030, which is what keeps the future ticks drawn until
			// the camera has actually left them behind.
			rewindFrame(RACE_FULL_STEP, raceLegExtent(fromP, toP), fromP, toP),
			STATE_YCAP[RACE_FULL_STATE],
			() => {
				sweeping = false;
				camPanning = false;
				story.raceView = finalView;
				publishRaceCam();
			},
			null,
			rewindMs(fromP, toP)
		);
	}

	// -- Simulation replay -------------------------------------------------------
	// Reader-triggered, unlike every choreography above it: SimRunner bumps
	// story.simRunNonce and this replays the 10,000 recorded simulation runs as a
	// moving playhead, writing the chart straight into the live buffers each frame
	// (same single-writer discipline as startScrub). ~3s, eased by the shared
	// trapezoid so the counts land softly on their finals.
	const SIM_MS = 3000;

	function playSimRun() {
		if (!width || !height) return;
		// under reduced motion there is no run to watch — hand the settled chart
		// straight to the reactive layout path, which snaps
		if (reducedMotion) {
			story.simRuns = SIM_N_SIMS;
			return;
		}
		stopSweep();
		if (tweener.target) tweener.to(tweener.target, 0);
		if (trailTweener.target) trailTweener.to(trailTweener.target, 0);
		tweener.stop();
		trailTweener.stop();
		sweeping = true;
		story.simNames = 0;
		story.simRunning = true;
		runPhase(
			SIM_MS,
			(e) => {
				const played = e * SIM_N_SIMS;
				const { axes } = writeSimFrame(
					tweener.current,
					trailTweener.current,
					width,
					height,
					played
				);
				decor = { ...decor, axes };
				// the one thing the replay publishes while it runs: the names come in
				// one at a time part-way through, and the layout can't see the
				// playhead. Only on the runs a name is due — a per-frame write would
				// retarget the tweener mid-run
				const due = simNamesDue(played);
				if (due !== story.simNames) story.simNames = due;
			},
			() => {
				// the last frame IS the settled layout (both go through writeSimFrame),
				// so publishing the playhead hands off to the reactive path with
				// nothing left to move — and leaves the chart where a step back to
				// this state will find it
				sweeping = false;
				story.simRunning = false;
				story.simRuns = SIM_N_SIMS;
			}
		);
	}

	// Generic entry choreography (STATE_ENTRY): play the state's legs back to
	// back, each writing its animated slots straight into the live buffers, then
	// settle onto the static layout. Same shape as the race animators above —
	// single-writer discipline (stop the tweeners first, `sweeping` makes the
	// render effect step aside), skippable (a state change calls stopSweep), and
	// bypassed entirely under reduced motion by the effect's snap branch. The
	// final leg is authored to land on the static frame, so the settle is a
	// zero-duration retarget with nothing to move.
	function playEntry(anim, write, finalAttrs, finalTrails) {
		if (!width || !height) return;
		tweener.stop();
		trailTweener.stop();
		sweeping = true;
		const runLeg = (i) => {
			if (i >= anim.phases.length) {
				sweeping = false;
				entryLabels = null;
				tweener.to(finalAttrs, 0);
				trailTweener.to(finalTrails, 0);
				return;
			}
			runPhase(
				anim.phases[i],
				(e) => write(tweener.current, trailTweener.current, i, e),
				() => {
					// the actors this leg was about are now on the chart, so their
					// names land with it (see EntryAnim.labelsAfter)
					for (const id of anim.labelsAfter?.[i] ?? []) entryLabels.add(id);
					runLeg(i + 1);
				}
			);
		};
		runLeg(0);
	}

	// A state's ambient drift (STATE_AMBIENT): unlike an entry choreography this
	// never ends, so there is no final leg and no settle to land on — the arrival
	// has already settled, and the writer's own t = 0 frame is what it landed on,
	// so the first tick redraws that frame and the join moves nothing. Same
	// single-writer discipline as playEntry (tweeners stopped, `sweeping` makes the
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
		const write = anim.frames(nodes, width, height, layoutParams);
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
			x <= racePlotRect.right + 0.5 &&
			y >= racePlotRect.top - 0.5 &&
			y <= racePlotRect.bottom + 0.5
		);
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
		ctx.clearRect(0, 0, width, height);
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
		const shown = raceStep ? raceLabelCut(attrs) : labelIds;
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
			if (story.raceView !== null) story.raceView = null;
			if (story.scrubYear !== null) story.scrubYear = null;
			// a race step's default resting camera is the last year its camera may
			// rest on — its extent's end for every step but raceFuture, which rests
			// out on the future strip (raceMaxPlayhead). Reading it through that one
			// function is what keeps this agreeing with raceLayout's own fallback.
			if (step) renderPlayhead = raceMaxPlayhead(step);
			// raceFull's true resting camera is RACE_REWIND_WAYPOINT_YEAR (2006) —
			// every arrival path settles here, animated or not, so the reader
			// always has the slider immediately usable from the same year
			if (stateName === RACE_FULL_STATE && width && height) {
				renderPlayhead = RACE_REWIND_WAYPOINT_YEAR;
			}
		});
	});

	// A cold mount straight into raceFull skips playRaceFullEntry entirely
	// (that only plays on a forward arrival from raceRecent, per the effect
	// above), so story.raceView is left null and raceLayout's own fallback
	// (extent[1], i.e. 2025) settles the chart on the wrong camera. This effect
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
			story.raceView = { playhead: renderPlayhead };
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

	// Simulation replay: SimRunner asks for a run by bumping the nonce. Watched as
	// a counter, not a flag, so pressing Start again re-runs — and so the reset back
	// to nonce 0 isn't itself a request. Declared before the render effect for the
	// same reason as the scrub trigger above: it has to win the flush, or the
	// playhead's own param change would tween the chart on before the run starts.
	let simNonceSeen = 0;
	$effect(() => {
		const nonce = story.simRunNonce;
		if (nonce === simNonceSeen) return;
		simNonceSeen = nonce;
		if (nonce === 0 || stateName !== "simRace") return;
		untrack(playSimRun);
	});

	// Race rewind: RaceRewindStart asks for the backwards pan by bumping this
	// nonce, the same pattern as the sim trigger above. Gated on RACE_ENTRY_STATE
	// so a stray press after the reader has moved on is a no-op; starts from
	// wherever the chart currently rests (the entry draw-on's present-day view,
	// unless a run is somehow already mid-flight) rather than assuming it is
	// still exactly at the extent's edge.
	//
	// RaceRewindStart also advances the step (see its own comment), so this
	// effect and the render effect below can land in the same flush. Single-
	// writer discipline still applies here exactly as it does at every other
	// playRaceRewind call site (playRaceEntry stops the tweener itself before
	// its sweep; the render effect's branches go through landOffChart) — without
	// stopping it first, the render effect's own default tween (same-state step
	// change, nothing else matches) would keep writing the buffers this sweep is
	// writing, corrupting the frame the reader sees for the rest of the chapter.
	let raceRewindNonceSeen = 0;
	$effect(() => {
		const nonce = story.raceRewindNonce;
		if (nonce === raceRewindNonceSeen) return;
		raceRewindNonceSeen = nonce;
		if (nonce === 0 || stateName !== RACE_ENTRY_STATE) return;
		untrack(() => {
			story.raceRewinding = true;
			tweener.stop();
			trailTweener.stop();
			playRaceRewind(
				story.raceView?.playhead ?? RACE_RECENT_STEP.extent[1],
				RACE_REWIND_WAYPOINT_YEAR,
				RACE_RECENT_STEP,
				STATE_YCAP[RACE_ENTRY_STATE]
			);
		});
	});

	// The race chapter's flight, armed by the raceEntry branch and fired when the
	// rank list has finished collapsing its bars into nodes and taken its overlay
	// down (story.rankCollapsed — RankBars owns that clock, since it is the one
	// that knows when its own transitions have landed). Until then the canvas is
	// parked on the collapsed frame, holding a copy of exactly what the reader is
	// looking at.
	//
	// Declared before the render effect for the same reason as the two triggers
	// above: it has to win the flush. Cleared by every render pass, so a state
	// change (Next/Prev mid-collapse) disarms it and the flag can only ever fire
	// the flight it was armed for.
	//
	// The arm is itself reactive ($state.raw — raw because the payload is buffers,
	// which must not be proxied), so this fires on whichever of the two lands last:
	// the flag going up, or the arrival arming. Waiting only on the flag would
	// strand the canvas on the collapsed frame for good on any arrival that finds
	// the list already collapsed, with no overlay left to hide it.
	/** @type {{startAttrs: Float64Array, startTrails: Float64Array, stateDelays: Float64Array, flownIn: boolean} | null} */
	let raceFlight = $state.raw(null);
	$effect(() => {
		const collapsed = story.rankCollapsed;
		const flight = raceFlight;
		untrack(() => {
			if (!collapsed || !flight || stateName !== RACE_ENTRY_STATE) return;
			const { startAttrs, startTrails, stateDelays, flownIn } = flight;
			raceFlight = null;
			// jitter 0, not TWEEN_JITTER: the flight is the list re-spacing into the
			// chart, and a hashed per-node start would scramble the top-to-bottom
			// order that is the whole thing the reader is meant to read out of it
			tweener.to(startAttrs, TWEEN_MS, 0, stateDelays, () => {
				chartVeiled = false;
				playRaceEntry(RACE_RECENT_STEP, flownIn);
			});
			trailTweener.to(startTrails, TWEEN_MS, 0);
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
		if (import.meta.env.DEV && story.raceYBandsRev !== lastBandRev) {
			lastBandRev = story.raceYBandsRev;
			layoutCache.clear();
		}
		// DEV: same idea for RacePxPerYearDev's x-axis density slider.
		if (import.meta.env.DEV && story.racePxPerYearRev !== lastPxRev) {
			lastPxRev = story.racePxPerYearRev;
			layoutCache.clear();
		}
		// DEV: same idea for RaceFixedYDev's fixed y-axis bounds.
		if (import.meta.env.DEV && story.raceFixedYRev !== lastFixedYRev) {
			lastFixedYRev = story.raceFixedYRev;
			layoutCache.clear();
		}
		if (!canvas || !width || !height || !stateName) return;
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
		const resized = width !== prevW || height !== prevH;
		if (sweeping) {
			if (stateName === prevState && !resized) return;
			stopSweep();
			sweeping = false;
			if (story.scrubbing) untrack(() => (story.scrubbing = false));
			// a replay the reader stepped away from is over, however far it got —
			// leave its controls usable if they step back
			if (story.simRunning) untrack(() => (story.simRunning = false));
			if (story.raceRewinding) untrack(() => (story.raceRewinding = false));
		}
		if (resized) {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			ctx = canvas.getContext("2d");
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			prevW = width;
			prevH = height;
		}
		const paramsKey = JSON.stringify(layoutParams) ?? "";
		const layout = layoutFor(stateName, width, height, layoutParams);
		const { attrs, delays } = layout;
		decor = {
			axes: layout.axes,
			notes: layout.notes,
			takeover: layout.takeover,
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
		const stateDelays = (playReveal ? delays : null) ?? EDGE_LAG_DELAYS;
		// race-chapter arrival (forward, from a revealFrom origin): play the draw-on
		// entry choreography instead of a plain state tween. Only reached with real
		// animation — reduced motion/resize are handled by the branch below.
		const raceEntry =
			stateChange && playReveal && stateName === RACE_ENTRY_STATE;
		// race-chapter arrival at raceFull (forward, from raceRecent): play the
		// rewind's second and final leg instead of a plain state tween. Unconditional
		// — the leg starts from `raceExitPlayhead`, so it continues the pan from
		// wherever raceRecent's camera actually was, whether that is the waypoint its
		// own leg 1 parked on, a point mid-flight if the reader read faster than the
		// choreography, the present if they never pressed Start, or the waypoint a
		// backward step retraced to — see playRaceFullEntry
		const raceFullEntryArrival =
			stateChange && playReveal && stateName === RACE_FULL_STATE;
		// race-chapter arrival at raceRecent going BACKWARDS, from raceFull: retrace
		// the rewind instead of tweening. Distinct from raceEntry above, which needs
		// prevState in revealFrom (rankReveal) and so can never also match here.
		const raceReverseArrival =
			stateChange &&
			stateName === RACE_ENTRY_STATE &&
			prevState === RACE_FULL_STATE;
		// race-chapter arrival at raceFuture (forward, from raceFull): run the same
		// pan the other way, out past the end of the data — see playRaceFuture.
		const raceFutureArrival =
			stateChange && playReveal && stateName === RACE_FUTURE_STATE;
		// ...and that leg retraced, stepping BACKWARDS from raceFuture to raceFull.
		// Disjoint from raceFullEntryArrival above by construction: that one needs
		// playReveal, and raceFull's revealFrom is ["raceRecent"], so an arrival
		// from raceFuture can never satisfy it.
		const raceFutureReverseArrival =
			stateChange &&
			stateName === RACE_FULL_STATE &&
			prevState === RACE_FUTURE_STATE;
		// any other state that declares an entry choreography (STATE_ENTRY),
		// played on a forward arrival from a revealFrom origin
		const entryAnim =
			stateChange && playReveal ? STATE_ENTRY[stateName] : undefined;
		// drop any gate a previous choreography left behind — an arrival tween
		// superseded before its onDone fired never reaches playEntry's settle, and
		// a stale gate would hide the new state's names for good. Re-armed below
		// only if this arrival actually plays an entry.
		entryLabels = null;
		// likewise disarm any race flight a previous pass left waiting on the rank
		// list's collapse — re-armed below only by the raceEntry branch itself
		raceFlight = null;
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
		prevState = stateName;
		prevParamsKey = paramsKey;
		if (resized || reducedMotion) {
			tweener.to(attrs, 0);
			trailTweener.to(trailTarget, 0);
			settle(stateName);
		} else if (raceEntry) {
			// arrive onto the empty draw-on frame (the entry-window contenders
			// pinned at the present edge, lines not yet drawn), then draw the
			// lines on. The
			// arrival tween's onDone fires playRaceEntry only if uninterrupted — a
			// superseding tween (Next mid-flight) drops it (see tween.js `to`).
			const startAttrs = attrs.slice();
			const startTrails = trailTarget.slice();
			// axes for this seed frame aren't written into decor here — the very
			// first rAF tick of playRaceEntry's sweep does that (outside this
			// effect), moments later; doing it here too would make this effect
			// read (via decor's spread) the same decor it's reactively driven by.
			// Called only to collapse every race trail to invisible (reveal 0) —
			// its dot placements are overwritten below. Alpha is a flat zero, not
			// the phase's own cast alpha: a collapsed trail still carries a stroke
			// alpha, and this arrival TWEENS onto the seed frame, so any non-zero
			// value fades the lines in before the draw-on has drawn anything. On a
			// re-entry (the reader stepped back to the rank chapter and forward
			// again) the buffer still holds the previous visit's curve geometry, so
			// that fade-in reads as the real lines, already drawn, squeezing toward
			// the present edge. The draw-on writes its own alphas from its first
			// frame (see playRaceEntry's `arrive`), so nothing is lost by holding
			// the seed at zero.
			writeRaceSweepFrame(
				startAttrs,
				startTrails,
				width,
				height,
				entryFrame(RACE_RECENT_STEP)(0),
				STATE_YCAP[RACE_ENTRY_STATE],
				() => 0
			);
			// The same seed frame written a second time, at full strength, purely so
			// each cast dot's own settled alpha can be read out of it below — the
			// write above zeroes them, which is what the trails need.
			const litAttrs = new Float64Array(ATTR_SIZE);
			writeRaceSweepFrame(
				litAttrs,
				new Float64Array(TRAIL_SIZE),
				width,
				height,
				entryFrame(RACE_RECENT_STEP)(0),
				STATE_YCAP[RACE_ENTRY_STATE],
				() => 1
			);
			// Where the rank list had each actor: RankBars publishes its row
			// geometry (story.rankListRows) and ORDER_OF gives every actor its row,
			// so the canvas can take over the very node each bar collapsed into
			// instead of the cast appearing out of nothing on the chart. The
			// previous step is HTML, but its rows have positions in the canvas's own
			// coordinate space, which is all a departure point needs. Untracked: the
			// list republishes this as the reader scrolls, and this effect must not
			// re-run on it.
			//
			// Ranks past the bottom of the panel — most of the cast; the list shows
			// the top 250 and only ~20 rows fit — depart from its bottom edge, at
			// alpha 0, rather than from hundreds of rows down. Two reasons, and they
			// are the same reason: the reader never saw those rows, so there is no
			// node to hand over, and the panel isn't covering that band, so anything
			// parked down there is drawn straight over the step's prose. They fade in
			// off the edge instead, reading as a stream up out of the list.
			const rows = untrack(() => story.rankListRows);
			const rowY = (id) => rows.top + ORDER_OF.get(id) * rows.pitch;
			// `attrs` parks the whole non-race corpus (the rank chapter's hop
			// crowd) at its distance-scatter spot, alpha 0 — the position a later
			// scatter chapter needs so ITS reveal doesn't teleport — and the write
			// above places the race cast at their real chart spot. The crowd is
			// still fully visible in the rank bar right now (for many of them, ~85%
			// under 10 films, that scatter spot sits off the left edge), and gliding
			// straight there drags a mass of opaque dots across the whole canvas
			// while they fade. Freeze everyone who isn't in the cast where they
			// stand instead and fade the rank scene out in place; the raceRecent
			// settle (story.raceView, once the choreography lands) then retargets
			// the hidden crowd onto its real scatter spot with nothing to see.
			//
			// The cast itself is written as the node its bar collapsed into — the
			// same spot (the bar's centre), the same radius, colour and alpha the
			// chart gives it (raceDotSpec, the definition RankBars' HTML circle also
			// reads). That is the whole point of the handoff: when the overlay
			// stands down, the canvas underneath is holding the identical nodes, so
			// the swap has nothing to show. It also means nothing about a dot
			// changes on the flight that follows — only where it sits.
			// a Float64 copy, not tweener.current.slice(): the live buffer is
			// Float32, and this is handed straight back to to() as a target frame
			const collapsedAttrs = new Float64Array(tweener.current);
			for (let i = 0, id = 0; i < EDGE_BASE; i += STRIDE, id++) {
				if (rows && RACE_RECENT_VISIBLE.has(id)) {
					const dot = raceDotSpec(id === RACE_RECENT_LEAD);
					const y = rowY(id);
					const offList = y > rows.bottom;
					set(
						collapsedAttrs,
						id,
						rows.cx,
						offList ? rows.bottom : y,
						dot.r,
						dot.rgb,
						offList ? 0 : dot.alpha
					);
					startAttrs[i + 6] = litAttrs[i + 6];
					continue;
				}
				for (let k = 0; k < 6; k++) startAttrs[i + k] = collapsedAttrs[i + k];
				startAttrs[i + 6] = 0;
				collapsedAttrs[i + 6] = 0;
			}
			// The intro network's links go with them. The loop above hides everyone
			// who isn't the cast, but it walks node slots only, so a reader who got
			// here faster than those links could fade would keep them — drawn
			// between two live dots — right through the flight.
			for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) {
				collapsedAttrs[i + 1] = 0;
			}
			// ...and hold the chart furniture back until the overlay has gone, so
			// the axes don't draw up behind a rank list that is still on screen.
			chartVeiled = true;
			// The race names ride their dots, so without a gate both spend the
			// flight travelling up the canvas with them. Blank them for it;
			// playRaceEntry lifts the gate once the cast is on the chart.
			entryLabels = new Set();
			// Stage 1 is not ours: the list is collapsing its bars into those nodes
			// as HTML, over the top of this. Snap the canvas onto the collapsed frame
			// — invisible, since the panel is opaque and covers this band — and wait
			// for the overlay to stand down (story.rankCollapsed, which is also what
			// unmounts it). The flight is armed here rather than run here so that the
			// canvas can never be moving while the HTML the reader is watching isn't.
			tweener.to(collapsedAttrs, 0);
			trailTweener.to(startTrails, 0);
			raceFlight = {
				startAttrs,
				startTrails,
				stateDelays,
				flownIn: Boolean(rows)
			};
		} else if (raceFullEntryArrival) {
			// no seed frame needed — the rewind sweep recomputes attrs from scratch
			// every frame via writeRaceSweepFrame, so it can start from raceRecent's
			// live camera (raceExitPlayhead) rather than an assumed year, and the axis
			// comes with it.
			landOffChart(attrs, trailTarget);
			playRaceFullEntry();
		} else if (raceReverseArrival) {
			// the same leg backwards, also picking its camera up from raceExitPlayhead
			landOffChart(attrs, trailTarget);
			playRaceReverse();
		} else if (raceFutureArrival) {
			// the chapter's last pan, forwards past the end of the data — no seed
			// frame for the same reason as raceFullEntryArrival above
			landOffChart(attrs, trailTarget);
			playRaceFuture();
		} else if (raceFutureReverseArrival) {
			landOffChart(attrs, trailTarget);
			playRaceFutureReverse();
		} else if (entryAnim) {
			// arrive onto the choreography's own frame 0 (its animated slots stamped
			// over the static layout), then hand the rAF to playEntry. Like the race
			// entry, the arrival tween's onDone only fires if uninterrupted, so a
			// reader who hits Next mid-flight skips the choreography.
			// no name is on the chart yet; each leg introduces its own as it lands
			if (entryAnim.labelsAfter) entryLabels = new Set();
			const write = entryAnim.frames(nodes, width, height, layoutParams);
			const startAttrs = attrs.slice();
			const startTrails = trailTarget.slice();
			write(startAttrs, startTrails, 0, 0);
			tweener.to(startAttrs, TWEEN_MS, TWEEN_JITTER, stateDelays, () =>
				playEntry(entryAnim, write, attrs, trailTarget)
			);
			trailTweener.to(startTrails, TWEEN_MS, 0);
		} else if (stateChange) {
			heldLabels = introduced.size ? introduced : null;
			labelHoldUntil = performance.now() + EDGE_LAG_MS;
			// the tweener only fires onDone once every delayed group has landed, so
			// this is the end of the state's authored reveal — and a superseded tween
			// drops its callback, so a reader who hits Next mid-reveal never settles
			tweener.to(attrs, TWEEN_MS, TWEEN_JITTER, stateDelays, () =>
				settle(stateName)
			);
			trailTweener.to(trailTarget, TWEEN_MS, 0, layout.trailDelays);
		} else if (paramChange) {
			// interaction: retarget quickly, no choreography (delays would make
			// a small pan/highlight feel laggy)
			tweener.to(attrs, PARAM_TWEEN_MS, 0);
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
	<canvas bind:this={canvas}></canvas>
	<div class="annotations">
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
		{#key stateName}
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
			     so each one plays its own fade-in then rather than at the step change. -->
			{#if !chartVeiled}
				{#each decor?.axes?.x ?? [] as tick}
					<!-- raceFuture as well as raceFull: its arrival pan starts from
					     raceFull's camera, so 1980 can be on the plot for the first
					     frames of the leg, and gating this on raceFull alone would blink
					     the term off the moment the reader pressed Next. -->
					{#if (stateName === RACE_FULL_STATE || stateName === RACE_FUTURE_STATE) && tick.label === "1980"}
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
							{tick.label}
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
				     runSweepPhase/scrubLoop), so the note stays glued to the crossing
				     through a pan instead of freezing the way a `notes` entry would.
				     The wrapper carries the mount fade and the payload's own `alpha`
				     rides each child, because the two must MULTIPLY: an animation with
				     fill-mode `both` outranks an inline opacity for good, so putting
				     both on one element would leave the cull ramp with no effect.

				     `story.raceRewinding` is what holds it back until the Start rewind
				     has landed. The pan brings the crossing on camera with about a
				     third of its travel still to go, and without this the note mounted
				     there and then rode ~270px across the plot to its resting spot:
				     fine for an 11px ring, seasick for a block of prose. So it waits,
				     and the wrapper's fade-in is then the only motion it makes.
				     `raceRewinding` and not `story.settled`, which is the usual
				     wait-for-the-reveal gate: both race steps share one state, so
				     `settled` is already open when Start fires, and raceFull's arrival
				     never sets it at all (playRaceFullEntry snaps rather than tweens).
				     Not `camPanning`/`sweeping` either — a reader's scrub raises both,
				     and the note should track the crossing through a drag, not blink on
				     every grab. This flag names exactly the one animation in question. -->
				{#if decor?.takeover && !story.raceRewinding}
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
	.visual {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.annotations {
		position: absolute;
		inset: 0;
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

	.hits {
		position: absolute;
		inset: 0;
		pointer-events: none;
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
		   otherwise intercept the click before it reaches this trigger */
		z-index: 1;
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
