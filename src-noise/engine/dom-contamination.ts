// SPDX-License-Identifier: GPL-3.0-only
import type { AreaFrame, Stage } from "./types";
import {
	createContaminationState, resetContamination, sampleDomCoverage, updateContamination,
	type ContaminationKind, type ContaminationState, type DomCoverage, type DomRect,
} from "./dom-contamination-state";
import { healingProgress, impulseAt, noiseUnit } from "./dom-visuals";
import { createDomRaster, type DomRaster } from "./dom-raster";
import "../styles/contamination.css";

interface Target {
	element: HTMLElement;
	kind: ContaminationKind;
	seed: number;
	state: ContaminationState;
	rect: DomRect;
	visible: DomRect;
	coverage: DomCoverage;
	patch: DomCoverage;
	transferred: number;
	paint: HTMLElement | null;
	raster: DomRaster | null;
	backdrop: string;
	radius: string;
	/** Last covered level, retained while the reconstruction wipe advances. */
	hold: number;
	/** Song seconds since the last touch, used to drive the reconstruction. */
	quiet: number;
	heal: number;
	burst: number;
	contact: boolean;
	css: string;
}

interface DomPointer { x: number; y: number; present: boolean; strength: number; allowed?: boolean }

const cards = ".post-card-wrapper, #left-sidebar .card-base, #right-sidebar .card-base, #category-bar, #top-row, footer";
const texts = ".post-card-title, .post-card-content .description, .post-meta, .post-card-bottom-tags a, #category-bar a, #top-row a, #left-sidebar .text-center, #right-sidebar .text-center, footer p";
const images = ".post-card-wrapper img, img.profile-avatar-image, .profile-avatar-image img";
const palette = ["#44d8e6", "#f35b98", "#ffd54a", "#ff2b4d", "#b388ff"];
const emptyBounds = (): DomCoverage => ({ fraction: 0, left: 0, top: 0, width: 0, height: 0 });
const rect = (): DomRect => ({ left: 0, top: 0, width: 0, height: 0 });
const fadeStart = 69;
const fadeEnd = 69.6;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

let colorContext: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, [number, number, number, number] | null>();

/** Resolve any CSS colour (rgb, oklch, color-mix…) to premultiplied-friendly RGBA. */
function colorTuple(value: string): [number, number, number, number] | null {
	const cached = colorCache.get(value);
	if (cached !== undefined) return cached;
	if (!colorContext) {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		colorContext = canvas.getContext("2d", { willReadFrequently: true });
	}
	if (!colorContext) return null;
	colorContext.fillStyle = "#010203";
	colorContext.fillStyle = value;
	if (colorContext.fillStyle === "#010203") {
		colorCache.set(value, null);
		return null;
	}
	colorContext.clearRect(0, 0, 1, 1);
	colorContext.fillRect(0, 0, 1, 1);
	const data = colorContext.getImageData(0, 0, 1, 1).data;
	const tuple: [number, number, number, number] = [data[0], data[1], data[2], data[3] / 255];
	colorCache.set(value, tuple);
	return tuple;
}

/**
 * Composite every ancestor background into one opaque paper colour. Text patches
 * paint this behind the rasterized glyphs so the intact sentence cannot show
 * through; semi-transparent cards are resolved instead of copied verbatim.
 */
function backdropColor(element: HTMLElement): string {
	const layers: [number, number, number, number][] = [];
	for (let node: HTMLElement | null = element; node; node = node.parentElement) {
		const color = colorTuple(getComputedStyle(node).backgroundColor);
		if (color && color[3] > 0.001) layers.push(color);
	}
	let red = 16;
	let green = 16;
	let blue = 24;
	let alpha = 1;
	for (let index = layers.length - 1; index >= 0; index--) {
		const [topR, topG, topB, topA] = layers[index];
		const outA = topA + alpha * (1 - topA);
		red = outA > 0 ? (topR * topA + red * alpha * (1 - topA)) / outA : red;
		green = outA > 0 ? (topG * topA + green * alpha * (1 - topA)) / outA : green;
		blue = outA > 0 ? (topB * topA + blue * alpha * (1 - topA)) / outA : blue;
		alpha = outA;
	}
	return `rgb(${Math.round(red)} ${Math.round(green)} ${Math.round(blue)})`;
}

