import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareChart, sampleChart, isPointBlocked, lastBlockedOnPath, type NoiseChart } from "./chart";
import type { AreaFrame } from "./types";

const block = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	topRightPercentage: { x: 0.6, y: 0.6 }, bottomLeftPercentage: { x: 0.4, y: 0.4 },
	appearTime: 0, enableTime: 0, disableTime: 10, disappearTime: 10,
	isSubtract: false, scaleEvents: [], rotateEvents: [], moveEvents: [], ...extra,
});
const chart = (blocks: unknown[], lines: unknown[] = [], offset = 0): NoiseChart => prepareChart({ formatVersion: 3, offset, blockAreaList: blocks, judgeLineList: lines });
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} != ${expected}`);

test("visible and blocking lifetimes are half-open and independent", () => {
	const data = chart([block({ appearTime: 1, enableTime: 2, disableTime: 4, disappearTime: 5 })]);
	assert.equal(sampleChart(data, 0.99, 1600, 900).areas.length, 0);
	const preview = sampleChart(data, 1.1, 1600, 900).areas[0];
	assert.equal(preview.phase, "disabled");
	close(preview.opacity, 0.2);
	assert.equal(isPointBlocked([preview], 800, 450, 900), false);
	assert.equal(sampleChart(data, 1.5, 1600, 900).areas[0].phase, "ready");
	assert.equal(sampleChart(data, 2, 1600, 900).areas[0].phase, "active");
	assert.equal(sampleChart(data, 4, 1600, 900).areas[0].phase, "disabled");
	assert.equal(sampleChart(data, 5, 1600, 900).areas.length, 0);
});

test("scale and rotation orbit their anchors before absolute move delta", () => {
	const data = chart([block({
		scaleEvents: [{ time: 0, anchor: { x: 0, y: 0 }, scale: { x: 1, y: 1 } }, { time: 2, anchor: { x: 0, y: 0 }, scale: { x: 2, y: 2 } }],
		rotateEvents: [{ time: 0, anchor: { x: 0, y: 0 }, rotation: 0 }, { time: 2, anchor: { x: 0, y: 0 }, rotation: 90 }],
		moveEvents: [{ time: 0, endPosition: { x: 0.5, y: 0.5 } }, { time: 2, endPosition: { x: 0.6, y: 0.5 } }],
	})]);
	const area = sampleChart(data, 1, 1600, 900).areas[0];
	close(area.cx, (1200 - 675) / Math.SQRT2 + 80);
	close(area.cy, 900 - (1200 + 675) / Math.SQRT2);
	close(area.width, 480); close(area.height, 270); close(area.rotation, -Math.PI / 4);
	const first = sampleChart(chart([block({ rotateEvents: [{ time: 0, anchor: { x: 0, y: 0 }, rotation: 90 }], scaleEvents: [{ time: 0, anchor: { x: 0, y: 0 }, scale: { x: 2, y: 2 } }] })]), 0, 1600, 900).areas[0];
	close(first.cx, 800); close(first.cy, 450);
});

test("subtract-only input blocks by parity, including triple overlap", () => {
	const normal: AreaFrame = { cx: 200, cy: 200, width: 400, height: 400, rotation: 0, phase: "active", opacity: 1, subtract: false };
	const subtract = { ...normal, subtract: true };
	assert.equal(isPointBlocked([subtract], 200, 200, 900), true);
	assert.equal(isPointBlocked([subtract, subtract], 200, 200, 900), false);
	assert.equal(isPointBlocked([subtract, subtract, subtract], 200, 200, 900), true);
	assert.equal(isPointBlocked([normal, subtract], 200, 200, 900), false);
	assert.equal(isPointBlocked([normal, subtract, subtract], 200, 200, 900), true);
});

test("five-percent stage-height inset follows rotated rectangle edges", () => {
	const area: AreaFrame = { cx: 600, cy: 400, width: 400, height: 160, rotation: Math.PI / 2, phase: "active", opacity: 1, subtract: false };
	assert.equal(isPointBlocked([area], 650, 400, 900), false);
	assert.equal(isPointBlocked([area], 620, 400, 900), true);
});

test("judge lines use local BPM ticks and authored offset exactly once", () => {
	const data = chart([], [{ bpm: 120,
		judgeLineMoveEvents: [{ startTime: 0, endTime: 32, start: 0, end: 1, start2: 0.5, end2: 0.5 }],
		judgeLineRotateEvents: [{ startTime: 0, endTime: 32, start: 0, end: 90 }],
		judgeLineDisappearEvents: [{ startTime: 0, endTime: 32, start: 1, end: 0 }],
	}], 0.25);
	const line = sampleChart(data, 0.5, 1600, 900).lines[0];
	close(line.x, 800); close(line.y, 450); close(line.rotation, -Math.PI / 4); close(line.opacity, 0.5);
});

test("three-width judge lines keep offscreen anchors from exposing endpoints inside the viewport", () => {
	const data = chart([], [{ bpm: 120,
		judgeLineMoveEvents: [{ startTime: 0, endTime: 32, start: 1.3, end: 1.3, start2: 0.5, end2: 0.5 }],
	}]);
	for (const [width, height] of [[1600, 900], [1280, 960], [1600, 800]]) {
		const line = sampleChart(data, 0, width, height).lines[0];
		close(line.length, width * 3);
		assert.ok(line.x - line.length / 2 < 0, "left endpoint must stay beyond the screen");
		assert.ok(line.x + line.length / 2 > width, "right endpoint must stay beyond the screen");
	}
});

test("a fast segment catches an inset only .02 CSS pixels wide, with both endpoints outside", () => {
	const data = chart([block({ bottomLeftPercentage: { x: 0.44999, y: 0.4 }, topRightPercentage: { x: 0.55001, y: 0.6 } })]);
	const hit = lastBlockedOnPath(data, { x: 100, y: 500, time: 1 }, { x: 900, y: 500, time: 1.016 }, 1000, 1000);
	assert.ok(hit !== null && hit > 0.49 && hit < 0.51);
});

test("swept input excludes the visible border and respects rotated inset geometry", () => {
	const data = chart([block({ rotateEvents: [{ time: 0, anchor: { x: 0.5, y: 0.5 }, rotation: 45 }] })]);
	assert.equal(lastBlockedOnPath(data, { x: 200, y: 580, time: 1 }, { x: 800, y: 580, time: 1.016 }, 1000, 1000), null);
	assert.notEqual(lastBlockedOnPath(data, { x: 200, y: 500, time: 1 }, { x: 800, y: 500, time: 1.016 }, 1000, 1000), null);
});

test("segment contact uses combined Subtract parity, not individual rectangle intersections", () => {
	const normal = block({ bottomLeftPercentage: { x: 0.2, y: 0.2 }, topRightPercentage: { x: 0.8, y: 0.8 } });
	const inverse = block({ isSubtract: true, bottomLeftPercentage: { x: 0.35, y: 0.35 }, topRightPercentage: { x: 0.65, y: 0.65 } });
	const from = { x: 450, y: 500, time: 1 }, to = { x: 550, y: 500, time: 1.016 };
	assert.equal(lastBlockedOnPath(chart([normal, inverse]), from, to, 1000, 1000), null);
	assert.equal(lastBlockedOnPath(chart([normal, inverse, inverse]), from, to, 1000, 1000), 1);
	assert.equal(lastBlockedOnPath(chart([inverse, inverse]), from, to, 1000, 1000), null);
});

test("stationary pointers catch a translating field between two outside frames", () => {
	const data = chart([block({ moveEvents: [
		{ time: 0, endPosition: { x: 0.2, y: 0.5 } },
		{ time: 0.04, endPosition: { x: 0.8, y: 0.5 } },
	] })]);
	const hit = lastBlockedOnPath(data, { x: 500, y: 500, time: 0 }, { x: 500, y: 500, time: 0.04 }, 1000, 1000);
	assert.ok(hit !== null);
	close(hit, 7 / 12);
});

test("rotation substeps catch a thin bar sweeping a stationary pointer", () => {
	const data = chart([block({ bottomLeftPercentage: { x: 0.2, y: 0.445 }, topRightPercentage: { x: 0.8, y: 0.555 },
		rotateEvents: [
			{ time: 0, anchor: { x: 0.5, y: 0.5 }, rotation: 0 },
			{ time: 0.04, anchor: { x: 0.5, y: 0.5 }, rotation: 180 },
		] })]);
	const hit = lastBlockedOnPath(data, { x: 500, y: 700, time: 0 }, { x: 500, y: 700, time: 0.04 }, 1000, 1000);
	assert.ok(hit !== null && hit > 0.49 && hit < 0.52);
});

test("short active lifetimes and audio offsets survive temporal subdivision", () => {
	const data = chart([block({ enableTime: 0.0123, disableTime: 0.0124 })], [], 2);
	assert.notEqual(lastBlockedOnPath(data, { x: 500, y: 500, time: 2 }, { x: 500, y: 500, time: 2.03 }, 1000, 1000), null);
	assert.equal(lastBlockedOnPath(data, { x: 500, y: 500, time: 2 }, { x: 500, y: 500, time: 2.01 }, 1000, 1000), null);
	assert.equal(lastBlockedOnPath(data, { x: 500, y: 500, time: 2.02 }, { x: 500, y: 500, time: 2.03 }, 1000, 1000), null);
});

test("teleport keyframes do not sweep through positions the area never occupied", () => {
	const data = chart([block({ moveEvents: [
		{ time: 0, endPosition: { x: 0.2, y: 0.5 }, easeTypeX: 13 },
		{ time: 0.02, endPosition: { x: 0.8, y: 0.5 } },
	] })]);
	assert.equal(lastBlockedOnPath(data, { x: 500, y: 500, time: 0 }, { x: 500, y: 500, time: 0.04 }, 1000, 1000), null);
});

test("letterbox contacts cannot infect and first enabled endpoint can", () => {
	const data = chart([block({ bottomLeftPercentage: { x: -1, y: 0 }, topRightPercentage: { x: 2, y: 1 }, enableTime: 1 })]);
	assert.equal(lastBlockedOnPath(data, { x: -200, y: 500, time: 1 }, { x: -100, y: 500, time: 1.02 }, 1000, 1000), null);
	assert.equal(lastBlockedOnPath(data, { x: 500, y: 500, time: 0.99 }, { x: 500, y: 500, time: 1 }, 1000, 1000), 1);
});
