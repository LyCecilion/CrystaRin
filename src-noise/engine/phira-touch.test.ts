// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPhiraTouchMask } from "./phira-touch";
import type { PhiraImage, PhiraTouch } from "./phira-types";

const solid = (red = 255, alpha = 255): PhiraImage => ({ width: 1, height: 1, pixels: new Uint8Array([red, 0, 0, alpha]) });
const finger = (id: number, strength = 1): PhiraTouch => ({ id, x: 0.5, y: 0.5, strength });
const alphaAt = (aux: Uint8Array, width: number, x: number, y: number): number => aux[(y * width + x) * 4 + 3];

test("Hide runs once from current scale and clears the final stale alpha without touching RGB", () => {
	const mask = createPhiraTouchMask(solid());
	const aux = new Uint8Array(20 * 20 * 4).fill(73);
	assert.equal(mask.render(aux, 20, 20, 1, [finger(1)], 0), true);
	assert.equal(alphaAt(aux, 20, 10, 10), 0);
	mask.render(aux, 20, 20, 1, [finger(1)], 0.1);
	assert.equal(alphaAt(aux, 20, 10, 10), 255);
	assert.equal(mask.render(aux, 20, 20, 1, [], 0.1), true);
	assert.equal(mask.render(aux, 20, 20, 1, [], 0.15), true);
	assert.equal(alphaAt(aux, 20, 10, 10), 255);
	assert.equal(mask.render(aux, 20, 20, 1, [], 0.201), false);
	for (let i = 0; i < aux.length; i++) assert.equal(aux[i], i % 4 === 3 ? 0 : 73);
});

test("reused disappearing slots restart Show at zero and stable IDs survive list reorder", () => {
	const mask = createPhiraTouchMask(solid(128, 128));
	const aux = new Uint8Array(6 * 6 * 4);
	mask.render(aux, 6, 6, 1, [finger(1)], 0);
	mask.render(aux, 6, 6, 1, [finger(1)], 0.1);
	assert.equal(alphaAt(aux, 6, 2, 2), 64);
	mask.render(aux, 6, 6, 1, [], 0.1);
	mask.render(aux, 6, 6, 1, [finger(2)], 0.15);
	assert.equal(alphaAt(aux, 6, 2, 2), 0);
	mask.render(aux, 6, 6, 1, [finger(2), finger(3)], 0.251);
	mask.render(aux, 6, 6, 1, [finger(3), finger(2)], 0.352);
	assert.equal(alphaAt(aux, 6, 2, 2), 96);
});

test("red/alpha bilinear sampling flips top-down PNG rows and replicates half-grid pixels", () => {
	const sprite: PhiraImage = { width: 1, height: 2, pixels: new Uint8Array([20, 99, 88, 255, 220, 99, 88, 255]) };
	const mask = createPhiraTouchMask(sprite);
	const aux = new Uint8Array(20 * 20 * 4);
	mask.render(aux, 20, 20, 1, [finger(1)], 0);
	mask.render(aux, 20, 20, 1, [finger(1)], 0.101);
	assert.equal(alphaAt(aux, 20, 10, 6), 220);
	assert.equal(alphaAt(aux, 20, 10, 12), 20);
	for (let y = 0; y < 20; y += 2) {
		for (let x = 0; x < 20; x += 2) {
			const value = alphaAt(aux, 20, x, y);
			assert.equal(alphaAt(aux, 20, x + 1, y), value);
			assert.equal(alphaAt(aux, 20, x, y + 1), value);
			assert.equal(alphaAt(aux, 20, x + 1, y + 1), value);
		}
	}
	assert.equal(alphaAt(aux, 20, 10, 10), 80);
});

test("R8 quantizes after each source-over finger and strength multiplies source alpha", () => {
	const mask = createPhiraTouchMask(solid(128, 128));
	const aux = new Uint8Array(6 * 6 * 4);
	mask.render(aux, 6, 6, 1, [finger(1, 0.5)], 0);
	mask.render(aux, 6, 6, 1, [finger(1, 0.5)], 0.101);
	assert.equal(alphaAt(aux, 6, 2, 2), 32);
	mask.reset();
	mask.render(aux, 6, 6, 1, [finger(1), finger(2)], 1);
	mask.render(aux, 6, 6, 1, [finger(1), finger(2)], 1.101);
	assert.equal(alphaAt(aux, 6, 2, 2), 96);
});

test("reset and backwards seeks discard prior slots and timing", () => {
	const mask = createPhiraTouchMask(solid());
	const aux = new Uint8Array(6 * 6 * 4);
	mask.render(aux, 6, 6, 1, [finger(1)], 2);
	mask.render(aux, 6, 6, 1, [finger(1)], 2.101);
	assert.equal(alphaAt(aux, 6, 2, 2), 255);
	mask.render(aux, 6, 6, 1, [finger(1)], 1);
	assert.equal(alphaAt(aux, 6, 2, 2), 0);
	mask.reset();
	assert.equal(mask.render(aux, 6, 6, 1, [], 4), false);
	assert.equal(alphaAt(aux, 6, 2, 2), 0);
});
