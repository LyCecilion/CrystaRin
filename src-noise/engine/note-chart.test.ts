// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareChart, sampleChart } from "./chart";
import { createNotePerformanceFrame, prepareNoteChart, sampleNoteChart } from "./note-chart";
import type { LineFrame } from "./types";

const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const scale = 1000 / (2 * 0.83175);
const note = (type: number, time: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	type, time, positionX: 0, holdTime: 0, speed: 1, floorPosition: 999, ...extra,
});
const line = (above: unknown[], below: unknown[] = [], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	bpm: 60, notesAbove: above, notesBelow: below,
	speedEvents: [{ startTime: 0, endTime: 10000, value: 1 }],
	judgeLineMoveEvents: [{ startTime: 0, endTime: 10000, start: 0.5, end: 0.5, start2: 0.5, end2: 0.5 }],
	judgeLineRotateEvents: [{ startTime: 0, endTime: 10000, start: 0, end: 0 }],
	judgeLineDisappearEvents: [{ startTime: 0, endTime: 10000, start: 1, end: 1 }], ...extra,
});
const geometry = (extra: Partial<LineFrame> = {}): LineFrame => ({ x: 1000, y: 500, rotation: 0, length: 4000, opacity: 1, ...extra });
const raw = (lines: unknown[], offset = 0): Record<string, unknown> => ({ formatVersion: 3, offset, judgeLineList: lines });
const sample = (source: unknown, time: number, lines: LineFrame[] = [geometry()]) => {
	const frame = createNotePerformanceFrame();
	sampleNoteChart(prepareNoteChart(source, prepareChart(source)), time, lines, 2000, 1000, frame);
	return frame;
};

test("BPM ticks and offset apply once while supplied geometry follows the same song clock", () => {
	const source = raw([line([note(1, 32)], [], { bpm: 120,
		judgeLineMoveEvents: [{ startTime: 0, endTime: 32, start: 0.25, end: 0.75, start2: 0.5, end2: 0.5 }],
	})], 0.25);
	const chart = prepareNoteChart(source, prepareChart(source)), frame = createNotePerformanceFrame();
	const lines = sampleChart(prepareChart(source), 0.5, 2000, 1000).lines;
	sampleNoteChart(chart, 0.5, lines, 2000, 1000, frame);
	close(frame.time, 0.25); close(frame.sprites[0].x, 1000); close(frame.sprites[0].y, 500 - 0.25 * scale);
	assert.equal(frame.judged, 0);
	sampleNoteChart(chart, 0.75, lines, 2000, 1000, frame);
	assert.equal(frame.sprites.length, 0); assert.equal(frame.judged, 1); close(frame.hits[0].age, 0);
});

test("above and below reflect only local Y before clockwise line rotation", () => {
	const source = raw([line([note(1, 32, { positionX: 2 })], [note(4, 32, { positionX: 2 })])]);
	const frame = sample(source, 0.5, [geometry({ rotation: Math.PI / 2, opacity: 0 })]);
	const above = frame.sprites.find((it) => it.side === -1)!, below = frame.sprites.find((it) => it.side === 1)!;
	close(above.x, 1000 + 0.5 * scale); close(below.x, 1000 - 0.5 * scale);
	close(above.y, 500 + 225); close(below.y, above.y);
	close(above.rotation, Math.PI / 2); close(below.rotation, above.rotation);
	assert.equal(above.opacity, 1); assert.equal(below.opacity, 1);
	assert.equal(above.kind, "tap"); assert.equal(below.kind, "flick");
});

test("simultaneous notes highlight across lines with different BPM conversions", () => {
	const source = raw([line([note(1, 32), note(2, 40)]), line([note(4, 64)], [], { bpm: 120 })]);
	const frame = sample(source, 0.75, [geometry(), geometry()]);
	assert.deepEqual(frame.sprites.map((it) => [it.kind, it.highlight]), [["tap", true], ["drag", false], ["flick", true]]);
	assert.equal(frame.total, 3);
});

test("zero line speed has no approach window and resumes through the integrated speed track", () => {
	const source = raw([line([note(2, 320)], [], { speedEvents: [
		{ startTime: 0, endTime: 288, value: 0 }, { startTime: 288, endTime: 10000, value: 1 },
	] })]);
	const stopped = sample(source, 0), stillStopped = sample(source, 8);
	assert.equal(stopped.sprites.length, 1); close(stopped.sprites[0].y, 500 - scale);
	close(stillStopped.sprites[0].y, stopped.sprites[0].y);
	close(sample(source, 9.5).sprites[0].y, 500 - 0.5 * scale);
	assert.equal(sample(source, 10).judged, 1);
});

