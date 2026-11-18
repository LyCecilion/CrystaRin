// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPhiraMasks } from "./phira-masks";
import type { AreaFrame } from "./types";

const noise = { width: 1, height: 1, pixels: new Uint8Array([128, 128, 128, 255]) };
const stage = { left: 0, top: 0, width: 32, height: 32 };
const area = (extra: Partial<AreaFrame> = {}): AreaFrame => ({ cx: 16, cy: 16, width: 32, height: 32, rotation: 0, phase: "active", subtract: false, opacity: 1, ...extra });

test("native subtract window excludes double AND triple overlap rather than using parity", () => {
	const masks = createPhiraMasks(noise);
	const subtract = area({ subtract: true });
	for (const [count, raw, composed] of [[1, 26, 255], [2, 52, 0], [3, 78, 0]]) {
		const frame = masks.render(32, 32, 1, stage, Array.from({ length: count }, () => subtract), 0);
		assert.equal(frame.sources[1], raw);
		assert.equal(frame.rgba[0], composed);
	}
	const frame = masks.render(32, 32, 1, stage, [area(), subtract], 0);
	assert.equal(frame.rgba[0], 0, "equal normal/inverse coverage is a hole");
});

test("Ready retains disabled capture and separate normal/subtract auxiliary cameras", () => {
	const masks = createPhiraMasks(noise);
	let frame = masks.render(32, 32, 1, stage, [area({ phase: "ready", opacity: 0.5 })], 0);
	assert.deepEqual(Array.from(frame.sources.subarray(0, 4)), [0, 0, 128, 0]);
	assert.deepEqual(Array.from(frame.aux.subarray(0, 4)), [128, 0, 128, 0]);
	assert.deepEqual(Array.from(frame.rgba.subarray(0, 4)), [0, 0, 0, 128]);
	frame = masks.render(32, 32, 1, stage, [area({ phase: "ready", subtract: true })], 0);
	assert.deepEqual(Array.from(frame.sources.subarray(0, 4)), [0, 0, 0, 26]);
	assert.deepEqual(Array.from(frame.aux.subarray(0, 4)), [0, 255, 255, 0]);
	frame = masks.render(32, 32, 1, stage, [area({ phase: "ready" }), area({ phase: "ready", subtract: true })], 0);
	assert.deepEqual(Array.from(frame.aux.subarray(0, 4)), [255, 255, 0, 0]);
});

test("source blend quantizes each sprite before the next additive contribution", () => {
	const masks = createPhiraMasks(noise);
	const frame = masks.render(32, 32, 1, stage, [area({ opacity: 0.5 }), area({ opacity: 0.1 })], 0);
	assert.equal(frame.sources[0], 154, "128/255 + .1 rounds to byte 154, not a single .6 blend");
});

test("gray masks produce a gray edge and opacity-attenuated exterior glow", () => {
	const a = area({ width: 8, height: 8, opacity: 0.5 });
	const gray = createPhiraMasks(noise).render(32, 32, 1, stage, [a], 0);
	const opaque = createPhiraMasks(noise).render(32, 32, 1, stage, [{ ...a, opacity: 1 }], 0);
	const inside = (3 * 8 + 3) * 4, outside = (3 * 8 + 2) * 4;
	assert.equal(gray.rgba[inside], 128);
	assert.equal(gray.rgba[inside + 1], 0);
	assert.equal(gray.rgba[outside], 0);
	assert.equal(gray.rgba[outside + 1], 128);
	assert.equal(opaque.rgba[outside + 1], 255);
	assert.ok(gray.rgba[outside + 2] > 0);
	assert.ok(gray.rgba[outside + 2] < opaque.rgba[outside + 2]);
});

test("CSS clockwise rotation rasterizes bottom-up and never fills the letterbox", () => {
	const masks = createPhiraMasks(noise);
	const inset = { left: 8, top: 8, width: 16, height: 16 };
	const frame = masks.render(32, 32, 1, inset, [area({ cx: 8, cy: 4, width: 16, height: 8, rotation: Math.PI / 2 })], 0);
	const at = (x: number, y: number): number => frame.sources[(y * 8 + x) * 4];
	assert.equal(at(3, 5), 255, "clockwise long dimension is vertical near stage top");
	assert.equal(at(3, 2), 0, "below the rotated rectangle");
	assert.equal(at(1, 5), 0, "left letterbox");
	assert.equal(at(3, 6), 0, "top letterbox");
	assert.equal(at(5, 5), 0, "outside rotated narrow dimension");
});

test("native inclusive pixel-center endpoints and physical grid dimensions are preserved", () => {
	const masks = createPhiraMasks(noise);
	const frame = masks.render(32, 32, 1, stage, [area({ cx: 10, cy: 10, width: 8, height: 8 })], 0);
	const at = (x: number, y: number): number => frame.sources[(y * 8 + x) * 4];
	assert.equal(at(1, 4), 255, "center exactly on left boundary");
	assert.equal(at(3, 4), 255, "center exactly on right boundary");
	assert.equal(at(4, 4), 0);
	const scaled = masks.render(33, 25, 1.5, stage, [], 1);
	assert.equal(scaled.width, 12);
	assert.equal(scaled.height, 8);
	const tiny = masks.render(1, 1, 1, { left: 0, top: 0, width: 1, height: 1 }, [], 0);
	assert.equal(tiny.width, 2); assert.equal(tiny.height, 2);
});

test("unchanged geometry retains buffers while animated displacement can rerender", () => {
	const masks = createPhiraMasks(noise);
	const areas = [area({ width: 8, height: 8 })];
	const first = masks.render(32, 32, 1, stage, areas, 0);
	const rgba = first.rgba, aux = first.aux, sources = first.sources;
	const expected = rgba.slice();
	const next = masks.render(32, 32, 1, stage, areas, 1);
	assert.equal(next.rgba, rgba); assert.equal(next.aux, aux); assert.equal(next.sources, sources);
	assert.deepEqual(next.rgba, expected, "constant displacement is time invariant");
	areas[0].phase = "disabled";
	masks.render(32, 32, 1, stage, areas, 1);
	assert.ok(aux.some((value, i) => i % 4 === 2 && value !== 0), "in-place phase edits invalidate geometry cache");
});
test("nearest displacement samples vertically flipped PNG rows", () => {
	const displacement = { width: 1, height: 2, pixels: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]) };
	const frame = createPhiraMasks(displacement).render(32, 32, 1, stage, [area({ width: 8, height: 8 })], 0);
	const source = (y: number): number => frame.sources[(y * 8 + 3) * 4];
	const displaced = (y: number): number => frame.rgba[(y * 8 + 3) * 4];
	assert.equal(source(2), 0); assert.equal(source(5), 0);
	assert.equal(source(3), 255); assert.equal(source(4), 255);
	// Native bottom-up white/black samples move these point samples inward
	// by .070703 UV, widening the two source rows to four output rows.
	for (const y of [2, 3, 4, 5]) assert.equal(displaced(y), 255);
	assert.equal(displaced(1), 0); assert.equal(displaced(6), 0);
});

