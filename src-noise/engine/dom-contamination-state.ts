// SPDX-License-Identifier: GPL-3.0-only
import { isPointBlocked } from "./chart";
import type { AreaFrame, Stage } from "./types";

export type ContaminationKind = "text" | "image" | "card";

export interface DomRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface DomCoverage {
	fraction: number;
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface ContaminationState {
	coverage: number;
	residue: number;
	strength: number;
}

const unit = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const smooth = (start: number, end: number, time: number): number => {
	const x = unit((time - start) / (end - start));
	return x * x * (3 - 2 * x);
};

export function createContaminationState(): ContaminationState {
	return { coverage: 0, residue: 0, strength: 0 };
}

export function resetContamination(state: ContaminationState): void {
	state.coverage = 0;
	state.residue = 0;
	state.strength = 0;
}

/** CPU midpoint quadrature, not displaced GPU coverage. Cells aim for 8 CSS px,
 * capped at 40 × 32 per target. Features below that spacing can be missed;
 * hit bounds include entire hit cells, within one cell of sampled contact.
 * All returned bounds are normalized to the ORIGINAL viewport target rect.
 * Stage clipping happens first, including translated/negative cover origins.
 */
export function sampleDomCoverage(output: DomCoverage, areas: readonly AreaFrame[], stage: Stage, rect: DomRect): void {
	output.fraction = 0;
	output.left = 0;
	output.top = 0;
	output.width = 0;
	output.height = 0;
	if (!(rect.width > 0 && rect.height > 0 && stage.width > 0 && stage.height > 0)
		|| !Number.isFinite(rect.left + rect.top + rect.width + rect.height + stage.left + stage.top + stage.width + stage.height)) return;
	const left = Math.max(rect.left, stage.left);
	const top = Math.max(rect.top, stage.top);
	const right = Math.min(rect.left + rect.width, stage.left + stage.width);
	const bottom = Math.min(rect.top + rect.height, stage.top + stage.height);
	if (!(right > left && bottom > top)) return;
	const columns = Math.min(40, Math.ceil((right - left) / 8));
	const rows = Math.min(32, Math.ceil((bottom - top) / 8));
	const cellWidth = (right - left) / columns;
	const cellHeight = (bottom - top) / rows;
	let hits = 0;
	let minColumn = columns;
	let minRow = rows;
	let maxColumn = -1;
	let maxRow = -1;
	for (let row = 0; row < rows; row++) {
		const y = top - stage.top + (row + 0.5) * cellHeight;
		for (let column = 0; column < columns; column++) {
			const x = left - stage.left + (column + 0.5) * cellWidth;
			if (!isPointBlocked(areas, x, y, stage.height)) continue;
			hits++;
			minColumn = Math.min(minColumn, column);
			minRow = Math.min(minRow, row);
			maxColumn = Math.max(maxColumn, column);
			maxRow = Math.max(maxRow, row);
		}
	}
	if (!hits) return;
	output.fraction = unit((hits / (columns * rows)) * ((right - left) / rect.width) * ((bottom - top) / rect.height));
	output.left = unit((left - rect.left + minColumn * cellWidth) / rect.width);
	output.top = unit((top - rect.top + minRow * cellHeight) / rect.height);
	output.width = Math.min(1 - output.left, (maxColumn - minColumn + 1) * cellWidth / rect.width);
	output.height = Math.min(1 - output.top, (maxRow - minRow + 1) * cellHeight / rect.height);
}

/** Memory uses supplied song delta only: paused/seek previews can change direct
 * appearance without depositing or recovering residue. Dense exposure slows
 * recovery; detail gives way to card structure around 65.2–68, then the Grid
 * subdues all DOM. Smooth ramps avoid threshold flashes; the coda settles fully.
 */
export function updateContamination(state: ContaminationState, kind: ContaminationKind, coverage: number, transferred: number, songTime: number, deltaSeconds: number): void {
	const time = Number.isFinite(songTime) ? songTime : 0;
	const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
	const dense = smooth(22, 32, time);
	const remnants = smooth(63, 69, time);
	const grid = smooth(104, 113, time);
	const settling = 1 - smooth(140, 150.75, time);
	const detail = kind === "text" ? 0.6 : kind === "image" ? 0.48 : 0.22;
	const gain = (0.86 + dense * 0.12) * (1 - remnants * detail) * (1 - grid * 0.48) * settling;
	const direct = unit(coverage);
	const transfer = unit(transferred);
	const deposition = Math.max(direct, transfer);
	let residue = unit(state.residue);
	if (delta > 0) {
		// Even a brief sweep must leave a readable afterimage. Refresh a bounded
		// exposure floor, rather than adding frame-rate-dependent entry pulses.
		residue = Math.max(residue, 0.64 * Math.sqrt(deposition) * settling);
		const recovery = (kind === "text" ? 0.6 : kind === "image" ? 0.32 : 0.18) * (1 - dense * 0.64);
		const depositionRate = deposition * (4 + dense * 2) * settling;
		const totalRate = recovery + (1 - settling) * 2 + depositionRate;
		const equilibrium = 0.9 * depositionRate / totalRate;
		residue = equilibrium + (residue - equilibrium) * Math.exp(-totalRate * delta);
		if (residue < 0.0001 || time >= 150.75) residue = 0;
	}
	state.coverage = direct;
	state.residue = residue;
	// Union of direct contact and memory, rather than a new pulse per entry.
	state.strength = unit(Math.sqrt(1 - (1 - direct) * (1 - residue)) * gain);
}
