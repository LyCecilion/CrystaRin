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

type Deposit = [number, number, number, number, number];
function recording() {
	const paths: Deposit[] = [];
	return { input: createPointerInfection((...path) => paths.push(path)), paths };
}

test("deposition begins at first inset contact, in displayed viewport coordinates", () => {
	const { input, paths } = recording();
	const shifted = { ...stage, left: 100, top: 200 };
	input.move(200, 700, 0, true, true);
	input.sample(data, shifted, 1, 0, true);
	assert.equal(paths.length, 0);
	input.move(1000, 700, 10, true, true);
	input.sample(data, shifted, 1.01, 10, true);
	assert.ok(paths.length > 0);
	assert.ok(Math.abs(paths[0][0] - 550) < 1e-5);
	assert.ok(paths.every(([fx, fy, tx, ty, s]) => fx >= 550 - 1e-5 && tx >= fx && fy === 700 && ty === 700 && s > 0 && s <= 1));
	assert.ok(paths.some(([fx, , tx]) => fx <= 900 && tx >= 900), "carried travel crosses a target between paints");
});

test("deposition follows every recorded bend rather than shortcutting", () => {
	const { input, paths } = recording();
	input.move(500, 500, 0, true, true);
	input.sample(data, stage, 1, 0, true);
	paths.length = 0;
	input.move(500, 100, 10, true, true);
	input.move(900, 100, 20, true, true);
	input.move(900, 500, 30, true, true);
	input.sample(data, stage, 1.03, 30, true);
	assert.ok(paths.some(([fx, fy, tx, ty]) => fy === 100 && ty === 100 && fx <= 700 && tx >= 700));
	assert.ok(paths.every(([fx, fy, tx, ty]) => fx === tx || fy === ty));
});

test("late deposition clips at actual carry expiry with finite positive fading strength", () => {
	const { input, paths } = recording();
	input.move(500, 500, 0, true, true);
	input.sample(data, stage, 1, 0, true);
	input.move(900, 500, 100, true, true);
	input.sample(data, stage, 1.1, 100, true);
	const expiry = 3012.5;
	paths.length = 0;
	input.move(900, 900, 6100, true, true);
	assert.equal(input.sample(data, stage, 7.1, 6100, true), 0);
	const limit = 500 + 400 * (expiry - 100) / 6000;
	assert.ok(paths.length > 1);
	assert.ok(paths.every(([, , , ty, s]) => ty < limit && Number.isFinite(s) && s > 0 && s <= 1));
	assert.ok(Math.abs(paths.at(-1)![3] - limit) < 1e-5);
	assert.ok(paths[0][4] > paths.at(-1)![4]);
});

test("clean excluded UI and reentry never bridge, and pause never deposits", () => {
	for (const leave of [false, true]) {
		const { input, paths } = recording();
		input.move(100, 500, 0, true, true);
		input.sample(data, stage, 1, 0, true);
		if (leave) input.leave(1, true);
		else input.move(500, 500, 1, false, true);
		input.move(900, 500, 2, true, true);
		input.sample(data, stage, 1.003, 3, true);
		assert.equal(paths.length, 0);
		input.move(500, 500, 4, true, true);
		input.sample(data, stage, 1.004, 4, false);
		assert.equal(paths.length, 0);
	}
});

test("infected UI breaks retain carry without painting the excluded bridge", () => {
	const { input, paths } = recording();
	input.move(500, 500, 0, true, true);
	input.sample(data, stage, 1, 0, true);
	paths.length = 0;
	input.move(600, 100, 1, false, true);
	input.move(900, 900, 2, true, true);
	input.sample(data, stage, 1.003, 3, true);
	assert.ok(paths.length > 0);
	assert.ok(paths.every(([fx, fy, tx, ty]) => fx === 900 && tx === 900 && fy === 900 && ty === 900));
});

test("Subtract holes and inactive lifetimes cannot acquire deposition", () => {
	const hole = prepareChart({ formatVersion: 3, offset: 2, judgeLineList: [], blockAreaList: [{
		bottomLeftPercentage: { x: 0.1, y: 0.1 }, topRightPercentage: { x: 0.9, y: 0.9 },
		appearTime: 0, enableTime: 0.004, disableTime: 0.006, disappearTime: 1,
	}, {
		bottomLeftPercentage: { x: 0.4, y: 0.4 }, topRightPercentage: { x: 0.6, y: 0.6 },
		appearTime: 0, enableTime: 0.004, disableTime: 0.006, disappearTime: 1, isSubtract: true,
	}] });
	const { input, paths } = recording();
	input.move(500, 500, 0, true, true);
	input.sample(hole, stage, 2, 0, true);
	input.sample(hole, stage, 2.01, 10, true);
	assert.equal(paths.length, 0);
	input.move(200, 500, 11, true, true);
	input.sample(hole, stage, 2.011, 11, true);
	assert.equal(paths.length, 0, "normal field is no longer active");
	input.reset();
	input.move(200, 500, 20, true, true);
	input.sample(hole, stage, 2, 20, true);
	input.sample(hole, stage, 2.01, 30, true);
	assert.ok(paths.length > 0, "stationary pointer acquires only during the short active lifetime");
	assert.ok(paths.every(([fx, fy, tx, ty]) => fx === 200 && tx === 200 && fy === 500 && ty === 500));
});
