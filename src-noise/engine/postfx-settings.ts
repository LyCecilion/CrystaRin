// SPDX-License-Identifier: GPL-3.0-only
// Recorded reference data: blockarea/main 789e10f, not an official shader or timeline.
import reference from "../assets/desultory-signals-postfx.json";

export type PostFxSettings = typeof reference.settings;
export type PostFxPass = keyof PostFxSettings;
export const postFxOrder: readonly PostFxPass[] = [
	"VignettePlus", "RGBShift", "Glitch", "GlitchDog", "DimensionSlash", "LensDistortion", "Bloom",
];
export const gridReference: typeof reference.material = reference.material;
/** Final centered crop hides clamped postfx borders without changing the source scene. */
export const postFxOverscan = 1.05;

export interface PostFxState {
	/** Opt-in: existing performances remain unchanged until preview is enabled. */
	enabled: boolean;
	settings: PostFxSettings;
	/** Recorded choreography is used only when an actual song clock is supplied. */
	followTimeline: boolean;
	/** Grid is a separate overlay before the full-screen stack, not an eighth post pass. */
	grid: boolean;
	/** Real performance.now()/1000 timestamp; -Infinity means never triggered. */
	slashTrigger: number;
	/** Manual glitch burst; independent of the recorded static glitchRange=0. */
	glitchTrigger: number;
}

export interface PostFxAssets {
	glitch: HTMLImageElement;
	displace: HTMLImageElement;
	glitchMap: HTMLImageElement;
	grid: HTMLImageElement;
	/** Original decoded R8 wire-noise array, bottom-up rows per layer. */
	wire: { width: number; height: number; depth: number; pixels: Uint8Array };
}

export function createPostFxState(): PostFxState {
	return { enabled: false, followTimeline: true, settings: structuredClone(reference.settings), grid: false, slashTrigger: -Infinity, glitchTrigger: -Infinity };
}

export function resetPostFxState(state: PostFxState): void {
	state.settings = structuredClone(reference.settings);
	state.grid = false;
	state.followTimeline = true;
	state.slashTrigger = -Infinity;
	state.glitchTrigger = -Infinity;
}
