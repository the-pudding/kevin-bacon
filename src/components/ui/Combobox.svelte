<script>
	// Typeahead over a list the caller filters. Same shape as Select.svelte — a
	// flat `items` array, a $bindable value, `class` merged onto a `bits-*` root
	// and no scoped styles — with one addition: `onsearch`, called with the
	// input's text so the caller can narrow `items`. Filtering is not done here
	// because the callers search different pools by different rules (see
	// scrolly/search.js), and a component that owned the match would have to own
	// the pool too.
	//
	// The popup is PORTALLED, which is load-bearing in the story rather than
	// cosmetic: its one caller lives in a step card whose measured height is what
	// half the canvas's bottom clearances are taken off, so a list that opened in
	// flow would walk the prose and the x-axis title up the screen (see
	// notes/design/interactions.md rule 1). Out of the card, it also escapes the
	// step wrapper's stacking context, which is what stops a z-index lift from
	// clearing the tap halves anywhere else in the story.
	//
	// Combobox.Content/Item/Viewport are re-exports of Select's, so ui.select.css
	// already styles the popup; ui.combobox.css only adds the input.
	import { Combobox, useId } from "bits-ui";

	let {
		id = useId(),
		value = $bindable(),
		items = [], // Array of { value, label }
		placeholder = "Search…",
		emptyText = "No matches",
		disabled = false,
		onsearch = undefined,
		autofocus = false,
		class: className = "",
		...restProps
	} = $props();

	let open = $state(false);
	/** @type {HTMLInputElement | null} */
	let inputRef = $state(null);

	// Opt-in: ActorSearch's box is a reader-initiated click on the search
	// glyph, so focusing it is following the click. GuessRank's box appears on
	// its own as each quiz question loads, where the same focus would steal
	// keyboard/scroll from a reader who never asked for the input.
	$effect(() => {
		if (autofocus) inputRef?.focus();
	});
</script>

<Combobox.Root
	{id}
	bind:value
	bind:open
	{disabled}
	type="single"
	{...restProps}
>
	<Combobox.Input
		{id}
		bind:ref={inputRef}
		{placeholder}
		aria-label={placeholder}
		class={`bits-combobox ${className}`.trim()}
		oninput={(e) => onsearch?.(e.currentTarget.value)}
	/>
	<Combobox.Portal>
		<Combobox.Content sideOffset={4}>
			<Combobox.Viewport>
				{#each items as item (item.value)}
					<Combobox.Item value={item.value} label={item.label}>
						{item.label}
					</Combobox.Item>
				{:else}
					<span data-combobox-empty>{emptyText}</span>
				{/each}
			</Combobox.Viewport>
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>
