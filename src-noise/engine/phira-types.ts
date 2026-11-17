// SPDX-License-Identifier: GPL-3.0-only
import type { AreaFrame, Stage } from "./types";

/** Decoded PNG bytes in normal top-down RGBA order. */
export interface PhiraImage {
	width: number;
	height: number;
	pixels: Uint8Array;
}

/** Screen-normalized bottom-left UV; strength is the web contamination envelope. */
export interface PhiraTouch {
	id: number;
	x: number;
	y: number;
	strength: number;
}

/** Bottom-up GPU upload rows, matching Phira-Pro's mask texture coordinates. */
export interface PhiraMaskFrame {
	width: number;
	height: number;
	rgba: Uint8Array;
	aux: Uint8Array;
	sources: Uint8Array;
}

export interface PhiraMasks {
	render(width: number, height: number, dpr: number, stage: Stage, areas: readonly AreaFrame[], time: number): PhiraMaskFrame;
}

export interface PhiraTouchMask {
	/** Writes only aux alpha; the other three material channels are preserved. */
	render(aux: Uint8Array, width: number, height: number, aspect: number, touches: readonly PhiraTouch[], time: number): boolean;
	reset(): void;
}
