import type { AreaFrame, AreaPhase, ChartFrame } from "./types";

interface Point { x: number; y: number }
interface Timed { time: number }
interface ScaleKey extends Timed {
	anchor: Point;
	value: Point;
	easeX: number;
	easeY: number;
	center: Point;
}
interface RotateKey extends Timed {
	anchor: Point;
	value: number;
	ease: number;
	cos: number;
	sin: number;
	/** Completed anchor translations: x = xx * width + xy * height. */
	xx: number;
	xy: number;
	yx: number;
	yy: number;
}
interface MoveKey extends Timed { value: Point; easeX: number; easeY: number }
interface Block {
	center: Point;
	size: Point;
	appear: number;
	enable: number;
	disable: number;
	disappear: number;
	subtract: boolean;
	scale: ScaleKey[];
	rotate: RotateKey[];
	move: MoveKey[];
}
interface FloatKey extends Timed { value: number }
interface Line { x: FloatKey[]; y: FloatKey[]; rotation: FloatKey[]; alpha: FloatKey[] }

export interface NoiseChart {
	readonly offset: number;
	readonly blocks: readonly Block[];
	readonly lines: readonly Line[];
}

type RecordValue = Record<string, unknown>;
const radians = Math.PI / 180;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

function record(value: unknown): RecordValue {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError("Expected a chart object");
	}
	return value as RecordValue;
}

function list(value: unknown): unknown[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new TypeError("Expected a chart event array");
	return value;
}

function number(value: unknown, fallback?: number): number {
	if (value === undefined && fallback !== undefined) return fallback;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new TypeError("Expected a finite chart number");
	}
	return value;
}

function point(value: unknown): Point {
	const p = record(value);
	return { x: number(p.x), y: number(p.y) };
}

function safeRatio(next: number, current: number): number {
	// Native SafeDiv treats a zero denominator as an unchanged center axis.
	return Math.abs(current) < 8 * 2 ** -149 ? 1 : next / current;
}

function prepareBlock(value: unknown): Block {
	const raw = record(value);
	const bl = point(raw.bottomLeftPercentage);
	const tr = point(raw.topRightPercentage);
	const center = { x: (bl.x + tr.x) / 2, y: (bl.y + tr.y) / 2 };
	const scale: ScaleKey[] = list(raw.scaleEvents).map((value) => {
		const e = record(value);
		return { time: number(e.time), anchor: point(e.anchor), value: point(e.scale),
			easeX: number(e.easeTypeX, 0), easeY: number(e.easeTypeY, 0), center };
	}).sort((a, b) => a.time - b.time);
	for (let i = 1; i < scale.length; i++) {
		const previous = scale[i - 1];
		const current = scale[i];
		current.center = {
			x: previous.anchor.x + (previous.center.x - previous.anchor.x) * safeRatio(current.value.x, previous.value.x),
			y: previous.anchor.y + (previous.center.y - previous.anchor.y) * safeRatio(current.value.y, previous.value.y),
		};
	}
	const rotate: RotateKey[] = list(raw.rotateEvents).map((value) => {
		const e = record(value);
		return { time: number(e.time), anchor: point(e.anchor), value: number(e.rotation, 0),
			ease: number(e.easeType, 0), cos: 1, sin: 0, xx: 0, xy: 0, yx: 0, yy: 0 };
	}).sort((a, b) => a.time - b.time);
	for (let i = 1; i < rotate.length; i++) {
		const previous = rotate[i - 1];
		const current = rotate[i];
		const angle = (current.value - previous.value) * radians;
		const c = Math.cos(angle);
		const s = Math.sin(angle);
		current.cos = c * previous.cos - s * previous.sin;
		current.sin = s * previous.cos + c * previous.sin;
		current.xx = c * previous.xx - s * previous.yx + (1 - c) * previous.anchor.x;
		current.xy = c * previous.xy - s * previous.yy + s * previous.anchor.y;
		current.yx = s * previous.xx + c * previous.yx - s * previous.anchor.x;
		current.yy = s * previous.xy + c * previous.yy + (1 - c) * previous.anchor.y;
	}
	const move = list(raw.moveEvents).map((value): MoveKey => {
		const e = record(value);
		return { time: number(e.time), value: point(e.endPosition),
			easeX: number(e.easeTypeX, 0), easeY: number(e.easeTypeY, 0) };
	}).sort((a, b) => a.time - b.time);
	return { center, size: { x: tr.x - bl.x, y: tr.y - bl.y },
		appear: number(raw.appearTime, 0), enable: number(raw.enableTime, 0),
		disable: number(raw.disableTime, 0), disappear: number(raw.disappearTime, 0),
		subtract: raw.isSubtract === true, scale, rotate, move };
}

