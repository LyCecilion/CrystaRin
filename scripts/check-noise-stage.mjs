// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

// Exercise the real material, masks and original images; no Astro server or mock GL.
const bundle = await build({
	stdin: {
		contents: `export { createPhiraMaterial, loadPhiraAssets } from "./src-noise/engine/phira-material";
			export { fitPerformanceViewport } from "./src-noise/engine/performance-viewport";`,
		resolveDir: fileURLToPath(new URL("../", import.meta.url)),
	},
	bundle: true, write: false, format: "iife", globalName: "stageRegression",
	loader: { ".png": "dataurl", ".frag": "text" },
});
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
	headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
	const page = await browser.newPage();
	await page.setContent("<!doctype html><title>Noise stage GPU regression</title>");
	await page.addScriptTag({ content: bundle.outputFiles[0].text });
	const results = await page.evaluate(async () => {
		const { createPhiraMaterial, loadPhiraAssets, fitPerformanceViewport } = stageRegression;
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl2");
		if (!gl) throw new Error("Stage regression requires WebGL 2");
		const material = createPhiraMaterial(gl, await loadPhiraAssets());
		const texture = gl.createTexture();
		const framebuffer = gl.createFramebuffer();
		function render(width, height, dpr, stage, phase, local = false) {
			const w = Math.round(width * dpr);
			const h = Math.round(height * dpr);
			canvas.width = w; canvas.height = h;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete stage readback framebuffer");
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			material.render(framebuffer, width, height, dpr, {
				stage, time: 99, touches: [],
				chart: { lines: [], areas: [{
					cx: stage.width / 2, cy: stage.height / 2,
					width: local ? 160 : stage.width * 3, height: local ? 160 : stage.height * 3,
					rotation: 0, phase, opacity: 1, subtract: false,
				}] },
			});
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			const pixels = new Uint8Array(w * h * 4);
			gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			if (gl.getError()) throw new Error("Stage GPU rendering failed");
			return { w, h, pixels };
		}
		const measurements = [];
		try {
			// Reuse one renderer across size changes, including cover-cropped and fractional-DPR views.
			for (const [width, height, dpr] of [[1280, 720, 1], [1080, 720, 1], [960, 720, 1], [1350, 720, 1], [1440, 720, 1], [1556, 846, 1.25]]) {
				const { stage } = fitPerformanceViewport(width, height);
				for (const phase of ["active", "ready", "disabled"]) {
					const { w, h, pixels } = render(width, height, dpr, stage, phase);
					let minimumEdgeAlpha = 255;
					for (let x = 0; x < w; x++) minimumEdgeAlpha = Math.min(minimumEdgeAlpha, pixels[x * 4 + 3], pixels[((h - 1) * w + x) * 4 + 3]);
					for (let y = 0; y < h; y++) minimumEdgeAlpha = Math.min(minimumEdgeAlpha, pixels[y * w * 4 + 3], pixels[(y * w + w - 1) * 4 + 3]);
					measurements.push({ label: `${width}x${height}@${dpr} ${phase}`, minimumEdgeAlpha });
				}
			}
			// An asymmetric inset stage catches top/bottom UV inversion as well as margin leakage.
			const stage = { left: 96, top: 80, width: 640, height: 400 };
			for (const phase of ["active", "ready", "disabled"]) {
				const { w, h, pixels } = render(960, 720, 1, stage, phase);
				let outsidePaint = 0;
				for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
					const cssY = h - y - 0.5;
					if (x + 0.5 < stage.left || x + 0.5 >= stage.left + stage.width || cssY < stage.top || cssY >= stage.top + stage.height) {
						if (pixels[(y * w + x) * 4 + 3]) outsidePaint++;
					}
				}
				const center = ((h - stage.top - stage.height / 2) * w + stage.left + stage.width / 2) * 4 + 3;
				measurements.push({ label: `inset ${phase}`, outsidePaint, centerAlpha: pixels[center] });
			}
			const { stage: localStage } = fitPerformanceViewport(1350, 720);
			const { w, h, pixels } = render(1350, 720, 1, localStage, "active", true);
			measurements.push({ label: "authored local area", centerAlpha: pixels[(Math.floor(h / 2) * w + Math.floor(w / 2)) * 4 + 3],
				cornerAlpha: pixels[3] + pixels[(w - 1) * 4 + 3] + pixels[((h - 1) * w) * 4 + 3] + pixels[(w * h - 1) * 4 + 3] });
		} finally {
			material.dispose(); gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture);
		}
		return measurements;
	});
	for (const result of results) {
		if ("minimumEdgeAlpha" in result) assert.ok(result.minimumEdgeAlpha > 0, `${result.label}: a full-stage area must reach every viewport edge`);
		if ("outsidePaint" in result) assert.equal(result.outsidePaint, 0, `${result.label}: stage margins must remain unpainted`);
		if ("centerAlpha" in result) assert.ok(result.centerAlpha > 0, `${result.label}: clipping must not erase the area interior`);
		if ("cornerAlpha" in result) assert.equal(result.cornerAlpha, 0, `${result.label}: authored empty corners must not be filled`);
		console.log(`${result.label}: passed`);
	}
} finally {
	await browser.close();
}
