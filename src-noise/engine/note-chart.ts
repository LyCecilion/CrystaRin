// SPDX-License-Identifier: GPL-3.0-only
// Ported from Phira-Pro 0c5cf2ee9d2bac1292f16287bb6b662ceee40365:
// prpr/src/parse/{pgr.rs,../parse.rs}, core/{note.rs,hold_body.rs}, judge.rs.
import { noteHitDuration, type NoteHit, type NoteKind, type NotePerformanceFrame, type NoteSprite } from "./note-types";
import type { LineFrame } from "./types";
import { sampleFloat, type NoiseChart } from "./chart";

interface SpeedKey { time: number; floor: number; speed: number }
interface PreparedNote {
	id: number; kind: NoteKind; time: number; end: number; x: number;
	speed: number; floor: number; side: -1 | 1; highlight: boolean;
}
interface NoteLine { speeds: SpeedKey[]; notes: PreparedNote[] }
interface HitEvent {
	time: number; noteId: number;
	xRatio: number; yRatio: number; yWidthRatio: number; rotation: number;
}
export interface NoteChart {
	offset: number;
	total: number;
	lines: readonly NoteLine[];
}
interface CompiledChart extends NoteChart { events: HitEvent[]; completions: number[] }
interface FramePool { sprites: NoteSprite[]; hits: NoteHit[] }
const pools = new WeakMap<NotePerformanceFrame, FramePool>();
const heightRatio = 0.83175;
const holdParticleInterval = 0.15;
const kinds: readonly NoteKind[] = ["tap", "drag", "hold", "flick"];

type Data = Record<string, unknown>;
function record(value: unknown): Data {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid PGR note object");
	return value as Data;
}
function array(value: unknown): unknown[] {
	if (!Array.isArray(value)) throw new Error("Invalid PGR note array");
	return value;
}
function finite(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid PGR note number");
	return value;
}
function upperBound(values: readonly number[], time: number): number {
	let lo = 0, hi = values.length;
	while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid] <= time) lo = mid + 1; else hi = mid; }
	return lo;
}
function speedFloor(keys: readonly SpeedKey[], time: number): number {
	let lo = 0, hi = keys.length;
	while (lo < hi) { const mid = (lo + hi) >>> 1; if (keys[mid].time <= time) lo = mid + 1; else hi = mid; }
	const i = Math.max(0, lo - 1), key = keys[i], next = keys[i + 1];
	if (time <= key.time) return key.floor;
	return next ? key.floor + (next.floor - key.floor) * (time - key.time) / (next.time - key.time)
		: key.floor + (time - key.time) * key.speed;
}

/** Capture the birth transform once. Retain both height- and width-normalized
 * Y terms so resizing can reproject a frozen hit without sampling a later line. */
function prepareHit(time: number, note: PreparedNote, line: NoiseChart["lines"][number], offset: number): HitEvent {
	const t = time + offset;
	const rotation = -sampleFloat(line.rotation, t, 0) * Math.PI / 180;
	return {
		time, noteId: note.id,
		xRatio: sampleFloat(line.x, t, 0.5) + note.x * Math.cos(rotation),
		yRatio: 1 - sampleFloat(line.y, t, 0.5),
		yWidthRatio: note.x * Math.sin(rotation),
		rotation: rotation + (note.side === 1 ? Math.PI : 0),
	};
}

/** Compile once. As in the native PGR parser, floorPosition is retained in the
 * asset but recomputed from speedEvents (it is often rounded in chart exports). */
export function prepareNoteChart(raw: unknown, geometry: NoiseChart): NoteChart {
	const source = record(raw);
	if (source.formatVersion !== 3 && source.formatVersion !== 1) throw new Error("Unsupported PGR note format");
	const chart: CompiledChart = { offset: finite(source.offset), total: 0, lines: [], events: [], completions: [] };
	const lines: NoteLine[] = [];
	const simultaneous = new Map<number, PreparedNote[]>();
	for (const value of array(source.judgeLineList)) {
		const input = record(value), bpm = finite(input.bpm);
		if (bpm <= 0) throw new Error("PGR note BPM must be positive");
		const tick = 60 / 32 / bpm;
		const events = array(input.speedEvents).map((value) => {
			const event = record(value);
			return { start: finite(event.startTime) * tick, end: finite(event.endTime) * tick, speed: finite(event.value) };
		}).filter((event) => event.start <= event.end);
		if (!events.length) throw new Error("PGR note line requires speedEvents");
		events[0].start = 0;
		const speeds: SpeedKey[] = [];
		let floor = 0;
		for (const event of events) {
			if (speeds.length && event.start < speeds[speeds.length - 1].time) throw new Error("Unordered PGR speedEvents");
			speeds.push({ time: event.start, floor, speed: event.speed });
			floor += (event.end - event.start) * event.speed;
		}
		const line: NoteLine = { speeds, notes: [] }, lineIndex = lines.length;
		const birthLine = geometry.lines[lineIndex];
		const birthOffset = chart.offset - geometry.offset;
		for (const side of [-1, 1] as const) {
			for (const value of array(side === -1 ? input.notesAbove : input.notesBelow)) {
				const inputNote = record(value), type = finite(inputNote.type);
				if (!Number.isInteger(type) || type < 1 || type > 4) throw new Error("Unknown PGR note type");
				const ticks = finite(inputNote.time), holdTicks = finite(inputNote.holdTime);
				const time = ticks * tick;
				if (holdTicks < 0) throw new Error("Negative PGR hold duration");
				finite(inputNote.floorPosition);
				const note: PreparedNote = {
					id: chart.total++, kind: kinds[type - 1], time, end: type === 3 ? (ticks + holdTicks) * tick : time,
					x: finite(inputNote.positionX) * 9 / 160, speed: finite(inputNote.speed),
					floor: speedFloor(speeds, time), side, highlight: false,
				};
				line.notes.push(note);
				const group = simultaneous.get(time);
				if (group) group.push(note); else simultaneous.set(time, [note]);
				chart.completions.push(note.end);
				chart.events.push(prepareHit(time, note, birthLine, birthOffset));
				if (note.kind === "hold") {
					for (let pulse = 1; time + pulse * holdParticleInterval < note.end; pulse++) {
						chart.events.push(prepareHit(time + pulse * holdParticleInterval, note, birthLine, birthOffset));
					}
					if (note.end > time) chart.events.push(prepareHit(note.end, note, birthLine, birthOffset));
				}
			}
		}
		lines.push(line);
	}
	for (const group of simultaneous.values()) if (group.length > 1) for (const note of group) note.highlight = true;
	chart.lines = lines;
	chart.completions.sort((a, b) => a - b);
	chart.events.sort((a, b) => a.time - b.time || a.noteId - b.noteId);
	return chart;
}