/** Compile the original parser's linear keyframes, including overlap trimming. */
function lineTrack(input: unknown, secondsPerTick: number, axis: boolean, movement: boolean): FloatKey[] {
	const keys: FloatKey[] = [];
	let previousEnd = -Infinity;
	for (const value of list(input)) {
		const e = record(value);
		let startTime = number(e.startTime);
		const endTime = number(e.endTime);
		if (startTime > endTime || endTime <= previousEnd) continue;
		let start = number(axis ? e.start2 : e.start, 0);
		const end = number(axis ? e.end2 : e.end, 0);
		if (startTime < previousEnd) {
			start += (end - start) * (previousEnd - startTime) / (endTime - startTime);
			startTime = previousEnd;
		}
		previousEnd = endTime;
		const time = Math.max(0, startTime * secondsPerTick);
		const last = keys[keys.length - 1];
		if (!last || last.value !== start || (movement && last.time !== time)) {
			keys.push({ time, value: start });
		}
		if (endTime * secondsPerTick > time) keys.push({ time: endTime * secondsPerTick, value: end });
	}
	return keys;
}

export function prepareChart(raw: unknown): NoiseChart {
	const chart = record(raw);
	if (chart.formatVersion !== 3) throw new TypeError("Noise playback requires PGR formatVersion 3");
	return {
		offset: number(chart.offset, 0),
		blocks: list(chart.blockAreaList ?? chart.BlockAreaList).map(prepareBlock),
		lines: list(chart.judgeLineList).map((value): Line => {
			const line = record(value);
			const bpm = number(line.bpm);
			if (bpm <= 0) throw new RangeError("Judge-line BPM must be positive");
			const r = 60 / bpm / 32;
			return { x: lineTrack(line.judgeLineMoveEvents, r, false, true),
				y: lineTrack(line.judgeLineMoveEvents, r, true, true),
				rotation: lineTrack(line.judgeLineRotateEvents, r, false, false),
				alpha: lineTrack(line.judgeLineDisappearEvents, r, false, false) };
		}),
	};
}

function lastIndex(keys: readonly Timed[], time: number): number {
	let low = 0;
	let high = keys.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (keys[middle].time <= time) low = middle + 1;
		else high = middle;
	}
	return low - 1;
}

function easingValue(ease: number, u: number): number {
	if (ease === 13) return 0;
	if (ease === 14) return 1;
	if (ease < 1 || ease > 12 || !Number.isInteger(ease)) return u;
	const power = Math.floor((ease - 1) / 3) + 2;
	switch ((ease - 1) % 3) {
		case 0: return u ** power;
		case 1: return 1 - (1 - u) ** power;
		default: return u < 0.5 ? 2 ** (power - 1) * u ** power : 1 - (2 - 2 * u) ** power / 2;
	}
}

// Native easing uses linear interpolation between 101 uniformly spaced samples.
const easingTables: readonly Float64Array[] = Array.from({ length: 15 }, (_, ease) =>
	Float64Array.from({ length: 101 }, (_, i) => easingValue(ease, i / 100)));

function progress(ease: number, a: number, b: number, time: number): number {
	const u = clamp(b <= a ? 1 : (time - a) / (b - a)) * 100;
	const i = Math.floor(u);
	const table = easingTables[ease] ?? easingTables[0];
	return i === 100 ? table[100] : table[i] + (table[i + 1] - table[i]) * (u - i);
}

export function sampleFloat(keys: readonly FloatKey[], time: number, fallback: number): number {
	if (!keys.length) return fallback;
	const index = Math.max(0, lastIndex(keys, time));
	const current = keys[index];
	const next = keys[index + 1];
	if (!next || time < current.time) return current.value;
	const p = clamp((time - current.time) / (next.time - current.time));
	return current.value + (next.value - current.value) * p;
}

