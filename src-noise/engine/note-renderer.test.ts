// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import test from "node:test";
import { createNoteDrawBatches, fillNoteDrawBatches } from "./note-renderer";
import type { NoteKind, NoteSprite } from "./note-types";

function sprite(id: number, kind: NoteKind, highlight = false): NoteSprite {
	return { id, kind, highlight, x: 100, y: 100, tailX: 100, tailY: 0,
		rotation: 0, opacity: 1, headVisible: true, side: -1 };
}

test("overlapping notes obey native type depth even when lower layers arrive last", () => {
	const pairs: readonly (readonly [NoteKind, NoteKind])[] = [
		["hold", "drag"], ["hold", "tap"], ["hold", "flick"],
		["drag", "tap"], ["drag", "flick"], ["tap", "flick"],
	];
	const batches = createNoteDrawBatches();
	for (const [lower, upper] of pairs) {
		for (const lowerHighlight of [false, true]) {
			for (const upperHighlight of [false, true]) {
				const foreground = sprite(1, upper, upperHighlight);
				const background = sprite(2, lower, lowerHighlight);
				// Different judge lines can submit the background after the foreground.
				const frame = Object.freeze([foreground, background]);
				fillNoteDrawBatches(frame, batches);
				assert.deepEqual(batches.flat().map(note => note.id), [2, 1], `${lower} must stay below ${upper}`);
				assert.deepEqual(frame.map(note => note.id), [1, 2]);
			}
		}
	}
});

test("highlights stay within their type and same-texture chart order remains stable", () => {
	const batches = createNoteDrawBatches();
	fillNoteDrawBatches([
		sprite(17, "tap", true), sprite(8, "hold", true), sprite(5, "tap"),
		sprite(2, "hold"), sprite(9, "tap"), sprite(1, "hold", true),
	], batches);
	assert.deepEqual(batches.flat().map(note => note.id), [2, 8, 1, 5, 9, 17]);
});

test("reused draw batches cannot retain notes after a seek or an empty frame", () => {
	const batches = createNoteDrawBatches();
	fillNoteDrawBatches([sprite(1, "hold"), sprite(2, "flick", true)], batches);
	fillNoteDrawBatches([sprite(3, "drag")], batches);
	assert.deepEqual(batches.flat().map(note => note.id), [3]);
	fillNoteDrawBatches([], batches);
	assert.deepEqual(batches.flat(), []);
});
