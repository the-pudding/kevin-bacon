import story from "$data/scrolly-story.json";
import { ATTR_SIZE, set } from "../attr-buffer.js";
import { SWEENEY, DENIRO, CHASE, HACKMAN, MIRREN } from "../cast.js";
import { ANCHOR_ID } from "../nodes.js";
import { CROWD, CAREER } from "../palette.js";
import { MARGIN, plotBottom, lin, markedTicks, stepped } from "../plot.js";
import {
	SEARCH_DOT_R,
	SEARCH_RGB,
	searchedId,
	withSearchLabel,
	withSearchParams
} from "../search.js";
import {
	TRAIL_SIZE,
	SWEENEY_SLOT,
	DENIRO_SLOT,
	CHASE_SLOT,
	BACON_SLOT,
	HACKMAN_SLOT,
	MIRREN_SLOT,
	COHORT_SLOT,
	TRAIL_META,
	setTrail,
	collapseTrail,
	clipSeries,
	monotoneSegments,
	sampleTrail,
	curveYAt
} from "../trails.js";

// ---------------------------------------------------------------------------
// Career lines (Future chapter): cumulative films by career age. Colour roles
// follow the prototype (career-age-scatter.js): the hero's trajectory is the
// red line, the comparisons are grey, and all three actors sit as blue marks
// (comparisons dimmed). Two casts draw this chart, and both clip their
// comparisons to the hero's endpoint so that every line on screen is a future
// branching off the hero's dot rather than a whole career to be read alongside
// it. Sweeney's cast asks how a Gen Z career might go; at "all futures" the
// comparisons demote into the grey cohort and lose their labels. Bacon's asks
// what is left of a career already run, which is the same question from the
// other end: his bounds start where he stands now, so Hackman's line is the
// flat stub of an actor who added nothing after this point and Mirren's is the
// steepest climb anyone has managed from it.
// ---------------------------------------------------------------------------

const HERO_ALPHA = 0.9;
const COMPARISON_ALPHA = 0.55;
const COHORT_ALPHA = 0.35;

/**
 * A cast is the hero first, then its comparisons, each
 * `[series key, node id, trail slot]`. `clip` cuts the comparisons back to the
 * hero's last film.
 * @typedef {{ named: [string, number, number][], clip: boolean }} CareerCast
 */

/** @type {CareerCast} */
const TRIO = {
	named: [
		["sweeney", SWEENEY, SWEENEY_SLOT],
		["deniro", DENIRO, DENIRO_SLOT],
		["chase", CHASE, CHASE_SLOT]
	],
	clip: true
};

/** @type {CareerCast} */
const BOUNDS = {
	named: [
		["bacon", ANCHOR_ID, BACON_SLOT],
		["hackman", HACKMAN, HACKMAN_SLOT],
		["mirren", MIRREN, MIRREN_SLOT]
	],
	clip: true
};

const CASTS = [TRIO, BOUNDS];

/** the hero's last (career age, films) — where a clipped cast's futures fork */
const heroEnd = (cast) => story.careers[cast.named[0][0]].at(-1);

/** a cast member's series as this cast draws it; null if a clip leaves nothing */
const castSeries = (cast, key) =>
	key === cast.named[0][0] || !cast.clip
		? story.careers[key]
		: clipSeries(story.careers[key], heroEnd(cast)[0], Infinity);

// where the trio's story stops — the cohort fan starts here too
const PRIMARY_AGE = heroEnd(TRIO)[0];

/**
 * Every cohort line, clipped to career-age ≥ Sweeney's endpoint and segmented
 * once (the data is static and scale-independent). Both the static layout and
 * the draw-on read these, so an animated frame lands exactly on the layout it
 * settles onto — the same reason race.js precomputes RACE_SEGS.
 *
 * A series that never reaches her endpoint (or reaches it only at its last
 * point) clips to null and gets no segments: 29 of the 145 have no line to draw,
 * so the layout collapses their slot and the choreography skips them.
 */