function sampleBlock(block: Block, time: number, width: number, height: number): AreaFrame {
	let cx = block.center.x;
	let cy = block.center.y;
	let sx = 1;
	let sy = 1;
	let rotation = 0;
	const si = lastIndex(block.scale, time);
	if (si >= 0) {
		const key = block.scale[si];
		const next = block.scale[si + 1];
		sx = key.value.x;
		sy = key.value.y;
		cx = key.center.x;
		cy = key.center.y;
		if (next) {
			sx += (next.value.x - sx) * progress(key.easeX, key.time, next.time, time);
			sy += (next.value.y - sy) * progress(key.easeY, key.time, next.time, time);
			cx = key.anchor.x + (cx - key.anchor.x) * safeRatio(sx, key.value.x);
			cy = key.anchor.y + (cy - key.anchor.y) * safeRatio(sy, key.value.y);
		}
	}
	cx *= width;
	cy *= height;
	const ri = lastIndex(block.rotate, time);
	if (ri >= 0) {
		const key = block.rotate[ri];
		const next = block.rotate[ri + 1];
		const x = key.cos * cx - key.sin * cy + key.xx * width + key.xy * height;
		cy = key.sin * cx + key.cos * cy + key.yx * width + key.yy * height;
		cx = x;
		rotation = key.value;
		if (next) {
			const delta = (next.value - rotation) * progress(key.ease, key.time, next.time, time);
			rotation += delta;
			const c = Math.cos(delta * radians);
			const s = Math.sin(delta * radians);
			const dx = cx - key.anchor.x * width;
			const dy = cy - key.anchor.y * height;
			cx = key.anchor.x * width + c * dx - s * dy;
			cy = key.anchor.y * height + s * dx + c * dy;
		}
	}
	const mi = lastIndex(block.move, time);
	if (mi >= 0) {
		const key = block.move[mi];
		const next = block.move[mi + 1];
		const x = next ? key.value.x + (next.value.x - key.value.x) * progress(key.easeX, key.time, next.time, time) : key.value.x;
		const y = next ? key.value.y + (next.value.y - key.value.y) * progress(key.easeY, key.time, next.time, time) : key.value.y;
		cx += (x - block.center.x) * width;
		cy += (y - block.center.y) * height;
	}
	const active = time >= block.enable && time < block.disable;
	const phase: AreaPhase = active ? "active" : time < block.enable && time >= block.enable - 0.5 ? "ready" : "disabled";
	const initiallyActive = block.appear >= block.enable && block.appear < block.disable;
	return { cx, cy: height - cy, width: Math.abs(block.size.x * sx * width),
		height: Math.abs(block.size.y * sy * height), rotation: -rotation * radians,
		subtract: block.subtract, phase, opacity: !active && !initiallyActive ? clamp((time - block.appear) / 0.5) : 1 };
}

/** `time` is the audio element's currentTime; apply the authored offset once. */
export function sampleChart(chart: NoiseChart, time: number, width: number, height: number): ChartFrame {
	const t = time - chart.offset;
	const areas: AreaFrame[] = [];
	for (const block of chart.blocks) {
		if (t < block.appear || t >= block.disappear) continue;
		const area = sampleBlock(block, t, width, height);
		if (area.width > 0 && area.height > 0) areas.push(area);
	}
	return { areas, lines: chart.lines.map((line) => ({
		x: sampleFloat(line.x, t, 0.5) * width,
		y: (1 - sampleFloat(line.y, t, 0.5)) * height,
		rotation: -sampleFloat(line.rotation, t, 0) * radians,
		length: width * 3,
		opacity: clamp(sampleFloat(line.alpha, t, 1)),
	})) };
}

function contains(area: AreaFrame, x: number, y: number, inset: number): boolean {
	if (area.width <= 0 || area.height <= 0) return false;
	const dx = x - area.cx;
	const dy = y - area.cy;
	const c = Math.cos(area.rotation);
	const s = Math.sin(area.rotation);
	const margin = area.subtract ? inset : -inset;
	return Math.abs(c * dx + s * dy) <= Math.max(0, area.width / 2 + margin)
		&& Math.abs(-s * dx + c * dy) <= Math.max(0, area.height / 2 + margin);
}

export function isPointBlocked(areas: readonly AreaFrame[], x: number, y: number, stageHeight: number): boolean {
	let originalNormal = false;
	let insetNormal = false;
	let originalSubtract = 0;
	let insetSubtract = 0;
	for (const area of areas) {
		if (area.phase !== "active") continue;
		if (contains(area, x, y, 0)) {
			if (area.subtract) originalSubtract++;
			else originalNormal = true;
		}
		if (contains(area, x, y, stageHeight * 0.05)) {
			if (area.subtract) insetSubtract++;
			else insetNormal = true;
		}
	}
	return originalNormal !== Boolean(originalSubtract & 1) && insetNormal !== Boolean(insetSubtract & 1);
}

export interface TimedPointerPosition {
	x: number;
	y: number;
	/** Audio time, including the chart's authored offset. */
	time: number;
}

/** Last contact along a recorded segment; normal/inverse inset and parity are
 * evaluated together, not as independent rectangle hits. Linear translation at
 * fixed rotation/scale is swept analytically. Curved transforms are subdivided
 * at keyframes and at most 1/240 s, with extra rotation subdivisions. */
