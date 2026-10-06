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

	// the listbox's own id, for the input's aria-controls (a combobox role
	// requires it) — bits-ui sets neither
	const listId = $derived(`${id}-list`);

	let open = $state(false);
	/** @type {HTMLInputElement | null} */
	let inputRef = $state(null);

	// Opt-in: ActorSearch's box is a reader-initiated click on the search
	// glyph, so focusing it is following the click. GuessRank's box appears on
	// its own as its step loads, where the same focus would steal keyboard/
	// scroll from a reader who never asked for the input — so it opts in only
	// on the remount after a pick, when the reader was already typing in it.
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
		aria-controls={listId}
		class={`bits-combobox ${className}`.trim()}
		oninput={(e) => onsearch?.(e.currentTarget.value)}
	/>
	<Combobox.Portal>
		<!-- Rendered through `child` for the id alone: bits-ui gives the id prop
		     to its floating layer and leaves the listbox element without one, so
		     the input's aria-controls would point at nothing.

		     The scrolling viewport is deliberately NOT a tab stop, though axe's
		     scrollable-region-focusable asks for one when the list overflows: a
		     focusable child is not allowed inside a listbox (aria-required-
		     children), and the list is already scrolled from the keyboard — the
		     arrow keys in the input move the highlight (aria-activedescendant)
		     and bits-ui keeps it in view. -->
		<Combobox.Content aria-label="Matches" sideOffset={4}>
			{#snippet child({ props, wrapperProps })}
				<div {...wrapperProps}>
					<div {...props} id={listId}>
						<Combobox.Viewport>
							{#each items as item (item.value)}
								<Combobox.Item value={item.value} label={item.label}>
									{item.label}
								</Combobox.Item>
							{:else}
								<span data-combobox-empty>{emptyText}</span>
							{/each}
						</Combobox.Viewport>
					</div>
				</div>
			{/snippet}
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>
