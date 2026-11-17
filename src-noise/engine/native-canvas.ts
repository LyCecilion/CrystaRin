/** Experimental Chromium HTML-in-Canvas APIs; always detect them at runtime. */
export interface DrawableCanvas extends HTMLCanvasElement {
	content: string;
	requestPaint(): void;
	getElementImageDefaultSize(element: Element): { width: number; height: number };
}

export interface DrawableWebGL extends WebGL2RenderingContext {
	texElementSubImage2D(target: number, level: number, x: number, y: number, element: Element): void;
}