export function lastBlockedOnPath(
	chart: NoiseChart, from: TimedPointerPosition, to: TimedPointerPosition,
	width: number, height: number,
): number | null {
	const start = from.time - chart.offset;
	const duration = to.time - from.time;
	if (duration < 0) return null;
	const blocks = chart.blocks.filter(b => b.appear <= start + duration && b.enable <= start + duration
		&& b.disappear > start && b.disable > start);
	if (!blocks.length) return null;
	const times = [0, 1];
	if (duration > 0) {
		const add = (time: number): void => {
			const u = (time - start) / duration;
			if (u > 0 && u < 1) times.push(u);
		};
		for (const block of blocks) {
			for (const time of [block.appear, block.enable, block.disable, block.disappear]) add(time);
			for (const track of [block.scale, block.rotate, block.move]) for (const key of track) add(key.time);
		}
	}
	times.sort((a, b) => a - b);
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const cuts: number[] = [];
	const areas: AreaFrame[] = [];
	const inside = (u: number): boolean => {
		const x = from.x + dx * u;
		const y = from.y + dy * u;
		if (x < 0 || x > width || y < 0 || y > height) return false;
		const time = start + duration * u;
		areas.length = 0;
		for (const block of blocks) {
			if (time >= Math.max(block.appear, block.enable) && time < Math.min(block.disappear, block.disable)) {
				areas.push(sampleBlock(block, time, width, height));
			}
		}
		return isPointBlocked(areas, x, y, height);
	};
	// Intersect four linear half-planes; radii may change across a scale event.
	function rectangle(ax: number, ay: number, bx: number, by: number,
		ahx: number, ahy: number, bhx: number, bhy: number): void {
		let lo = 0;
		let hi = 1;
		const clip = (a: number, b: number): boolean => {
			if (a < 0 && b < 0) return false;
			if (a < 0) lo = Math.max(lo, a / (a - b));
			if (b < 0) hi = Math.min(hi, a / (a - b));
			return lo <= hi;
		};
		if (clip(ahx - ax, bhx - bx) && clip(ahx + ax, bhx + bx)
			&& clip(ahy - ay, bhy - by) && clip(ahy + ay, bhy + by)) cuts.push(lo, hi);
	}
	for (let i = times.length - 1; i > 0; i--) {
		const low = times[i - 1];
		const high = times[i];
		if (high <= low) continue;
		// Never interpolate a teleport at a key/lifecycle boundary backwards.
		const beforeHigh = high - Math.min((high - low) * 1e-7, 1e-7);
		let steps = Math.max(1, Math.ceil(duration * (high - low) * 240));
		for (const block of blocks) {
			const a = sampleBlock(block, start + duration * low, width, height);
			const b = sampleBlock(block, start + duration * beforeHigh, width, height);
			steps = Math.max(steps, Math.ceil(Math.abs(b.rotation - a.rotation) / radians));
		}
		for (let step = steps - 1; step >= 0; step--) {
			const a = low + (high - low) * step / steps;
			const b = low + (high - low) * (step + 1) / steps;
			if (inside(b)) return b;
			const end = b - Math.min((b - a) * 1e-7, 1e-7);
			const at = start + duration * a;
			const bt = start + duration * end;
			cuts.length = 0;
			cuts.push(0, 1);
			rectangle(from.x + dx * a - width / 2, from.y + dy * a - height / 2,
				from.x + dx * b - width / 2, from.y + dy * b - height / 2,
				width / 2, height / 2, width / 2, height / 2);
			for (const block of blocks) {
				const middle = (at + bt) / 2;
				if (middle < Math.max(block.appear, block.enable) || middle >= Math.min(block.disappear, block.disable)) continue;
				const ar = sampleBlock(block, at, width, height);
				const br = sampleBlock(block, bt, width, height);
				const ac = Math.cos(ar.rotation), as = Math.sin(ar.rotation);
				const bc = Math.cos(br.rotation), bs = Math.sin(br.rotation);
				const ax = from.x + dx * a - ar.cx, ay = from.y + dy * a - ar.cy;
				const bx = from.x + dx * b - br.cx, by = from.y + dy * b - br.cy;
				for (const inset of [0, height * 0.05]) {
					const margin = block.subtract ? inset : -inset;
					rectangle(ac * ax + as * ay, -as * ax + ac * ay, bc * bx + bs * by, -bs * bx + bc * by,
						Math.max(0, ar.width / 2 + margin), Math.max(0, ar.height / 2 + margin),
						Math.max(0, br.width / 2 + margin), Math.max(0, br.height / 2 + margin));
				}
			}
			cuts.sort((x, y) => x - y);
			for (let j = cuts.length - 1; j >= 0; j--) {
				const u = a + (b - a) * cuts[j];
				if (inside(u)) return u;
				if (j && inside(a + (b - a) * (cuts[j - 1] + cuts[j]) / 2)) return u;
			}
		}
	}
	return null;
}

