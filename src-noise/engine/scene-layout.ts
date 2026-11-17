export interface SceneElement {
	id: string;
	element: HTMLElement;
}

/** Self-contained so the capture tool can run this same discovery in its browser. */
export function collectSceneLayers(root: Document = document): SceneElement[] {
	const groups = [
		["wallpaper", "#wallpaper-wrapper"],
		["sidebar", "#left-sidebar .card-base, #right-sidebar .card-base"],
		["category", "#category-bar"],
		["post", "#post-list-container .post-card-item"],
		["pagination", "#content-wrapper .pagination"],
		["footer", "footer"],
		["navbar", "#top-row"],
	];
	const result: SceneElement[] = [];
	for (const [group, selector] of groups) {
		let index = 0;
		for (const element of root.querySelectorAll(selector)) {
			if (!(element instanceof HTMLElement)) continue;
			const rect = element.getBoundingClientRect();
			if (rect.width < 1 || rect.height < 1) continue;
			if (result.some(item => item.element.contains(element) || element.contains(item.element))) continue;
			result.push({ id: `${group}-${index++}`, element });
		}
	}
	return result;
}

export interface SceneLayerAsset {
	id: string;
	url: string;
	width: number;
	height: number;
	elementWidth: number;
	elementHeight: number;
	insetLeft: number;
	insetTop: number;
}

export interface SceneManifest {
	version: 1;
	viewport: { width: number; height: number; layoutWidth: number };
	theme: "light" | "dark";
	background: string;
	layers: SceneLayerAsset[];
}

export interface SceneIndex {
	version: 1;
	presets: { width: number; height: number; theme: "light" | "dark"; url: string }[];
}