function remember(target: Target, left: number, top: number, width: number, height: number): void {
	const patch = target.patch;
	left = Math.max(0, left);
	top = Math.max(0, top);
	const right = Math.min(1, left + width);
	const bottom = Math.min(1, top + height);
	if (right <= left || bottom <= top) return;
	if (patch.width && patch.height) {
		const oldRight = patch.left + patch.width;
		const oldBottom = patch.top + patch.height;
		patch.left = Math.min(left, patch.left);
		patch.top = Math.min(top, patch.top);
		patch.width = Math.max(right, oldRight) - patch.left;
		patch.height = Math.max(bottom, oldBottom) - patch.top;
	} else {
		patch.left = left;
		patch.top = top;
		patch.width = right - left;
		patch.height = bottom - top;
	}
}

/** 64 × 64 monochrome grain, reused by every contaminated element. */
function grainTexture(): string {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 64;
	const context = canvas.getContext("2d");
	if (!context) return "";
	const image = context.createImageData(64, 64);
	let seed = 0x9e3779b9;
	for (let index = 0; index < image.data.length; index += 4) {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		const value = (seed >>> 0) % 256;
		image.data[index] = value;
		image.data[index + 1] = value;
		image.data[index + 2] = value;
		image.data[index + 3] = value > 150 ? 96 : 0;
	}
	context.putImageData(image, 0, 0);
	return `url(${canvas.toDataURL("image/png")})`;
}

function cardPalette(seed: number): [string, string] {
	const index = Math.abs(seed) % palette.length;
	return [palette[index], palette[(index + 2) % palette.length]];
}

function heatAt(pointer: DomPointer | undefined, box: DomRect): number {
	if (!pointer?.present || pointer.allowed === false || !(pointer.strength > 0) || !(box.width > 0 && box.height > 0)) return 0;
	const x = Math.max(box.left, Math.min(pointer.x, box.left + box.width));
	const y = Math.max(box.top, Math.min(pointer.y, box.top + box.height));
	const distance = Math.hypot(pointer.x - x, pointer.y - y);
	const reach = Math.max(160, Math.max(box.width, box.height) * 0.55);
	return Math.max(0, 1 - distance / reach) * Math.min(1, pointer.strength);
}

function styleFor(
	target: Target,
	amount: number,
	heat: number,
	hotX: number,
	hotY: number,
	tick: number,
	songTime: number,
): string {
	const full = target.rect;
	const visible = target.visible;
	const left = Math.max(target.patch.left * full.width, visible.left - full.left);
	const top = Math.max(target.patch.top * full.height, visible.top - full.top);
	const right = Math.min((target.patch.left + target.patch.width) * full.width, visible.left + visible.width - full.left);
	const bottom = Math.min((target.patch.top + target.patch.height) * full.height, visible.top + visible.height - full.top);
	// The wipe moves the whole patch's top edge down, revealing the intact source.
	const wipe = Math.min(bottom, Math.max(top, target.heal * full.height));
	const parts = [
		`left:${full.left.toFixed(2)}px`,
		`top:${full.top.toFixed(2)}px`,
		`width:${full.width.toFixed(2)}px`,
		`height:${full.height.toFixed(2)}px`,
		`border-radius:${target.radius}`,
		`clip-path:inset(${wipe.toFixed(2)}px ${Math.max(0, full.width - right).toFixed(2)}px ${Math.max(0, full.height - bottom).toFixed(2)}px ${left.toFixed(2)}px)`,
		`--noise-dom-level:${amount.toFixed(4)}`,
		`--noise-dom-heal:${target.heal.toFixed(3)}`,
		`--noise-dom-healing:${target.heal > 0.001 && target.heal < 0.999 ? 1 : 0}`,
		`--noise-dom-hot:${(heat * amount).toFixed(3)}`,
		`--noise-dom-hx:${hotX.toFixed(1)}px`,
		`--noise-dom-hy:${hotY.toFixed(1)}px`,
		`--noise-dom-heal-y:${(target.heal * full.height).toFixed(1)}px`,
		`--noise-dom-bg:${target.backdrop}`,
	];
	if (target.kind === "card") {
		const colors = cardPalette(target.seed + tick);
		const tilt = (noiseUnit(target.seed, tick, 3) * 2 - 1) * 0.9 * amount;
		parts.push(
			`--noise-dom-a:${colors[0]}`,
			`--noise-dom-b:${colors[1]}`,
			`--noise-dom-bar:${((songTime * 28) % 100).toFixed(2)}%`,
			`--noise-dom-bar-op:${(amount > 0.3 ? Math.min(1, (amount - 0.3) * 1.5) : 0).toFixed(3)}`,
			`transform:rotate(${tilt.toFixed(2)}deg) scale(${(1 + amount * 0.014).toFixed(3)})`,
		);
	}
	return `${parts.join(";")};`;
}