const COHORT = story.careers.cohort.map((series, i) => {
	const clipped = clipSeries(series, PRIMARY_AGE, Infinity);
	return {
		slot: COHORT_SLOT + i,
		series: clipped,
		segs: clipped ? monotoneSegments(clipped) : []
	};
});
const COHORT_BY_SLOT = new Map(COHORT.map((c) => [c.slot, c]));

// px from the canvas's left edge to the plot's left edge (career age 0)
const CAREER_LEFT = MARGIN + 14;

/**
 * The scales every career state and entry choreography shares, so an animated
 * frame lands exactly on the static layout. Domain comes from the background
 * cloud (every actor with a known career age) so the states share one stable
 * axis and the trajectory lines sit in the space the cloud fills — matching the
 * prototype's full-cloud scaling. Both casts are folded in, so the two steps
 * are provably on the same axis rather than coincidentally so; the lines never
 * exceed the cloud, but Math.max guards it anyway.
 */
function careerFrame(nodes, w, h) {
	let ageMax = 0;
	let filmsMax = 0;
	for (const n of nodes) {
		if (n.careerAge == null) continue;
		ageMax = Math.max(ageMax, n.careerAge);
		filmsMax = Math.max(filmsMax, n.films);
	}
	for (const cast of CASTS) {
		for (const [key] of cast.named) {
			const series = story.careers[key];
			ageMax = Math.max(ageMax, series.at(-1)[0]);
			filmsMax = Math.max(filmsMax, ...series.map((p) => p[1]));
		}
	}
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	return {
		ageMax,
		filmsMax,
		bottom,
		xS: (a) => lin(a, 0, ageMax, CAREER_LEFT, w - MARGIN - 6),
		yS: (f) => lin(f, 0, filmsMax, bottom, top) // more films = up
	};
}

/**
 * `set`'s radius/colour/alpha triple for one dot, with the reader's own mark
 * taking precedence over whatever the chart was drawing it as. A helper rather
 * than three ternaries at each call site: the position is NOT overridden, so a
 * searched actor who is also one of the named leads keeps the endpoint of their
 * own line and simply changes colour on it.
 */
const careerDot = (marked, r, rgb, alpha) =>
	marked ? [SEARCH_DOT_R, SEARCH_RGB, 1] : [r, rgb, alpha];

// nice even film-count steps (prototype tick strategy), labelled from the first
// step up (no 0 tick) and marked between at the step's round fractions
const FILMS_MINOR = { 5: 1, 20: 5, 50: 10 };

function filmsTicks(filmsMax, yS) {
	const step = filmsMax <= 30 ? 5 : filmsMax <= 100 ? 20 : 50;
	return markedTicks(
		{
			major: stepped(step)(step, filmsMax),
			minor: stepped(FILMS_MINOR[step])(FILMS_MINOR[step], filmsMax)
		},
		yS,
		String
	);
}

