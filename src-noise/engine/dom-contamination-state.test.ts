// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createContaminationState,
	resetContamination,
	sampleDomCoverage,
	updateContamination,
	type ContaminationKind,
	type ContaminationState,
	type DomCoverage,
} from "./dom-contamination-state";
import type { AreaFrame, Stage } from "./types";

const stage: Stage = { left: 0, top: 0, width: 400, height: 400 };
const area: AreaFrame = { cx: 200, cy: 200, width: 240, height: 240, rotation: 0, phase: "active", opacity: 1, subtract: false };
const target = { left: 100, top: 100, width: 200, height: 200 };
const coverage = (): DomCoverage => ({ fraction: 0, left: 0, top: 0, width: 0, height: 0 });

function expose(kind: ContaminationKind, time: number, duration: number) {
	const state = createContaminationState();
	for (let frame = 0; frame < duration * 60; frame++) {
		updateContamination(state, kind, 0.8, 0, time, 1 / 60);
	}
	return state;
}

function assertBounded(state: ContaminationState): void {
	for (const value of [state.coverage, state.residue, state.strength]) {
		assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
	}
}

test("only active effective noise contacts the DOM; empty samples clear reused output", () => {
	const output = coverage();
	sampleDomCoverage(output, [area], stage, target);
	assert.equal(output.fraction, 1);
	for (const phase of ["ready", "disabled"] as const) {
		sampleDomCoverage(output, [{ ...area, phase }], stage, target);
		assert.deepEqual(output, coverage());
	}
	sampleDomCoverage(output, [], stage, target);
	assert.deepEqual(output, coverage());
});

test("rotated contact preserves viewport mapping with translated cover-stage origins", () => {
	const rotated = { ...area, width: 240, height: 100, rotation: Math.PI / 2 };
	const inside = { left: 180, top: 110, width: 40, height: 180 };
	const original = coverage();
	sampleDomCoverage(original, [rotated], stage, inside);
	assert.equal(original.fraction, 1);
	const translated = coverage();
	sampleDomCoverage(translated, [rotated], { ...stage, left: -70, top: 35 }, { ...inside, left: inside.left - 70, top: inside.top + 35 });
	assert.deepEqual(translated, original);
	sampleDomCoverage(translated, [rotated], stage, { left: 240, top: 180, width: 20, height: 40 });
	assert.equal(translated.fraction, 0);
});

test("normal inset and expanded Subtract exclusion leave holes quiet", () => {
	const output = coverage();
	const normal = { ...area, width: 400, height: 400 };
	const hole = { ...area, width: 80, height: 80, subtract: true };
	sampleDomCoverage(output, [normal, hole], stage, { left: 170, top: 170, width: 60, height: 60 });
	assert.equal(output.fraction, 0);
	// Outside the visible hole, but inside its five-percent input expansion.
	sampleDomCoverage(output, [normal, hole], stage, { left: 242, top: 180, width: 12, height: 40 });
	assert.equal(output.fraction, 0);
	sampleDomCoverage(output, [normal, hole], stage, { left: 270, top: 180, width: 20, height: 40 });
	assert.equal(output.fraction, 1);
	// The visible normal border is not effective input contact either.
	sampleDomCoverage(output, [normal], stage, { left: 2, top: 100, width: 12, height: 40 });
	assert.equal(output.fraction, 0);
});

test("Subtract-only and overlapping holes retain the chart input parity rule", () => {
	const output = coverage();
	const inverse = { ...area, subtract: true };
	sampleDomCoverage(output, [inverse], stage, target);
	assert.equal(output.fraction, 1);
	sampleDomCoverage(output, [inverse, inverse], stage, target);
	assert.equal(output.fraction, 0);
	sampleDomCoverage(output, [inverse, inverse, inverse], stage, target);
	assert.equal(output.fraction, 1);
	sampleDomCoverage(output, [area, inverse], stage, target);
	assert.equal(output.fraction, 0);
	sampleDomCoverage(output, [area, inverse, inverse], stage, target);
	assert.equal(output.fraction, 1);
});

test("clipping excludes offstage and edge-only contact and normalizes against original rect", () => {
	const output = coverage();
	const full = { ...area, width: 1000, height: 1000 };
	sampleDomCoverage(output, [full], stage, { left: -100, top: 100, width: 200, height: 100 });
	assert.equal(output.fraction, 0.5);
	assert.equal(output.left, 0.5);
	assert.equal(output.width, 0.5);
	assert.equal(output.top, 0);
	assert.equal(output.height, 1);
	for (const rect of [
		{ left: 400, top: 100, width: 20, height: 20 },
		{ left: 100, top: 400, width: 20, height: 20 },
		{ left: 500, top: 100, width: 20, height: 20 },
		{ left: 100, top: 100, width: 0, height: 20 },
	]) {
		sampleDomCoverage(output, [full], stage, rect);
		assert.deepEqual(output, coverage());
	}
});

test("partial coverage produces a localized ghost patch rather than whole-target bounds", () => {
	const output = coverage();
	sampleDomCoverage(output, [{ ...area, cx: 100, cy: 100, width: 120, height: 120 }], stage, { left: 0, top: 0, width: 300, height: 300 });
	assert.ok(output.fraction > 0 && output.fraction < 0.2);
	assert.ok(output.left > 0 && output.top > 0);
	assert.ok(output.width < 0.4 && output.height < 0.4);
	assert.ok(output.left + output.width < 0.6);
	assert.ok(output.top + output.height < 0.6);
});

