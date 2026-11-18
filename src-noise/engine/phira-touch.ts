// SPDX-License-Identifier: GPL-3.0-only
// Ported from Phira-Pro prpr/src/core/block_touch.rs and block_shader.rs:643-664.
// https://github.com/Phira-Pro/Phira-Pro/tree/c3873ea3d8759177630a2bbfea79036e99389118
import type { PhiraImage, PhiraTouch, PhiraTouchMask } from "./phira-types";

const MAX_TOUCHES = 10;
const DURATION = 0.1;
const SPRITE_HEIGHT = 44 / 100 * 11.5 / 10;

interface Slot {
	finger: number | null;
	seen: boolean;
	x: number;
	y: number;
	strength: number;
	startTime: number;
	startScale: number;
	endScale: number;
	scale: number;
	inverseSize: number;
}

/** Official TouchHover.png: decoded top-down RGBA, sampled as red and alpha. */
export function createPhiraTouchMask(sprite: PhiraImage): PhiraTouchMask {
	const slots: Slot[] = Array.from({ length: MAX_TOUCHES }, () => ({
		finger: null, seen: false, x: 0, y: 0, strength: 0,
		startTime: 0, startScale: 0, endScale: 0, scale: 0, inverseSize: 0,
	}));
	let lastTime: number | null = null;

	function reset(): void {
		for (const slot of slots) {
			slot.finger = null;
			slot.seen = false;
			slot.x = slot.y = slot.strength = 0;
			slot.startTime = slot.startScale = slot.endScale = slot.scale = slot.inverseSize = 0;
		}
		lastTime = null;
	}

	function update(touches: readonly PhiraTouch[], time: number): void {
		if (!Number.isFinite(time)) return;
		if (lastTime !== null && time < lastTime) reset();
		lastTime = time;
		for (const slot of slots) {
			const t = Math.max(0, Math.min(1, (time - slot.startTime) / DURATION));
			slot.scale = slot.startScale + (slot.endScale - slot.startScale) * t;
			slot.seen = false;
		}
		const count = Math.min(MAX_TOUCHES, touches.length);
		for (let i = 0; i < count; i++) {
			const touch = touches[i];
			if (!Number.isFinite(touch.x) || !Number.isFinite(touch.y)) continue;
			let target: Slot | undefined;
			for (const slot of slots) {
				if (slot.finger === touch.id) {
					target = slot;
					break;
				}
			}
			if (!target) {
				for (const slot of slots) {
					if (slot.finger === null) {
						target = slot;
						// Show restarts from zero, even when reusing an unfinished Hide.
						slot.finger = touch.id;
						slot.startTime = time;
						slot.startScale = slot.scale = 0;
						slot.endScale = 1;
						break;
					}
				}
			}
			if (target) {
				target.x = touch.x;
				target.y = touch.y;
				target.strength = touch.strength;
				target.seen = true;
			}
		}
		for (const slot of slots) {
			// Clear the finger once: an already hiding slot must not restart Hide.
			if (slot.finger !== null && !slot.seen) {
				slot.finger = null;
				slot.startTime = time;
				slot.startScale = slot.scale;
				slot.endScale = 0;
			}
		}
	}

	function bilinear(x0: number, y0: number, x1: number, y1: number, fx: number, fy: number, channel: number): number {
		const pixels = sprite.pixels;
		const bottom = pixels[(y0 * sprite.width + x0) * 4 + channel] * (1 - fx)
			+ pixels[(y0 * sprite.width + x1) * 4 + channel] * fx;
		const top = pixels[(y1 * sprite.width + x0) * 4 + channel] * (1 - fx)
			+ pixels[(y1 * sprite.width + x1) * 4 + channel] * fx;
		return (bottom * (1 - fy) + top * fy) / 255;
	}

	function sample(u: number, v: number, aspect: number): number {
		let result = 0;
		for (const slot of slots) {
			if (slot.scale <= 0) continue;
			const su = (u - slot.x) * aspect * slot.inverseSize + 0.5;
			const sv = (v - slot.y) * slot.inverseSize + 0.5;
			if (su < 0 || su > 1 || sv < 0 || sv > 1) continue;
			const x = su * sprite.width - 0.5;
			// Native sprite UV is Y-up; decoded PNG rows are top-down.
			const y = (1 - sv) * sprite.height - 0.5;
			const floorX = Math.floor(x);
			const floorY = Math.floor(y);
			const x0 = Math.max(0, Math.min(sprite.width - 1, floorX));
			const x1 = Math.max(0, Math.min(sprite.width - 1, floorX + 1));
			const y0 = Math.max(0, Math.min(sprite.height - 1, floorY));
			const y1 = Math.max(0, Math.min(sprite.height - 1, floorY + 1));
			const fx = x - floorX;
			const fy = y - floorY;
			const red = bilinear(x0, y0, x1, y1, fx, fy, 0);
			const alpha = bilinear(x0, y0, x1, y1, fx, fy, 3) * slot.strength;
			// Sprites/Default: One, OneMinusSrcAlpha; quantize the R8 RT per finger.
			result = Math.max(0, Math.min(255, Math.round(red * alpha * 255 + result * (1 - alpha))));
		}
		return result;
	}

	function render(aux: Uint8Array, width: number, height: number, aspect: number, touches: readonly PhiraTouch[], time: number): boolean {
		update(touches, time);
		// Always clear, including the first frame after the final Hide completes.
		for (let i = 3; i < width * height * 4; i += 4) aux[i] = 0;
		let visible = false;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const slot of slots) {
			if (slot.finger !== null || slot.scale > 0) visible = true;
			if (slot.scale <= 0) continue;
			const size = SPRITE_HEIGHT * slot.scale;
			slot.inverseSize = 1 / size;
			const halfY = size * 0.5;
			const halfX = halfY / aspect;
			minX = Math.min(minX, slot.x - halfX);
			minY = Math.min(minY, slot.y - halfY);
			maxX = Math.max(maxX, slot.x + halfX);
			maxY = Math.max(maxY, slot.y + halfY);
		}
		const bw = Math.floor(width / 2);
		const bh = Math.floor(height / 2);
		const x0 = Math.max(0, Math.floor(minX * bw));
		const y0 = Math.max(0, Math.floor(minY * bh));
		const x1 = Math.min(bw, Math.ceil(maxX * bw));
		const y1 = Math.min(bh, Math.ceil(maxY * bh));
		for (let y = y0; y < y1; y++) {
			for (let x = x0; x < x1; x++) {
				const value = sample((x + 0.5) / bw, (y + 0.5) / bh, aspect);
				const i = (y * 2 * width + x * 2) * 4 + 3;
				aux[i] = aux[i + 4] = aux[i + width * 4] = aux[i + width * 4 + 4] = value;
			}
		}
		return visible;
	}

	return { render, reset };
}
