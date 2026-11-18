// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

// Real browser layout/paint, bundled production adapter; no Astro server or fake DOM.
const bundle = await build({
	entryPoints: [fileURLToPath(new URL("../src-noise/engine/dom-contamination.ts", import.meta.url))],
	bundle: true, write: false, format: "iife", globalName: "domRegression", outfile: "dom-regression.js",
});
const rasterBundle = await build({
	entryPoints: [fileURLToPath(new URL("../src-noise/engine/dom-raster.ts", import.meta.url))],
	bundle: true, write: false, format: "iife", globalName: "rasterRegression",
});
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
	headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
	await page.setContent(`<!doctype html><title>DOM contamination regression</title>
		<style>
		* { box-sizing: border-box } body { margin: 0; font: 24px/32px Arial; background: white; color: #222 }
		[data-noise-native-viewport] { position: relative; width: 800px; height: 600px }
		.post-card-wrapper { position: absolute; left: 40px; top: 40px; width: 600px; height: 400px; border: 1px solid #aaa; border-radius: 16px }
		.post-card-content { position: absolute; inset: 0 }
		.post-card-title { position: absolute; left: 20px; top: 20px; width: 260px; height: 80px; margin: 0; font: bold 28px/36px Arial }
		.description { position: absolute; left: 20px; top: 200px; width: 260px; height: 64px }
		.cover { position: absolute; left: 330px; top: 20px; width: 160px; height: 100px; overflow: hidden }
		img { width: 200px; height: 150px; object-fit: cover; display: block }
		#top-row { position: absolute; left: 700px; top: 0; width: 100px; height: 60px }
		.dropdown { opacity: 0; position: absolute; left: -650px; top: 520px; width: 100px }
		</style>
		<div data-noise-native-viewport>
			<div class="post-card-wrapper"><div class="post-card-content">
				<h2 class="post-card-title">A wrapped title<br><span>keeps its layout</span></h2>
				<div class="description">Untouched text<br>stays quiet.</div>
			</div><div class="cover"><img alt="Fixture" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='40'%3E%3Cpath fill='%23e58a32' d='M0 0h40v40H0z'/%3E%3Cpath fill='%233b97bc' d='M40 0h40v40H40z'/%3E%3C/svg%3E"></div></div>
			<nav id="top-row"><div class="dropdown"><a href="#">Hidden link</a></div></nav>
		</div>`);
	await page.addStyleTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".css")).text });
	await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
	await page.addScriptTag({ content: rasterBundle.outputFiles[0].text });
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all([...document.images].map(image => image.decode()));
		window.adapter = domRegression.mountDomContamination();
		window.original = document.querySelector("[data-noise-native-viewport]").innerHTML;
		window.titleRect = document.querySelector(".post-card-title").getBoundingClientRect().toJSON();
	});
	const rasterPixels = await page.evaluate(async () => {
		const title = document.querySelector(".post-card-title");
		const text = rasterRegression.createDomRaster(title, "text", 260, 80);
		text.draw(1, 0, 1, 180, 120, 7);
		const pixels = text.canvas.getContext("2d").getImageData(0, 0, 260, 80).data;
		const colors = { cyan: 0, magenta: 0, yellow: 0, lowerLine: 0 };
		for (let index = 0; index < pixels.length; index += 4) {
			const [r, g, b, a] = pixels.subarray(index, index + 4);
			if (a < 100) continue;
			if (r < 150 && g > 170 && b > 170) colors.cyan++;
			if (r > 160 && b > 80 && r > g * 1.4) colors.magenta++;
			if (r > 180 && g > 140 && b < 130) colors.yellow++;
			if (Math.floor(index / 4 / 260) >= 36) colors.lowerLine++;
		}
		const corrupted = text.canvas.toDataURL();
		text.draw(1, 0, 1, 180, 120, 7);
		const stable = text.canvas.toDataURL() === corrupted;
		text.draw(1, 1, 1, 180, 120, 7);
		const reconstructed = text.canvas.toDataURL() !== corrupted;
		text.dispose();
		const image = document.querySelector("img").cloneNode();
		document.body.append(image);
		await image.decode();
		const sampleImage = (fit, position) => {
			image.style.objectFit = fit;
			image.style.objectPosition = position;
			const raster = rasterRegression.createDomRaster(image, "image", 200, 150);
			raster.draw(0, 0, 0, 0, 0, 7);
			const context = raster.canvas.getContext("2d");
			const middle = [...context.getImageData(100, 75, 1, 1).data];
			const top = [...context.getImageData(100, 0, 1, 1).data];
			raster.dispose();
			return { middle, top };
		};
		const left = sampleImage("cover", "left center");
		const right = sampleImage("cover", "right center");
		const contain = sampleImage("contain", "center");
		image.remove();
		return { colors, stable, reconstructed, left, right, contain };
	});
	for (const [color, count] of Object.entries(rasterPixels.colors)) {
		assert.ok(count > 10, `shared raster must retain visible ${color} pixels`);
	}
	assert.equal(rasterPixels.stable, true, "unchanged song state must preserve identical raster pixels");
	assert.equal(rasterPixels.reconstructed, true, "healing must reconstruct readable glyphs even within the same glyph tick");
	assert.deepEqual(rasterPixels.left.middle, [229, 138, 50, 255], "cover must preserve left-aligned source cropping");
	assert.deepEqual(rasterPixels.right.middle, [59, 151, 188, 255], "cover must preserve right-aligned source cropping");
	assert.equal(rasterPixels.contain.top[3], 0, "contain must retain its transparent letterbox instead of stretching the source");
	const titleClip = { x: 60, y: 60, width: 260, height: 80 };
	const quietClip = { x: 60, y: 240, width: 260, height: 64 };
	const beforeTitle = await page.screenshot({ clip: titleClip });
	const beforeQuiet = await page.screenshot({ clip: quietClip });
	const beforeHidden = await page.screenshot({ clip: { x: 40, y: 520, width: 200, height: 50 } });
	await page.evaluate(() => {
		adapter.prepare(12);
		const active = (cx, cy, width, height) => ({ cx, cy, width, height, rotation: 0, phase: "active", opacity: 1, subtract: false });
		adapter.sample([active(140, 140, 180, 250), active(450, 120, 200, 200)], { left: 0, top: 0, width: 800, height: 600 }, 12, false);
		adapter.infectPath(60, 540, 140, 540, 1);
		adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 12, false);
	});
	assert.notDeepEqual(await page.screenshot({ clip: titleClip }), beforeTitle, "contact must visibly paint a text echo");
	assert.deepEqual(await page.screenshot({ clip: quietClip }), beforeQuiet, "untouched text must stay pixel-identical");
	assert.deepEqual(await page.screenshot({ clip: { x: 40, y: 520, width: 200, height: 50 } }), beforeHidden, "hidden dropdowns must not leak ghosts");
	const direct = await page.evaluate(() => {
		const paint = document.querySelector('[data-noise-dom-patch="image"]');
		const style = getComputedStyle(paint);
		return {
			titleRect: document.querySelector(".post-card-title").getBoundingClientRect().toJSON(),
			hiddenState: document.querySelector(".dropdown a").getAttribute("data-noise-dom-state"),
			clip: style.clipPath,
			inert: document.querySelector("[data-noise-dom-overlay]").inert,
		};
	});
	assert.deepEqual(direct.titleRect, await page.evaluate(() => titleRect), "multiline text geometry must not move");
	assert.equal(direct.hiddenState, null, "hidden ancestors cannot acquire contamination");
	assert.equal(direct.inert, true, "ghosts must not duplicate keyboard interaction");
	assert.match(direct.clip, /^inset\(.+50px/, "cover paint must clip to its shorter overflow-hidden parent");
	await page.evaluate(() => {
		adapter.reset(); adapter.prepare(40);
		const stage = { left: 0, top: 0, width: 800, height: 600 };
		adapter.sample([], stage, 40, false);
		adapter.infectPath(80, 260, 240, 260, 1);
		adapter.sample([], stage, 40 + 1 / 60, true);
	});
	assert.equal(await page.locator(".post-card-content > .description").getAttribute("data-noise-dom-state"), "residual", "between-paint travel must leave local residue");
	assert.equal(await page.locator(".post-card-content > .post-card-title").getAttribute("data-noise-dom-state"), null, "a different element must not inherit the brush");
	const paused = await page.screenshot({ clip: quietClip });
	await page.evaluate(() => {
		for (let i = 0; i < 100; i++) adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 40 + 1 / 60, false);
	});
	assert.deepEqual(await page.screenshot({ clip: quietClip }), paused, "pause must freeze element residue");
	await page.evaluate(() => {
		adapter.reset();
		adapter.prepare(69);
		adapter.infectPath(80, 260, 240, 260, 1);
		adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 69, false);
		window.retiringCanvas = document.querySelector('[data-noise-dom-patch="text"] canvas');
	});
	assert.equal(await page.locator("[data-noise-dom-overlay]").evaluate(element => Number(getComputedStyle(element).opacity)), 1, "retirement must begin with the full DOM effect");
	const fullBurst = await page.screenshot({ clip: quietClip });
	await page.evaluate(() => {
		adapter.prepare(69.3);
		adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 69.3, false);
	});
	const halfFade = await page.screenshot({ clip: quietClip });
	assert.notDeepEqual(halfFade, fullBurst, "retirement must visibly fade the DOM effect rather than cutting it abruptly");
	assert.notDeepEqual(halfFade, beforeQuiet, "the midpoint must still retain visible residue");
	assert.ok(Math.abs(await page.locator("[data-noise-dom-overlay]").evaluate(element => Number(getComputedStyle(element).opacity)) - 0.5) < 0.001, "the 0.6-second fade must be halfway at 69.3 seconds");
	await page.evaluate(() => {
		for (let index = 0; index < 10; index++) {
			adapter.prepare(69.3);
			adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 69.3, false);
		}
	});
	assert.deepEqual(await page.screenshot({ clip: quietClip }), halfFade, "pausing during retirement must freeze the fade");
	assert.equal(await page.evaluate(() => adapter.prepare(69.6)), false, "the completed fade must retire DOM sampling");
	assert.deepEqual(await page.evaluate(() => [retiringCanvas.width, retiringCanvas.height]), [1, 1], "retirement must release retained canvas backing stores");
	assert.equal(await page.evaluate(() => document.querySelector("[data-noise-native-viewport]").innerHTML), await page.evaluate(() => original), "retirement must remove all paint and restore the exact source markup");
	assert.deepEqual(await page.screenshot({ clip: quietClip }), beforeQuiet, "retirement must restore clean text pixels");
	const late = await page.evaluate(() => {
		const ready = adapter.prepare(120);
		adapter.infectPath(80, 260, 240, 260, 1);
		adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 120, true);
		return { ready, overlays: document.querySelectorAll("[data-noise-dom-overlay]").length };
	});
	assert.deepEqual(late, { ready: false, overlays: 0 }, "late seeks and pointer travel must not recreate retired paint");
	assert.equal(await page.evaluate(() => adapter.prepare(40)), true, "seeking backwards must rediscover the drawable source");
	await page.evaluate(() => {
		adapter.infectPath(80, 260, 240, 260, 1);
		adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 40, false);
	});
	assert.notDeepEqual(await page.screenshot({ clip: quietClip }), beforeQuiet, "backwards seeks must restore visible DOM contamination");
	assert.equal(await page.locator("[data-noise-dom-overlay]").evaluate(element => Number(getComputedStyle(element).opacity)), 1, "backwards seeks must not inherit retirement opacity");
	await page.evaluate(() => {
		adapter.reset();
		adapter.prepare(69.3);
		adapter.infectPath(80, 260, 240, 260, 1);
		adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 69.3, false);
	});
	assert.ok(Math.abs(await page.locator("[data-noise-dom-overlay]").evaluate(element => Number(getComputedStyle(element).opacity)) - 0.5) < 0.001, "a direct seek into the fade must use the song clock");
	await page.evaluate(() => {
		adapter.reset();
		adapter.prepare(0);
		adapter.infectPath(80, 260, 240, 260, 1);
		adapter.sample([], { left: 0, top: 0, width: 800, height: 600 }, 0, false);
	});
	assert.notDeepEqual(await page.screenshot({ clip: quietClip }), beforeQuiet, "replay must enable DOM contamination again");
	await page.evaluate(() => { adapter.reset(); });
	assert.equal(await page.evaluate(() => document.querySelector("[data-noise-native-viewport]").innerHTML), await page.evaluate(() => original), "exit must restore the exact source nodes, attributes and markup");
	assert.deepEqual(await page.screenshot({ clip: titleClip }), beforeTitle, "restored text must be pixel-identical");
	assert.deepEqual(await page.screenshot({ clip: quietClip }), beforeQuiet, "restored brushed text must be pixel-identical");
	console.log("DOM paint: shared rasters retain three-colour corruption, multiline text and image cropping; hidden/clipped content stays contained; swept transfer and pause preserve geometry; reset restores identical DOM and pixels.");
} finally {
	await browser.close();
}