function careerLayout(cast, showCohort) {
	const heroKey = cast.named[0][0];
	/** @type {import("../layout-types.js").LayoutFn} */
	return function layoutCareer(nodes, w, h, _edges, params) {
		const attrs = new Float64Array(ATTR_SIZE);
		const trails = new Float64Array(TRAIL_SIZE);
		const trailDelays = new Float64Array(TRAIL_META.length);
		const { filmsMax, ageMax, bottom, xS, yS } = careerFrame(nodes, w, h);
		// every career trail parks on the end of the hero's line, so a line the
		// state doesn't draw is a collapsed point sitting on their dot: lines grow
		// out of them and retract back into them, in both directions and whether or
		// not the draw-on choreography plays. Parking them anywhere else (the plot
		// origin, y=0) makes the tween a translation across the chart instead.
		const [heroAge, heroFilms] = heroEnd(cast);
		const forkX = xS(heroAge);
		const forkY = yS(heroFilms);
		const namedIds = new Set(cast.named.map(([, id]) => id));
		const search = searchedId(params);
		for (const n of nodes) {
			const marked = n.id === search;
			if (namedIds.has(n.id)) {
				const key = cast.named.find(([, id]) => id === n.id)[0];
				const [age, films] = story.careers[key].at(-1);
				// blue marks all round; the comparisons read dimmed
				const alpha = key === heroKey ? 1 : COMPARISON_ALPHA;
				set(
					attrs,
					n.id,
					xS(age),
					yS(films),
					...careerDot(marked, 5.5, CAREER, alpha)
				);
			} else if (n.careerAge != null) {
				// background cloud: this actor's (career age, films) position
				set(
					attrs,
					n.id,
					xS(n.careerAge),
					yS(n.films),
					...careerDot(marked, 2, CROWD, 0.22)
				);
			} else {
				// no career age known: hidden on the plot's origin, the corner the
				// simulation next door starts its runs from
				set(attrs, n.id, xS(0), yS(0), 2, CROWD, 0);
			}
		}
		TRAIL_META.forEach((_meta, t) => {
			const namedEntry = cast.named.find(([, , slot]) => slot === t);
			if (namedEntry) {
				const key = namedEntry[0];
				// clipped comparisons diverge from the hero's endpoint; in the cohort
				// state they demote to cohort strength
				const series = castSeries(cast, key);
				const alpha =
					key === heroKey
						? HERO_ALPHA
						: showCohort
							? COHORT_ALPHA
							: COMPARISON_ALPHA;
				if (series) setTrail(trails, t, series, xS, yS, alpha);
				else collapseTrail(trails, t, forkX, forkY, 0);
				trailDelays[t] = 150;
			} else if (showCohort && COHORT_BY_SLOT.has(t)) {
				const { series } = COHORT_BY_SLOT.get(t);
				if (series) setTrail(trails, t, series, xS, yS, COHORT_ALPHA);
				else collapseTrail(trails, t, forkX, forkY, 0);
				// the draw-on choreography owns the forward reveal's stagger; this
				// only paces the plain arrival (stepping back in from simRace)
				trailDelays[t] = 150;
			} else {
				collapseTrail(trails, t, forkX, forkY, 0);
			}
		});
		const axes = {
			x: markedTicks(
				{ major: stepped(10)(0, ageMax), minor: stepped(5)(0, ageMax) },
				xS,
				String
			),
			xBase: bottom + 10,
			yMarkX: CAREER_LEFT,
			y: filmsTicks(filmsMax, yS)
		};
		return { attrs, trails, trailDelays, axes };
	};
}

/**
 * The draw-on primitives both career choreographies share, bound to one frame's
 * scales. A `line` is `{ slot, segs, a0, a1 }` (plus `id`/`trailAlpha` for one
 * an actor rides): `segs` are the monotone segments of the series the static
 * layout draws, `a0`/`a1` the career-age span the growth runs across.
 *
 * At e=0 a line carries no ink, which is what keeps a seed frame invisible: the
 * arrival tween would otherwise fade a stale line (this state's own trail
 * vertices, left in the buffer by an earlier visit) in while retracting it onto
 * the start point, so the reader watches the trajectory disappear before it has
 * ever been drawn.
 */
function lineDrawer(nodes, w, h) {
	const { xS, yS } = careerFrame(nodes, w, h);
	/** grow a line across the first `e` of its span; returns the tip's career age */
	const growLine = (trails, line, e, alpha) => {
		const tip = line.a0 + (line.a1 - line.a0) * e;
		sampleTrail(
			trails,
			line.slot,
			line.segs,
			line.a0,
			tip,
			xS,
			yS,
			e > 0 ? alpha : 0
		);
		return tip;
	};
	/** the same growth with the actor's dot riding the tip */
	const rideTip = (attrs, trails, line, e, dotAlpha) => {
		const tip = growLine(trails, line, e, line.trailAlpha);
		set(
			attrs,
			line.id,
			xS(tip),
			yS(curveYAt(line.segs, tip)),
			5.5,
			CAREER,
			dotAlpha
		);
	};
	return { growLine, rideTip, xS, yS };
}

// two beats: the hero's story so far, then the careers set against it
const CAREER_ENTRY_MS = [1200, 1100];

