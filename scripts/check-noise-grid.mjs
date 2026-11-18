// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

// Bundle the real pipeline and original assets, without an Astro build or server.
const bundle = await build({
	stdin: {
		contents: `export { createPostFxPipeline } from "./src-noise/engine/postfx";
			export { createPostFxState } from "./src-noise/engine/postfx-settings";
			export { loadPostFxAssets } from "./src-noise/engine/postfx-assets";`,
		resolveDir: fileURLToPath(new URL("../", import.meta.url)),
	},
	bundle: true, write: false, format: "iife", globalName: "gridRegression",
	loader: { ".png": "dataurl", ".bin": "dataurl" },
});
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
	headless: true,
	args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
	const page = await browser.newPage();
	await page.setContent("<!doctype html><title>Grid GPU regression</title>");
	await page.addScriptTag({ content: bundle.outputFiles[0].text });
	const measurements = await page.evaluate(async () => {
		const { createPostFxPipeline, createPostFxState, loadPostFxAssets } = gridRegression;
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl2");
		if (!gl) throw new Error("Grid regression requires WebGL 2");
		const input = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, input);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
		const pipeline = createPostFxPipeline(gl, await loadPostFxAssets());
		const state = createPostFxState();
		state.grid = true;
		for (const pass of Object.values(state.settings)) pass.enabled = 0;
		const framebuffer = gl.createFramebuffer();
		function read(width, height, time) {
			const texture = pipeline.render(input, width, height, time, state);
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete readback framebuffer");
			const pixels = new Uint8Array(width * height * 4);
			gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			if (gl.getError()) throw new Error("Grid GPU rendering failed");
			return pixels;
		}
		function spacing(pixels, width, height, horizontal) {
			const length = horizontal ? width : height;
			const fixed = Math.floor((horizontal ? height : width) / 2 + height / 20);
			const centers = [];
			let start = -1;
			for (let p = Math.floor(length / 2 - height / 5); p <= Math.ceil(length / 2 + height / 5); p++) {
				const x = horizontal ? p : fixed, y = horizontal ? fixed : p;
				const bright = pixels[(y * width + x) * 4] > 3;
				if (bright && start < 0) start = p;
				if (!bright && start >= 0) { centers.push((start + p - 1) / 2); start = -1; }
			}
			if (centers.length < 3) throw new Error("Expected multiple visible grid borders");
			const gaps = centers.slice(1).map((center, i) => center - centers[i]).sort((a, b) => a - b);
			return gaps[Math.floor(gaps.length / 2)];
		}
		const results = [];
		try {
			for (const [width, height] of [[960, 720], [1280, 800], [1280, 720], [1440, 720]]) {
				canvas.width = width; canvas.height = height;
				const first = read(width, height, 0), wrapped = read(width, height, 1);
				results.push({ width, height,
					x: spacing(first, width, height, true), y: spacing(first, width, height, false),
					wrapIdentical: first.every((value, i) => value === wrapped[i]),
				});
			}
		} finally {
			pipeline.dispose(); gl.deleteTexture(input); gl.deleteFramebuffer(framebuffer);
		}
		return results;
	});
	for (const result of measurements) {
		const label = `${result.width}×${result.height}`;
		assert.ok(Math.abs(result.x - result.y) <= 1, `${label}: cells must be square, got ${result.x}×${result.y}`);
		assert.ok(Math.abs(result.y - result.height / 10) <= 1, `${label}: preserve the vertical grid density`);
		assert.ok(result.wrapIdentical, `${label}: the expansion cycle must wrap without a jump`);
		console.log(`${label}: ${result.x}×${result.y}px cells; cycle wrap pixel-identical`);
	}
} finally {
	await browser.close();
}
