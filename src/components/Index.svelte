<script>
	import Scrolly from "$components/helpers/Scrolly.svelte";

	let value = $state();
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
	<section id="scrolly">
		<div class="scrolly-layout">
			<div class="scrolly-visual">
				<p>Step {value ?? "–"}</p>
			</div>
			<div class="scrolly-steps">
				<Scrolly bind:value>
					<div class="step" class:active={value === 0}>
						<p>
							Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
							tempor incididunt ut labore et dolore magna aliqua.
						</p>
					</div>

					<div class="step" class:active={value === 1}>
						<p>
							Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris
							nisi ut aliquip ex ea commodo consequat.
						</p>
					</div>

					<div class="step" class:active={value === 2}>
						<p>
							Duis aute irure dolor in reprehenderit in voluptate velit esse cillum
							dolore eu fugiat nulla pariatur.
						</p>
					</div>

					<div class="step" class:active={value === 3}>
						<p>
							Excepteur sint occaecat cupidatat non proident, sunt in culpa qui
							officia deserunt mollit anim id est laborum.
						</p>
					</div>

					<div class="step" class:active={value === 4}>
						<p>
							Sed ut perspiciatis unde omnis iste natus error sit voluptatem
							accusantium doloremque laudantium, totam rem aperiam.
						</p>
					</div>
				</Scrolly>
			</div>
		</div>
	</section>
</svelte:boundary>

<style>
	#scrolly {
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