test("speed integration, note.speed and recomputed floorPosition determine head motion", () => {
	const source = raw([line([note(1, 64, { speed: 0.5, floorPosition: -9000 }), note(2, 320, { speed: 0 })], [], {
		speedEvents: [{ startTime: 0, endTime: 32, value: 1 }, { startTime: 32, endTime: 10000, value: 2 }],
	})]);
	close(sample(source, 1.5).sprites[0].y, 500 - 0.5 * scale);
	const zero = sample(source, 0).sprites.find((it) => it.kind === "drag")!;
	close(zero.y, 500);
});

test("holds keep independent body speed through line-speed changes and hide the held head", () => {
	const source = raw([line([note(3, 32, { holdTime: 64, speed: 0.4 })], [], {
		speedEvents: [{ startTime: 0, endTime: 48, value: 1 }, { startTime: 48, endTime: 10000, value: 0 }],
	})]);
	const before = sample(source, 0.75).sprites[0];
	assert.equal(before.headVisible, true); close(before.y, 500 - 0.25 * scale);
	close(before.y - before.tailY, 2 * 0.4 * scale);
	const start = sample(source, 1).sprites[0];
	assert.equal(start.headVisible, false); close(start.y, 500); close(start.tailY, 500 - 2 * 0.4 * scale);
	const held = sample(source, 2).sprites[0];
	close(held.y, 500); close(held.tailY, 500 - 0.4 * scale);
	assert.equal(sample(source, 3).sprites.length, 0);
});

test("below hold tail follows reflected local axis with current moving-line geometry", () => {
	const source = raw([line([], [note(3, 32, { holdTime: 64, speed: 0.2, positionX: 1 })], {
		judgeLineMoveEvents: [{ startTime: 0, endTime: 10000, start: 0.4, end: 0.4, start2: 0.7, end2: 0.7 }],
		judgeLineRotateEvents: [{ startTime: 0, endTime: 10000, start: -90, end: -90 }],
	})]);
	const frame = sample(source, 2, [geometry({ x: 800, y: 300, rotation: Math.PI / 2 })]);
	const held = frame.sprites[0];
	close(held.x, 800); close(held.y, 300 + 112.5); close(held.tailX, 800 - 0.2 * scale); close(held.tailY, held.y);
	for (const hit of frame.hits) { close(hit.x, held.x); close(hit.y, held.y); }
});

test("Auto Play counts all four kinds at exact native boundaries and retains only recent effects", () => {
	const source = raw([line([note(1, 32), note(2, 64), note(4, 96), note(3, 128, { holdTime: 32 })])]);
	const chart = prepareNoteChart(source, prepareChart(source)), frame = createNotePerformanceFrame();
	const at = (time: number) => { sampleNoteChart(chart, time, [geometry()], 2000, 1000, frame); return frame; };
	assert.equal(at(0.999).judged, 0);
	assert.equal(at(1).judged, 1); close(frame.hits[0].age, 0);
	assert.equal(at(1.5).hits.length, 1); close(frame.hits[0].age, 0.5);
	assert.equal(at(1.5001).hits.length, 0);
	assert.equal(at(2).judged, 2); assert.equal(at(3).judged, 3);
	assert.equal(at(4).judged, 3); assert.equal(frame.hits.length, 1); close(frame.hits[0].age, 0);
	at(4.31); assert.equal(frame.hits.length, 3);
	close(frame.hits[0].age, 0.31); close(frame.hits[1].age, 0.16); close(frame.hits[2].age, 0.01);
	assert.equal(at(4.999).judged, 3);
	assert.equal(at(5).judged, 4); assert.equal(frame.sprites.length, 0);
	close(frame.hits[frame.hits.length - 1].age, 0);
	assert.equal(at(5.5001).hits.length, 0); assert.equal(frame.judged, 4);
});

test("pause, backward seek, restart and re-enabling equal a fresh sample without judgement bursts", () => {
	const source = raw([line([note(1, 32), note(3, 64, { holdTime: 128, speed: 0.2 }), note(4, 224)])]);
	const chart = prepareNoteChart(source, prepareChart(source)), output = createNotePerformanceFrame(), lines = [geometry()];
	for (const time of [0, 1, 2, 2.25, 2.25, 8, 3, 0, 6.5, 2.25]) {
		sampleNoteChart(chart, time, lines, 2000, 1000, output);
		assert.deepEqual(output, sample(source, time, lines));
		assert.ok(output.hits.every((hit) => hit.age >= 0 && hit.age <= 0.5));
	}
});

