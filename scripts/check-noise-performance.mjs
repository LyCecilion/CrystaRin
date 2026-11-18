// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import sharp from "sharp";

// Run against `pnpm preview:noise --port 4326` after a production build.
const base = process.env.BASE_URL;
if (!base) throw new Error("Set BASE_URL to the production noise preview URL (not the dev server).");
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
	headless: true,
	args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-experimental-web-platform-features"],
});
try {
	const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
	const page = await context.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	// Observe the short opening in-page, rather than racing two seconds of CDP calls.
	await page.addInitScript(() => {
		window.openingObservation = null;
		window.continuationObservation = null;
		window.noiseFadeSamples = [];
		window.noiseFadeComplete = false;
		const observer = new MutationObserver(records => {
			const root = document.querySelector("#noise-experience");
			if (root?.dataset.phase === "opening" && !window.openingObservation) {
				const at = document.querySelector("#noise-at");
				window.openingObservation = { visible: at.checkVisibility(), disabled: at.disabled };
			}
			if (root?.dataset.phase === "prelude") {
				if (window.continuationObservation === null && Number(root.dataset.signalTime) !== 2
					&& records.some(record => record.attributeName === "data-signal-time")) {
					window.continuationObservation = Number(root.dataset.signalTime);
				}
				const canvas = document.querySelector("#noise-difficulty-canvas");
				const opacity = Number(canvas.style.opacity || 1);
				if (opacity > 0 && opacity < 1 && !canvas.hidden) window.noiseFadeSamples.push(opacity);
				if (canvas.hidden) { window.noiseFadeComplete = true; observer.disconnect(); }
			}
		});
		observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-phase", "data-signal-time", "style", "hidden"] });
		window.quietObservation = null;
		window.quietCurtain = null;
		window.performanceObservation = null;
		let quietSince = null;
		let quietVisible = 0;
		const stageObserver = new MutationObserver(() => {
			const root = document.querySelector("#noise-experience");
			if (!root) return;
			const now = performance.now();
			if (root.dataset.phase === "quiet") {
				if (quietSince === null) quietSince = now;
				if (!window.quietCurtain) {
					const curtain = document.querySelector("#noise-curtain");
					window.quietCurtain = {
						visible: curtain ? !curtain.hidden : false,
						opacity: curtain ? getComputedStyle(curtain).opacity : null,
					};
				}
				if (!window.quietObservation) {
					const audio = document.querySelector("audio");
					window.quietObservation = { paused: audio.paused, time: audio.currentTime, path: location.pathname };
				}
			} else if (quietSince !== null) {
				quietVisible += now - quietSince;
				quietSince = null;
			}
			if (root.dataset.phase === "performance") {
				window.performanceObservation = { quietVisible };
				stageObserver.disconnect();
			}
		});
		stageObserver.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-phase"] });
	});
	await page.goto(base);
	await page.waitForSelector('#noise-check-viewport[data-ok="false"]');
	assert.equal(await page.locator("#noise-status").textContent(), "BLOCKED", "a failing check must never leave READY on the gate");
	assert.equal(await page.locator("#noise-selection").isVisible(), false, "small windows must not enter selection");
	assert.equal(await page.locator("#noise-dismiss").count(), 0, "production must not expose the development browse entry");
	assert.equal(await page.locator("#noise-check-api").getAttribute("data-ok"), "true", "this regression requires Chrome HTML-in-Canvas support");
	await page.route("**/*WireNoise*", route => route.abort());
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.locator("#noise-retry").waitFor({ state: "visible" });
	await page.unroute("**/*WireNoise*");
	await page.locator("#noise-retry").click();
	await page.waitForFunction(() => {
		const phase = document.querySelector("#noise-experience").dataset.phase;
		return phase === "opening" || phase === "selection" || !document.querySelector("#noise-enable-audio").hidden;
	});
	if (await page.locator("#noise-enable-audio").isVisible()) await page.locator("#noise-enable-audio").click();
	await page.waitForSelector('#noise-experience[data-phase="selection"]');
	assert.deepEqual(await page.evaluate(() => window.openingObservation), { visible: false, disabled: true }, "AT cannot skip the first two seconds");
	assert.equal(await page.locator("#noise-at").isEnabled(), true);
	assert.equal(await page.locator("#noise-experience").getAttribute("data-signal-time"), "2");
	const frozenSignal = await page.locator("#noise-signal-canvas").evaluate(canvas => canvas.toDataURL());
	const noisyFrame = await page.screenshot();
	await page.evaluate(async () => {
		const start = performance.now();
		while (performance.now() - start < 1000) {
			const { promise, resolve } = Promise.withResolvers();
			requestAnimationFrame(resolve);
			await promise;
		}
	});
	assert.equal(await page.locator("#noise-signal-canvas").evaluate(canvas => canvas.toDataURL()), frozenSignal, "SIGNAL must remain frozen at two seconds");
	assert.equal(await page.locator("#noise-experience").getAttribute("data-signal-time"), "2");
	assert.notDeepEqual(await page.screenshot(), noisyFrame, "noise must continue animating while SIGNAL waits for AT");
	const frameStyle = await page.locator("#noise-at").evaluate(button => {
		const style = getComputedStyle(button);
		return { border: style.borderStyle, outline: style.outlineStyle, shadow: style.boxShadow };
	});
	assert.deepEqual(frameStyle, { border: "none", outline: "none", shadow: "none" });
	console.log("size gate, resource retry, paused SIGNAL with live noise and frameless AT: passed");

	const lateAssets = [];
	const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
	const navigations = [];
	page.on("request", request => {
		if (request.url().startsWith("http") && new URL(request.url()).pathname.startsWith("/_astro/")) lateAssets.push(request.url());
		if (request.resourceType() === "document") navigations.push(request.url());
	});
	await context.setOffline(true);
	await page.locator("#noise-at").click();
	await page.waitForSelector('#noise-experience[data-phase="prelude"]');
	await page.waitForFunction(() => window.continuationObservation !== null);
	const continuedAt = await page.evaluate(() => window.continuationObservation);
	assert.ok(continuedAt >= 2 && continuedAt < 3, "AT must continue immediately after two seconds, not replay the opening");
	await page.waitForFunction(() => window.noiseFadeComplete);
	assert.ok(await page.evaluate(() => window.noiseFadeSamples.length > 0), "noise must pass through visible intermediate opacity while AT continues");
	assert.equal(await page.locator("#noise-difficulty-canvas").isVisible(), false);
	await page.waitForSelector('#noise-experience[data-phase="quiet"]');
	assert.deepEqual(await page.evaluate(() => window.quietObservation), { paused: true, time: 0, path: "/performance/" });
	assert.deepEqual(await page.evaluate(() => window.quietCurtain), { visible: true, opacity: "1" }, "the postlude must open on pure black, not on the blog");
	assert.equal(new URL(page.url()).pathname, "/performance/");
	assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin, "the stage URL must change without reloading or losing preloaded resources");
	assert.equal(context.pages().length, 1, "the transition must remain in the same tab");
	await page.waitForFunction(() => {
		const curtain = document.querySelector("#noise-curtain");
		if (!curtain || curtain.hidden) return false;
		const opacity = Number(getComputedStyle(curtain).opacity);
		return opacity > 0.05 && opacity < 0.95;
	}, null, { timeout: 30000 });
	await page.waitForSelector('#noise-experience[data-phase="performance"]', { timeout: 30000 });
	assert.equal(await page.locator("#noise-curtain").isVisible(), false, "the exposure must be complete before the show");
	const quietVisible = await page.evaluate(() => window.performanceObservation.quietVisible);
	assert.ok(quietVisible >= 8800 && quietVisible < 13000, `the black aftermath, exposure and five quiet seconds must all count as visible stage time; got ${quietVisible}ms`);
	assert.deepEqual(navigations, [], "the handoff must not trigger another document request");
	assert.match(await page.locator("audio").getAttribute("src"), /^blob:/, "the song must play from fully fetched local bytes");
	assert.equal(await page.locator("#noise-toolbar").isVisible(), false);
	assert.equal(await page.locator(".noise-postfx-launch").count(), 0);
	await page.waitForFunction(() => document.querySelector("audio").currentTime > 1);
	console.log("offline same-document /performance/ handoff, black postlude, exposure and five quiet seconds: passed");

	// The show is never paused by a failing viewport: only the stage layers withdraw.
	const beforeResize = await page.locator("audio").evaluate(audio => audio.currentTime);
	await page.setViewportSize({ width: 800, height: 600 });
	await page.waitForTimeout(1500);
	const afterResize = await page.locator("audio").evaluate(audio => audio.currentTime);
	assert.ok(afterResize > beforeResize + 0.8, `a failing viewport must keep the song running; ${beforeResize} -> ${afterResize}`);
	assert.equal(await page.locator("#noise-experience").getAttribute("data-phase"), "performance");
	assert.equal(await page.locator("audio").evaluate(audio => audio.paused), false);
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.waitForFunction(target => document.querySelector("audio").currentTime > target, afterResize + 1, { timeout: 30000 });
	console.log("failing viewport keeps the song running: passed");

	// No seeking or playback-rate acceleration: exercise the real song-end event.
	await page.waitForSelector('#noise-experience[data-phase="ended"]', { timeout: 190000 });
	const pixels = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
	assert.equal(pixels.some(value => value !== 0), false, "every visible pixel must be black at the end");
	assert.equal(await page.locator("audio").evaluate(audio => audio.paused && !audio.getAttribute("src")), true);
	assert.equal(await page.locator("#noise-native-canvas, #noise-native-hold, [data-noise-dom-overlay]").count(), 0);
	assert.deepEqual(lateAssets, [], "the prepared performance must not request further compiled assets");
	assert.deepEqual(errors, []);
	console.log("natural offline completion, pure black and released rendering/audio: passed");
	await context.setOffline(false);
	const refreshed = await page.reload();
	assert.equal(refreshed.status(), 200, "/performance/ must be a real refreshable static route");
	await page.locator("#noise-start:not([disabled])").waitFor({ state: "visible" });
	assert.equal(await page.locator("#noise-experience").getAttribute("data-entry"), "performance");
	assert.equal(await page.locator("#noise-experience").getAttribute("data-phase"), "checking", "refresh must recheck and prepare resources before playback");
	assert.equal(await page.locator("audio").evaluate(audio => audio.paused && audio.currentTime === 0), true);
	await page.locator("#noise-start").click();
	await page.waitForSelector('#noise-experience[data-phase="quiet"]');
	await page.waitForSelector('#noise-experience[data-phase="performance"]');
	console.log("refreshable direct performance entry with readiness gate and quiet stage: passed");
} finally {
	await browser.close();
}
