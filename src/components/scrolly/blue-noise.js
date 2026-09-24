// The blue-noise scatter the dotted charts stand their dots on: every dot the
// same size, no two nearer than `spacing`, and no rows or columns for the eye
// to find. Seats are dealt by Poisson-disc sampling, so the space between them
// varies the way it does in a crowd. A lattice packs tighter, but it reads as a
// honeycomb. Shared by the hop-bands rows (layouts/hop-bands.js) and the rank
// bars that turn them on their side (rank-geometry.js), so the two steps'
// crowds are dealt the same way.
import PoissonDiskSampling from "poisson-disk-sampling";
import { dotHash } from "./nodes.js";

// a few boxes' seats, most recent last: a drag-resize strikes a new box on
// every frame, and there is no reason to keep them all
const SEAT_CACHE_SIZE = 8;
const seatCache = new Map();

/**
 * One fixed scatter of dot centres across a box, struck once per box and never
 * re-dealt, sorted along the axis the chart cuts its bands on.
 *
 * Sorted that way, a band is a run of consecutive seats: everything before a
 * cut is on one side of everything after it, so moving the later part on by a
 * band gap only pulls the two apart and no two dots can come to overlap across
 * a cut.
 *
 * Seeded off `dotHash` (a sine hash stepped by one repeats; see its note), so
 * the same box always gets the same seats: goldens hash the layouts built on
 * this, and the render layer caches them.
 * @param {{x: number, y: number, w: number, h: number}} box where the centres
 *   may fall, px
 * @param {number} spacing the least distance between two seats, centre to centre
 * @param {number} salt dotHash salt, so two charts' scatters differ
 * @param {0 | 1} axis 0 to sort left to right, 1 top to bottom
 * @returns {number[][]} [x, y] per seat
 */
export function blueNoiseSeats(box, spacing, salt, axis) {
	const key = `${box.x},${box.y},${box.w},${box.h},${spacing},${salt},${axis}`;
	if (!seatCache.has(key)) {
		let draw = 0;
		const sampler = new PoissonDiskSampling(
			{ shape: [box.w, box.h], minDistance: spacing },
			() => dotHash(draw++, salt)
		);
		const other = 1 - axis;
		const seats = sampler
			.fill()
			.map(([x, y]) => [box.x + x, box.y + y])
			.sort((a, b) => a[axis] - b[axis] || a[other] - b[other]);
		seatCache.set(key, seats);
		if (seatCache.size > SEAT_CACHE_SIZE)
			seatCache.delete(seatCache.keys().next().value);
	}
	return seatCache.get(key);
}