test("output arrays and live sprite/hit objects are reused across adjacent samples", () => {
	const source = raw([line([note(3, 32, { holdTime: 64, speed: 0.1 })])]);
	const chart = prepareNoteChart(source, prepareChart(source)), output = createNotePerformanceFrame();
	const sprites = output.sprites, hits = output.hits;
	sampleNoteChart(chart, 1.01, [geometry()], 2000, 1000, output);
	const sprite = sprites[0], hit = hits[0];
	sampleNoteChart(chart, 1.02, [geometry()], 2000, 1000, output);
	assert.equal(output.sprites, sprites); assert.equal(output.hits, hits);
	assert.equal(output.sprites[0], sprite); assert.equal(output.hits[0], hit);
});

test("projection culls offstage notes, not a hold body crossing the stage", () => {
	const source = raw([line([note(1, 320), note(3, 320, { holdTime: 64, speed: -5 })])]);
	const frame = sample(source, 0);
	assert.deepEqual(frame.sprites.map((it) => it.kind), ["hold"]);
	assert.ok(frame.sprites[0].y < 0); close(frame.sprites[0].tailY, 500);
});

test("successive six-note groups retain independent effects when an old line teleports away", () => {
	const group = (time: number) => [
		note(3, time, { holdTime: 4.8 }), note(4, time),
		...Array.from({ length: 4 }, (_, i) => note(2, time + i + 1)),
	];
	const source = raw([
		line(group(32), [], { judgeLineMoveEvents: [
			{ startTime: 0, endTime: 38.4, start: 0.25, end: 0.25, start2: 0.5, end2: 0.5 },
			{ startTime: 38.4, endTime: 10000, start: 3, end: 3, start2: 0.5, end2: 0.5 },
		] }),
		line(group(39.2), [], { judgeLineMoveEvents: [
			{ startTime: 0, endTime: 10000, start: 0.75, end: 0.75, start2: 0.5, end2: 0.5 },
		] }),
	]);
	const geometry = prepareChart(source), chart = prepareNoteChart(source, geometry), output = createNotePerformanceFrame();
	sampleNoteChart(chart, 1.4, sampleChart(geometry, 1.4, 2000, 1000).lines, 2000, 1000, output);
	assert.equal(output.hits.filter(hit => Math.abs(hit.x - 500) < 1e-8).length, 7);
	assert.equal(output.hits.filter(hit => Math.abs(hit.x - 1500) < 1e-8).length, 7);
	assert.ok(output.hits.every(hit => hit.y === 500 && hit.age < 0.5));
	const firstId = output.hits[0].id;
	sampleNoteChart(chart, 1.49, sampleChart(geometry, 1.49, 2000, 1000).lines, 2000, 1000, output);
	close(output.hits.find(hit => hit.id === firstId)!.x, 500);
	sampleNoteChart(chart, 1.501, sampleChart(geometry, 1.501, 2000, 1000).lines, 2000, 1000, output);
	assert.equal(output.hits.some(hit => hit.id === firstId), false);
});

test("birth translation and rotation survive resize, expiry and backward seeks with the chart offset", () => {
	const source = raw([line([note(4, 32, { positionX: 2 })], [], {
		judgeLineMoveEvents: [
			{ startTime: 0, endTime: 32, start: 0.2, end: 0.3, start2: 0.4, end2: 0.6 },
			{ startTime: 32, endTime: 64, start: 0.3, end: 0.8, start2: 0.6, end2: 0.1 },
		],
		judgeLineRotateEvents: [
			{ startTime: 0, endTime: 32, start: 0, end: 90 },
			{ startTime: 32, endTime: 64, start: 90, end: 180 },
		],
	})], 0.25);
	const geometry = prepareChart(source), chart = prepareNoteChart(source, geometry), output = createNotePerformanceFrame();
	for (const [width, height] of [[2000, 1000], [1600, 900], [1280, 960]]) {
		for (const time of [1.45, 1.8, 1.3, 1.45]) {
			sampleNoteChart(chart, time, sampleChart(geometry, time, width, height).lines, width, height, output);
			if (time === 1.8) { assert.deepEqual(output.hits, []); continue; }
			assert.equal(output.hits.length, 1);
			close(output.hits[0].x, width * 0.3);
			close(output.hits[0].y, height * 0.4 - width * 0.1125);
			close(output.hits[0].rotation, -Math.PI / 2);
			close(output.hits[0].age, time - 1.25);
		}
	}
});
