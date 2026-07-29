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
		raceStepCast,
		PX_PER_YEAR,
		RACE_RECENT_EXTENT,
		RACE_RECENT_STEP,
		RACE_REWIND_WAYPOINT_YEAR,
		RACE_TRADES_STEP,
		RACE_RECENT_YFIT,
		RACE_TRADES_YFIT,
		raceRewindYFit
	} from "./layouts/race.js";
	import {
		ATTR_SIZE,
		DELAY_SIZE,
		STRIDE,
		EDGE_BASE,
		STATES,
		OVERLAYS,
		STATE_LABELS,
		STATE_LABEL_DIRS,
		STATE_PICK,
		STATE_PULSE,
		STATE_YCAP,
		STATE_RACE,
		STATE_YFIT,
		STATE_PARAMS,
		STATE_REVEAL_FROM,
		STATE_ENTRY,
		STATE_SEED,
		STATE_TRACKED,
		TRAIL_SIZE,
		TRAIL_STRIDE,
		TRAIL_POINTS,
		TRAIL_META
	} from "./states.js";
	import { MARGIN, plotBottom } from "./layout-shared.js";
	import { story } from "./story.svelte.js";

	// undefined until the <Step> registry has populated (first client render)
	/** @type {{ state: import("./states.js").VisualState, params?: Object, stepsHeight?: number, coldStart?: boolean }} */
	let {
		state: stateName,
		params,
		stepsHeight = 0,
		coldStart = false
	} = $props();

	const TWEEN_MS = 700;
	const ENTER_MS = 900;
	// interaction inside a state (params change): quicker, direct retarget
	const PARAM_TWEEN_MS = 450;
	const TWEEN_JITTER = 0.5;

	const { nodes, edges } = makeNodes();
	// delays for a skipped reveal (see STATE_REVEAL_FROM below): dots retarget
	// in unison, but edges hold back until the dots have mostly landed — edges
	// draw toward their endpoints' *final* spots, so fading them in earlier
	// strings lines between mid-flight dots and far-away destinations
	const SKIP_REVEAL_DELAYS = new Float64Array(DELAY_SIZE);
	SKIP_REVEAL_DELAYS.fill(TWEEN_MS * 0.75, nodes.length);
	// edges draw outward from the anchor: orient each from its lower-hop end so
	// the line grows from Bacon toward the outer actor
	const edgeEnds = edges.map(({ source, target }) =>
		nodes[source].hop <= nodes[target].hop ? [source, target] : [target, source]
	);
	// every id any state labels or pulses — tracked out of the attr array each
	// frame so the HTML annotations stay glued to their dots mid-tween.
	// Dynamic label states (function values) declare their possible ids in
	// STATE_TRACKED instead.
	const TRACKED_IDS = [
		...new Set([
			...Object.values(STATE_LABELS).filter(Array.isArray).flat(),
			...Object.values(STATE_PULSE),
			...STATE_TRACKED
		])
	];
	const tweener = createTweener(ATTR_SIZE, drawScene, STRIDE);
	// trails (race/career lines) tween on their own array so polylines morph
	// with the same interruption-safe semantics as dots
	const trailTweener = createTweener(TRAIL_SIZE, drawScene, TRAIL_STRIDE);
	// last trail target, kept so states without trails fade them out in place
	let lastTrailTarget = null;

	// -- Race path animator ("time machine") -------------------------------------
	// A third rAF writer. Unlike the two tweeners it does NOT lerp between two
	// endpoints: each frame it evaluates the race layout at a moving window and
	// writes the ~15 race dots + their trails straight into the live tweener
	// buffers, then repaints. Entry choreography draws the actors' lines on from
	// the present edge. See delivery-plan Stage 4.
	const SWEEP_MS = 4000;
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
	// fixed — only the camera (playhead) or the reveal moves — so the cast, the
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
	// reader-driven pan / settled hold: the camera at one playhead year
	const panFrame = (step) => (playhead) => ({ ...step, playhead });
	// the one state whose arrival plays the draw-on entry (scoped by revealFrom)
	const RACE_ENTRY_STATE = "raceRecent";
	// contender cast at raceRecent's extent — what the draw-on shows from its
	// first frame, so nobody who fails its yCap ever appears just to vanish
	const RACE_ENTRY_CONTENDERS = raceStepCast(
		RACE_RECENT_STEP,
		STATE_YCAP[RACE_ENTRY_STATE]
	);
	// how far into a phase a departing actor is fully gone. Departures finish EARLY
	// rather than riding the whole phase because the rewind's leg 2 moves the y axis
	// under them as it pans (raceRewindYFit), and the actors it drops are not in that
	// landing fit — a line still fading at the end of the leg could be drawn outside
	// the plot, over the axis furniture. They leave while the axis still holds them,
	// which also reads better: the modern crowd drops away first, leaving the actors
	// the step is about.
	const CAST_DEPART_END = 0.35;
	// per-frame cast alpha for one sweep phase: actors joining the landing set
	// fade in over the phase, actors leaving fade out over CAST_DEPART_END,
	// everyone else rides at full strength — so contender-membership changes glide
	// across the phase instead of popping when the settle layout's filter kicks in
	const castAlpha = (cast, e) =>
		cast &&
		((id) =>
			cast.to.has(id)
				? cast.from.has(id)
					? 1
					: e
				: cast.from.has(id)
					? Math.max(0, 1 - e / CAST_DEPART_END)
					: 0);
	// the one state whose arrival plays the rewind's second leg (scoped by
	// revealFrom) — see playRaceEntry/playRaceRewind for the two-leg split
	const RACE_REWIND_STATE = "raceTrades";
	// true once raceRecent's own rewind leg has settled; gates the second leg so a
	// reader who advances past raceRecent before that first leg finishes falls
	// back to a plain crossfade instead of a second-leg pan that starts from a
	// discontinuous frame
	let raceRecentRewound = false;
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
	// run one eased race phase; map(e) → the frame; onDone chains the next; cast
	// ({from, to} contender Sets) fades membership changes over the phase (see
	// castAlpha). Every frame publishes its camera into renderPlayhead, so a later
	// leg (or a reader's grab) continues from wherever this one actually got to.
	// `fixedYFit` is either one [vMin,vMax,vLo,vHi] held for the whole phase or a
	// function of the eased progress (raceRewindYFit) for the one phase whose axis moves.
	function runSweepPhase(map, yCap, onDone, fixedYFit = null, cast = null) {
		const yFitAt =
			typeof fixedYFit === "function" ? fixedYFit : () => fixedYFit;
		runPhase(
			SWEEP_MS,
			(e) => {
				const { axes, cam } = writeRaceSweepFrame(
					tweener.current,
					trailTweener.current,
					width,
					height,
					map(e),
					yCap,
					yFitAt(e),
					castAlpha(cast, e)
				);
				renderPlayhead = cam.playhead;
				decor = { ...decor, axes };
			},
			onDone
		);
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
			extent,
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
		const { axes } = writeRaceSweepFrame(
			tweener.current,
			trailTweener.current,
			width,
			height,
			panFrame(raceStep)(renderPlayhead),
			STATE_YCAP[stateName],
			// the state's own shared y-fit, or the axis jumps between the panned
			// frames and the static settle
			STATE_YFIT[stateName] ?? null
		);
		decor = { ...decor, axes };
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
		// it for the glide loop
		stopSweep();
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
	const decollideLabels = createLabelDecollider();
	const LABEL_LINE_GAP_PX = 16; // ~11px label line-height * 1.15, matches reference

	// layouts are pure in (state, w, h, params) — cache so re-visited states
	// skip both the recompute and the per-call Float64Array allocation; the
	// tweener only reads the result, never mutates it. `params` merges the
	// step's static params with the interaction fields the state consumes
	// (STATE_PARAMS selector), so an interaction re-runs the current layout.
	const layoutCache = new Map();
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
	let reducedMotion = $state(false);
	// true while the race path animator owns the rAF (see playRaceEntry); the
	// render effect steps aside and the panning-domain axis furniture hides
	let sweeping = $state(false);
	/** @type {{ id: number, name: string, x: number, y: number, r: number, alpha: number, labelAlpha: number, labelOffset: number }[]} */
	let tracked = $state([]);
	// static per-state chart furniture (ticks/callouts/legend) from the layout result
	/** @type {{ axes?: { x?: {pos:number,label:string}[], y?: {pos:number,label:string}[], xBase?: number, yBase?: number }, notes?: import("./states.js").Note[], legend?: import("./layout-shared.js").LegendItem[], legendY?: number, hits?: import("./layout-shared.js").Hit[] } | null} */
	let decor = $state(null);
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
	// the rewind phase) — reactive ($state) because the template also reads it to
	// hide the era callouts while they're stale mid-pan. The entry draw-on keeps
	// the camera still, so its notes stay pixel-accurate throughout and don't need
	// to hide (see the `!camPanning` guard below).
	let camPanning = $state(false);
	// The live camera playhead — the single source of truth for where the race
	// chapter's camera is. Every camera writer (draw-on, both rewind legs, the pan
	// glide) publishes into it each frame, so a later leg or a reader's grab
	// continues from wherever the previous motion actually got to instead of a
	// hard-coded year. Reset with `raceView` on a state change.
	let renderPlayhead = RACE_RECENT_EXTENT[1];
	// While an entry choreography is playing, the set of ids whose names have
	// been introduced so far (see EntryAnim.labelsAfter); null = no gate, every
	// labelled id shows. Deliberately NOT $state: drawScene folds it into
	// `tracked` (which is reassigned every frame and is what the template reads),
	// so the labels stay reactive without the render effect depending on state it
	// also writes. The CSS opacity transition on .node-label does the fade.
	/** @type {Set<number> | null} */
	let entryLabels = null;

	const overlay = $derived(OVERLAYS[stateName]);
	// the active state's race camera descriptor ({ extent }), or undefined off the
	// race chapter — its presence is what makes a step pannable
	const raceStep = $derived(STATE_RACE[stateName]);
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
	const labelIds = $derived.by(() => {
		const spec = STATE_LABELS[stateName];
		return new Set(
			typeof spec === "function" ? spec(layoutParams) : (spec ?? [])
		);
	});
	// per-node label placement overrides ("left"/"right" beside the dot instead
	// of the default below-and-centred)
	const labelDirs = $derived(STATE_LABEL_DIRS[stateName] ?? {});
	const pulseId = $derived(STATE_PULSE[stateName] ?? null);
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
	// change abandons the sweep) and reduced-motion safe. Once the draw-on
	// settles, immediately (no pause) starts the rewind's first leg, panning the
	// camera back from the present to RACE_REWIND_WAYPOINT_YEAR — so draw-on +
	// first-leg rewind play as one continuous flourish while the reader is still
	// on raceRecent's step.
	function playRaceEntry(step) {
		if (!width || !height) return;
		const finalView = { playhead: step.extent[1] };
		if (reducedMotion) {
			// defensive: the effect's reduced-motion branch normally jumps before
			// this runs, so the draw-on is skipped and we land on the static frame
			story.raceView = finalView;
			return;
		}
		// single-writer discipline: stop the generic writers before the sweep owns
		// the rAF; on completion pin the chart via raceView, which triggers one
		// param-tween settle. The sweep casts only raceRecent's contenders
		// (RACE_ENTRY_CONTENDERS), so its frames always agree with the yCap-
		// filtered static layouts and nobody pops out at the settle.
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
				if (!reducedMotion) {
					// leg 1 stays on raceRecent's own axis: it settles back onto
					// raceRecent, so nothing about the y-scale may change
					playRaceRewind(
						step.extent[1],
						RACE_REWIND_WAYPOINT_YEAR,
						step,
						STATE_YCAP[RACE_ENTRY_STATE],
						RACE_RECENT_YFIT,
						() => {
							raceRecentRewound = true;
						}
					);
				}
			},
			RACE_RECENT_YFIT,
			{ from: RACE_ENTRY_CONTENDERS, to: RACE_ENTRY_CONTENDERS }
		);
	}

	// Race-chapter rewind, played in two legs so the "camera moving back in time"
	// motion is visible across both raceRecent and raceTrades instead of happening
	// all at once during raceRecent: leg 1 (chained off playRaceEntry's onDone)
	// pans from the present back to RACE_REWIND_WAYPOINT_YEAR and stops; leg 2
	// (played on arrival at raceTrades, gated by raceRecentRewound so an
	// interrupted leg 1 falls back to a plain crossfade) continues the same pan on
	// from there down to raceTrades' own resting year. At a fixed px-per-year both
	// legs are pure x-translation — the camera can never zoom.
	//
	// `toExtent`/`toCap` describe the LANDING state: the leg fades out actors who
	// stop being contenders there (and fades in any who start), so its last frame
	// matches the yCap-filtered static settle exactly instead of dropping them in
	// one pop. The frame's own extent is the leg's camera travel instead, so the
	// visible line always runs right up to the dot mid-pan; the y-fit and the cast
	// are both passed in, so that wider extent never leaks into either.
	//
	// `yFit` is the leg's axis: leg 1 holds raceRecent's fit (it settles back onto
	// raceRecent), leg 2 passes a raceRewindYFit, so the y-scale pans with the camera
	// and lands exactly on the static settle's axis.
	function playRaceRewind(fromP, toP, toStep, toCap, yFit, onSettled) {
		if (!width || !height) return;
		const finalView = { playhead: toP };
		if (reducedMotion) {
			story.raceView = finalView;
			onSettled?.();
			return;
		}
		const span = raceVisibleSpan(width, height);
		const legExtent = /** @type {[number, number]} */ ([
			Math.min(fromP, toP) - span,
			Math.max(fromP, toP)
		]);
		// both legs start from a frame resting under raceRecent's cast (leg 1 from
		// the entry draw-on, leg 2 from raceRecent settled at the waypoint)
		const cast = {
			from: RACE_ENTRY_CONTENDERS,
			// raceStepCast, not raceContenders: the landing step may name its cast
			// outright (RACE_TRADES_STEP.only), and anyone it drops has to fade out
			// across the leg like any other departure instead of popping at the settle
			to: raceStepCast(toStep, toCap)
		};
		sweeping = true;
		camPanning = true;
		runSweepPhase(
			rewindFrame(toStep, legExtent, fromP, toP),
			STATE_YCAP[RACE_ENTRY_STATE],
			() => {
				sweeping = false;
				camPanning = false;
				story.raceView = finalView;
				publishRaceCam();
				onSettled?.();
			},
			yFit,
			cast
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

	function drawScene() {
		if (!ctx) return;
		const attrs = tweener.current;
		const trailAttrs = trailTweener.current;
		ctx.clearRect(0, 0, width, height);
		// trails under everything: race/career lines, prediction diagonal
		for (let t = 0; t < TRAIL_META.length; t++) {
			const base = t * TRAIL_STRIDE;
			const alpha = trailAttrs[base + TRAIL_POINTS * 2];
			if (alpha <= 0.008) continue;
			const { rgb, width: lw } = TRAIL_META[t];
			ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
			ctx.lineWidth = lw;
			ctx.beginPath();
			ctx.moveTo(trailAttrs[base], trailAttrs[base + 1]);
			for (let k = 1; k < TRAIL_POINTS; k++) {
				ctx.lineTo(trailAttrs[base + k * 2], trailAttrs[base + k * 2 + 1]);
			}
			ctx.stroke();
		}
		ctx.lineWidth = 1;
		// a live (target alpha > 0) line's endpoint is drawn at its final spot
		// (not its live position) so the line points to where the actor is going
		// and the actor slides onto it, instead of the angle swinging as the
		// actor tweens into place; a dying line (faded out in the target state)
		// tracks both live dots instead — the target state's endpoint positions
		// belong to a layout this edge isn't part of
		const target = layoutFor(stateName, width, height, layoutParams).attrs;
		for (let e = 0; e < edgeEnds.length; e++) {
			const i = EDGE_BASE + e * STRIDE;
			const progress = attrs[i];
			const alpha = attrs[i + 1];
			if (alpha <= 0.004 || progress <= 0.004) continue;
			const [from, to] = edgeEnds[e];
			const dying = target[i + 1] <= 0.004;
			const xa = attrs[from * STRIDE];
			const ya = attrs[from * STRIDE + 1];
			const xb = dying ? attrs[to * STRIDE] : target[to * STRIDE];
			const yb = dying ? attrs[to * STRIDE + 1] : target[to * STRIDE + 1];
			ctx.strokeStyle = `rgba(120, 120, 120, ${alpha})`;
			ctx.beginPath();
			ctx.moveTo(xa, ya);
			ctx.lineTo(xa + (xb - xa) * progress, ya + (yb - ya) * progress);
			ctx.stroke();
		}
		dotBuckets.clear();
		for (let i = 0; i < EDGE_BASE; i += STRIDE) {
			const alpha = attrs[i + 6];
			if (alpha <= 0.004) continue;
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
		const nextTracked = TRACKED_IDS.map((id) => ({
			id,
			name: nodes[id].name,
			x: attrs[id * STRIDE],
			y: attrs[id * STRIDE + 1],
			r: attrs[id * STRIDE + 2],
			alpha: attrs[id * STRIDE + 6],
			// a name rides its dot's alpha, except while an entry choreography is
			// holding it back until the leg that introduces the actor has finished
			labelAlpha:
				labelIds.has(id) && (!entryLabels || entryLabels.has(id))
					? attrs[id * STRIDE + 6]
					: 0,
			labelOffset: 0
		}));
		// only beside-dot labels ("left"/"right") stack vertically — below-dot
		// labels are already x-separated by their own dot, so they're excluded
		const besideDot = nextTracked.filter(
			(t) => t.labelAlpha > 0 && labelDirs[t.id] != null
		);
		if (besideDot.length > 1) {
			const shownOffset = decollideLabels(besideDot, LABEL_LINE_GAP_PX);
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

	$effect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => (reducedMotion = query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	});

	// The race sweep/pan owns story.raceView; drop it whenever the active state
	// changes so a freshly-entered state rests at its own resting year, not a
	// stale override. The playhead and the pan target go with it — otherwise a pan
	// on one race step leaks into the next one's first grab. Depends on stateName
	// ONLY (untrack the reads) — a sweep setting raceView while the state is
	// unchanged must not re-fire this. Declared before the render effect so it
	// wins the flush when a step change dirties both.
	$effect(() => {
		stateName;
		const extent = STATE_RACE[stateName]?.extent;
		untrack(() => {
			if (story.raceView !== null) story.raceView = null;
			if (story.scrubYear !== null) story.scrubYear = null;
			if (extent) renderPlayhead = extent[1];
		});
	});

	// Publishes the live camera for the pan control (RaceScrubber). ScrollyVisual is
	// the only component that knows the canvas width, so the bounds have to come
	// from here. One-way by construction: no layout's `params` selector reads
	// raceCam, so this can never feed back into the render effect. Called at rest
	// points (state change, resize, every choreography settle) rather than per
	// frame — the pan control only needs the camera it can be grabbed from.
	function publishRaceCam() {
		const extent = raceStep?.extent;
		if (!extent || !width || !height) {
			if (story.raceCam !== null) story.raceCam = null;
			return;
		}
		const bounds = racePanBounds(width, height, extent, renderPlayhead);
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
			pxPerYear: PX_PER_YEAR,
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

	$effect(() => {
		if (!canvas || !width || !height || !stateName) return;
		// while the path animator/scrub loop owns the rAF, step aside: a genuine
		// state change (Next) abandons it — dots tween on from wherever they are, so
		// Next stays live and any in-progress scrub ends; a param/raceView change is
		// the animator's own handoff, so ignore it. (Scrubbing implies sweeping, so
		// this one guard covers both.) raceView is dropped by the stateName effect.
		if (sweeping) {
			if (stateName === prevState) return;
			stopSweep();
			sweeping = false;
			if (story.scrubbing) untrack(() => (story.scrubbing = false));
		}
		const resized = width !== prevW || height !== prevH;
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
			legend: layout.legend,
			legendY: layout.legendY,
			hits: layout.hits
		};
		// states without trails fade the previous ones out where they lie
		let trailTarget = layout.trails;
		if (!trailTarget) {
			trailTarget = lastTrailTarget
				? lastTrailTarget.slice()
				: new Float64Array(TRAIL_SIZE);
			for (let t = 0; t < TRAIL_META.length; t++) {
				trailTarget[t * TRAIL_STRIDE + TRAIL_POINTS * 2] = 0;
			}
		}
		lastTrailTarget = trailTarget;
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
			tweener.to(attrs, ENTER_MS, TWEEN_JITTER, delays);
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
		const stateDelays = playReveal ? delays : SKIP_REVEAL_DELAYS;
		// race-chapter arrival (forward, from a revealFrom origin): play the draw-on
		// entry choreography instead of a plain state tween. Only reached with real
		// animation — reduced motion/resize are handled by the branch below.
		const raceEntry =
			stateChange && playReveal && stateName === RACE_ENTRY_STATE;
		// race-chapter arrival at raceTrades (forward, from raceRecent): play the
		// rewind's second leg instead of a plain state tween — but only if
		// raceRecent's own first leg actually finished (raceRecentRewound);
		// otherwise fall through to the plain stateChange tween below (see
		// raceRecentRewound's comment).
		const raceRewindArrival =
			stateChange &&
			playReveal &&
			stateName === RACE_REWIND_STATE &&
			raceRecentRewound;
		// any other state that declares an entry choreography (STATE_ENTRY),
		// played on a forward arrival from a revealFrom origin
		const entryAnim =
			stateChange && playReveal ? STATE_ENTRY[stateName] : undefined;
		// drop any gate a previous choreography left behind — an arrival tween
		// superseded before its onDone fired never reaches playEntry's settle, and
		// a stale gate would hide the new state's names for good. Re-armed below
		// only if this arrival actually plays an entry.
		entryLabels = null;
		prevState = stateName;
		prevParamsKey = paramsKey;
		if (resized || reducedMotion) {
			tweener.to(attrs, 0);
			trailTweener.to(trailTarget, 0);
		} else if (raceEntry) {
			// a fresh entry sweep is starting, so any earlier "done" flag no longer
			// applies until this one completes
			raceRecentRewound = false;
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
			writeRaceSweepFrame(
				startAttrs,
				startTrails,
				width,
				height,
				entryFrame(RACE_RECENT_STEP)(0),
				STATE_YCAP[RACE_ENTRY_STATE],
				RACE_RECENT_YFIT,
				castAlpha({ from: RACE_ENTRY_CONTENDERS, to: RACE_ENTRY_CONTENDERS }, 0)
			);
			tweener.to(startAttrs, TWEEN_MS, TWEEN_JITTER, stateDelays, () =>
				playRaceEntry(RACE_RECENT_STEP)
			);
			trailTweener.to(startTrails, TWEEN_MS, 0);
		} else if (raceRewindArrival) {
			// no seed frame needed — the rewind sweep recomputes attrs from scratch
			// every frame via writeRaceSweepFrame, continuing smoothly from where
			// raceRecent's first-leg rewind settled (the raceRecentRewound gate is
			// what guarantees the camera is actually parked at the waypoint). This is
			// the one phase whose axis moves: it pans down onto raceTrades' resting
			// fit, following the dots, as the camera travels back.
			playRaceRewind(
				RACE_REWIND_WAYPOINT_YEAR,
				RACE_TRADES_STEP.extent[1],
				RACE_TRADES_STEP,
				STATE_YCAP[RACE_REWIND_STATE],
				raceRewindYFit(
					RACE_RECENT_YFIT,
					RACE_TRADES_YFIT,
					RACE_REWIND_WAYPOINT_YEAR,
					RACE_TRADES_STEP.extent[1],
					RACE_TRADES_STEP.only
				)
			);
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
		} else if (stateChange && STATE_SEED[stateName]) {
			// seed frame: fade the prior visual out where it lies (alpha → 0, no
			// movement), then once faded snap invisibly into the seed positions —
			// so the next state reveals from a consistent frame without any dot
			// being seen changing xy
			const fade = Float64Array.from(tweener.current);
			for (let i = 0; i < EDGE_BASE; i += STRIDE) fade[i + 6] = 0;
			for (let i = EDGE_BASE; i < ATTR_SIZE; i += STRIDE) fade[i + 1] = 0;
			tweener.to(fade, TWEEN_MS, 0, null, () => tweener.to(attrs, 0));
			trailTweener.to(trailTarget, TWEEN_MS, 0, layout.trailDelays);
		} else if (stateChange) {
			tweener.to(attrs, TWEEN_MS, TWEEN_JITTER, stateDelays);
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
			     vertically centred; otherwise it hangs below, anchored so it never
			     spills past the canvas edge (right-align near the right edge,
			     left-align near the left, else centred on the dot) -->
			{@const dir = labelDirs[t.id]}
			{@const transform =
				dir === "right"
					? `translate(${t.x + t.r + 4}px, calc(${t.y + t.labelOffset}px - 50%))`
					: dir === "left"
						? `translate(calc(${t.x - t.r - 4}px - 100%), calc(${t.y + t.labelOffset}px - 50%))`
						: `translate(${
								t.x > width - 96
									? `calc(${t.x}px - 100%)`
									: t.x < 96
										? `${t.x}px`
										: `calc(${t.x}px - 50%)`
							}, ${t.y + t.r + 4}px)`}
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
			{#if overlay?.xLabel}
				<p class="x-label fade-in" style="top: {xLabelTop}px; bottom: auto">
					{overlay.xLabel}
				</p>
			{/if}
		{/key}
		{#key overlay?.yLabel}
			{#if overlay?.yLabel}
				<!-- centre the axis title on the graph's y-axis extent, not the tall canvas -->
				<p class="y-label fade-in" style="top: {yLabelTop}px">
					{overlay.yLabel}
				</p>
			{/if}
		{/key}
		{#key stateName}
			<!-- axes are recomputed every frame during the race sweep/scrub
			     animations (see writeRaceSweepFrame), so they stay pixel-accurate
			     throughout and don't need to hide. Notes (era-handover callouts) have
			     no per-frame equivalent, so they still hide during a live scrub/pan
			     and snap back in once it settles. -->
			{#each decor?.axes?.x ?? [] as tick}
				<p
					class="tick tick-x fade-in"
					style="left: {tick.pos}px; {decor.axes.xBase != null
						? `top: ${decor.axes.xBase}px`
						: ''}"
				>
					{tick.label}
				</p>
			{/each}
			{#each decor?.axes?.y ?? [] as tick}
				<p class="tick tick-y fade-in" style="top: {tick.pos}px">
					{tick.label}
				</p>
			{/each}
			{#if !camPanning}
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
			{/if}
			{#if decor?.legend}
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
		{/key}
	</div>
	{#if pick}
		<div class="hits">
			{#each decor?.hits ?? [] as hit (hit.label)}
				<button
					class="hit"
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
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--color-gray-900, #222);
		text-shadow:
			0 0 3px var(--color-bg, #fff),
			0 0 6px var(--color-bg, #fff);
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
</style>
