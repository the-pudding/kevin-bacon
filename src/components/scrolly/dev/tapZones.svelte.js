// @ts-check
/**
 * Dev-only visibility flag for the tap halves' debug tint (TapZonesDev.svelte
 * toggles it; TapNav.svelte reads it to paint the halves). A module-level
 * rune rather than a prop: TapZonesDev sits fixed to the viewport for the
 * whole post while TapNav remounts on most step changes, so there is no
 * shared ancestor to thread a prop through. Persisted so a reload keeps the
 * tint on while debugging.
 */
import localStorage from "$utils/localStorage.js";

const STORE_KEY = "kb-tap-zones-visible";

export const tapZonesDev = $state({
	visible: localStorage.get(STORE_KEY) === true
});

export function toggleTapZones() {
	tapZonesDev.visible = !tapZonesDev.visible;
	localStorage.set(STORE_KEY, tapZonesDev.visible);
}