interface DomContamination {
	/** Returns false after retirement or when there is no drawable source. */
	prepare(songTime: number): boolean;
	infectPath(fromX: number, fromY: number, toX: number, toY: number, strength: number): void;
	sample(areas: readonly AreaFrame[], stage: Stage, songTime: number, playing: boolean, pointer?: DomPointer): void;
	reset(): void;
	dispose(): void;
}

/** Paint-only local echoes live INSIDE the drawable source, never above gameplay. */
export function mountDomContamination(): DomContamination {
	let viewport: HTMLElement | null = null;
	let overlay: HTMLDivElement | null = null;
	const targets: Target[] = [];
	let previousTime: number | null = null;

	function removePaint(target: Target): void {
		target.paint?.remove();
		target.paint = null;
		target.raster?.dispose();
		target.raster = null;
		target.css = "";
		target.hold = 0;
		target.quiet = 0;
		target.heal = 0;
		target.burst = 0;
		target.contact = false;
		target.patch.width = target.patch.height = 0;
		target.element.removeAttribute("data-noise-dom-state");
	}

	function reset(): void {
		overlay?.remove();
		overlay = null;
		viewport = null;
		previousTime = null;
		for (const target of targets) {
			removePaint(target);
			resetContamination(target.state);
		}
		targets.length = 0;
	}

	function createPaint(target: Target): void {
		const style = getComputedStyle(target.element);
		target.radius = style.borderRadius;
		target.backdrop = target.kind === "text" ? backdropColor(target.element) : "transparent";
		const root = document.createElement("div");
		root.dataset.noiseDomPatch = target.kind;
		const fragment = document.createDocumentFragment();
		if (target.kind === "card") {
			const bar = document.createElement("div");
			bar.dataset.noiseDomBar = "";
			fragment.append(bar);
		} else {
			target.raster = createDomRaster(target.element, target.kind, target.rect.width, target.rect.height);
			fragment.append(target.raster.canvas);
		}
		const heat = document.createElement("div");
		heat.dataset.noiseDomHeat = "";
		fragment.append(heat);
		const line = document.createElement("div");
		line.dataset.noiseDomHealLine = "";
		fragment.append(line);
		root.append(fragment);
		overlay?.append(root);
		target.paint = root;
		target.css = "";
	}

	function discover(source: HTMLElement): void {
		reset();
		viewport = source;
		let seed = 1;
		const add = (selector: string, kind: ContaminationKind): void => {
			for (const element of source.querySelectorAll<HTMLElement>(selector)) {
				if (element.closest("[data-noise-ui]")) continue;
				targets.push({
					element, kind,
					seed: ((seed++ * 2654435761) >>> 0),
					state: createContaminationState(),
					rect: rect(), visible: rect(),
					coverage: emptyBounds(), patch: emptyBounds(),
					transferred: 0, paint: null, raster: null,
					backdrop: "transparent", radius: "0",
					hold: 0, quiet: 0, heal: 0, burst: 0, contact: false, css: "",
				});
			}
		};
		add(cards, "card");
		add(images, "image");
		add(texts, "text");
		overlay = document.createElement("div");
		overlay.setAttribute("data-noise-dom-overlay", "");
		overlay.setAttribute("aria-hidden", "true");
		overlay.inert = true;
		overlay.style.setProperty("--noise-dom-grain", grainTexture());
		source.append(overlay);
	}

	// Measure once BEFORE sweeping all coalesced pointer segments and before any paint writes.
	function prepare(songTime: number): boolean {
		// Retire the complete adapter, not just its opacity. A backwards seek will
		// discover the live source again; late frames do not even query the DOM.
		if (songTime >= fadeEnd) {
			if (viewport) reset();
			return false;
		}
		const source = document.querySelector<HTMLElement>("[data-noise-native-viewport]");
		if (!source) { if (viewport) reset(); return false; }
		if (source !== viewport) discover(source);
		const progress = clamp01((songTime - fadeStart) / (fadeEnd - fadeStart));
		const opacity = String(1 - progress * progress * (3 - 2 * progress));
		if (overlay && overlay.style.opacity !== opacity) overlay.style.opacity = opacity;
		for (const target of targets) {
			if (!target.element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
				target.visible.width = target.visible.height = 0;
				continue;
			}
			const bounds = target.element.getBoundingClientRect();
			target.rect.left = bounds.left;
			target.rect.top = bounds.top;
			target.rect.width = bounds.width;
			target.rect.height = bounds.height;
			let left = Math.max(0, bounds.left);
			let top = Math.max(0, bounds.top);
			let right = Math.min(innerWidth, bounds.right);
			let bottom = Math.min(innerHeight, bounds.bottom);
			// Covers and clamped excerpts must not leak paint past their actual clipping ancestors.
			for (let parent = target.element.parentElement; parent && parent !== viewport; parent = parent.parentElement) {
				const style = getComputedStyle(parent);
				if (style.overflowX !== "visible" || style.overflowY !== "visible") {
					const clip = parent.getBoundingClientRect();
					if (style.overflowX !== "visible") { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
					if (style.overflowY !== "visible") { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
				}
			}
			target.visible.left = left;
			target.visible.top = top;
			target.visible.width = Math.max(0, right - left);
			target.visible.height = Math.max(0, bottom - top);
		}
		return true;
	}

	function infectPath(fromX: number, fromY: number, toX: number, toY: number, strength: number): void {
		if (!(strength > 0)) return;
		const dx = toX - fromX;
		const dy = toY - fromY;
		for (const target of targets) {
			const box = target.visible;
			if (!box.width || !box.height) continue;
			let enter = 0;
			let leave = 1;
			if (dx === 0) { if (fromX < box.left || fromX > box.left + box.width) continue; }
			else {
				const a = (box.left - fromX) / dx;
				const b = (box.left + box.width - fromX) / dx;
				enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
			}
			if (dy === 0) { if (fromY < box.top || fromY > box.top + box.height) continue; }
			else {
				const a = (box.top - fromY) / dy;
				const b = (box.top + box.height - fromY) / dy;
				enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
			}
			if (leave < enter) continue;
			const x1 = fromX + dx * enter;
			const y1 = fromY + dy * enter;
			const x2 = fromX + dx * leave;
			const y2 = fromY + dy * leave;
			const full = target.rect;
			const left = Math.max(box.left, Math.min(x1, x2) - 8);
			const top = Math.max(box.top, Math.min(y1, y2) - 8);
			const right = Math.min(box.left + box.width, Math.max(x1, x2) + 8);
			const bottom = Math.min(box.top + box.height, Math.max(y1, y2) + 8);
			remember(target, (left - full.left) / full.width, (top - full.top) / full.height,
				(right - left) / full.width, (bottom - top) / full.height);
			target.transferred = Math.max(target.transferred, strength);
		}
	}

	function sample(
		areas: readonly AreaFrame[],
		stage: Stage,
		songTime: number,
		playing: boolean,
		pointer?: DomPointer,
	): void {
		if (!overlay) return;
		const delta = playing && previousTime !== null ? Math.max(0, songTime - previousTime) : 0;
		previousTime = songTime;
		const slowTick = Math.floor(songTime * 15);
		const glyphTick = Math.floor(songTime * 10);
		const pulse = impulseAt(songTime);
		for (const target of targets) {
			const full = target.rect;
			const visible = target.visible;
			const coverage = target.coverage;
			sampleDomCoverage(coverage, areas, stage, visible);
			const contact = coverage.fraction > 0 || target.transferred > 0;
			if (coverage.fraction > 0 && full.width && full.height) {
				remember(target,
					(visible.left - full.left + coverage.left * visible.width) / full.width,
					(visible.top - full.top + coverage.top * visible.height) / full.height,
					coverage.width * visible.width / full.width,
					coverage.height * visible.height / full.height);
				coverage.fraction *= visible.width * visible.height / (full.width * full.height);
			}
			updateContamination(target.state, target.kind, coverage.fraction, target.transferred, songTime, delta);
			target.transferred = 0;
			const level = target.state.strength;
			const heat = heatAt(pointer, visible);
			if (contact) {
				target.quiet = 0;
				target.heal = 0;
				// The last covered frame is what the afterglow has to preserve; taking
				// a historical maximum would make the effect jump after a fade-out.
				target.hold = level;
				if (!target.contact) target.burst = 0.85;
			} else {
				target.quiet += delta;
				target.heal = healingProgress(target.quiet);
			}
			target.contact = contact;
			target.burst = Math.max(0, target.burst - delta * 5);
			// Direct contact tracks the field; after it leaves, the held peak is
			// what the reconstruction wipe erases over the next few seconds.
			const base = contact ? level : Math.max(level, target.hold * (1 - target.heal));
			const visual = Math.min(1, base * (1 + pulse * 0.7) + target.burst * 0.3);
			if (visual < 0.002 || target.heal >= 0.999) {
				if (target.paint) removePaint(target);
				continue;
			}
			if (!full.width || !full.height || !visible.width || !visible.height) {
				if (target.paint) removePaint(target);
				continue;
			}
			if (!target.paint) {
				createPaint(target);
				if (!target.paint) continue;
			}
			const amount = Math.round(clamp01(visual) * 255) / 255;
			if (target.raster && (target.raster.width !== full.width || target.raster.height !== full.height)) {
				target.raster.dispose();
				target.raster.canvas.remove();
				target.raster = createDomRaster(target.element, target.kind === "image" ? "image" : "text", full.width, full.height);
				target.paint.prepend(target.raster.canvas);
			}
			target.raster?.draw(amount, target.heal, heat, slowTick, glyphTick, target.seed);
			const hotX = pointer?.present ? Math.max(0, Math.min(pointer.x - full.left, full.width)) : full.width / 2;
			const hotY = pointer?.present ? Math.max(0, Math.min(pointer.y - full.top, full.height)) : full.height / 2;
			const css = styleFor(target, amount, heat, hotX, hotY, slowTick, songTime);
			if (css !== target.css) {
				target.paint.style.cssText = css;
				target.css = css;
			}
			const state = coverage.fraction > 0 ? "covered" : target.heal > 0 ? "healing" : "residual";
			if (target.element.dataset.noiseDomState !== state) target.element.dataset.noiseDomState = state;
		}
	}

	return { prepare, infectPath, sample, reset, dispose: reset };
}
