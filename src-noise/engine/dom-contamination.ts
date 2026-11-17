// SPDX-License-Identifier: GPL-3.0-only
import type { AreaFrame, Stage } from "./types";
import {
	createContaminationState, resetContamination, sampleDomCoverage, updateContamination,
	type ContaminationKind, type ContaminationState, type DomCoverage, type DomRect,
} from "./dom-contamination-state";
import "../styles/contamination.css";

interface Target {
	element: HTMLElement;
	kind: ContaminationKind;
	state: ContaminationState;
	rect: DomRect;
	visible: DomRect;
	coverage: DomCoverage;
	patch: DomCoverage;
	transferred: number;
	paint: HTMLElement | null;
	ghost: HTMLElement | null;
	text: string | null;
	css: string;
}

const cards = ".post-card-wrapper, #left-sidebar .card-base, #right-sidebar .card-base, #category-bar, #top-row, footer";
const texts = ".post-card-title, .post-card-content .description, .post-meta, .post-card-bottom-tags a, #category-bar a, #top-row a, #left-sidebar .text-center, #right-sidebar .text-center, footer p";
const images = ".post-card-wrapper img, img.profile-avatar-image, .profile-avatar-image img";
const emptyBounds = (): DomCoverage => ({ fraction: 0, left: 0, top: 0, width: 0, height: 0 });
const rect = (): DomRect => ({ left: 0, top: 0, width: 0, height: 0 });

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

interface DomContamination {
	prepare(): void;
	infectPath(fromX: number, fromY: number, toX: number, toY: number, strength: number): void;
	sample(areas: readonly AreaFrame[], stage: Stage, songTime: number, playing: boolean): void;
	reset(): void;
	dispose(): void;
}

