// SPDX-License-Identifier: GPL-3.0-only
// Port of Phira-Pro prpr/src/core/block_mask.rs (native render_displaced).
// Source: https://github.com/Phira-Pro/Phira-Pro/tree/c3873ea3d8759177630a2bbfea79036e99389118
import type { PhiraImage, PhiraMaskFrame, PhiraMasks } from "./phira-types";
import type { AreaFrame, Stage } from "./types";

const f = Math.fround;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const unit = (v: number): number => f(v / 255);
function unorm(v: number): number {
	const scaled = f(clamp(v, 0, 1) * 255);
	const whole = Math.trunc(scaled);
	return whole + Number(f(scaled - whole) >= 0.5);
}

// Native GLES mediump intermediates are rounded separately, ties to even.
const float = new Float32Array(1);
const bits = new Uint32Array(float.buffer);
function medium(v: number): number {
	float[0] = v;
	bits[0] = (bits[0] + 0xfff + ((bits[0] >>> 13) & 1)) & ~0x1fff;
	return float[0];
}
function noiseIndex(v: number, size: number): number {
	v = f(v % 2);
	if (v < 0) v = f(v + 2);
	if (v > 1) v = f(2 - v);
	return Math.min(size - 1, Math.floor(f(v * size)));
}
const centered = Float32Array.from({ length: 256 }, (_, i) => medium(f(medium(unit(i)) - 0.5)));
const weights = new Float32Array(6);
let weightSum = 0;
for (let k = 1; k <= 6; k++) weightSum = f(weightSum + f(k ** f(2.65)));
for (let k = 0; k < 6; k++) weights[k] = f(f((6 - k) ** f(2.65)) / weightSum);

// Red and green have separate R8 conversions. Green uses UNCLAMPED red.
const subtractRed = new Uint8Array(512);
const subtractGreen = new Uint8Array(512);
for (let enabled = 0; enabled < 2; enabled++) {
	for (let green = 0; green < 256; green++) {
		const g = unit(green);
		const t = clamp(f(f(g - f(0.2)) * -10), 0, 1);
		const r = f(enabled + f(f(t * t) * f(3 - f(2 * t))));
		const i = enabled * 256 + green;
		subtractRed[i] = unorm(r);
		subtractGreen[i] = unorm(f(f(g * r) * 10));
	}
}
const inverseIndex = (red: number, green: number): number => (red >= 23 && red <= 30 ? 256 : 0) + green;

