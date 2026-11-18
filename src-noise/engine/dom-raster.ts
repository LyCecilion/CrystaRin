// SPDX-License-Identifier: GPL-3.0-only
import { corruptGlyph, glyphAmount, sliceOffsets } from "./dom-visuals";

interface Glyph {
	text: string;
	x: number;
	y: number;
	width: number;
	font: string;
	color: string;
	direction: CanvasDirection;
	index: number;
}

export interface DomRaster {
	canvas: HTMLCanvasElement;
	width: number;
	height: number;
	draw(amount: number, heal: number, heat: number, tick: number, glyphTick: number, seed: number): void;
	dispose(): void;
}

function surface(width: number, height: number, ratio: number): CanvasRenderingContext2D {
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.ceil(width * ratio));
	canvas.height = Math.max(1, Math.ceil(height * ratio));
	const context = canvas.getContext("2d");
	if (!context) throw new Error("无法创建 DOM 污染绘制表面");
	context.scale(ratio, ratio);
	return context;
}

/** Read the real, already-wrapped text once, without inserting measurement clones.
 * Range positions preserve inline styles, explicit breaks and original line widths. */
function measureGlyphs(element: HTMLElement, context: CanvasRenderingContext2D): Glyph[] {
	const box = element.getBoundingClientRect();
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const range = document.createRange();
	const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
	const glyphs: Glyph[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const parent = node.parentElement;
		if (!parent?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
		const style = getComputedStyle(parent);
		const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		context.font = font;
		const ascent = context.measureText("Mg").fontBoundingBoxAscent;
		for (const part of segmenter.segment(node.textContent ?? "")) {
			if (!part.segment.trim()) continue;
			range.setStart(node, part.index);
			range.setEnd(node, part.index + part.segment.length);
			const bounds = range.getBoundingClientRect();
			if (!(bounds.width > 0 && bounds.height > 0)) continue;
			let text = part.segment;
			if (style.textTransform === "uppercase") text = text.toLocaleUpperCase();
			else if (style.textTransform === "lowercase") text = text.toLocaleLowerCase();
			else if (style.textTransform === "capitalize" && (part.index === 0 || /\s/u.test(node.textContent?.[part.index - 1] ?? ""))) text = text.toLocaleUpperCase();
			glyphs.push({
				text, x: bounds.left - box.left, y: bounds.top - box.top + ascent,
				width: bounds.width, font, color: style.color,
				direction: style.direction === "rtl" ? "rtl" : "ltr", index: glyphs.length,
			});
		}
	}
	return glyphs;
}

function position(value: string, free: number): number {
	if (value === "left" || value === "top") return 0;
	if (value === "right" || value === "bottom") return free;
	if (value === "center") return free / 2;
	// Computed positions contain percentages, pixels, or a calc of the two.
	let offset = 0;
	for (const term of value.replace(/\s+/g, "").matchAll(/([+-]?\d*\.?\d+)(%|px)/g)) {
		offset += Number(term[1]) * (term[2] === "%" ? free / 100 : 1);
	}
	return offset;
}

function paintImage(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number): boolean {
	if (!image.complete || !image.naturalWidth || !image.naturalHeight) return false;
	const style = getComputedStyle(image);
	let scaleX = width / image.naturalWidth;
	let scaleY = height / image.naturalHeight;
	if (style.objectFit !== "fill") {
		const fit = style.objectFit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
		scaleX = scaleY = style.objectFit === "none" ? 1 : style.objectFit === "scale-down" ? Math.min(1, fit) : fit;
	}
	const drawWidth = image.naturalWidth * scaleX;
	const drawHeight = image.naturalHeight * scaleY;
	const terms = style.objectPosition.match(/calc\([^)]*\)|[^\s]+/g) ?? ["50%", "50%"];
	let x = terms[0];
	let y = terms[1] ?? "50%";
	if (terms.length >= 3) {
		// Edge-offset syntax, e.g. right 12px bottom 8px.
		for (let index = 0; index < terms.length; index++) {
			const edge = terms[index];
			if (!["left", "right", "top", "bottom"].includes(edge)) continue;
			const offset = /^(?:calc\(|[\d.+-])/.test(terms[index + 1] ?? "") ? terms[++index] : "0px";
			const value = edge === "right" || edge === "bottom" ? `calc(100% - ${offset})` : offset;
			if (edge === "left" || edge === "right") x = value;
			else y = value;
		}
	}
	context.drawImage(image, position(x, width - drawWidth), position(y, height - drawHeight), drawWidth, drawHeight);
	return true;
}

/** One ink raster per target. Colour echoes and all three bands only copy pixels;
 * neither DOM text layout nor glyph rasterization is repeated for each slice. */
export function createDomRaster(element: HTMLElement, kind: "text" | "image", width: number, height: number): DomRaster {
	const ratio = Math.min(devicePixelRatio || 1, 2);
	const ink = surface(width, height, ratio);
	const output = surface(width, height, ratio);
	const colors = kind === "text" ? surface(width * 3, height, ratio) : null;
	const glyphs = kind === "text" ? measureGlyphs(element, ink) : [];
	const image = element instanceof HTMLImageElement ? element : null;
	const canvas = output.canvas;
	canvas.dataset.noiseDomPaint = "";
	if (kind === "image") canvas.dataset.noiseDomFilter = "";
	let lastGlyphTick = Number.NaN;
	let lastSource = "";
	let lastDraw = "";

	function rasterize(fraction: number, tick: number, seed: number): void {
		ink.clearRect(0, 0, width, height);
		for (const glyph of glyphs) {
			ink.font = glyph.font;
			ink.fillStyle = glyph.color;
			ink.direction = glyph.direction;
			ink.textAlign = glyph.direction === "rtl" ? "right" : "left";
			const text = corruptGlyph(glyph.text, fraction, tick, seed, glyph.index);
			ink.fillText(text, glyph.x + (glyph.direction === "rtl" ? glyph.width : 0), glyph.y, glyph.width);
		}
		if (!colors) return;
		colors.clearRect(0, 0, width * 3, height);
		const palette = ["#44d8e6", "#f35b98", "#ffd54a"];
		for (let index = 0; index < 3; index++) {
			colors.save();
			colors.beginPath();
			colors.rect(index * width, 0, width, height);
			colors.clip();
			colors.drawImage(ink.canvas, index * width, 0, width, height);
			colors.globalCompositeOperation = "source-in";
			colors.fillStyle = palette[index];
			colors.fillRect(index * width, 0, width, height);
			colors.restore();
		}
	}

	return {
		canvas, width, height,
		draw(amount, heal, heat, tick, glyphTick, seed): void {
			const fraction = glyphAmount(amount, heal);
			const contentTick = fraction > 0.01 ? glyphTick : -1;
			if (kind === "text" && lastGlyphTick !== contentTick) {
				rasterize(fraction, glyphTick, seed);
				lastGlyphTick = contentTick;
				lastDraw = "";
			} else if (image && lastSource !== (image.currentSrc || image.src)) {
				ink.clearRect(0, 0, width, height);
				if (!paintImage(ink, image, width, height)) return;
				lastSource = image.currentSrc || image.src;
				lastDraw = "";
			}
			const key = `${tick}:${amount}:${heat}`;
			if (lastDraw === key) return;
			lastDraw = key;
			output.clearRect(0, 0, width, height);
			const offsets = sliceOffsets(3, kind, amount, heat, tick, seed);
			for (let index = 0; index < offsets.length; index++) {
				const offset = offsets[index];
				const top = Math.max(0, index * height / 3 - (index ? height * 0.015 : 0));
				const bottom = Math.min(height, (index + 1) * height / 3 + (index < 2 ? height * 0.015 : 0));
				output.save();
				output.beginPath();
				output.rect(0, top, width, bottom - top);
				output.clip();
				output.translate(width / 2 + offset.x, height / 2 + offset.y);
				output.scale(offset.scaleX, offset.scaleY);
				output.translate(-width / 2, -height / 2);
				if (colors) {
					output.drawImage(colors.canvas, 0, 0, width * ratio, height * ratio, -7 * amount, 0, width, height);
					output.drawImage(colors.canvas, width * ratio, 0, width * ratio, height * ratio, 5 * amount, 0, width, height);
					output.drawImage(colors.canvas, width * ratio * 2, 0, width * ratio, height * ratio, 2 * amount, 2, width, height);
				}
				output.drawImage(ink.canvas, 0, 0, width, height);
				output.restore();
			}
		},
		dispose(): void {
			// Release backing stores immediately when contact ends or the layout changes.
			for (const context of [ink, output, colors]) if (context) context.canvas.width = context.canvas.height = 1;
		},
	};
}
