// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { createPostFxTimelineFrame, samplePostFxTimeline } from "./postfx-timeline";

function close(actual: number, expected: number): void {
	assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
}

test("the opening does not inherit the static Bloom and Glitch values or a future slash", () => {
	const frame = createPostFxTimelineFrame();
	samplePostFxTimeline(frame, 0);
	assert.equal(frame.bloomBrightness, 0);
	assert.equal(frame.vignetteDarkness, 0);
	assert.equal(frame.glitchRange, 0);
	assert.equal(frame.gridOpacity, 0);
	assert.deepEqual(frame.slashes[2], { position: { x: 0, y: 0 }, lineDirection: 0, direction: 0, strength: 0 });
	close(frame.slashes[0].lineDirection, 15);
	close(frame.slashes[0].direction, 100);
});

test("the 88.5s drop samples its peak rather than interpolating from the next key", () => {
	const frame = createPostFxTimelineFrame();
	samplePostFxTimeline(frame, 88.5);
	close(frame.bloomBrightness, 6.5);
	close(frame.glitchRange, 0.23);
	close(frame.convergence, 8);
	close(frame.slashes[0].strength, 2);
	close(frame.slashes[1].strength, 2);
});

test("outgoing easing controls cubic transitions, including slash decay", () => {
	const frame = createPostFxTimelineFrame();
	// Scale 4 -> 2.5, InOutCubic, at one quarter of the interval.
	samplePostFxTimeline(frame, 100 + (108.11000061035156 - 100) / 4);
	close(frame.glitchDogScale, 4 + (2.5 - 4) * 0.0625);
	// Slash 1, 3 -> 0, OutCubic, at one quarter of its outgoing interval.
	samplePostFxTimeline(frame, 115.23999786376953 + (116 - 115.23999786376953) / 4);
	close(frame.slashes[0].strength, 3 * 0.75 ** 3);
});

test("the outro holds square-wave values and ignores the radius sentinel", () => {
	const frame = createPostFxTimelineFrame();
	samplePostFxTimeline(frame, 148.5);
	close(frame.glitchMapBrightness, 1.6);
	samplePostFxTimeline(frame, 148.9);
	assert.equal(frame.glitchMapBrightness, 0);
	samplePostFxTimeline(frame, 149);
	close(frame.glitchMapBrightness, 1.6);
	close(frame.animationTime, 146.7530059814453);
	samplePostFxTimeline(frame, 150.75);
	close(frame.vignetteRadius, 0.15);
	assert.equal(frame.vignetteDarkness, 1);
	assert.equal(frame.convergence, 0);
});

test("backward seeks restore slash info and values without retained future state", () => {
	const frame = createPostFxTimelineFrame();
	samplePostFxTimeline(frame, 0);
	const opening = structuredClone(frame);
	samplePostFxTimeline(frame, 125.94);
	assert.ok(frame.slashes.every(slash => slash.strength > 0));
	close(frame.slashes[0].position.x, 0.3);
	samplePostFxTimeline(frame, 0);
	assert.deepEqual(frame, opening);
});

test("Grid fades in during 108.1–108.5 seconds and remains visible after the last key", () => {
	const frame = createPostFxTimelineFrame();
	samplePostFxTimeline(frame, 108);
	assert.equal(frame.gridOpacity, 0);
	samplePostFxTimeline(frame, 108.3);
	close(frame.gridOpacity, 0.3);
	samplePostFxTimeline(frame, 108.5);
	close(frame.gridOpacity, 0.6);
	samplePostFxTimeline(frame, 149);
	close(frame.gridOpacity, 0.6);
});

test("the backdrop fades before Grid appears without freezing the outro opacity", () => {
	const frame = createPostFxTimelineFrame();
	samplePostFxTimeline(frame, 0);
	close(frame.bgAlpha, 0.8);
	samplePostFxTimeline(frame, 66.6);
	close(frame.bgAlpha, 0.425);
	assert.equal(frame.gridOpacity, 0);
	samplePostFxTimeline(frame, 68);
	close(frame.bgAlpha, 0.05);
	samplePostFxTimeline(frame, 149);
	close(frame.bgAlpha, 0.05);
	close(frame.gridOpacity, 0.6);
});
