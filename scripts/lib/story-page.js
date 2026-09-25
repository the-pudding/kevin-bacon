// What every browser-driven script (tween-sheet.js, a11y-scan.js) needs to put
// the story on screen: a dev server, and the wait for the story to be mounted.

/** An in-process Vite dev server on a free port. */
export async function startVite() {
	const { createServer } = await import("vite");
	const server = await createServer({
		server: { port: 0, host: "127.0.0.1" },
		logLevel: "error"
	});
	await server.listen();
	return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

/**
 * Resolves once the story has mounted: the next control exists (a tap half
 * stacked, an edge notch beside the prose — TapNav's, rendered after the
 * registry exists), the canvas is up and the fonts have loaded.
 * @param {import("playwright").Page} page
 */
export async function waitForStory(page) {
	await page.waitForSelector(".tap-half.next, .notch.next");
	await page.waitForSelector(".scrolly-visual canvas");
	await page.evaluate(() => document.fonts.ready);
}
