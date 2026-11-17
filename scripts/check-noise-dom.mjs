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
		.dropdown { opacity: 0; position: absolute; left: -650px; top: 160px; width: 100px }
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
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all([...document.images].map(image => image.decode()));
		window.adapter = domRegression.mountDomContamination();
		window.original = document.querySelector("[data-noise-native-viewport]").innerHTML;
		window.titleRect = document.querySelector(".post-card-title").getBoundingClientRect().toJSON();
	});
	const titleClip = { x: 60, y: 60, width: 260, height: 80 };
	const quietClip = { x: 60, y: 240, width: 260, height: 64 };
	const beforeTitle = await page.screenshot({ clip: titleClip });
	const beforeQuiet = await page.screenshot({ clip: quietClip });
	const beforeHidden = await page.screenshot({ clip: { x: 40, y: 155, width: 200, height: 50 } });
	await page.evaluate(() => {
		adapter.prepare();
		const active = (cx, cy, width, height) => ({ cx, cy, width, height, rotation: 0, phase: "active", opacity: 1, subtract: false });
		adapter.sample([active(140, 140, 180, 250), active(450, 120, 200, 200)], { left: 0, top: 0, width: 800, height: 600 }, 12, false);
	});
	assert.notDeepEqual(await page.screenshot({ clip: titleClip }), beforeTitle, "contact must visibly paint a text echo");
	assert.deepEqual(await page.screenshot({ clip: quietClip }), beforeQuiet, "untouched text must stay pixel-identical");
	assert.deepEqual(await page.screenshot({ clip: { x: 40, y: 155, width: 200, height: 50 } }), beforeHidden, "hidden dropdowns must not leak ghosts");
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
		adapter.reset(); adapter.prepare();
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
	await page.evaluate(() => { adapter.reset(); });
	assert.equal(await page.evaluate(() => document.querySelector("[data-noise-native-viewport]").innerHTML === original), true, "exit must restore the exact source nodes, attributes and markup");
	assert.deepEqual(await page.screenshot({ clip: titleClip }), beforeTitle, "restored text must be pixel-identical");
	assert.deepEqual(await page.screenshot({ clip: quietClip }), beforeQuiet, "restored brushed text must be pixel-identical");
	console.log("DOM paint: localized visible echoes; hidden/clipped content stays contained; swept transfer and pause preserve geometry; reset restores identical DOM and pixels.");
} finally {
	await browser.close();
}
