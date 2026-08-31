<script>
	// A term in running prose, dotted-underlined, that opens a panel of detail —
	// the "want the receipts?" affordance. Deliberately generic: the term itself is
	// `children`, the detail is the `info` snippet, so the same component carries a
	// route's films at step 1 and a note about the corpus later on.
	//
	// Two presentations of one thing. Wide enough for a tethered card and it is a
	// popover, so whatever the term is talking about stays visible behind it; on a
	// phone, where a tethered card has nowhere to go, it is a bottom sheet.
	// Dialog.Content brings the focus trap and scroll lock the sheet needs.
	import { Dialog, Popover } from "bits-ui";
	import { MediaQuery } from "svelte/reactivity";
	import X from "@lucide/svelte/icons/x";

	let {
		children, // the underlined term, inline in the sentence
		info, // snippet: the panel's body
		title = undefined, // optional panel heading and accessible name. Omit it
		// where the term itself already says what the panel is about — a heading
		// that only restates the underlined words is noise above the close button
		open = $bindable(false),
		class: className = "",
		...restProps
	} = $props();

	// same phone breakpoint PairQuiz lays out against. The page is prerendered, so
	// the server has no viewport to measure — it renders the popover's trigger,
	// which is the same <button> either way, and the real query resolves on hydrate
	const sheet = new MediaQuery("(max-width: 30rem)", false);
</script>

<!-- trigger and body are authored once and rendered into whichever primitive is
     active, so the two presentations cannot drift apart -->
{#snippet term()}{@render children?.()}{/snippet}
{#snippet body()}{@render info?.()}{/snippet}

{#if sheet.current}
	<Dialog.Root bind:open>
		<Dialog.Trigger class="bits-infoterm {className}" {...restProps}>
			{@render term()}
		</Dialog.Trigger>
		<Dialog.Portal>
			<Dialog.Overlay data-infoterm-scrim />
			<Dialog.Content data-infoterm-panel data-infoterm-sheet>
				<header data-infoterm-head>
					{#if title}
						<Dialog.Title data-infoterm-title>{title}</Dialog.Title>
					{/if}
					<Dialog.Close data-infoterm-close aria-label="Close">
						<X />
					</Dialog.Close>
				</header>
				{@render body()}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{:else}
	<Popover.Root bind:open>
		<Popover.Trigger class="bits-infoterm {className}" {...restProps}>
			{@render term()}
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content
				data-infoterm-panel
				side="top"
				sideOffset={6}
				collisionPadding={12}
				aria-label={title}
			>
				<header data-infoterm-head>
					{#if title}
						<p data-infoterm-title>{title}</p>
					{/if}
					<Popover.Close data-infoterm-close aria-label="Close">
						<X />
					</Popover.Close>
				</header>
				{@render body()}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{/if}