/** Paint-only local echoes live INSIDE the drawable source, never above gameplay. */
export function mountDomContamination(): DomContamination {
	let viewport: HTMLElement | null = null;
	let overlay: HTMLDivElement | null = null;
	const targets: Target[] = [];
	let previousTime: number | null = null;

	function reset(): void {
		overlay?.remove();
		overlay = null;
		viewport = null;
		previousTime = null;
		for (const target of targets) {
			resetContamination(target.state);
			target.element.removeAttribute("data-noise-dom-state");
		}
		targets.length = 0;
	}

	function discover(source: HTMLElement): void {
		reset();
		viewport = source;
		const add = (selector: string, kind: ContaminationKind): void => {
			for (const element of source.querySelectorAll<HTMLElement>(selector)) {
				if (element.closest("[data-noise-ui]")) continue;
				targets.push({ element, kind, state: createContaminationState(), rect: rect(), visible: rect(),
					coverage: emptyBounds(), patch: emptyBounds(), transferred: 0, paint: null, ghost: null, text: null, css: "" });
			}
		};
		add(cards, "card");
		add(images, "image");
		add(texts, "text");
		overlay = document.createElement("div");
		overlay.setAttribute("data-noise-dom-overlay", "");
		overlay.setAttribute("aria-hidden", "true");
		overlay.inert = true;
		source.append(overlay);
	}

	// Measure once BEFORE sweeping all coalesced pointer segments and before any paint writes.
	function prepare(): void {
		const source = document.querySelector<HTMLElement>("[data-noise-native-viewport]");
		if (!source) { if (viewport) reset(); return; }
		if (source !== viewport) discover(source);
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

	function createPaint(target: Target): void {
		const paint = document.createElement("div");
		paint.dataset.noiseDomPatch = target.kind;
		if (target.kind === "card") {
			paint.style.borderRadius = getComputedStyle(target.element).borderRadius;
		} else {
			const sourceStyle = getComputedStyle(target.element);
			let ghost: HTMLElement;
			if (target.kind === "image" && target.element instanceof HTMLImageElement) {
				const image = document.createElement("img");
				image.src = target.element.currentSrc || target.element.src;
				image.alt = "";
				image.style.objectFit = sourceStyle.objectFit;
				image.style.objectPosition = sourceStyle.objectPosition;
				ghost = image;
			} else {
				ghost = target.element.cloneNode(true) as HTMLElement;
				for (const node of [ghost, ...ghost.querySelectorAll("*")]) {
					node.removeAttribute("id");
					node.removeAttribute("data-noise-dom-state");
					for (const attribute of [...node.attributes]) {
						if (attribute.name.startsWith("on")) node.removeAttribute(attribute.name);
					}
				}
				ghost.style.font = sourceStyle.font;
				ghost.style.letterSpacing = sourceStyle.letterSpacing;
				ghost.style.color = sourceStyle.color;
				ghost.style.textAlign = sourceStyle.textAlign;
				target.text = target.element.textContent;
			}
			ghost.setAttribute("data-noise-dom-paint", "");
			paint.append(ghost);
			target.ghost = ghost;
		}
		target.paint = paint;
		overlay?.append(paint);
	}

	function sample(areas: readonly AreaFrame[], stage: Stage, songTime: number, playing: boolean): void {
		if (!overlay) return;
		const delta = playing && previousTime !== null ? Math.max(0, songTime - previousTime) : 0;
		previousTime = songTime;
		for (const target of targets) {
			const full = target.rect;
			const visible = target.visible;
			const coverage = target.coverage;
			sampleDomCoverage(coverage, areas, stage, visible);
			if (coverage.fraction > 0 && full.width && full.height) {
				remember(target, (visible.left - full.left + coverage.left * visible.width) / full.width,
					(visible.top - full.top + coverage.top * visible.height) / full.height,
					coverage.width * visible.width / full.width, coverage.height * visible.height / full.height);
				coverage.fraction *= visible.width * visible.height / (full.width * full.height);
			}
			updateContamination(target.state, target.kind, coverage.fraction, target.transferred, songTime, delta);
			target.transferred = 0;
			const level = target.state.strength;
			if (level < 0.002) {
				target.paint?.remove(); target.paint = null; target.ghost = null; target.css = "";
				target.patch.width = target.patch.height = 0;
				target.element.removeAttribute("data-noise-dom-state");
				continue;
			}
			if (!visible.width || !visible.height) { target.paint?.remove(); target.paint = null; target.ghost = null; target.css = ""; continue; }
			if (!target.paint) createPaint(target);
			const paint = target.paint!;
			if (target.kind === "text" && target.text !== target.element.textContent) {
				paint.remove(); createPaint(target); target.css = "";
			}
			const patch = target.patch;
			const left = Math.max(patch.left * full.width, visible.left - full.left);
			const top = Math.max(patch.top * full.height, visible.top - full.top);
			const right = Math.min((patch.left + patch.width) * full.width, visible.left + visible.width - full.left);
			const bottom = Math.min((patch.top + patch.height) * full.height, visible.top + visible.height - full.top);
			const amount = Math.round(level * 255) / 255;
			const css = `left:${full.left.toFixed(2)}px;top:${full.top.toFixed(2)}px;width:${full.width.toFixed(2)}px;height:${full.height.toFixed(2)}px;clip-path:inset(${top.toFixed(2)}px ${Math.max(0, full.width - right).toFixed(2)}px ${Math.max(0, full.height - bottom).toFixed(2)}px ${left.toFixed(2)}px);--noise-dom-level:${amount};`;
			if (target.css !== css) {
				target.paint!.style.cssText = css;
				if (target.kind === "card") target.paint!.style.borderRadius = getComputedStyle(target.element).borderRadius;
				target.css = css;
			}
			const state = coverage.fraction > 0 ? "covered" : "residual";
			if (target.element.dataset.noiseDomState !== state) target.element.dataset.noiseDomState = state;
		}
	}

	return { prepare, infectPath, sample, reset, dispose: reset };
}