/**
 * A career step's entry choreography: the hero's red trajectory draws on from
 * the start of their career with their dot riding the tip, then the comparison
 * lines grow in — so "here's the career" and "here's what to measure it
 * against" read as two beats instead of one static chart. Both casts clip, so
 * the second beat unspools out of the point the hero lands on.
 *
 * A comparison waits collapsed and invisible at the first point of its own
 * clipped series — the hero's career age, at that comparison's own film count.
 * For the trio that is the hero's dot exactly (the build asserts all three are
 * at 16 films by career age 15); for the bounds it is within a film of it, so
 * nothing perceptibly moves when the second leg takes over.
 *
 * The final leg at e=1 reproduces the static layout call for call (same
 * monotone segments, same sample window, same alphas), so the settle has
 * nothing left to move. See EntryAnim in states.js.
 */
function careerEntry(cast) {
	const heroKey = cast.named[0][0];
	return function careerEntryFrames(nodes, w, h) {
		const { rideTip, xS, yS } = lineDrawer(nodes, w, h);
		// per named actor: the curve the line samples off, and the career-age span
		// the draw-on grows across
		const lines = cast.named.map(([key, id, slot]) => {
			const series = castSeries(cast, key);
			return {
				id,
				slot,
				segs: series ? monotoneSegments(series) : [],
				a0: series && series[0][0],
				a1: series && series.at(-1)[0],
				start: series && [xS(series[0][0]), yS(series[0][1])],
				trailAlpha: key === heroKey ? HERO_ALPHA : COMPARISON_ALPHA
			};
		});
		const hero = lines[0];
		// a comparison whose series never reaches the hero's endpoint — or reaches
		// it only at its very last point — has no line to draw; it keeps the static
		// frame the seed already put it in
		const comparisons = lines.slice(1).filter((line) => line.segs.length);
		return (attrs, trails, phase, e) => {
			if (phase === 0) {
				rideTip(attrs, trails, hero, e, 1);
				// comparisons wait, invisible, where their own line begins
				for (const line of comparisons) {
					collapseTrail(trails, line.slot, line.start[0], line.start[1], 0);
					set(attrs, line.id, line.start[0], line.start[1], 5.5, CAREER, 0);
				}
				return;
			}
			rideTip(attrs, trails, hero, 1, 1);
			for (const line of comparisons) {
				rideTip(attrs, trails, line, e, COMPARISON_ALPHA * e);
			}
		};
	};
}

// one beat: the whole fan of futures opening out of her endpoint
const COHORT_ENTRY_MS = [1600];
// share of the leg spent handing off between lines; the rest is any one line's
// own growth, so even the last line gets (1 - COHORT_STAGGER) of the leg to draw
const COHORT_STAGGER = 0.5;

/**
 * careerMany entry choreography: every cohort line grows out of the end of
 * Sweeney's line, the same way careerTrio's two comparisons do — staggered in
 * slot order so the fan sprays open instead of appearing all at once. Without
 * it the lines morph in from the corner they were parked at, which reads as
 * arriving from the bottom-left rather than branching off her career.
 *
 * Her own line, the two comparisons and the background cloud aren't touched
 * here: they're already on screen from careerTrio and ride the ordinary arrival
 * tween, over which the comparisons dim into cohort strength.
 *
 * The final frame reproduces the static layout call for call (same clipped
 * series, same segments, same full sample window, same alpha), so the settle has
 * nothing left to move. See EntryAnim in states.js.
 */
function cohortEntryFrames(nodes, w, h) {
	const { growLine, xS, yS } = lineDrawer(nodes, w, h);
	const [heroAge, heroFilms] = heroEnd(TRIO);
	const forkX = xS(heroAge);
	const forkY = yS(heroFilms);
	const lines = COHORT.filter((c) => c.segs.length).map((c) => ({
		...c,
		a0: c.series[0][0],
		a1: c.series.at(-1)[0]
	}));
	const span = 1 - COHORT_STAGGER;
	const last = Math.max(1, lines.length - 1);
	// attrs/phase are unused: this state's dots need no choreography, and the
	// fan is one leg
	return (_attrs, trails, _phase, e) => {
		lines.forEach((line, i) => {
			const offset = (COHORT_STAGGER * i) / last;
			const local = Math.min(1, Math.max(0, (e - offset) / span));
			// not started yet: an invisible point at the spot it will grow from
			if (local <= 0) collapseTrail(trails, line.slot, forkX, forkY, 0);
			else growLine(trails, line, local, COHORT_ALPHA);
		});
	};
}

