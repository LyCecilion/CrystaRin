import type { SignalOption } from "./engine.js";

export const DEFAULT_SETTINGS: {
	readonly options: readonly SignalOption[];
	readonly design: Readonly<Record<string, string | number>>;
	readonly preview: { readonly view: string; readonly selectedId: string; readonly aspect: string };
};