test("a single swept transfer frame is visible and survives pointer expiry before fully restoring", () => {
	const state = createContaminationState();
	updateContamination(state, "image", 0, 1, 35, 1 / 60);
	assert.ok(state.residue > 0.2 && state.strength > 0.15);
	updateContamination(state, "image", 0, 0, 39, 4);
	assert.equal(state.coverage, 0);
	assert.ok(state.residue > 0 && state.strength > 0);
	updateContamination(state, "image", 0, 0, 39, 120);
	assert.equal(state.residue, 0);
	assert.equal(state.strength, 0);
});

test("brief early coverage leaves a readable afterimage after the field has gone", () => {
	for (const coverage of [1, 0.1]) {
		const state = createContaminationState();
		updateContamination(state, "text", coverage, 0, 3.5, 1 / 60);
		updateContamination(state, "text", 0, 0, 4.5, 1);
		assert.equal(state.coverage, 0);
		assert.ok(state.strength > (coverage === 1 ? 0.45 : 0.2), "residue must not become imperceptible immediately after a brief pass");
		for (let frame = 1; frame <= 300; frame++) {
			updateContamination(state, "text", 0, 0, 4.5 + frame / 10, 0.1);
		}
		assert.equal(state.strength, 0, "stronger residue must still fully recover");
	}
});

test("stationary transfer floors do not accumulate extra impulses at higher frame rates", () => {
	const slower = createContaminationState();
	const faster = createContaminationState();
	for (let frame = 0; frame < 30; frame++) updateContamination(slower, "image", 0, 1, 40, 1 / 30);
	for (let frame = 0; frame < 120; frame++) updateContamination(faster, "image", 0, 1, 40, 1 / 120);
	assert.ok(Math.abs(slower.residue - faster.residue) < 0.000001);
	assert.ok(Math.abs(slower.strength - faster.strength) < 0.000001);
	assertBounded(slower);
	assertBounded(faster);
	assert.deepEqual(createContaminationState(), { coverage: 0, residue: 0, strength: 0 });
});

test("repeated exposure deepens and refreshes bounded memory instead of restarting a pulse", () => {
	const state = expose("card", 40, 1);
	const first = state.residue;
	updateContamination(state, "card", 0, 0, 40, 1);
	const faded = state.residue;
	assert.ok(faded < first);
	updateContamination(state, "card", 0.8, 0, 40, 1);
	assert.ok(state.residue > first);
	const strength = state.strength;
	for (let frame = 0; frame < 1200; frame++) {
		updateContamination(state, "card", 0.8, 0, 40, 1 / 60);
		assertBounded(state);
		assert.ok(state.residue < 1 && state.strength < 1);
	}
	assert.ok(state.strength >= strength);
});

test("text recovers before images and card edges, and dense passages retain more memory", () => {
	const text = { coverage: 0, residue: 0.7, strength: 0 };
	const image = { ...text };
	const card = { ...text };
	updateContamination(text, "text", 0, 0, 40, 2);
	updateContamination(image, "image", 0, 0, 40, 2);
	updateContamination(card, "card", 0, 0, 40, 2);
	assert.ok(text.residue < image.residue && image.residue < card.residue);
	const early = { coverage: 0, residue: 0.7, strength: 0 };
	const dense = { ...early };
	updateContamination(early, "image", 0, 0, 12, 2);
	updateContamination(dense, "image", 0, 0, 40, 2);
	assert.ok(dense.residue > early.residue);
});

test("song phases intensify smoothly, subdue detail into remnants/Grid, and settle by the end", () => {
	for (const kind of ["text", "image", "card"] as const) {
		const early = expose(kind, 12, 2);
		const dense = expose(kind, 40, 2);
		const remnants = expose(kind, 75, 2);
		const grid = expose(kind, 120, 2);
		const tail = expose(kind, 149, 2);
		assert.ok(early.strength > 0);
		assert.ok(dense.strength > early.strength);
		assert.ok(remnants.strength < dense.strength);
		assert.ok(grid.strength < remnants.strength);
		assert.ok(tail.strength < grid.strength);
		for (const boundary of [26, 65.2, 68, 108.1]) {
			const before = { coverage: 0, residue: 0.5, strength: 0 };
			const after = { ...before };
			updateContamination(before, kind, 0.8, 0, boundary - 0.001, 0);
			updateContamination(after, kind, 0.8, 0, boundary + 0.001, 0);
			assert.ok(Math.abs(after.strength - before.strength) < 0.01);
		}
		updateContamination(dense, kind, 1, 1, 150.75, 1 / 60);
		assert.equal(dense.strength, 0);
		assert.equal(dense.residue, 0);
	}
	assert.ok(expose("card", 75, 2).strength > expose("text", 75, 2).strength);
});

test("paused delta zero freezes memory while computing direct appearance and reset restores exactly", () => {
	const state = expose("image", 40, 1);
	const residue = state.residue;
	updateContamination(state, "image", 0, 1, 40, 0);
	const absent = state.strength;
	for (let frame = 0; frame < 100; frame++) updateContamination(state, "image", 0, 1, 40, 0);
	assert.equal(state.residue, residue);
	assert.equal(state.strength, absent);
	updateContamination(state, "image", 1, 1, 40, 0);
	assert.equal(state.residue, residue);
	assert.equal(state.coverage, 1);
	assert.ok(state.strength > absent);
	updateContamination(state, "image", 1, 1, 150.75, 0);
	assert.equal(state.residue, residue);
	assert.equal(state.strength, 0);
	resetContamination(state);
	assert.deepEqual(state, createContaminationState());
});

test("non-finite inputs and out-of-range contact do not poison numeric state", () => {
	const state = createContaminationState();
	updateContamination(state, "text", Number.NaN, Infinity, Number.NaN, Infinity);
	assertBounded(state);
	updateContamination(state, "text", 10, -2, 40, 1);
	assertBounded(state);
	assert.equal(state.coverage, 1);
});
