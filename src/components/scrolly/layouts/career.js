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
	RED,
	BLUE,
	YELLOW,
	SWEENEY,
	DENIRO,
	CHASE,
	SWEENEY_SLOT,
	DENIRO_SLOT,
	CHASE_SLOT,
	COHORT_SLOT,
	TRAIL_META,
	setTrail,
	collapseTrail
} from "../layout-shared.js";

// ---------------------------------------------------------------------------
// Career lines (Future chapter): cumulative films by career age.
// ---------------------------------------------------------------------------

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
			const rgb = key === "sweeney" ? RED : key === "deniro" ? BLUE : YELLOW;
			set(attrs, n.id, xS(age), yS(films), 5.5, rgb, 1);
		}
		TRAIL_META.forEach((_meta, t) => {
			const namedEntry = named.find(([, , slot]) => slot === t);
			if (namedEntry) {
				setTrail(trails, t, story.careers[namedEntry[0]], xS, yS, 0.9);
				trailDelays[t] = 150;
			} else if (
				showCohort &&
				t >= COHORT_SLOT &&
				t < COHORT_SLOT + story.careers.cohort.length
			) {
				setTrail(trails, t, story.careers.cohort[t - COHORT_SLOT], xS, yS, 0.2);
				trailDelays[t] = 300 + (t - COHORT_SLOT) * 25;
			} else {
				collapseTrail(trails, t, MARGIN + 14, bottom, 0);
			}
		});
		const notes = [
			{
				x: xS(15) + 10,
				y: yS(16) - 40,
				strong: true,
				text: "all three: 16 films by career age 15"
			}
		];
		const axes = {
			x: [0, 10, 20, 30, 40, 50]
				.filter((a) => a <= ageMax)
				.map((a) => ({ pos: xS(a), label: String(a) })),
			xBase: bottom + 10,
			y: [0, Math.round(filmsMax / 2), filmsMax].map((f) => ({
				pos: yS(f),
				label: String(f)
			}))
		};
		return { attrs, trails, trailDelays, notes, axes };
	};
}

const CAREER_OVERLAY = {
	caption: "Films by career age",
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
		labels: [SWEENEY, DENIRO, CHASE],
		overlay: CAREER_OVERLAY
	}
};
