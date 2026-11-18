// SPDX-License-Identifier: GPL-3.0-only
import { loadPhiraAssets, type PhiraFrame } from "./phira-material";
import type { DrawableCanvas } from "./native-canvas";
import { createSceneCompositor, type SceneCompositor, type SceneOptions } from "./scene-renderer";
import { loadPostFxAssets } from "./postfx-assets";
import type { PostFxState } from "./postfx-settings";
import { loadNoteAssets } from "./note-assets";
import type { NotePerformanceState } from "./note-types";

export interface NativeTakeover {
	readonly active: boolean;
	enter(withMusic?: boolean): Promise<boolean>;
	setRunning(running: boolean): void;
	/** Resolve only after a fresh frame has presented the requested scene mode. */
	present(effect: boolean): Promise<void>;
	exit(reason?: string): void;
	dispose(): void;
}

/** Real DOM stays alive inside a drawable viewport; the document owns scrolling. */
export function mountNativeTakeover(root: HTMLElement, hooks: {
	onEnter: (withMusic: boolean) => void;
	onExit: (withMusic: boolean, reason?: string) => void;
	canEnter: (withMusic: boolean) => boolean;
	frame?: (nowMs: number) => PhiraFrame | undefined;
	postfx: PostFxState;
	notes: NotePerformanceState;
}): NativeTakeover {
	const get = <T extends HTMLElement>(id: string): T => {
		const element = root.querySelector<T>(`#${id}`);
		if (!element) throw new Error(`Missing native control: ${id}`);
		return element;
	};
	const start = get<HTMLButtonElement>("noise-native-start");
	const toolbar = get("noise-native-toolbar");
	const leave = get<HTMLButtonElement>("noise-native-exit");
	const effect = get<HTMLButtonElement>("noise-native-effect");
	const status = get("noise-native-status");
	// Keep the real page outside the performance UI's inherited/button styles.
	const canvas = document.createElement("canvas") as DrawableCanvas;
	canvas.id = "noise-native-canvas";
	canvas.setAttribute("content", "drawable");
	canvas.setAttribute("aria-hidden", "true");
	canvas.hidden = true;
	const hold = document.createElement("canvas");
	hold.id = "noise-native-hold";
	hold.setAttribute("aria-hidden", "true");
	hold.hidden = true;
	document.body.append(canvas, hold);
	const listeners = new AbortController();
	const moved: { element: HTMLElement; anchor: Comment }[] = [];
	const viewport = document.createElement("div");
	viewport.setAttribute("drawable", "");
	viewport.setAttribute("data-noise-native-viewport", "");
	viewport.inert = true;
	const scroller = document.createElement("div");
	scroller.setAttribute("data-noise-native-scroller", "");
	viewport.append(scroller);
	const spacer = document.createElement("div");
	spacer.id = "noise-native-spacer";
	spacer.setAttribute("aria-hidden", "true");
	const rectangle = { id: "viewport", x: 0, y: 0, width: 0, height: 0 };
	const rectangles = [rectangle];
	const options: SceneOptions = { effect: true, pointerX: innerWidth / 2, pointerY: innerHeight / 2, time: 0, postfx: hooks.postfx };
	let compositor: SceneCompositor | null = null;
	let active = false;
	let pending = false;
	let disposed = false;
	let running = true;
	let performanceMode = false;
	let dirty = true;
	let version = 0;
	let animation = 0;
	let watchdog = 0;
	let spacerHeight = 0;
	let ready: { promise: Promise<boolean>; resolve(value: boolean): void } | null = null;
	let presentation: { resolve(): void; reject(error: Error): void } | null = null;
	root.dataset.nativeState = "idle";

	function finishEntrance(element: HTMLElement): void {
		for (const animation of element.getAnimations({ subtree: true })) {
			if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
		}
	}

	function exit(reason?: string): void {
		const wasActive = active || pending;
		const scroll = window.scrollY;
		++version;
		active = false;
		pending = false;
		cancelAnimationFrame(animation);
		clearTimeout(watchdog);
		animation = 0;
		ready?.resolve(false);
		ready = null;
		presentation?.reject(new Error(reason || "实时舞台已退出"));
		presentation = null;
		// Retain the spacer until the same nodes and their finished paint are back.
		for (const { element, anchor } of moved) {
			anchor.replaceWith(element);
			finishEntrance(element);
		}
		if (moved.length) {
			spacer.remove();
			window.scrollTo({ top: scroll, behavior: "instant" });
		}
		moved.length = 0;
		canvas.hidden = true;
		hold.hidden = true;
		toolbar.hidden = true;
		viewport.remove();
		compositor?.dispose();
		compositor = null;
		start.disabled = false;
		start.textContent = "原生 HTML-in-Canvas（无音乐）";
		root.dataset.nativeState = reason ? "error" : "idle";
		if (reason) status.textContent = reason;
		if (wasActive) hooks.onExit(performanceMode, reason);
	}

	function requestPaint(): void {
		if (!active && !pending) return;
		try {
			const now = performance.now();
			options.time = now / 1000;
			// Mutate the live source BEFORE its paint/upload, never from a paint handler.
			options.noise = performanceMode ? hooks.frame?.(now) : undefined;
			if (active || pending) canvas.requestPaint();
		}
		catch (error) { exit(error instanceof Error ? error.message : "原生绘制失败，已恢复首页"); }
	}

	function shouldAnimate(): boolean {
		return running && (performanceMode || options.effect || hooks.postfx.enabled);
	}

	function refreshAnimation(): void {
		if (!active) return;
		cancelAnimationFrame(animation);
		animation = shouldAnimate() ? requestAnimationFrame(animate) : 0;
		requestPaint();
	}

	function animate(): void {
		animation = 0;
		if (!active || !shouldAnimate()) return;
		requestPaint();
		animation = requestAnimationFrame(animate);
	}

	function syncHeight(): void {
		const height = Math.max(innerHeight, scroller.scrollHeight);
		if (height !== spacerHeight) {
			spacerHeight = height;
			spacer.style.height = `${height}px`;
		}
		scroller.scrollTop = window.scrollY;
	}

	function resize(): void {
		if (!compositor) return;
		if (active && compositor.frames > 0 && hold.hidden) {
			hold.width = canvas.width;
			hold.height = canvas.height;
			const context = hold.getContext("2d");
			if (!context) throw new Error("无法保留调整尺寸前的帧，已恢复首页");
			context.drawImage(canvas, 0, 0);
			hold.hidden = false;
		}
		rectangle.width = document.documentElement.getBoundingClientRect().width;
		rectangle.height = innerHeight;
		viewport.style.width = `${rectangle.width}px`;
		viewport.style.height = `${rectangle.height}px`;
		canvas.style.width = hold.style.width = `${innerWidth}px`;
		canvas.style.height = hold.style.height = `${innerHeight}px`;
		compositor.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
		syncHeight();
		dirty = true;
		clearTimeout(watchdog);
		watchdog = window.setTimeout(() => exit("未收到原生绘制帧，已恢复真实首页；请检查 Chrome 的 HTML-in-Canvas 支持"), 5000);
		requestPaint();
	}

	async function enter(withMusic = false): Promise<boolean> {
		if (disposed || active || pending || !hooks.canEnter(withMusic)) return false;
		if (canvas.content !== "drawable" || typeof canvas.requestPaint !== "function"
			|| typeof canvas.getElementImageDefaultSize !== "function"
			|| typeof WebGL2RenderingContext === "undefined"
			|| !("texElementSubImage2D" in WebGL2RenderingContext.prototype)) {
			status.textContent = "当前浏览器未启用实验性 HTML-in-Canvas；保留正常首页，不使用截图冒充原生输入。";
			root.dataset.nativeState = "unsupported";
			return false;
		}
		const operation = ++version;
		performanceMode = withMusic;
		options.effect = true;
		effect.setAttribute("aria-pressed", "true");
		effect.textContent = "噪域：开";
		pending = true;
		root.dataset.nativeState = "loading";
		start.disabled = true;
		start.textContent = "正在准备实时 DOM 输入…";
		status.textContent = "等待浏览器绘制真实首页，不需要截图尺寸预设。";
		try {
			await document.fonts.ready;
			const [phiraAssets, postfxAssets, noteAssets] = await Promise.all([
				loadPhiraAssets(), loadPostFxAssets(), withMusic ? loadNoteAssets() : undefined,
			]);
			await Promise.all(document.getAnimations()
				.filter(item => Number.isFinite(item.effect?.getComputedTiming().endTime))
				.map(item => item.finished.catch(() => {})));
			if (disposed || operation !== version) return false;
			spacerHeight = document.documentElement.scrollHeight;
			spacer.style.height = `${spacerHeight}px`;
			const elements = [...document.body.children].filter((element): element is HTMLElement =>
				element instanceof HTMLElement && element !== root && element !== canvas && element !== hold
				&& !["SCRIPT", "STYLE", "LINK", "ASTRO-DEV-TOOLBAR"].includes(element.tagName));
			// Fixed body children belong to the viewport, not the inner scroll container.
			const fixed = new Set(elements.filter(element => getComputedStyle(element).position === "fixed"));
			document.body.append(spacer);
			canvas.append(viewport);
			for (const element of elements) {
				const anchor = document.createComment("native-home-position");
				element.before(anchor);
				moved.push({ element, anchor });
				(fixed.has(element) ? viewport : scroller).append(element);
			}
			finishEntrance(viewport);
			compositor = createSceneCompositor(canvas, [{ id: "viewport", element: viewport }], getComputedStyle(document.documentElement).backgroundColor, phiraAssets, postfxAssets, noteAssets);
			canvas.hidden = false;
			ready = Promise.withResolvers<boolean>();
			const result = ready.promise;
			resize();
			return await result;
		} catch (error) {
			if (operation === version && !disposed) exit(error instanceof Error ? error.message : "原生输入启动失败，已恢复首页");
			return false;
		}
	}

	const signal = listeners.signal;
	canvas.addEventListener("paint", event => {
		if ((!active && !pending) || !compositor) return;
		try {
			const changed = (event as Event & { changedElements?: Element[] }).changedElements;
			if (!changed || changed.length) dirty = true;
			syncHeight();
			if (dirty) {
				compositor.updateElement("viewport", viewport);
				dirty = false;
			}
			if (!compositor || (!active && !pending)) return;
			compositor.render(rectangles, options);
			hold.hidden = true;
			clearTimeout(watchdog);
			presentation?.resolve();
			presentation = null;
			if (pending) {
				hooks.onEnter(performanceMode);
				pending = false;
				active = true;
				root.dataset.nativeState = "active";
				status.textContent = "";
				toolbar.hidden = performanceMode;
				if (!performanceMode) leave.focus({ preventScroll: true });
				ready?.resolve(true);
				ready = null;
				if (shouldAnimate()) animation = requestAnimationFrame(animate);
			}
		} catch (error) { exit(error instanceof Error ? error.message : "实时图层绘制失败，已恢复首页"); }
	}, { signal });
	root.addEventListener("noise-postfx-change", refreshAnimation, { signal });
	root.addEventListener("noise-notes-change", refreshAnimation, { signal });
	start.addEventListener("click", () => { void enter(); }, { signal });
	leave.addEventListener("click", () => exit(), { signal });
	effect.addEventListener("click", () => {
		options.effect = !options.effect;
		effect.setAttribute("aria-pressed", String(options.effect));
		effect.textContent = options.effect ? "噪域：开" : "噪域：关";
		refreshAnimation();
	}, { signal });
	window.addEventListener("scroll", () => {
		if (active || pending) { syncHeight(); dirty = true; requestPaint(); }
	}, { signal, passive: true });
	window.addEventListener("resize", () => {
		if (!active && !pending) return;
		try { resize(); }
		catch (error) { exit(error instanceof Error ? error.message : "尺寸更新失败，已恢复首页"); }
	}, { signal, passive: true });
	window.addEventListener("pointermove", event => {
		options.pointerX = event.clientX;
		options.pointerY = event.clientY;
	}, { signal, passive: true });
	document.addEventListener("keydown", event => {
		if (event.key === "Escape" && !performanceMode && (active || pending)) exit();
	}, { signal });
	canvas.addEventListener("webglcontextlost", event => {
		event.preventDefault();
		if (active || pending) exit("原生图形上下文丢失，已恢复真实首页");
	}, { signal });
	return {
		get active() { return active; },
		enter,
		present(enabled) {
			if (!active || !compositor) return Promise.reject(new Error("实时舞台尚未就绪"));
			presentation?.reject(new Error("实时舞台画面已被更新"));
			const pending = Promise.withResolvers<void>();
			presentation = pending;
			options.effect = enabled;
			dirty = true;
			clearTimeout(watchdog);
			watchdog = window.setTimeout(() => exit("实时舞台画面准备超时"), 5000);
			requestPaint();
			return pending.promise;
		},
		setRunning(value) {
			running = value;
			if (value) refreshAnimation();
			else { cancelAnimationFrame(animation); animation = 0; }
		},
		exit,
		dispose() { disposed = true; exit(); listeners.abort(); canvas.remove(); hold.remove(); },
	};
}
