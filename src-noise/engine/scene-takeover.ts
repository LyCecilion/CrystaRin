// SPDX-License-Identifier: GPL-3.0-only
import { loadPhiraAssets } from "./phira-material";
import { collectSceneLayers, type SceneElement, type SceneIndex, type SceneManifest } from "./scene-layout";
import { createSceneCompositor, type SceneCompositor } from "./scene-renderer";
import { loadPostFxAssets } from "./postfx-assets";
import type { PostFxState } from "./postfx-settings";

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
	const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>();
	const image = new Image();
	const cleanup = () => {
		image.onload = null;
		image.onerror = null;
		signal.removeEventListener("abort", abort);
	};
	const abort = () => {
		cleanup();
		image.src = "";
		reject(new DOMException("Aborted", "AbortError"));
	};
	image.onload = () => { cleanup(); resolve(image); };
	image.onerror = () => { cleanup(); reject(new Error("首页图层图片加载失败")); };
	signal.addEventListener("abort", abort, { once: true });
	if (signal.aborted) { abort(); return promise; }
	image.src = url;
	return promise;
}

/** The retained DOM owns layout and native scrolling; only its paint is replaced. */
export function mountSceneTakeover(root: HTMLElement, hooks: {
	onEnter: () => void;
	onExit: () => void;
	canEnter: () => boolean;
	postfx: PostFxState;
}): { enter: () => Promise<boolean>; exit: (reason?: string) => void; dispose: () => void; readonly active: boolean } {
	const get = <T extends HTMLElement>(id: string): T => {
		const element = root.querySelector<T>(`#${id}`);
		if (!element) throw new Error(`Missing scene control: ${id}`);
		return element;
	};
	const canvas = get<HTMLCanvasElement>("noise-scene-canvas");
	const start = get<HTMLButtonElement>("noise-layer-start");
	const toolbar = get("noise-layer-toolbar");
	const effect = get<HTMLButtonElement>("noise-layer-effect");
	const leave = get<HTMLButtonElement>("noise-layer-exit");
	const status = get("noise-layer-status");
	const listeners = new AbortController();
	const hidden = new Map<HTMLElement, { attribute: string | null; inert: boolean }>();
	const options = { effect: true, pointerX: innerWidth / 2, pointerY: innerHeight / 2, time: 0, postfx: hooks.postfx };
	let compositor: SceneCompositor | null = null;
	let pending: AbortController | null = null;
	let manifest: SceneManifest | null = null;
	let sources: SceneElement[] = [];
	let rectangles: { id: string; x: number; y: number; width: number; height: number }[] = [];
	let active = false;
	let disposed = false;
	let version = 0;
	let animation = 0;
	const theme = () => document.documentElement.classList.contains("dark") ? "dark" : "light";
	const assetUrl = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
	root.dataset.sceneState = "idle";

	function restore(): void {
		for (const [element, previous] of hidden) {
			if (previous.attribute === null) element.removeAttribute("data-noise-scene-hidden");
			else element.setAttribute("data-noise-scene-hidden", previous.attribute);
			element.inert = previous.inert;
		}
		hidden.clear();
	}

	function exit(reason?: string): void {
		const wasActive = active;
		++version;
		pending?.abort();
		pending = null;
		cancelAnimationFrame(animation);
		animation = 0;
		active = false;
		// Restore paint before removing the completed canvas frame. Never touch scroll.
		restore();
		canvas.hidden = true;
		toolbar.hidden = true;
		compositor?.dispose();
		compositor = null;
		manifest = null;
		sources = [];
		rectangles = [];
		start.disabled = false;
		start.textContent = "图层接管验证（无音乐）";
		root.dataset.sceneState = reason ? "error" : "idle";
		if (reason) status.textContent = reason;
		if (wasActive) hooks.onExit();
	}

	function measure(): void {
		if (!manifest || innerWidth !== manifest.viewport.width || innerHeight !== manifest.viewport.height
			|| Math.abs(document.documentElement.getBoundingClientRect().width - manifest.viewport.layoutWidth) > 2 || theme() !== manifest.theme) {
			throw new Error("窗口或主题已变化，已返回真实首页；请使用匹配的截图布局");
		}
		for (let i = 0; i < sources.length; i++) {
			const source = sources[i];
			const asset = manifest.layers[i];
			if (!source.element.isConnected) throw new Error("页面已变化，已返回真实首页");
			const rect = source.element.getBoundingClientRect();
			if (Math.abs(rect.width - asset.elementWidth) > 2 || Math.abs(rect.height - asset.elementHeight) > 2) {
				throw new Error("页面布局与截图不匹配，保留真实首页；请重新捕获图层");
			}
			const target = rectangles[i];
			target.x = rect.left - asset.insetLeft;
			target.y = rect.top - asset.insetTop;
		}
	}

	function frame(time: number): void {
		if (!active || !compositor) return;
		try {
			measure();
			options.time = time / 1000;
			compositor.render(rectangles, options);
			animation = requestAnimationFrame(frame);
		} catch (error) {
			exit(error instanceof Error ? error.message : "图层绘制失败，已返回真实首页");
		}
	}

	async function enter(): Promise<boolean> {
		if (disposed || active || pending || !hooks.canEnter()) return false;
		const operation = ++version;
		const request = new AbortController();
		pending = request;
		start.disabled = true;
		start.textContent = "正在准备首页图层…";
		root.dataset.sceneState = "loading";
		status.textContent = "准备完整首帧后才切入 Canvas；原生页面保持可恢复。";
		const json = async <T>(url: string): Promise<T> => {
			const response = await fetch(assetUrl(url), { signal: request.signal, cache: "no-store" });
			if (!response.ok) throw new Error(`截图资产未准备 (${response.status})，请先运行 pnpm capture:noise`);
			return response.json();
		};
		try {
			const index = await json<SceneIndex>("noise-scene/index.json");
			const preset = index.version === 1 && index.presets.find(item => item.width === innerWidth && item.height === innerHeight && item.theme === theme());
			if (!preset) throw new Error(`当前 ${innerWidth} × ${innerHeight} / ${theme()} 没有截图预设，保留真实首页`);
			const scene = await json<SceneManifest>(preset.url);
			if (scene.version !== 1 || !scene.layers.length) throw new Error("首页截图清单无效，保留真实页面");
			const assets = await Promise.all(scene.layers.map(async layer => ({ id: layer.id, image: await loadImage(assetUrl(layer.url), request.signal) })));
			await document.fonts.ready;
			const [phiraAssets, postfxAssets] = await Promise.all([loadPhiraAssets(), loadPostFxAssets()]);
			// A matching viewport may still be finishing its responsive transitions.
			await Promise.all(document.getAnimations()
				.filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
				.map(animation => animation.finished.catch(() => {})));
			if (disposed || operation !== version) return false;
			manifest = scene;
			sources = collectSceneLayers();
			if (sources.length !== scene.layers.length || sources.some((source, i) => source.id !== scene.layers[i].id)) {
				throw new Error("首页内容已变化，保留真实页面；请重新捕获图层");
			}
			rectangles = scene.layers.map(layer => ({ id: layer.id, x: 0, y: 0, width: layer.width, height: layer.height }));
			measure();
			compositor = createSceneCompositor(canvas, assets, scene.background, phiraAssets, postfxAssets);
			canvas.style.width = `${innerWidth}px`;
			canvas.style.height = `${innerHeight}px`;
			compositor.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
			options.pointerX = innerWidth / 2;
			options.pointerY = innerHeight / 2;
			options.time = performance.now() / 1000;
			compositor.render(rectangles, options);
			canvas.hidden = false;
			// Let the completed first frame reach paint while the source DOM still exists.
			const painted = Promise.withResolvers<void>();
			requestAnimationFrame(() => painted.resolve());
			await painted.promise;
			if (disposed || operation !== version) return false;
			measure();
			compositor.render(rectangles, options);
			hooks.onEnter();
			for (const child of document.body.children) {
				if (!(child instanceof HTMLElement) || child === root) continue;
				hidden.set(child, { attribute: child.getAttribute("data-noise-scene-hidden"), inert: child.inert });
				child.setAttribute("data-noise-scene-hidden", "");
				child.inert = true;
			}
			active = true;
			pending = null;
			toolbar.hidden = false;
			root.dataset.sceneState = "active";
			status.textContent = "";
			leave.focus({ preventScroll: true });
			animation = requestAnimationFrame(frame);
			return true;
		} catch (error) {
			if (operation !== version || disposed) return false;
			exit(error instanceof Error ? error.message : "首页图层加载失败，保留真实页面");
			return false;
		}
	}

	const signal = listeners.signal;
	start.addEventListener("click", () => { void enter(); }, { signal });
	leave.addEventListener("click", () => exit(), { signal });
	effect.addEventListener("click", () => {
		options.effect = !options.effect;
		effect.setAttribute("aria-pressed", String(options.effect));
		effect.textContent = options.effect ? "噪域：开" : "噪域：关";
	}, { signal });
	window.addEventListener("pointermove", event => {
		options.pointerX = event.clientX;
		options.pointerY = event.clientY;
	}, { signal, passive: true });
	window.addEventListener("resize", () => {
		if (active || pending) exit("窗口尺寸已变化，已返回真实首页；请使用匹配的截图布局");
	}, { signal, passive: true });
	document.addEventListener("keydown", event => {
		if (event.key === "Escape" && (active || pending)) exit();
	}, { signal });
	canvas.addEventListener("webglcontextlost", event => {
		event.preventDefault();
		if (active || pending) exit("图形上下文已丢失，已返回真实首页");
	}, { signal });
	return {
		enter,
		exit,
		get active() { return active; },
		dispose() { disposed = true; exit(); listeners.abort(); },
	};
}
