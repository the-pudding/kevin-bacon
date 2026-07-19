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
	clipSeries
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

function careerLayout(showCohort) {
	/** @type {import("../layout-shared.js").LayoutFn} */
	return function layoutCareer(nodes, w, h) {
		const attrs = new Float64Array(ATTR_SIZE);
		const trails = new Float64Array(TRAIL_SIZE);
		const trailDelays = new Float64Array(TRAIL_META.length);
		const named = [
			["sweeney", SWEENEY, SWEENEY_SLOT],
			["deniro", DENIRO, DENIRO_SLOT],
			["chase", CHASE, CHASE_SLOT]
		];
		// where Sweeney's story stops — comparison/cohort lines start here
		const primaryAge = story.careers.sweeney.at(-1)[0];
		let ageMax = 0;
		let filmsMax = 0;
		const consider = [
			...named.map(([k]) => story.careers[k]),
			...(showCohort ? story.careers.cohort : [])
		];
		for (const series of consider) {
			ageMax = Math.max(ageMax, series.at(-1)[0]);
			filmsMax = Math.max(filmsMax, ...series.map((p) => p[1]));
		}
		const top = MARGIN + 8;
		const bottom = plotBottom(h);
		const xS = (a) => lin(a, 0, ageMax, MARGIN + 14, w - MARGIN - 6);
		const yS = (f) => lin(f, 0, filmsMax, bottom, top); // more films = up
		const namedIds = new Set(named.map(([, id]) => id));
		for (const n of nodes) {
			if (!namedIds.has(n.id)) {
				const [x, y] = scatterPosition(n, w, h);
				set(attrs, n.id, x, y, 2, CROWD, 0);
				continue;
			}
			const key = named.find(([, id]) => id === n.id)[0];
			const [age, films] = story.careers[key].at(-1);
			// blue marks all round; the comparisons read dimmed
			const alpha = key === "sweeney" ? 1 : COMPARISON_ALPHA;
			set(attrs, n.id, xS(age), yS(films), 5.5, BLUE, alpha);
		}
		TRAIL_META.forEach((_meta, t) => {
			const namedEntry = named.find(([, , slot]) => slot === t);
			if (namedEntry) {
				const key = namedEntry[0];
				// comparisons diverge from Sweeney's endpoint; in the cohort state
				// they demote to cohort strength
				const series =
					key === "sweeney"
						? story.careers[key]
						: clipSeries(story.careers[key], primaryAge, Infinity);
				const alpha =
					key === "sweeney"
						? 0.9
						: showCohort
							? COHORT_ALPHA
							: COMPARISON_ALPHA;
				if (series) setTrail(trails, t, series, xS, yS, alpha);
				else collapseTrail(trails, t, xS(primaryAge), yS(0), 0);
				trailDelays[t] = 150;
			} else if (
				showCohort &&
				t >= COHORT_SLOT &&
				t < COHORT_SLOT + story.careers.cohort.length
			) {
				const series = clipSeries(
					story.careers.cohort[t - COHORT_SLOT],
					primaryAge,
					Infinity
				);
				if (series) setTrail(trails, t, series, xS, yS, COHORT_ALPHA);
				else collapseTrail(trails, t, xS(primaryAge), yS(0), 0);
				trailDelays[t] = 300 + (t - COHORT_SLOT) * 25;
			} else {
				collapseTrail(trails, t, MARGIN + 14, bottom, 0);
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

const CAREER_OVERLAY = {
	xLabel: "Career age (years)",
	yLabel: "Films"
};

export const states = {
	careerTrio: {
		layout: careerLayout(false),
		labels: [SWEENEY, DENIRO, CHASE],
		overlay: CAREER_OVERLAY
	},
	careerMany: {
		layout: careerLayout(true),
		// the comparisons have demoted into the cohort — only the hero is named
		labels: [SWEENEY],
		overlay: CAREER_OVERLAY
	}
};
