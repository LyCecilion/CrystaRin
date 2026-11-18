#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const [input, output, notesOutput, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length) {
	throw new Error("Usage: node scripts/prepare-noise-chart.mjs <official-chart.json> <output.json> [notes-output.json]");
}

const chart = JSON.parse(await readFile(input, "utf8"));
if (chart.formatVersion !== 3 || !Array.isArray(chart.judgeLineList)) {
	throw new TypeError("Expected an official PGR formatVersion 3 chart");
}
const blocks = chart.blockAreaList ?? chart.BlockAreaList ?? [];
if (!Array.isArray(blocks)) throw new TypeError("Expected blockAreaList to be an array");

// Preserve block geometry and all its animation fields without quantization.
// Only the four judge-line fields consumed by noise playback survive reduction.
const compact = {
	formatVersion: chart.formatVersion,
	offset: chart.offset ?? 0,
	blockAreaList: blocks,
	judgeLineList: chart.judgeLineList.map((line) => {
		if (!Number.isFinite(line.bpm) || line.bpm <= 0) {
			throw new TypeError("Judge-line BPM must be a positive finite number");
		}
		for (const field of ["judgeLineMoveEvents", "judgeLineRotateEvents", "judgeLineDisappearEvents"]) {
			if (!Array.isArray(line[field])) throw new TypeError(`Expected ${field} to be an array`);
		}
		return {
			bpm: line.bpm,
			judgeLineMoveEvents: line.judgeLineMoveEvents,
			judgeLineRotateEvents: line.judgeLineRotateEvents,
			judgeLineDisappearEvents: line.judgeLineDisappearEvents,
		};
	}),
};
// Keep the optional note companion separate so the default noise-only mode
// need not download or compile the optional note performance.
const notes = notesOutput ? {
	formatVersion: chart.formatVersion,
	offset: chart.offset ?? 0,
	judgeLineList: chart.judgeLineList.map((line) => {
		for (const field of ["notesAbove", "notesBelow", "speedEvents"]) {
			if (!Array.isArray(line[field])) throw new TypeError(`Expected ${field} to be an array`);
		}
		return {
			bpm: line.bpm,
			notesAbove: line.notesAbove,
			notesBelow: line.notesBelow,
			speedEvents: line.speedEvents,
		};
	}),
} : null;
await writeFile(output, `${JSON.stringify(compact)}\n`, "utf8");
if (notesOutput) await writeFile(notesOutput, `${JSON.stringify(notes)}\n`, "utf8");
