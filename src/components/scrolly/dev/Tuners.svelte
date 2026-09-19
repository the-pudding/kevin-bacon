<script>
	// @ts-check
	/**
	 * The race chart's dev tuners, mounted together so Index pulls in one chunk
	 * under `import.meta.env.DEV`. Each renders nothing until story.race.cam
	 * exists, i.e. off the race chapter.
	 */
	import RaceYBandDev from "./RaceYBandDev.svelte";
	import RacePxPerYearDev from "./RacePxPerYearDev.svelte";
	import RaceSpeedDev from "./RaceSpeedDev.svelte";
</script>

<RaceYBandDev />
<RacePxPerYearDev />
<RaceSpeedDev />