/** All source planes and returned upload arrays are retained between frames. */
export function createPhiraMasks(displacement: PhiraImage): PhiraMasks {
	const frame: PhiraMaskFrame = { width: 0, height: 0, rgba: new Uint8Array(0), aux: new Uint8Array(0), sources: new Uint8Array(0) };
	let planes: Uint8Array[] = [];
	let compose = new Uint8Array(0);
	let ping = new Uint8Array(0);
	let pong = new Uint8Array(0);
	let horizontal = new Uint8Array(0);
	let warpU = new Float32Array(0);
	let warpV = new Float32Array(0);
	let warpA = new Uint32Array(0);
	let warpB = new Uint32Array(0);
	let warpRow = new Uint32Array(0);
	let previous = new Float64Array(0);
	let previousCount = -1;
	let lastWidth = NaN, lastHeight = NaN;
	let lastLeft = NaN, lastTop = NaN, lastStageWidth = NaN, lastStageHeight = NaN;
	let lastTime = NaN;
	let uniform = -1;
	const blends = new Map<number, Uint8Array>();
	function blend(opacity: number): Uint8Array {
		opacity = f(opacity);
		let table = blends.get(opacity);
		if (!table) {
			table = new Uint8Array(256);
			for (let i = 0; i < 256; i++) table[i] = unorm(f(unit(i) + opacity));
			blends.set(opacity, table);
		}
		return table;
	}

	return { render(width, height, dpr, stage, areas, time) {
		const w = 2 * Math.max(Math.floor(width * dpr / 8), 1);
		const h = 2 * Math.max(Math.floor(height * dpr / 8), 1);
		let changed = w !== frame.width || h !== frame.height || width !== lastWidth || height !== lastHeight
			|| stage.left !== lastLeft || stage.top !== lastTop || stage.width !== lastStageWidth || stage.height !== lastStageHeight || areas.length !== previousCount;
		for (let i = 0; !changed && i < areas.length; i++) {
			const a = areas[i], j = i * 8;
			changed = previous[j] !== a.cx || previous[j + 1] !== a.cy || previous[j + 2] !== a.width || previous[j + 3] !== a.height
				|| previous[j + 4] !== a.rotation || previous[j + 5] !== Number(a.subtract) || previous[j + 6] !== phase(a) || previous[j + 7] !== a.opacity;
		}
		if (!changed && (time === lastTime || uniform >= 0)) return frame;
		if (w !== frame.width || h !== frame.height) {
			const n = w * h;
			frame.width = w; frame.height = h;
			frame.rgba = new Uint8Array(n * 4); frame.aux = new Uint8Array(n * 4); frame.sources = new Uint8Array(n * 4);
			planes = Array.from({ length: 8 }, () => new Uint8Array(n));
			compose = new Uint8Array(n); ping = new Uint8Array(n); pong = new Uint8Array(n); horizontal = new Uint8Array(n);
			warpU = new Float32Array(w); warpV = new Float32Array(h); warpA = new Uint32Array(w); warpB = new Uint32Array(w); warpRow = new Uint32Array(h);
		}
		if (changed) {
			for (const plane of planes) plane.fill(0);
			if (blends.size > 512) blends.clear();
			if (previous.length !== areas.length * 8) previous = new Float64Array(areas.length * 8);
			for (let i = 0; i < areas.length; i++) {
				const a = areas[i], j = i * 8;
				previous[j] = a.cx; previous[j + 1] = a.cy; previous[j + 2] = a.width; previous[j + 3] = a.height;
				previous[j + 4] = a.rotation; previous[j + 5] = Number(a.subtract); previous[j + 6] = phase(a); previous[j + 7] = a.opacity;
				const layer = (a.phase === "active" ? 0 : 2) + Number(a.subtract);
				const primary = blend(a.subtract ? 0.1 : a.opacity);
				const green = a.subtract && a.phase !== "active" ? blend(f(f(0.1) * f(a.opacity))) : undefined;
				rasterRows(w, h, width, height, stage, a, (y, first, last) => {
					for (let p = y * w + first, end = y * w + last; p < end; p++) {
						planes[layer][p] = primary[planes[layer][p]];
						if (green) planes[6][p] = green[planes[6][p]];
						if (a.phase === "ready") {
							const ready = 4 + Number(a.subtract);
							planes[ready][p] = primary[planes[ready][p]];
							if (green) planes[7][p] = green[planes[7][p]];
						}
					}
				});
			}
			frame.aux.fill(0);
			uniform = -1;
			for (let p = 0; p < w * h; p++) {
				compose[p] = Math.abs(planes[0][p] - (planes[1][p] >= 23 && planes[1][p] <= 30 ? 255 : 0));
				const inv = inverseIndex(planes[3][p], planes[6][p]);
				const disabled = unorm(Math.abs(f(f(unit(subtractRed[inv]) * unit(subtractGreen[inv])) - unit(planes[2][p]))));
				frame.aux[p * 4] = planes[4][p];
				frame.aux[p * 4 + 1] = planes[7][p] === 0 ? 0 : subtractGreen[inverseIndex(planes[5][p], planes[7][p])];
				frame.aux[p * 4 + 2] = disabled;
				for (let c = 0; c < 4; c++) frame.sources[p * 4 + c] = planes[c][p];
			}
			uniform = compose[0];
			for (let p = 1; p < compose.length; p++) if (compose[p] !== uniform) { uniform = -1; break; }
			previousCount = areas.length; lastWidth = width; lastHeight = height;
			lastLeft = stage.left; lastTop = stage.top; lastStageWidth = stage.width; lastStageHeight = stage.height;
		}
		const d = 0.70703125;
		const dt = f(d * f(f(f(time) / 20) * f(2.59)));
		if (uniform < 0) {
			for (let x = 0; x < w; x++) {
				const u = f(f(x + 0.5) / w), st = f(u * f(2.13));
				warpU[x] = u;
				warpA[x] = noiseIndex(f(dt + st), displacement.width) * 4;
				warpB[x] = noiseIndex(f(-dt + st), displacement.width) * 4;
			}
			for (let y = 0; y < h; y++) {
				const v = f(f(y + 0.5) / h);
				warpV[y] = v;
				// Decoded PNG is top-down; native DISPLACE is vertically flipped.
				warpRow[y] = (displacement.height - 1 - noiseIndex(f(dt + f(v * f(1.02))), displacement.height)) * displacement.width * 4;
			}
		}
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const p = y * w + x, dst = p * 4;
				let value = uniform;
				if (value < 0) {
					const a = centered[displacement.pixels[warpRow[y] + warpA[x]]];
					const b = centered[displacement.pixels[warpRow[y] + warpB[x]]];
					const u = f(f(f(f(d * a) - f(d * b)) * f(0.1)) + warpU[x]);
					const v = f(f(f(f(d * a) + f(d * b)) * f(0.1)) + warpV[y]);
					const sx = Math.trunc(clamp(f(u * w), 0, w - 1)), sy = Math.trunc(clamp(f(v * h), 0, h - 1));
					value = compose[sy * w + sx];
				}
				ping[p] = value;
				frame.rgba[dst] = value; frame.rgba[dst + 1] = 0; frame.rgba[dst + 2] = 0; frame.rgba[dst + 3] = frame.aux[dst + 2];
			}
		}
		// Separable 3x3 maximum also exactly implements the binary bit-row path.
		for (let pass = 0; pass < 6 && weights[pass] >= 0.01; pass++) {
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
				const p = y * w + x;
				horizontal[p] = Math.max(ping[p], ping[y * w + Math.max(0, x - 1)], ping[y * w + Math.min(w - 1, x + 1)]);
			}
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
				const p = y * w + x, dst = p * 4;
				const maximum = Math.max(horizontal[p], horizontal[Math.max(0, y - 1) * w + x], horizontal[Math.min(h - 1, y + 1) * w + x]);
				pong[p] = maximum;
				const delta = maximum - ping[p];
				if (pass === 0) frame.rgba[dst + 1] = delta;
				if (delta !== 0 && frame.rgba[dst] !== 255) {
					const outside = f(1 - unit(frame.rgba[dst]));
					frame.rgba[dst + 2] = unorm(f(f(weights[pass] * f(outside * unit(delta))) + unit(frame.rgba[dst + 2])));
				}
			}
			const swap = ping; ping = pong; pong = swap;
		}
		lastTime = time;
		return frame;
	} };
}

