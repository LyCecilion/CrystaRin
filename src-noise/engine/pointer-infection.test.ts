// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareChart } from "./chart";
import { createPointerInfection } from "./pointer-infection";

const stage = { left: 0, top: 0, width: 1000, height: 1000 };
const data = prepareChart({ formatVersion: 3, offset: 0, judgeLineList: [], blockAreaList: [{
	bottomLeftPercentage: { x: 0.4, y: 0.4 }, topRightPercentage: { x: 0.6, y: 0.6 },
	appearTime: 0, enableTime: 0, disableTime: 20, disappearTime: 20,
}] });

test("a crossing between paints infects, and carry expires three seconds after actual contact, not paint", () => {
	const input = createPointerInfection();
	input.move(100, 500, 1000, true, true);
	assert.equal(input.sample(data, stage, 1, 1000, true), 0);
	input.move(900, 500, 1010, true, true);
	const strength = input.sample(data, stage, 1.02, 1020, true);
	assert.ok(Math.abs(strength - (4005.625 - 1020) / 3000) < 1e-6);
	assert.equal(input.sample(data, stage, 4.006, 4006, true), 0);
});

test("recorded bends do not become a fictitious straight line through the area", () => {
	const input = createPointerInfection();
	input.move(100, 500, 0, true, true);
	input.sample(data, stage, 1, 0, true);
	input.move(100, 100, 1, true, true);
	input.move(900, 100, 2, true, true);
	input.move(900, 500, 3, true, true);
	assert.equal(input.sample(data, stage, 1.004, 4, true), 0);
});

test("a short recorded visit survives even when the paint sees only the outside endpoint", () => {
	const input = createPointerInfection();
	input.move(100, 500, 0, true, true);
	input.sample(data, stage, 1, 0, true);
	input.move(500, 500, 1, true, true);
	input.move(900, 500, 2, true, true);
	assert.ok(input.sample(data, stage, 1.016, 16, true) > 0.99);
});

test("leaving the window does not erase carry or bridge a path on re-entry; a new contact refreshes it", () => {
	const input = createPointerInfection();
	input.move(500, 500, 0, true, true);
	assert.equal(input.sample(data, stage, 1, 0, true), 1);
	input.leave(1, true);
	input.sample(data, stage, 1.001, 1, true);
	input.move(900, 500, 1000, true, true);
	assert.ok(Math.abs(input.sample(data, stage, 2, 1000, true) - 2 / 3) < 1e-6);
	input.move(500, 500, 2000, true, true);
	assert.equal(input.sample(data, stage, 3, 2000, true), 1);
	input.leave(2001, true);
	input.sample(data, stage, 3.001, 2001, true);
	assert.ok(input.sample(data, stage, 5.999, 4999, true) > 0);
	assert.equal(input.sample(data, stage, 6, 5000, true), 0);
});

test("UI exclusions, pause, seek/reset and viewport rebasing break old paths", () => {
	for (const reset of ["ui", "pause", "seek", "resize"] as const) {
		const input = createPointerInfection();
		input.move(100, 500, 0, true, true);
		input.sample(data, stage, 1, 0, true);
		if (reset === "ui") input.move(500, 500, 1, false, true);
		if (reset === "pause") input.sample(data, stage, 1, 1, false);
		if (reset === "seek") input.reset();
		if (reset === "resize") input.rebase();
		input.move(900, 500, 2, true, true);
		assert.equal(input.sample(data, stage, 1.003, 3, true), 0, reset);
	}
});

test("buffered audio still expires carry by wall time, without needing a pressed button", () => {
	const input = createPointerInfection();
	input.move(500, 500, 0, true, true);
	input.sample(data, stage, 1, 0, true);
	input.leave(1, true);
	input.sample(data, stage, 1, 1, true);
	input.move(900, 500, 1500, true, true);
	assert.equal(input.sample(data, stage, 1, 1500, true), 0.5);
	assert.equal(input.sample(data, stage, 1, 3000, true), 0);
});

test("stage-local coordinates and event-time audio interpolation catch transient animated contact", () => {
	const transient = prepareChart({ formatVersion: 3, offset: 2, judgeLineList: [], blockAreaList: [{
		bottomLeftPercentage: { x: 0.4, y: 0.4 }, topRightPercentage: { x: 0.6, y: 0.6 },
		appearTime: 0, enableTime: 0.004, disableTime: 0.006, disappearTime: 1,
	}] });
	const input = createPointerInfection();
	const insetStage = { ...stage, left: 100, top: 200 };
	input.move(200, 700, 1000, true, true);
	input.sample(transient, insetStage, 2, 1000, true);
	input.move(1000, 700, 1010, true, true);
	assert.ok(input.sample(transient, insetStage, 2.02, 1020, true) > 0.99);
});
