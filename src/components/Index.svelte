<script>
	import { getContext } from "svelte";
	import Footer from "$components/Footer.svelte";
	import Scrolly from "$components/helpers/Scrolly.svelte";

	// const copy = getContext("copy");
	// const data = getContext("data");

	let value = $state();

	const steps = [
		"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
		"Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
		"Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
		"Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
		"Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam."
	];
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
	<section id="scrolly-demo">
		<div class="scrolly-layout">
			<div class="scrolly-visual">
				<p>Step {value ?? "–"}</p>
			</div>
			<div class="scrolly-steps">
				<Scrolly bind:value>
					{#each steps as text, i}
						{@const active = value === i}
						<div class="step" class:active>
							<p>{text}</p>
						</div>
					{/each}
				</Scrolly>
			</div>
		</div>
	</section>

	<!-- <Footer recirc={true} /> -->
</svelte:boundary>

<style>
	#scrolly-demo {
		max-width: 700px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.scrolly-layout {
		display: flex;
		flex-direction: column;
	}

	.scrolly-visual {
		position: sticky;
		top: 0;
		height: 50vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg-secondary, #eee);
		border: 1px solid var(--color-border);
		font-size: 2rem;
		font-weight: bold;
		z-index: 0;
	}

	.scrolly-steps {
		margin-top: -50vh;
		z-index: 1;
		position: relative;
	}

	.step {
		min-height: 60vh;
		display: flex;
		align-items: center;
		padding: 1rem;
		opacity: 0.3;
		transition: opacity 0.2s ease;
	}

	.step p {
		background: var(--color-bg);
		padding: 1.5rem;
		border-radius: var(--border-radius, 4px);
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
	}

	.step.active {
		opacity: 1;
	}
</style>
