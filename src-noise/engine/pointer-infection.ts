// SPDX-License-Identifier: GPL-3.0-only
import { lastBlockedOnPath, type NoiseChart, type TimedPointerPosition } from "./chart";
import type { PointerVisual, Stage } from "./types";

interface RecordedPosition { x: number; y: number; stamp: number; allowed: boolean }
interface PathPosition extends TimedPointerPosition { stamp: number }

/** Records input independently of paint. One physical cursor, no virtual trail
 * fingers. Audio-clock interpolation aligns coalesced events to animated areas;
 * the three-second carry uses wall time, including while audio is buffering.
 * Optional deposition uses displayed viewport coordinates, never bridges excluded
 * input, and reports a conservative end-of-portion strength for carried travel. */
export function createPointerInfection(
	deposit?: (fromX: number, fromY: number, toX: number, toY: number, strength: number) => void,
): {
	readonly pointer: PointerVisual & { allowed: boolean };
	move(x: number, y: number, stamp: number, allowed: boolean, tracking: boolean): void;
	leave(stamp: number, tracking: boolean): void;
	rebase(): void;
	reset(): void;
	sample(chart: NoiseChart, stage: Stage, songTime: number, nowMs: number, playing: boolean): number;
} {
	const pointer = { x: -10000, y: -10000, present: false, allowed: false, strength: 0 };
	const pending: RecordedPosition[] = [];
	let previous: PathPosition | null = null;
	let clock: { stamp: number; time: number } | null = null;
	let until = 0;

	function rebase(): void {
		pending.length = 0;
		previous = null;
		clock = null;
	}
	function reset(): void {
		rebase();
		until = 0;
		pointer.strength = 0;
	}
	return {
		pointer,
		move(x, y, stamp, allowed, tracking) {
			pointer.x = x;
			pointer.y = y;
			pointer.present = true;
			pointer.allowed = allowed;
			if (tracking) pending.push({ x, y, stamp, allowed });
		},
		leave(stamp, tracking) {
			pointer.present = false;
			if (tracking) pending.push({ x: pointer.x, y: pointer.y, stamp, allowed: false });
		},
		rebase,
		reset,
		sample(chart, stage, songTime, nowMs, playing) {
			if (!playing) { reset(); return 0; }
			if (clock && songTime < clock.time) reset();
			const anchor = clock ?? { stamp: nowMs, time: songTime };
			const elapsed = nowMs - anchor.stamp;
			function visit(x: number, y: number, stamp: number, allowed: boolean): void {
				if (!allowed) { previous = null; return; }
				stamp = Math.max(previous?.stamp ?? anchor.stamp, Math.min(nowMs, stamp));
				const u = elapsed > 0 ? Math.max(0, Math.min(1, (stamp - anchor.stamp) / elapsed)) : 1;
				const point: PathPosition = {
					x: x - stage.left, y: y - stage.top, stamp,
					time: anchor.time + (songTime - anchor.time) * u,
				};
				const from = previous ?? point;
				if (!deposit) {
					const hit = lastBlockedOnPath(chart, from, point, stage.width, stage.height);
					if (hit !== null) until = Math.max(until, from.stamp + (point.stamp - from.stamp) * hit + 3000);
				} else {
					const dt = point.stamp - from.stamp;
					const dx = point.x - from.x;
					const dy = point.y - from.y;
					const emit = (lo: number, hi: number, strength: number): void => {
						deposit(from.x + dx * lo + stage.left, from.y + dy * lo + stage.top,
							from.x + dx * hi + stage.left, from.y + dy * hi + stage.top, strength);
					};
					const carried = (lo: number, hi: number): void => {
						if (until <= from.stamp + dt * lo) return;
						// The expiry itself has zero strength. End just inside its finite,
						// open bound; subdivide fading travel so one late frame cannot
						// assign an almost-zero level to its entire three-second path.
						if (dt > 0) hi = Math.min(hi, (until - from.stamp) / dt - 1e-12);
						if (hi < lo) return;
						const count = Math.max(1, Math.ceil(dt * (hi - lo) / 300));
						for (let i = 0; i < count; i++) {
							const a = lo + (hi - lo) * i / count;
							const b = lo + (hi - lo) * (i + 1) / count;
							const strength = Math.min(1, (until - from.stamp - dt * b) / 3000);
							if (strength > 0) emit(a, b, strength);
						}
					};
					let cursor = 0;
					lastBlockedOnPath(chart, from, point, stage.width, stage.height, (lo, hi) => {
						if (lo > cursor) carried(cursor, lo);
						emit(lo, hi, 1);
						until = Math.max(until, from.stamp + dt * hi + 3000);
						cursor = hi;
					});
					if (cursor < 1) carried(cursor, 1);
				}
				previous = point;
			}
			for (const point of pending) visit(point.x, point.y, point.stamp, point.allowed);
			pending.length = 0;
			visit(pointer.x, pointer.y, nowMs, pointer.present && pointer.allowed);
			clock = { stamp: nowMs, time: songTime };
			pointer.strength = Math.max(0, Math.min(1, (until - nowMs) / 3000));
			return pointer.strength;
		},
	};
}