function phase(a: AreaFrame): number { return a.phase === "active" ? 2 : a.phase === "ready" ? 1 : 0; }

/** Native raster_rows interval intersection, in viewport CSS rather than chart units.
 * Inclusive rectangle endpoints retain the native pixel-center boundary rule;
 * the stage clip is half-open, so letterbox pixels never enter source cameras.
 */
function rasterRows(w: number, h: number, width: number, height: number, stage: Stage, area: AreaFrame, write: (y: number, first: number, last: number) => void): void {
	if (area.width <= 0 || area.height <= 0 || width <= 0 || height <= 0 || stage.width <= 0 || stage.height <= 0) return;
	const s = Math.sin(area.rotation), c = Math.cos(area.rotation);
	const cx = stage.left + area.cx, cy = stage.top + area.cy;
	const hx = area.width / 2, hy = area.height / 2;
	const yHalf = Math.abs(s) * hx + Math.abs(c) * hy;
	const start = clamp(Math.ceil((height - cy - yHalf) * h / height - 0.5), 0, h);
	const end = clamp(Math.floor((height - cy + yHalf) * h / height - 0.5) + 1, 0, h);
	const clipFirst = clamp(Math.ceil(stage.left * w / width - 0.5), 0, w);
	const clipLast = clamp(Math.ceil((stage.left + stage.width) * w / width - 0.5), 0, w);
	for (let y = start; y < end; y++) {
		const py = height - (y + 0.5) * height / h;
		if (py < stage.top || py >= stage.top + stage.height) continue;
		const dy = py - cy;
		let lo = 0, hi = width;
		// Inverse clockwise screen-space rotation: (c*dx+s*dy,-s*dx+c*dy).
		if (Math.abs(c) < 1e-7) {
			if (Math.abs(s * dy) > hx) continue;
		} else {
			const a = (-hx - s * dy) / c + cx, b = (hx - s * dy) / c + cx;
			lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
		}
		if (Math.abs(s) < 1e-7) {
			if (Math.abs(c * dy) > hy) continue;
		} else {
			const a = (-hy - c * dy) / -s + cx, b = (hy - c * dy) / -s + cx;
			lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
		}
		if (lo > hi) continue;
		const first = Math.max(clipFirst, clamp(Math.ceil(lo * w / width - 0.5), 0, w));
		const last = Math.min(clipLast, clamp(Math.floor(hi * w / width - 0.5) + 1, 0, w));
		if (first < last) write(y, first, last);
	}
}
