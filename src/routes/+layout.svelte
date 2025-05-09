<script>
	import '../app.css'; // Global styles, Tailwind

	let { children } = $props();
</script>

<div class="app-shell">
	{@render children()}
</div>

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100vh; /* Use viewport height for full screen apps */
        /* Or height: 100% if html, body are also 100% and it's not nested weirdly */
		background-color: #f9f9f9; /* Match body background if needed here */
	}

    /* If you use this .app-shell, you might adjust/remove the global CSS:
       :global(body > div) { height: 100%; display: flex; ... }
       And ensure html, body are 100% height.
       Using min-height: 100vh on app-shell is often most robust for full page apps.
    */
</style>