const CAREER_OVERLAY = {
	xLabel: "Career age (years)",
	yLabel: "Film count"
};

const CAREER_TITLE = "Film count by career age";

export const states = {
	careerTrio: {
		layout: careerLayout(TRIO, false),
		title: CAREER_TITLE,
		// One scene with careerBacon and careerMany. All three draw the same chart
		// and differ only in which lines are on it: careerFrame's scales come from
		// the background cloud and every cast's named series, so the title, the
		// overlay's two axis labels and every tick are identical on all three.
		// Treated as separate scenes, the step change faded all of it out, held it
		// out for the whole arrival, and faded the same words back in at the same
		// coordinates — ~870ms in which the only motion on the chart was its own
		// furniture leaving and coming back (motion.md rules 6, 7).
		scene: "career",
		labels: (params) => withSearchLabel([SWEENEY, DENIRO, CHASE], params),
		params: withSearchParams(),
		// the draw-on is authored for the forward arrival out of the Gen Z race;
		// stepping back into it from careerBacon gets a plain tween
		revealFrom: ["raceGenz"],
		entry: {
			phases: CAREER_ENTRY_MS,
			frames: careerEntry(TRIO),
			// each name lands with the line that earns it, rather than labelling a
			// dot the reader hasn't been told anything about yet: nobody on the
			// arrival, the hero with leg 0, the comparisons with leg 1
			labelsAfter: [[], [SWEENEY], [DENIRO, CHASE]]
		},
		overlay: CAREER_OVERLAY
	},
	careerBacon: {
		layout: careerLayout(BOUNDS, false),
		title: CAREER_TITLE,
		// one scene with the other two — see the note on careerTrio above
		scene: "career",
		labels: (params) => withSearchLabel([ANCHOR_ID, HACKMAN, MIRREN], params),
		// no control on this step, but the three career states share a scene and
		// a sticky pick must not blink off on the middle one
		params: withSearchParams(),
		// All three dots sit at the right-hand end of the axis (Bacon at career
		// age 47, Hackman 54, Mirren 52), so the names go to their LEFT, into the
		// plot. They have to be beside-dot names rather than the trio's below-dot
		// ones: Bacon and Hackman both rest at 47 films, so centred under their
		// dots the two names landed on the same baseline and overprinted. Only
		// beside-dot names are de-collided (see createLabelStacker).
		labelDirs: {
			[ANCHOR_ID]: "left",
			[HACKMAN]: "left",
			[MIRREN]: "left"
		},
		// authored for the forward arrival off the trio; stepping back in from
		// careerMany gets a plain tween. The trio's lines are on their own slots
		// and are not in this state's TRAIL_CONSTANCY group, so they fade out
		// where they lie before the crowd moves and this chart is drawn onto an
		// empty plot (see trails.js).
		revealFrom: ["careerTrio"],
		entry: {
			phases: CAREER_ENTRY_MS,
			frames: careerEntry(BOUNDS),
			labelsAfter: [[], [ANCHOR_ID], [HACKMAN, MIRREN]]
		},
		overlay: CAREER_OVERLAY
	},
	careerMany: {
		layout: careerLayout(TRIO, true),
		title: CAREER_TITLE,
		// one scene with the other two — see the note on careerTrio above
		scene: "career",
		// the comparisons have demoted into the cohort — only the hero is named
		labels: (params) => withSearchLabel([SWEENEY], params),
		// this state hosts the career-age search (step 27)
		params: withSearchParams(),
		// the fan is authored to branch off the endpoint of Sweeney's line, which
		// holds arriving backward from simRace too: her line and the comparisons
		// are already drawn on that chart, so the branch point is the same
		// endpoint either direction. Arriving forward from careerBacon they are at
		// alpha 0 — they faded out where they lay on the way in — so they fade
		// back on without travelling, and the fan branches off the same point.
		revealFrom: ["careerBacon", "simRace"],
		entry: { phases: COHORT_ENTRY_MS, frames: cohortEntryFrames },
		overlay: CAREER_OVERLAY
	}
};
