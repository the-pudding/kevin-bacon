<script>
	import { Button } from "bits-ui";
	let {
		children,
		class: className = "", // "circle"
		variant = "default", // "default" | "story" | "primary" | "secondary" | "ghost" | "link" | "outline" | "notch"
		size = "default", // "default" | "sm" | "lg" | "icon"
		href = undefined,
		disabled = false,
		...restProps
	} = $props();
</script>

<Button.Root
	{href}
	{disabled}
	class="bits-button {className}"
	{...restProps}
	data-size={size}
	data-variant={variant}
>
	{@render children?.()}
</Button.Root>
