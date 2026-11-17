// SPDX-License-Identifier: GPL-3.0-only
import chartUrl from "../assets/desultory-signals.json?url";
import musicUrl from "../assets/desultory-signals.ogg?url";
import notesUrl from "../assets/desultory-signals-notes.json?url";
import { PerformanceAudio } from "./audio";
import { prepareChart, sampleChart, type NoiseChart } from "./chart";
import { loadPhiraAssets, type PhiraFrame } from "./phira-material";
import type { PhiraTouch } from "./phira-types";
import { mountSceneTakeover } from "./scene-takeover";
import { mountNativeTakeover } from "./native-takeover";
import { createPointerInfection } from "./pointer-infection";
import { mountDomContamination } from "./dom-contamination";
import type { Stage } from "./types";
import { createPostFxState, postFxOverscan } from "./postfx-settings";
import { mountPostFxControls } from "./postfx-controls";
import "../styles/postfx.css";
import { createNotePerformanceFrame, prepareNoteChart, sampleNoteChart, type NoteChart } from "./note-chart";
import type { NotePerformanceState } from "./note-types";
import { fitPerformanceViewport, projectPerformanceStage, unprojectPresentation } from "./performance-viewport";

function clock(seconds: number): string {
	const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
	return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function mountNoiseExperience(root: HTMLElement): void {
	if (root.dataset.mounted) return;
	root.dataset.mounted = "true";
	// Escape the homepage's transformed stacking contexts without changing its layout.
	document.body.append(root);
	const get = <T extends HTMLElement>(id: string): T => {
		const element = root.querySelector<T>(`#${id}`);
		if (!element) throw new Error(`Missing performance control: ${id}`);
		return element;
	};
	const intro = get("noise-intro");
	const start = get<HTMLButtonElement>("noise-start");
	const dismiss = get<HTMLButtonElement>("noise-dismiss");
	const launch = get<HTMLButtonElement>("noise-launch");
	const toolbar = get("noise-toolbar");
	const toggle = get<HTMLButtonElement>("noise-toggle");
	const restart = get<HTMLButtonElement>("noise-restart");
	const mute = get<HTMLButtonElement>("noise-mute");
	const notesButton = get<HTMLButtonElement>("noise-notes");
	const judgements = get("noise-judgements");
	const exit = get<HTMLButtonElement>("noise-exit");
	const seek = get<HTMLInputElement>("noise-seek");
	const timeLabel = get("noise-time");
	const status = get("noise-status");
	const playStatus = get("noise-play-status");
	const audio = new PerformanceAudio(musicUrl);
	root.append(audio.element);
	const listeners = new AbortController();
	const inertElements = new Map<HTMLElement, boolean>();
	let previousFocus: HTMLElement | null = null;
	let chart: NoiseChart | null = null;
	let noteChart: NoteChart | null = null;
	let notesLoading = false;
	const notesState: NotePerformanceState = { enabled: false };
	const noteFrame = createNotePerformanceFrame();
	let ready = false;
	let failed = false;
	let disposed = false;
	let entered = false;
	let playing = false;
	let starting = false;
	let playVersion = 0;
	let stage: Stage = { left: 0, top: 0, width: 0, height: 0 };
	const inputStage: Stage = { left: 0, top: 0, width: 0, height: 0 };
	let presentationScale = 1;
	let allowed = false;
	const contamination = mountDomContamination();
	const infection = createPointerInfection((fromX, fromY, toX, toY, strength) => {
		contamination.infectPath(
			unprojectPresentation(fromX, innerWidth, presentationScale),
			unprojectPresentation(fromY, innerHeight, presentationScale),
			unprojectPresentation(toX, innerWidth, presentationScale),
			unprojectPresentation(toY, innerHeight, presentationScale), strength,
		);
	});
	let lastUiUpdate = 0;
	const pointer = infection.pointer;
	const touch: PhiraTouch = { id: 0, x: 0, y: 0, strength: 0 };
	const touches: PhiraTouch[] = [];
	const materialFrame: PhiraFrame = { stage, chart: { areas: [], lines: [] }, touches, time: 0 };
	const signal = listeners.signal;
	const postfx = createPostFxState();
	const postfxControls = mountPostFxControls(root, postfx);
	const scene = mountSceneTakeover(root, {
		postfx,
		onEnter() { setIntro(false); launch.hidden = true; },
		onExit() { launch.hidden = false; launch.focus({ preventScroll: true }); },
		canEnter: () => !entered && !starting && !native.active && root.dataset.nativeState !== "loading",
	});
	const native = mountNativeTakeover(root, {
		postfx,
		notes: notesState,
		onEnter() { setIntro(false); launch.hidden = true; },
		onExit(withMusic, reason) {
			contamination.reset();
			if (withMusic && (entered || starting)) stop();
			launch.hidden = false;
			launch.focus({ preventScroll: true });
			if (reason) { status.textContent = reason; setIntro(true); }
		},
		canEnter: withMusic => !scene.active && root.dataset.sceneState !== "loading"
			&& (withMusic || (!entered && !starting)),
		frame: samplePerformance,
	});

	function setIntro(open: boolean): void {
		intro.hidden = !open;
		launch.hidden = open || entered;
		if (open) {
			previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			for (const child of document.body.children) {
				if (child instanceof HTMLElement && child !== root && !inertElements.has(child)) {
					inertElements.set(child, child.inert);
					child.inert = true;
				}
			}
			(ready && allowed ? start : dismiss).focus({ preventScroll: true });
		} else {
			for (const [element, wasInert] of inertElements) element.inert = wasInert;
			inertElements.clear();
			if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
			previousFocus = null;
		}
	}

	function resetPollution(): void {
		infection.reset();
		audio.setPollution(0);
	}

	function syncUi(): void {
		const duration = audio.element.duration;
		timeLabel.textContent = `${clock(audio.element.currentTime)} / ${clock(duration)}`;
		seek.disabled = !Number.isFinite(duration) || duration <= 0;
		if (!seek.matches(":active")) seek.value = String(duration > 0 ? audio.element.currentTime / duration * 100 : 0);
		toggle.textContent = playing ? "暂停" : audio.element.ended ? "重播" : "继续";
		mute.textContent = audio.element.muted ? "取消静音" : "静音";
		mute.setAttribute("aria-pressed", String(audio.element.muted));
		notesButton.disabled = notesLoading;
		notesButton.textContent = notesLoading ? "正在准备音符…" : `音符 / Auto Play：${notesState.enabled ? "开" : "关"}`;
		notesButton.setAttribute("aria-pressed", String(notesState.enabled));
		judgements.hidden = !notesState.enabled;
		judgements.textContent = notesState.enabled ? `Auto Play · Perfect ${noteFrame.judged} / ${noteFrame.total}` : "";
	}

	function pause(message = "已暂停"): void {
		playVersion++;
		starting = false;
		start.disabled = !ready || !allowed;
		playing = false;
		audio.pause();
		resetPollution();
		if (entered) root.dataset.state = "paused";
		playStatus.textContent = message;
		syncUi();
	}

	function syncPresentation(): void {
		const nextScale = postfx.enabled ? postFxOverscan : 1;
		if (nextScale !== presentationScale) infection.rebase();
		presentationScale = nextScale;
		projectPerformanceStage(stage, innerWidth, innerHeight, presentationScale, inputStage);
	}

	function resize(): void {
		const width = window.innerWidth;
		const height = window.innerHeight;
		const viewport = fitPerformanceViewport(width, height);
		stage = viewport.stage;
		infection.rebase();
		syncPresentation();
		const deviceAllowed = width >= 1024 && height >= 576 && window.matchMedia("(any-pointer: fine)").matches;
		allowed = deviceAllowed && viewport.supported;
		const issue = !deviceAllowed ? "请使用鼠标，并将窗口扩大到至少 1024 × 576。"
			: !viewport.supported ? `当前窗口比例需要裁去 ${(viewport.croppedFraction * 100).toFixed(1)}% 的谱面，超过 20% 上限。请将窗口调整至接近 4:3～16:9，或更换设备。` : "";
		start.disabled = !ready || !allowed || starting;
		if (!failed) {
			status.textContent = issue || (ready ? "准备就绪。点击后播放音乐；Esc 可暂停。" : "正在准备演出资源…");
			start.textContent = ready ? audio.element.currentTime > 0 ? "继续演出" : "开始演出" : "正在准备";
		}
		if (!allowed && (entered || starting)) {
			pause(issue);
			// Exit GPU takeover without stop(): preserve the song position for recovery.
			entered = false;
			native.exit();
			toolbar.hidden = true;
			root.dataset.state = "paused";
			setIntro(true);
		}
	}

	function fail(error: unknown): void {
		failed = true;
		ready = false;
		playing = false;
		starting = false;
		playVersion++;
		audio.pause();
		resetPollution();
		entered = false;
		native.exit();
		toolbar.hidden = true;
		root.dataset.state = "error";
		status.textContent = `演出未能启动：${error instanceof Error ? error.message : String(error)}。可以继续浏览首页，或刷新页面重试。`;
		start.disabled = true;
		start.textContent = "无法开始";
		setIntro(true);
		console.error("Noise performance:", error);
	}

	function samplePerformance(nowMs: number): PhiraFrame | undefined {
		if ((!entered && !starting) || !chart || disposed) return undefined;
		try {
			const now = nowMs / 1000;
			const songTime = audio.element.currentTime;
			const sampled = sampleChart(chart, songTime, stage.width, stage.height);
			contamination.prepare();
			infection.sample(chart, inputStage, songTime, nowMs, playing);
			contamination.sample(sampled.areas, stage, songTime, playing);
			audio.setPollution(pointer.strength);
			touches.length = 0;
			if (pointer.present && pointer.allowed && pointer.strength > 0) {
				touch.x = unprojectPresentation(pointer.x, innerWidth, presentationScale) / innerWidth;
				touch.y = 1 - unprojectPresentation(pointer.y, innerHeight, presentationScale) / innerHeight;
				touch.strength = pointer.strength;
				touches.push(touch);
			}
			materialFrame.stage = stage;
			materialFrame.chart = sampled;
			materialFrame.time = songTime;
			materialFrame.touchTime = now;
			if (notesState.enabled && noteChart) {
				sampleNoteChart(noteChart, songTime, sampled.lines, stage.width, stage.height, noteFrame);
				materialFrame.notes = noteFrame;
			} else {
				materialFrame.notes = undefined;
			}
			if (now - lastUiUpdate > 0.15) { syncUi(); lastUiUpdate = now; }
			return materialFrame;
		} catch (error) { fail(error); return undefined; }
	}

	async function play(): Promise<void> {
		if (!ready || !allowed || starting || disposed || scene.active || (native.active && !entered) || root.dataset.sceneState === "loading" || root.dataset.nativeState === "loading") return;
		starting = true;
		start.disabled = true;
		const version = ++playVersion;
		try {
			if (audio.element.ended) { contamination.reset(); audio.seek(0); }
			await audio.play();
			if (disposed || version !== playVersion) return;
			if (!allowed || document.hidden) { audio.pause(); return; }
			if (!native.active && !await native.enter(true)) {
				audio.pause();
				throw new Error(get("noise-native-status").textContent || "无法启用实时首页输入");
			}
			if (disposed || version !== playVersion) { native.exit(); return; }
			entered = true;
			playing = true;
			root.dataset.state = "playing";
			setIntro(false);
			toolbar.hidden = false;
			launch.hidden = true;
			playStatus.textContent = "";
			resetPollution();
			syncUi();
		} catch (error) {
			if (version !== playVersion) return;
			status.textContent = `无法播放音乐：${error instanceof Error ? error.message : String(error)}。请检查浏览器音频权限后再次点击。`;
			playStatus.textContent = "音乐未能播放，请再次点击继续。";
		} finally {
			if (version === playVersion) {
				starting = false;
				start.disabled = !ready || !allowed;
			}
		}
	}

	function stop(): void {
		pause("");
		audio.seek(0);
		entered = false;
		native.exit();
		toolbar.hidden = true;
		root.dataset.state = ready ? "ready" : "loading";
		setIntro(false);
		launch.focus({ preventScroll: true });
	}
	async function toggleNotes(): Promise<void> {
		if (notesLoading || disposed || !chart) return;
		if (!notesState.enabled && !noteChart) {
			notesLoading = true;
			syncUi();
			try {
				const response = await fetch(notesUrl, { signal });
				if (!response.ok) throw new Error(`音符数据加载失败 (${response.status})`);
				const prepared = prepareNoteChart(await response.json(), chart);
				if (disposed) return;
				noteChart = prepared;
			} catch (error) {
				if (!disposed) playStatus.textContent = error instanceof Error ? error.message : "音符演出未能加载";
				return;
			} finally {
				notesLoading = false;
				if (!disposed) syncUi();
			}
		}
		if (disposed) return;
		notesState.enabled = !notesState.enabled;
		if (notesState.enabled) samplePerformance(performance.now());
		else materialFrame.notes = undefined;
		syncUi();
		root.dispatchEvent(new CustomEvent("noise-notes-change"));
	}

	start.addEventListener("click", () => { void play(); }, { signal });
	dismiss.addEventListener("click", () => { scene.exit(); native.exit(); if (starting) pause(""); setIntro(false); }, { signal });
	launch.addEventListener("click", () => setIntro(true), { signal });
	toggle.addEventListener("click", () => { if (playing) pause(); else void play(); }, { signal });
	exit.addEventListener("click", stop, { signal });
	restart.addEventListener("click", () => { resetPollution(); contamination.reset(); audio.seek(0); syncUi(); }, { signal });
	mute.addEventListener("click", () => { audio.element.muted = !audio.element.muted; syncUi(); }, { signal });
	notesButton.addEventListener("click", () => { void toggleNotes(); }, { signal });
	seek.addEventListener("input", () => { resetPollution(); contamination.reset(); audio.seek(Number(seek.value) / 100 * audio.element.duration); syncUi(); }, { signal });
	window.addEventListener("resize", resize, { signal, passive: true });
	root.addEventListener("noise-postfx-change", syncPresentation, { signal });
	window.addEventListener("blur", () => infection.leave(performance.now(), playing), { signal });
	document.addEventListener("pointermove", (event) => {
		if (event.pointerType === "touch") return;
		const allowed = !(event.target instanceof Element && event.target.closest("[data-noise-ui], input, textarea, select, button, [role=dialog]"));
		const now = performance.now();
		const record = (point: PointerEvent): void => {
			// Legacy epoch-based timestamps and modern performance timestamps.
			const stamp = point.timeStamp > now + 1000 ? point.timeStamp - performance.timeOrigin : point.timeStamp;
			infection.move(point.clientX, point.clientY, Math.max(0, Math.min(now, stamp)), allowed, playing);
		};
		for (const point of event.getCoalescedEvents?.() ?? []) record(point);
		record(event);
	}, { signal, passive: true });
	document.addEventListener("pointerout", (event) => {
		if (!event.relatedTarget) infection.leave(performance.now(), playing);
	}, { signal, passive: true });
	document.addEventListener("visibilitychange", () => { if (document.hidden && entered) pause("切换到后台，演出已暂停。"); }, { signal });
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			if (!intro.hidden) { if (starting) pause(""); setIntro(false); }
			else if (playing) pause();
		}
		if (event.key === "Tab" && !intro.hidden) {
			const buttons = [...intro.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
			const first = buttons[0];
			const last = buttons[buttons.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
		}
	}, { signal });
	audio.element.addEventListener("loadedmetadata", syncUi, { signal });
	audio.element.addEventListener("waiting", () => { if (playing) playStatus.textContent = "正在缓冲音乐…"; }, { signal });
	audio.element.addEventListener("playing", () => { if (playing) playStatus.textContent = ""; }, { signal });
	audio.element.addEventListener("ended", () => { pause("演出结束，可以重播或返回首页。"); root.dataset.state = "ended"; }, { signal });
	audio.element.addEventListener("error", () => { if (entered) pause("音乐加载失败，请检查连接后重试。"); }, { signal });
	window.addEventListener("pagehide", () => {
		disposed = true;
		listeners.abort();
		scene.dispose();
		native.dispose();
		contamination.dispose();
		postfxControls.dispose();
		setIntro(false);
		audio.dispose();
	}, { once: true, signal });

	resize();
	setIntro(true);
	void (async () => {
		try {
			const [prepared] = await Promise.all([
				fetch(chartUrl, { signal }).then(async (response) => {
					if (!response.ok) throw new Error(`谱面加载失败 (${response.status})`);
					return prepareChart(await response.json());
				}),
				loadPhiraAssets(),
			]);
			if (disposed) return;
			chart = prepared;
			ready = true;
			root.dataset.state = "ready";
			resize();
		} catch (error) { if (!disposed) fail(error); }
	})();
}