export function createNotePerformanceFrame(): NotePerformanceFrame {
	const frame: NotePerformanceFrame = { sprites: [], hits: [], judged: 0, total: 0, time: 0 };
	pools.set(frame, { sprites: [], hits: [] });
	return frame;
}

/** Stateless song-clock sampling: pause, seek and toggling need no reset.
 * Projection follows native world width 2, aspect width/height, flow speed 1.
 * Below notes reflect local Y only. Line alpha does NOT fade native notes.
 * Hold head scrolling uses the line integral; body length uses its own speed.
 * Hit pulses are anchored to authored time, not frame arrival (native .15 s).
 * Hit positions/rotations are captured at birth; only stage-size projection changes.
 */
export function sampleNoteChart(chart: NoteChart, audioTime: number, lines: readonly LineFrame[], width: number, height: number, output: NotePerformanceFrame): void {
	const compiled = chart as CompiledChart, time = audioTime - chart.offset;
	output.time = time;
	output.total = chart.total;
	output.judged = upperBound(compiled.completions, time);
	let pool = pools.get(output);
	if (!pool) { pool = { sprites: [], hits: [] }; pools.set(output, pool); }
	let spriteCount = 0, hitCount = 0;
	const distanceScale = height / (2 * heightRatio);
	// Conservative projected sprite padding; never cull a partly visible head/tail.
	const padding = width * 0.15;
	if (width > 0 && height > 0 && Number.isFinite(time)) {
		for (let i = 0; i < chart.lines.length; i++) {
			const geometry = lines[i];
			if (!geometry) continue;
			const line = chart.lines[i], floor = speedFloor(line.speeds, time);
			const cos = Math.cos(geometry.rotation), sin = Math.sin(geometry.rotation);
			for (const note of line.notes) {
				if (time >= note.end) continue;
				const hold = note.kind === "hold", holding = hold && time >= note.time;
				const distance = holding ? 0 : (note.floor - floor) * (hold ? 1 : note.speed) * distanceScale;
				// Native show_below=false cover test, in world-space units.
				if (time < note.time && distance <= -width * 0.0005) continue;
				const x = note.x * width, y = note.side * distance;
				const tail = y + (hold ? note.side * (note.end - Math.max(time, note.time)) * note.speed * distanceScale : 0);
				const headX = geometry.x + x * cos - y * sin, headY = geometry.y + x * sin + y * cos;
				const tailX = geometry.x + x * cos - tail * sin, tailY = geometry.y + x * sin + tail * cos;
				if (Math.max(headX, tailX) < -padding || Math.min(headX, tailX) > width + padding
					|| Math.max(headY, tailY) < -padding || Math.min(headY, tailY) > height + padding) continue;
				let sprite = pool.sprites[spriteCount];
				if (!sprite) { sprite = {} as NoteSprite; pool.sprites.push(sprite); }
				sprite.id = note.id; sprite.kind = note.kind; sprite.x = headX; sprite.y = headY;
				sprite.tailX = tailX; sprite.tailY = tailY; sprite.rotation = geometry.rotation;
				sprite.opacity = 1; sprite.highlight = note.highlight; sprite.headVisible = !holding; sprite.side = note.side;
				output.sprites[spriteCount++] = sprite;
			}
		}
		let lo = 0, hi = compiled.events.length;
		while (lo < hi) { const mid = (lo + hi) >>> 1; if (compiled.events[mid].time < time - noteHitDuration) lo = mid + 1; else hi = mid; }
		for (let i = lo; i < compiled.events.length && compiled.events[i].time <= time; i++) {
			const event = compiled.events[i];
			let hit = pool.hits[hitCount];
			if (!hit) { hit = {} as NoteHit; pool.hits.push(hit); }
			hit.id = i;
			hit.x = event.xRatio * width;
			hit.y = event.yRatio * height + event.yWidthRatio * width;
			hit.rotation = event.rotation;
			hit.age = time - event.time; hit.opacity = 1;
			output.hits[hitCount++] = hit;
		}
	}
	output.sprites.length = spriteCount;
	output.hits.length = hitCount;
}
