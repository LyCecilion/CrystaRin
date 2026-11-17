// SPDX-License-Identifier: GPL-3.0-only
import type { Stage } from "./types";

export interface PerformanceViewport {
	stage: Stage;
	croppedFraction: number;
	supported: boolean;
}

/** Adapt within 4:3–16:9; outside it, cover from the nearest endpoint.
 * At most 20% of the virtual stage may be cropped, split equally on both sides.
 * Dimensions are viewport CSS pixels, independent of device pixel ratio. */
export function fitPerformanceViewport(width: number, height: number): PerformanceViewport {
	const stageWidth = Math.max(width, height * (4 / 3));
	const stageHeight = Math.max(height, width / (16 / 9));
	const croppedFraction = 1 - Math.min(width / stageWidth, height / stageHeight);
	return {
		stage: {
			left: (width - stageWidth) / 2,
			top: (height - stageHeight) / 2,
			width: stageWidth,
			height: stageHeight,
		},
		croppedFraction,
		supported: croppedFraction <= 0.2 + Number.EPSILON,
	};
}

/** Screen-space footprint of the source stage after the final presentation crop. */
export function projectPerformanceStage(stage: Stage, width: number, height: number, scale: number, output: Stage): void {
	output.left = width / 2 + (stage.left - width / 2) * scale;
	output.top = height / 2 + (stage.top - height / 2) * scale;
	output.width = stage.width * scale;
	output.height = stage.height * scale;
}

/** Undo the presentation zoom before placing a source-space touch. */
export function unprojectPresentation(value: number, extent: number, scale: number): number {
	return extent / 2 + (value - extent / 2) / scale;
}
