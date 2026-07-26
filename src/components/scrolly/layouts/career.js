import story from "$data/scrolly-story.json";
import {
	ATTR_SIZE,
	TRAIL_SIZE,
	MARGIN,
	plotBottom,
	lin,
	set,
	scatterPosition,
	CROWD,
	BLUE,
	SWEENEY,
	DENIRO,
	CHASE,
	SWEENEY_SLOT,
	DENIRO_SLOT,
	CHASE_SLOT,
	COHORT_SLOT,
	TRAIL_META,
	setTrail,
	collapseTrail,
	clipSeries,
	monotoneSegments,
	sampleTrail,
	curveYAt
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Career lines (Future chapter): cumulative films by career age. Colour roles
// follow the prototype (career-age-scatter.js): Sweeney's trajectory is the
// red hero line, the comparisons (De Niro/Chase) are grey lines clipped to
// career-age ≥ hers — so every possible future diverges from her dot — and
// all three actors sit as blue marks (comparisons dimmed). At "all futures"
// the comparisons demote into the grey cohort and lose their labels.
// ---------------------------------------------------------------------------

const COMPARISON_ALPHA = 0.55;
const COHORT_ALPHA = 0.35;

const NAMED = [
	["sweeney", SWEENEY, SWEENEY_SLOT],
	["deniro", DENIRO, DENIRO_SLOT],
	["chase", CHASE, CHASE_SLOT]
];
// where Sweeney's story stops — comparison/cohort lines start here
const PRIMARY_AGE = story.careers.sweeney.at(-1)[0];
/** a comparison's series from Sweeney's endpoint on, or null if it never gets there */
const comparisonSeries = (key) =>
	clipSeries(story.careers[key], PRIMARY_AGE, Infinity);

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

/**
 * The scales both career states and the careerTrio entry choreography share, so
 * an animated frame lands exactly on the static layout. Domain comes from the
 * background cloud (every actor with a known career age) so both states share
 * one stable axis and the trajectory lines sit in the space the cloud fills —
 * matching the prototype's full-cloud scaling. The lines never exceed the
 * cloud, but Math.max guards it anyway.
 */
function careerFrame(nodes, w, h) {
	let ageMax = 0;
	let filmsMax = 0;
	for (const n of nodes) {
		if (n.careerAge == null) continue;
		ageMax = Math.max(ageMax, n.careerAge);
		filmsMax = Math.max(filmsMax, n.films);
	}
	for (const series of NAMED.map(([k]) => story.careers[k])) {
		ageMax = Math.max(ageMax, series.at(-1)[0]);
		filmsMax = Math.max(filmsMax, ...series.map((p) => p[1]));
	}
	const top = MARGIN + 8;
	const bottom = plotBottom(h);
	return {
		ageMax,
		filmsMax,
		bottom,
		xS: (a) => lin(a, 0, ageMax, MARGIN + 14, w - MARGIN - 6),
		yS: (f) => lin(f, 0, filmsMax, bottom, top) // more films = up
	};
}

function careerLayout(showCohort) {
	/** @type {import("../layout-shared.js").LayoutFn} */
	return function layoutCareer(nodes, w, h) {
		const attrs = new Float64Array(ATTR_SIZE);
		const trails = new Float64Array(TRAIL_SIZE);
		const trailDelays = new Float64Array(TRAIL_META.length);
		const { filmsMax, ageMax, bottom, xS, yS } = careerFrame(nodes, w, h);
		// every career trail parks on the end of Sweeney's line, so a line the
		// state doesn't draw is a collapsed point sitting on her dot: lines grow
		// out of her and retract back into her, in both directions and whether or
		// not the draw-on choreography plays. Parking them anywhere else (the plot
		// origin, y=0) makes the tween a translation across the chart instead.
		const forkX = xS(PRIMARY_AGE);
		const forkY = yS(story.careers.sweeney.at(-1)[1]);
		const namedIds = new Set(NAMED.map(([, id]) => id));
		for (const n of nodes) {
			if (namedIds.has(n.id)) {
				const key = NAMED.find(([, id]) => id === n.id)[0];
				const [age, films] = story.careers[key].at(-1);
				// blue marks all round; the comparisons read dimmed
				const alpha = key === "sweeney" ? 1 : COMPARISON_ALPHA;
				set(attrs, n.id, xS(age), yS(films), 5.5, BLUE, alpha);
			} else if (n.careerAge != null) {
				// background cloud: this actor's (career age, films) position
				set(attrs, n.id, xS(n.careerAge), yS(n.films), 2, CROWD, 0.22);
			} else {
				// no career age known — park hidden at the distance-scatter spot
				const [x, y] = scatterPosition(n, w, h);
				set(attrs, n.id, x, y, 2, CROWD, 0);
			}
		}
		TRAIL_META.forEach((_meta, t) => {
			const namedEntry = NAMED.find(([, , slot]) => slot === t);
			if (namedEntry) {
				const key = namedEntry[0];
				// comparisons diverge from Sweeney's endpoint; in the cohort state
				// they demote to cohort strength
				const series =
					key === "sweeney" ? story.careers[key] : comparisonSeries(key);
				const alpha =
					key === "sweeney"
						? 0.9
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
				// only paces the plain arrival (stepping back in from winBars)
				trailDelays[t] = 150;
			} else {
				collapseTrail(trails, t, forkX, forkY, 0);
			}
		});
		// nice even film-count steps (prototype tick strategy), no 0 tick
		const yStep = filmsMax <= 30 ? 5 : filmsMax <= 100 ? 20 : 50;
		const y = [];
		for (let f = yStep; f <= filmsMax; f += yStep) {
			y.push({ pos: yS(f), label: String(f) });
		}
		const axes = {
			x: [0, 10, 20, 30, 40, 50]
				.filter((a) => a <= ageMax)
				.map((a) => ({ pos: xS(a), label: String(a) })),
			xBase: bottom + 10,
			y
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
			BLUE,
			dotAlpha
		);
	};
	// where a future branches off her story: the end of Sweeney's own line
	const forkX = xS(PRIMARY_AGE);
	const forkY = yS(story.careers.sweeney.at(-1)[1]);
	return { growLine, rideTip, forkX, forkY };
}

// two beats: her story so far, then the futures branching off its end
const CAREER_ENTRY_MS = [1200, 1100];

/**
 * careerTrio entry choreography: Sweeney's red trajectory draws on from the
 * start of her career with her dot riding the tip, then the two comparison
 * lines unspool out of the point she lands on — so "here's her career so far"
 * and "here's where it could go from there" read as two beats instead of one
 * static chart. The final leg at e=1 reproduces the static layout call for call
 * (same monotone segments, same sample window, same alphas), so the settle has
 * nothing left to move. See STATE_ENTRY in states.js.
 */
function careerEntryFrames(nodes, w, h) {
	const { rideTip, forkX, forkY } = lineDrawer(nodes, w, h);
	// per named actor: the curve the line samples off, and the career-age span
	// the draw-on grows across
	const lines = NAMED.map(([key, id, slot]) => {
		const series =
			key === "sweeney" ? story.careers[key] : comparisonSeries(key);
		return {
			id,
			slot,
			segs: series ? monotoneSegments(series) : [],
			a0: series && series[0][0],
			a1: series && series.at(-1)[0],
			trailAlpha: key === "sweeney" ? 0.9 : COMPARISON_ALPHA
		};
	});
	const hero = lines[0];
	// a comparison whose series never reaches Sweeney's endpoint — or reaches it
	// only at its very last point — has no line to draw; it keeps the static
	// frame the seed already put it in
	const comparisons = lines.slice(1).filter((line) => line.segs.length);
	return (attrs, trails, phase, e) => {
		if (phase === 0) {
			rideTip(attrs, trails, hero, e, 1);
			// comparisons wait, invisible, at the point they'll branch from
			for (const line of comparisons) {
				collapseTrail(trails, line.slot, forkX, forkY, 0);
				set(attrs, line.id, forkX, forkY, 5.5, BLUE, 0);
			}
			return;
		}
		rideTip(attrs, trails, hero, 1, 1);
		for (const line of comparisons) {
			rideTip(attrs, trails, line, e, COMPARISON_ALPHA * e);
		}
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
 * nothing left to move. See STATE_ENTRY in states.js.
 */
function cohortEntryFrames(nodes, w, h) {
	const { growLine, forkX, forkY } = lineDrawer(nodes, w, h);
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
	yLabel: "Films"
};

export const states = {
	careerTrio: {
		layout: careerLayout(false),
		labels: [SWEENEY, DENIRO, CHASE],
		// the draw-on is authored for the forward arrival out of the Gen Z scatter;
		// stepping back into it from careerMany gets a plain tween
		revealFrom: ["scatterGenZ"],
		entry: {
			phases: CAREER_ENTRY_MS,
			frames: careerEntryFrames,
			// each name lands with the line that earns it, rather than labelling a
			// dot the reader hasn't been told anything about yet
			labelsAfter: [[SWEENEY], [DENIRO, CHASE]]
		},
		overlay: CAREER_OVERLAY
	},
	careerMany: {
		layout: careerLayout(true),
		// the comparisons have demoted into the cohort — only the hero is named
		labels: [SWEENEY],
		// the fan is authored to branch off the endpoint careerTrio just drew;
		// stepping back in from winBars gets a plain tween
		revealFrom: ["careerTrio"],
		entry: { phases: COHORT_ENTRY_MS, frames: cohortEntryFrames },
		overlay: CAREER_OVERLAY
	}
};
