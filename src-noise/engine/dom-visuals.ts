// SPDX-License-Identifier: GPL-3.0-only

/** One horizontal band's displacement, measured in the patched element's CSS pixels. */
export interface SliceOffset {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
}

/** Song moments that add a short violent burst on top of the smooth contamination. */
const DOM_IMPULSES: readonly number[] = [26, 65.2];

/** Block glyphs preserve the deliberately damaged, potentially unreadable signal. */
const GLYPHS = "▤▥▦▧▨▩◇◆▰▱▢▣◢◣◤◥▚▞╳▍▎▏";

/** Digital steps keep the tearing from looking like a smooth CSS tween. */
export function quantize(value: number, step: number): number {
	return Math.round(value / step) * step;
}

/**
 * 0 while the field still touches the element (or during the short afterglow),
 * 1 once the surface has fully reconstructed. Pause freezes because callers only
 * advance `quietSeconds` with the song clock.
 */
export function healingProgress(quietSeconds: number): number {
	const x = Math.max(0, Math.min(1, (quietSeconds - 0.8) / 2.4));
	return x * x * (3 - 2 * x);
}

/** Pure function of song time, so seeking never replays or skips a spike. */
export function impulseAt(songTime: number): number {
	let value = 0;
	for (const at of DOM_IMPULSES) {
		const delta = songTime - at;
		if (delta >= 0) value += Math.exp(-((delta / 0.16) ** 2));
	}
	return Math.min(1, value);
}

/** Fraction of characters that should be replaced; the peak may be unreadable. */
export function glyphAmount(level: number, heal: number): number {
	const x = Math.max(0, Math.min(1, (level - 0.08) * 1.25));
	return x * Math.max(0, 1 - heal);
}

/** Stable 0..1 noise for one (seed, tick, index) triple. */
export function noiseUnit(seed: number, tick: number, index: number): number {
	let h = (seed ^ Math.imul(tick, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
	h ^= h >>> 16;
	h = Math.imul(h, 0x7feb352d);
	h ^= h >>> 15;
	h = Math.imul(h, 0x846ca68b);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

/** One deterministic replacement per measured grapheme; all bands reuse its pixels. */
export function corruptGlyph(original: string, fraction: number, tick: number, seed: number, index: number): string {
	if (!(fraction > 0.01) || noiseUnit(seed, tick, index) >= fraction) return original;
	return GLYPHS[Math.floor(noiseUnit(seed ^ 0x9e37, tick, index) * GLYPHS.length)];
}

/**
 * Per-slice offsets: the outer bands pull opposite ways, the middle band jitters,
 * and the pointer hotspot amplifies the whole tear. Values are quantized to 2px
 * and only change on the slow tick, which reads as digital rather than elastic.
 */
export function sliceOffsets(
	count: number,
	kind: "text" | "image",
	level: number,
	heat: number,
	tick: number,
	seed: number,
): SliceOffset[] {
	const amplitude = kind === "image" ? 26 : 16;
	const strength =
		Math.max(0, Math.min(1, level)) * (0.55 + 0.45 * Math.max(0, Math.min(1, heat)));
	const offsets: SliceOffset[] = [];
	for (let index = 0; index < count; index++) {
		const direction = count > 1 ? (index / (count - 1)) * 2 - 1 : 0;
		const jitter = noiseUnit(seed, tick, index) * 2 - 1;
		offsets.push({
			x: quantize(strength * amplitude * (direction * 1.1 + jitter * 0.7), 2),
			y: quantize(strength * 4 * (noiseUnit(seed ^ 5, tick, index) * 2 - 1), 2),
			scaleX: 1 + (noiseUnit(seed ^ 9, tick, index) * 2 - 1) * 0.05 * strength,
			scaleY: 1 + (noiseUnit(seed ^ 13, tick, index) * 2 - 1) * 0.03 * strength,
		});
	}
	return offsets;
}
