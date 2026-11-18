// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { prepareChart } from "./chart";
import { fitPerformanceViewport, projectPerformanceStage, unprojectPresentation } from "./performance-viewport";
import { createPointerInfection } from "./pointer-infection";
import { postFxOverscan } from "./postfx-settings";

test("phone, tablet and intermediate ratios use the entire viewport without borders", () => {
	for (const [width, height] of [[1600, 900], [1440, 900], [1280, 960], [1568, 889]]) {
		const layout = fitPerformanceViewport(width, height);
		assert.deepEqual(layout.stage, { left: 0, top: 0, width, height });
		assert.equal(layout.croppedFraction, 0);
		assert.equal(layout.supported, true);
	}
});

test("outside standard ratios the nearest endpoint covers the viewport with symmetric cropping", () => {
	const wide = fitPerformanceViewport(1920, 900);
	assert.deepEqual(wide.stage, { left: 0, top: -90, width: 1920, height: 1080 });
	assert.ok(Math.abs(wide.croppedFraction - 1 / 6) < 1e-12);
	const narrow = fitPerformanceViewport(1152, 960);
	assert.deepEqual(narrow.stage, { left: -64, top: 0, width: 1280, height: 960 });
	assert.ok(Math.abs(narrow.croppedFraction - 0.1) < 1e-12);
	for (const layout of [wide, narrow]) assert.equal(layout.supported, true);
});

test("the twenty-percent crop boundary is inclusive, but greater cropping blocks playback", () => {
	for (const [width, height] of [[2000, 900], [1024, 960]]) {
		assert.equal(fitPerformanceViewport(width, height).supported, true);
	}
	for (const [width, height] of [[2001, 900], [1024, 961], [2560, 1080], [1080, 1920]]) {
		assert.equal(fitPerformanceViewport(width, height).supported, false);
	}
});

test("noise contact follows the visible chart after either negative stage-origin crop", () => {
	const chart = prepareChart({ formatVersion: 3, offset: 0, judgeLineList: [], blockAreaList: [{
		bottomLeftPercentage: { x: 0.42, y: 0.42 }, topRightPercentage: { x: 0.58, y: 0.58 },
		appearTime: 0, enableTime: 0, disableTime: 20, disappearTime: 20,
	}] });
	for (const [width, height] of [[1920, 900], [1152, 960]]) {
		const { stage } = fitPerformanceViewport(width, height);
		const input = createPointerInfection();
		input.move(width / 2, height / 2, 0, true, true);
		assert.equal(input.sample(chart, stage, 1, 0, true), 1);
		input.reset();
		input.move(0, 0, 1, true, true);
		assert.equal(input.sample(chart, stage, 1, 1, true), 0);
	}
});

test("presentation crop keeps source touches aligned through standard and cover viewports, then restores them", () => {
	for (const [width, height] of [[1280, 960], [1600, 900], [1920, 900], [1152, 960]]) {
		const { stage } = fitPerformanceViewport(width, height);
		const shown = { left: 0, top: 0, width: 0, height: 0 };
		for (const scale of [postFxOverscan, 1]) {
			projectPerformanceStage(stage, width, height, scale, shown);
			assert.ok(Math.abs(shown.left + shown.width / 2 - width / 2) < 1e-8);
			assert.ok(Math.abs(shown.top + shown.height / 2 - height / 2) < 1e-8);
			const sourceX = stage.left + stage.width * 0.3, sourceY = stage.top + stage.height * 0.45;
			const screenX = shown.left + shown.width * 0.3, screenY = shown.top + shown.height * 0.45;
			assert.ok(Math.abs(unprojectPresentation(screenX, width, scale) - sourceX) < 1e-8);
			assert.ok(Math.abs(unprojectPresentation(screenY, height, scale) - sourceY) < 1e-8);
		}
		assert.deepEqual(shown, stage);
	}
});

test("contact tracks the enlarged noise boundary rather than its unzoomed location", () => {
	const chart = prepareChart({ formatVersion: 3, offset: 0, judgeLineList: [], blockAreaList: [{
		bottomLeftPercentage: { x: 0.28, y: 0.35 }, topRightPercentage: { x: 0.48, y: 0.65 },
		appearTime: 0, enableTime: 0, disableTime: 20, disappearTime: 20,
	}] });
	for (const [width, height] of [[1600, 900], [1920, 900], [1152, 960]]) {
		const { stage } = fitPerformanceViewport(width, height);
		const insetLeft = stage.left + stage.width * 0.28 + stage.height * 0.05;
		const enlargedLeft = width / 2 + (insetLeft - width / 2) * postFxOverscan;
		const screenX = (insetLeft + enlargedLeft) / 2;
		const shown = { ...stage };
		for (const scale of [1, postFxOverscan, 1]) {
			projectPerformanceStage(stage, width, height, scale, shown);
			const input = createPointerInfection();
			input.move(screenX, height / 2, 0, true, true);
			assert.equal(input.sample(chart, shown, 1, 0, true), scale === 1 ? 0 : 1);
		}
	}
});
