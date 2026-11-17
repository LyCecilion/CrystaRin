// SPDX-License-Identifier: GPL-3.0-only

export type NoteKind = "tap" | "drag" | "hold" | "flick";

/** Stage-local CSS pixels, y down; rotation follows LineFrame's clockwise radians. */
export interface NoteSprite {
	id: number;
	kind: NoteKind;
	x: number;
	y: number;
	tailX: number;
	tailY: number;
	rotation: number;
	opacity: number;
	highlight: boolean;
	headVisible: boolean;
	/** -1 approaches from above the line, +1 from below, before rotation. */
	side: -1 | 1;
}

export interface NoteHit {
	id: number;
	x: number;
	y: number;
	rotation: number;
	/** Song seconds since this Auto Play hit/pulse, independent of render FPS. */
	age: number;
	opacity: number;
}

export interface NotePerformanceFrame {
	sprites: NoteSprite[];
	hits: NoteHit[];
	judged: number;
	total: number;
	time: number;
}

export interface NotePerformanceState {
	enabled: boolean;
}

export const noteHitDuration: number = 0.5;
