export interface SignalOption {
	readonly id: string;
	readonly label: string;
	readonly value: string;
}

export class SignalRenderer {
	constructor(canvas: HTMLCanvasElement, options?: { aspect?: string; framing?: string });
	setDesign(design: Record<string, string | number>): void;
	render(seconds: number, options: readonly SignalOption[], view: string, selectedId: string): void;
	dispose(): void;
}
