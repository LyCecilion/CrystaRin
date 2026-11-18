export type AreaPhase = "disabled" | "ready" | "active";

/** Area geometry uses stage-local CSS pixels, y down, clockwise radians. */
export interface AreaFrame {
	cx: number;
	cy: number;
	width: number;
	height: number;
	rotation: number;
	subtract: boolean;
	phase: AreaPhase;
	opacity: number;
}

export interface LineFrame {
	x: number;
	y: number;
	rotation: number;
	length: number;
	opacity: number;
}

export interface ChartFrame {
	areas: AreaFrame[];
	lines: LineFrame[];
}

export interface Stage {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** Pointer coordinates use viewport CSS pixels. */
export interface PointerVisual {
	x: number;
	y: number;
	strength: number;
	present: boolean;
}

