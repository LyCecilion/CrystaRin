// SPDX-License-Identifier: GPL-3.0-only
// Settings-level choreography recorded in blockarea/main ef32e4b.
import reference from "../assets/desultory-signals-timeline.json";

interface Key {
	time: number;
	value: number;
	easeType: number;
	separated: boolean;
	startValue: number;
	endValue: number;
}
export interface TimelineSlash {
	position: { x: number; y: number };
	/** Both angles are degrees. Strength remains in settings units (shader multiplies by .01). */
	lineDirection: number;
	direction: number;
	strength: number;
}
export interface PostFxTimelineFrame {
	vignetteRadius: number;
	vignetteDarkness: number;
	bloomBrightness: number;
	glitchDogScale: number;
	glitchMapBrightness: number;
	glitchMapContrast: number;
	convergence: number;
	glitchRange: number;
	shiftRadius: number;
	gridOpacity: number;
	/** Backdrop opacity, applied before notes/noise rather than to the complete frame. */
	bgAlpha: number;
	animationTime: number;
	slashes: TimelineSlash[];
}
export const postFxFreezeTime: number = reference.runtime.freezeTime;
// The 160s entry is explicitly a sentinel, not a fade target during this 150.75s song.
const radiusKeys = reference.directors.vignetteRadius.keys.filter(key => key.time <= 150.75);

function ease(code: number, p: number): number {
	switch (code) {
		case 0: return p;
		case 1: return 1 - Math.cos(p * Math.PI / 2);
		case 2: return Math.sin(p * Math.PI / 2);
		case 3: return (1 - Math.cos(Math.PI * p)) / 2;
		case 4: return p * p;
		case 5: return 1 - (1 - p) ** 2;
		case 6: return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
		case 7: return p ** 3;
		case 8: return 1 - (1 - p) ** 3;
		case 9: return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
		case 10: return p ** 4;
		case 11: return 1 - (1 - p) ** 4;
		case 12: return p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2;
		case 13: return 0;
		case 14: return 1;
		default: throw new Error(`Unsupported postfx ease ${code}`);
	}
}

function evaluate(keys: readonly Key[], time: number): number {
	if (!keys.length) return 0;
	const first = keys[0];
	if (time < first.time) return first.separated ? first.endValue : first.value;
	let index = 0;
	while (index + 1 < keys.length && keys[index + 1].time <= time) index++;
	const a = keys[index];
	if (index === keys.length - 1) return a.separated ? a.startValue : a.value;
	const b = keys[index + 1];
	const p = Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
	const av = a.separated ? a.startValue : a.value;
	const bv = b.separated ? b.endValue : b.value;
	return av + ease(a.easeType, p) * (bv - av);
}

export function createPostFxTimelineFrame(): PostFxTimelineFrame {
	return {
		vignetteRadius: 0, vignetteDarkness: 0, bloomBrightness: 0,
		glitchDogScale: 1, glitchMapBrightness: 0, glitchMapContrast: 0,
		convergence: 0, glitchRange: 0, shiftRadius: 0, gridOpacity: 0,
		bgAlpha: 0, animationTime: 0,
		slashes: Array.from({ length: 5 }, () => ({ position: { x: 0, y: 0 }, lineDirection: 0, direction: 0, strength: 0 })),
	};
}

/** Stateless sampling into retained storage: pause, backward seeks and replay cannot accumulate drift. */
export function samplePostFxTimeline(output: PostFxTimelineFrame, time: number): void {
	const dirs = reference.directors;
	output.vignetteRadius = evaluate(radiusKeys, time);
	output.vignetteDarkness = evaluate(dirs.vignetteDarkness.keys, time);
	output.bloomBrightness = evaluate(dirs.bloomBrightness.keys, time);
	output.glitchDogScale = evaluate(dirs.glitchDogScale.keys, time);
	output.glitchMapBrightness = evaluate(dirs.glitchMapBrightness.keys, time);
	output.glitchMapContrast = evaluate(dirs.glitchMapContrast.keys, time);
	output.convergence = evaluate(dirs.convergence.keys, time);
	output.glitchRange = evaluate(dirs.glitchRange.keys, time);
	output.shiftRadius = evaluate(dirs.shiftRadius.keys, time);
	output.gridOpacity = evaluate(dirs.gridOpacity.keys, time);
	output.bgAlpha = evaluate(dirs.bgAlpha.keys, time);
	// Preview policy only: stop noise motion at freezeTime. Unknown reset values are NOT invented.
	// Recorded directors/slashes and backdrop opacity continue through the outro.
	output.animationTime = Math.min(time, postFxFreezeTime);
	for (let index = 0; index < reference.slashes.length; index++) {
		const source = reference.slashes[index];
		const target = output.slashes[index];
		let info: (typeof source.infos)[number] | undefined;
		for (const candidate of source.infos) {
			if (candidate.time > time) break;
			info = candidate;
		}
		target.position.x = info?.position.x ?? 0;
		target.position.y = info?.position.y ?? 0;
		target.lineDirection = info?.lineDirection ?? 0;
		target.direction = info?.direction ?? 0;
		target.strength = info ? evaluate(source.strength.keys, time) : 0;
	}
}
