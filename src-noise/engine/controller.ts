// SPDX-License-Identifier: GPL-3.0-only
import chartUrl from "../assets/desultory-signals.json?url";
import musicUrl from "../assets/desultory-signals.ogg?url";
import notesUrl from "../assets/desultory-signals-notes.json?url";
import { PerformanceAudio } from "./audio";
import { prepareChart, sampleChart, type NoiseChart } from "./chart";
import { loadPhiraAssets, type PhiraFrame } from "./phira-material";
import { loadPostFxAssets } from "./postfx-assets";
import { loadNoteAssets } from "./note-assets";
import type { PhiraTouch } from "./phira-types";
import { mountSceneTakeover } from "./scene-takeover";
import { mountNativeTakeover } from "./native-takeover";
import { createPointerInfection } from "./pointer-infection";
import { mountDomContamination } from "./dom-contamination";
import type { Stage } from "./types";
import type { DrawableCanvas } from "./native-canvas";
import { createPostFxState, postFxOverscan } from "./postfx-settings";
import { mountPostFxControls } from "./postfx-controls";
import "../styles/postfx.css";
import { createNotePerformanceFrame, prepareNoteChart, sampleNoteChart, type NoteChart } from "./note-chart";
import { fitPerformanceViewport, projectPerformanceStage, unprojectPresentation } from "./performance-viewport";
import { prepareSignalIntro, type SignalIntro } from "./signal-intro";
import { createDifficultyNoise, type DifficultyNoise } from "./difficulty-noise";
import { prepareHomepage, type PreparedHomepage } from "./prepare-homepage";

type Phase = "checking" | "opening" | "selection" | "prelude" | "handoff" | "quiet" | "performance" | "paused" | "ended" | "browse";
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const difficultyFadeDuration = 0.6;
/** SIGNAL's aftermath: pure black, then the blog exposed and left alone before the show takes it. */
const quietBlackDuration = 3000;
const quietFadeDuration = 900;
const quietBlogDuration = 5000;
/** The chart's first noise burst: postfx joins there instead of from the first bar. */
const postFxStart = 4.7524;

export function mountNoiseExperience(root: HTMLElement): void {
	if (root.dataset.mounted) return;
	root.dataset.mounted = "true";
	document.body.append(root);
	const sourceElements = new Map<HTMLElement, boolean>();
	for (const node of document.body.children) {
		if (node instanceof HTMLElement && node !== root) { sourceElements.set(node, node.inert); node.inert = true; }
	}
	const dev = import.meta.env.DEV;
	const directPerformance = root.dataset.entry === "performance";
	const get = <T extends HTMLElement>(id: string): T => {
		const node = root.querySelector<T>(`#${id}`);
		if (!node) throw new Error(`Missing performance control: ${id}`);
		return node;
	};
	const gate = get("noise-intro");
	const status = get("noise-status");
	const selection = get("noise-selection");
	const enableAudio = get<HTMLButtonElement>("noise-enable-audio");
	const signalCanvas = get<HTMLCanvasElement>("noise-signal-canvas");
	const difficultyCanvas = get<HTMLCanvasElement>("noise-difficulty-canvas");
	const difficulties = get("noise-difficulties");
	const at = get<HTMLButtonElement>("noise-at");
	const resume = get<HTMLButtonElement>("noise-start");
	const retry = get<HTMLButtonElement>("noise-retry");
	const toolbar = get("noise-toolbar");
	const curtain = get("noise-curtain");
	const seek = get<HTMLInputElement>("noise-seek");
	const audio = new PerformanceAudio(musicUrl);
	root.append(audio.element);
	const listeners = new AbortController();
	const { signal } = listeners;
	const postfx = createPostFxState();
	postfx.enabled = true;
	const postfxControls = dev ? mountPostFxControls(root, postfx) : null;
	const notesState = { enabled: true };
	const noteFrame = createNotePerformanceFrame();
	const contamination = mountDomContamination();
	const inputStage: Stage = { left: 0, top: 0, width: 0, height: 0 };
	let stage: Stage = { ...inputStage };
	let presentationScale = postFxOverscan;
	let phase: Phase = "checking";
	let resumePhase: "opening" | "prelude" | "quiet" | "performance" | null = null;
	let chart: NoiseChart | null = null;
	let noteChart: NoteChart | null = null;
	let intro: SignalIntro | null = null;
	let difficultyNoise: DifficultyNoise | null = null;
	let homepage: PreparedHomepage | null = null;
	let preparing = false;
	let resourcesReady = false;
	let allowed = false;
	let apiReady = false;
	let warm = false;
	let busy = false;
	let disposed = false;
	let terminal = false;
	let failed = false;
	let version = 0;
	let animation = 0;
	let fade: Animation | null = null;
	let lastUi = 0;
	const postludeBlack = directPerformance ? 0 : quietBlackDuration;
	const postludeTotal = postludeBlack + quietFadeDuration + quietBlogDuration;
	let quietRemaining = postludeTotal;
	let quietFrame = 0;
	const openedAt = performance.now();
	let contaminationActive = false;
	let postFxStarted = false;
	let stageOk = true;
	const infection = createPointerInfection((x1, y1, x2, y2, strength) => {
		if (contaminationActive) contamination.infectPath(
			unprojectPresentation(x1, innerWidth, presentationScale), unprojectPresentation(y1, innerHeight, presentationScale),
			unprojectPresentation(x2, innerWidth, presentationScale), unprojectPresentation(y2, innerHeight, presentationScale), strength);
	});
	const touch: PhiraTouch = { id: 0, x: 0, y: 0, strength: 0 };
	const touches: PhiraTouch[] = [];
	const frame: PhiraFrame = { stage, chart: { areas: [], lines: [] }, touches, time: 0 };
	const scene = mountSceneTakeover(root, {
		postfx, canEnter: () => dev && phase === "browse" && !native.active,
		onEnter() {}, onExit() {},
	});
	const native = mountNativeTakeover(root, {
		postfx, notes: notesState, frame: samplePerformance,
		canEnter: () => !terminal && !scene.active,
		onEnter() {},
		onExit(_music, reason) {
			warm = false;
			contamination.reset();
			if (reason && !terminal && !disposed) showFailure(reason);
		},
	});
	native.setRunning(false);

	function check(id: string, text: string, ok?: boolean): void {
		const node = get(id);
		node.textContent = text;
		if (ok !== undefined) node.dataset.ok = String(ok);
	}
	function setPhase(next: Phase): void {
		phase = next;
		root.dataset.phase = next;
		root.dataset.state = next === "performance" ? "playing" : next;
		document.documentElement.dataset.noiseSurface = next === "performance" || next === "quiet" || next === "browse" ? "performance" : next === "ended" ? "ended" : "gate";
		gate.hidden = next !== "checking" && next !== "paused";
		selection.hidden = next !== "opening" && next !== "selection" && next !== "prelude";
		difficulties.hidden = next !== "selection";
		difficultyCanvas.hidden = next !== "opening" && next !== "selection"
			&& !(next === "prelude" && (intro?.currentTime ?? 2) < 2 + difficultyFadeDuration);
		if (next === "opening" || next === "selection") difficultyCanvas.style.opacity = "1";
		toolbar.hidden = !dev || next !== "performance";
		resume.hidden = next !== "paused";
		if (next === "paused") resume.textContent = "CONTINUE";
		at.disabled = next !== "selection" || !allowed || !warm || busy;
	}
	/** The gate only reports machine state; a failing check must never leave READY behind. */
	function refreshGateStatus(): void {
		if (phase !== "checking") return;
		status.textContent = !allowed || !apiReady ? "BLOCKED" : failed ? "FAILED" : preparing ? "PREPARING" : warm ? "READY" : "CHECKING";
	}
	/** Only layers that need a valid stage withdraw; postfx, audio and the blog keep going. */
	function applyStageLayers(): void {
		if (phase === "performance") native.setNoise(stageOk);
	}
	function clearCurtain(): void {
		curtain.hidden = true;
		curtain.style.opacity = "";
	}
	function applyCurtain(remaining: number): void {
		const elapsed = postludeTotal - remaining;
		const progress = Math.max(0, Math.min(1, (elapsed - postludeBlack) / quietFadeDuration));
		if (progress >= 1) { clearCurtain(); return; }
		curtain.hidden = false;
		curtain.style.opacity = String(1 - progress * progress * (3 - 2 * progress));
	}
	function cancelVisuals(): void {
		if (phase === "quiet" && quietFrame) quietRemaining = Math.max(0, quietRemaining - (performance.now() - quietFrame));
		quietFrame = 0;
		cancelAnimationFrame(animation);
		animation = 0;
		fade?.cancel();
		fade = null;
		clearCurtain();
		gate.style.opacity = "";
	}
	function resetPollution(): void {
		infection.reset();
		audio.setPollution(0);
	}
	function showFailure(error: unknown): void {
		if (terminal || disposed) return;
		version++;
		busy = false;
		failed = true;
		cancelVisuals();
		audio.pause();
		intro?.pause();
		native.setRunning(false);
		resetPollution();
		if (phase === "handoff") resumePhase = "quiet";
		else if (phase === "opening" || phase === "performance" || phase === "prelude" || phase === "quiet") resumePhase = phase;
		setPhase(resumePhase ? "paused" : "checking");
		status.textContent = `FAILED / ${error instanceof Error ? error.message : String(error)}`;
		retry.hidden = false;
		resume.hidden = true;
	}
	function suspend(): void {
		if (phase !== "opening" && phase !== "prelude" && phase !== "performance" && phase !== "quiet" && phase !== "handoff") return;
		resumePhase = phase === "handoff" ? "quiet" : phase;
		version++;
		busy = false;
		cancelVisuals();
		audio.pause();
		intro?.pause();
		native.setRunning(false);
		resetPollution();
		setPhase("paused");
		status.textContent = "PAUSED";
		resume.disabled = !allowed || !apiReady || !warm || preparing;
	}
	function syncUi(): void {
		const duration = audio.element.duration || 0;
		get("noise-time").textContent = `${clock(audio.element.currentTime)} / ${clock(duration)}`;
		if (!seek.matches(":active")) seek.value = String(duration ? audio.element.currentTime / duration * 100 : 0);
		get("noise-judgements").textContent = `Auto Play · Perfect ${noteFrame.judged} / ${noteFrame.total}`;
	}
	function samplePerformance(nowMs: number): PhiraFrame | undefined {
		if (!chart || terminal || disposed || phase === "quiet" || phase === "handoff" || resumePhase === "quiet") return undefined;
		try {
			const songTime = audio.element.currentTime;
			const sampled = sampleChart(chart, songTime, stage.width, stage.height);
			const playing = phase === "performance" && !audio.element.paused;
			if (phase === "performance" || resumePhase === "performance") {
				if (!postFxStarted && songTime >= postFxStart) {
					postFxStarted = true;
					postfx.enabled = true;
					syncPresentation();
				}
				contaminationActive = stageOk && contamination.prepare(songTime);
				if (stageOk) {
					infection.sample(chart, inputStage, songTime, nowMs, playing);
					if (contaminationActive) contamination.sample(sampled.areas, stage, songTime, playing, infection.pointer);
				}
			}
			audio.setPollution(infection.pointer.strength);
			touches.length = 0;
			const pointer = infection.pointer;
			if (pointer.present && pointer.allowed && pointer.strength > 0) {
				touch.x = unprojectPresentation(pointer.x, innerWidth, presentationScale) / innerWidth;
				touch.y = 1 - unprojectPresentation(pointer.y, innerHeight, presentationScale) / innerHeight;
				touch.strength = pointer.strength;
				touches.push(touch);
			}
			frame.stage = stage; frame.chart = sampled; frame.time = songTime; frame.touchTime = nowMs / 1000;
			if (notesState.enabled && noteChart && stageOk) {
				sampleNoteChart(noteChart, songTime, sampled.lines, stage.width, stage.height, noteFrame);
				frame.notes = noteFrame;
			} else frame.notes = undefined;
			if (dev && nowMs - lastUi > 150) { syncUi(); lastUi = nowMs; }
			return frame;
		} catch (error) { showFailure(error); return undefined; }
	}
	function renderSelection(sourceChanged = true): void {
		if (!intro || !difficultyNoise) return;
		if (sourceChanged) intro.render(2);
		root.dataset.signalTime = "2";
		const bounds = intro.selectionBounds;
		const box = bounds[3];
		at.style.left = `${box.x}px`; at.style.top = `${box.y}px`;
		at.style.width = `${box.width}px`; at.style.height = `${box.height}px`;
		difficultyNoise.render((performance.now() - openedAt) / 1000, bounds, sourceChanged);
	}
	function tick(): void {
		animation = 0;
		try {
			if (phase === "quiet") {
				const now = performance.now();
				if (quietFrame) quietRemaining = Math.max(0, quietRemaining - (now - quietFrame));
				quietFrame = now;
				applyCurtain(quietRemaining);
				if (quietRemaining === 0) { void beginPerformance(); return; }
			} else if (phase === "selection") renderSelection(false);
			else if ((phase === "opening" || phase === "prelude") && intro) {
				const time = intro.currentTime;
				root.dataset.signalTime = String(time);
				intro.render(time);
				if (phase === "opening") {
					difficultyNoise?.render((performance.now() - openedAt) / 1000, intro.selectionBounds, true);
					if (time >= 2) {
						intro.pause();
						resumePhase = null;
						setPhase("selection");
						renderSelection();
					}
				} else {
					const progress = Math.max(0, Math.min(1, (time - 2) / difficultyFadeDuration));
					difficultyCanvas.style.opacity = String(1 - progress * progress * (3 - 2 * progress));
					difficultyCanvas.hidden = progress === 1;
					if (progress < 1) difficultyNoise?.render((performance.now() - openedAt) / 1000, intro.selectionBounds, true);
					if (time >= intro.duration) { void enterQuietBlog(); return; }
				}
			} else return;
			animation = requestAnimationFrame(tick);
		} catch (error) { showFailure(error); }
	}
	async function revealSelection(): Promise<void> {
		if (!resourcesReady || !warm || !allowed || document.hidden || busy || failed || phase !== "checking") return;
		if (directPerformance) {
			resumePhase = "quiet";
			resume.hidden = false;
			resume.disabled = false;
			resume.textContent = "ENTER BLOG";
			return;
		}
		if (!intro) return;
		busy = true;
		const operation = ++version;
		try {
			const permission = intro.unlockAudio();
			enableAudio.hidden = intro.audioReady;
			await permission;
		} catch (error) { if (operation === version) showFailure(error); return; }
		if (disposed || operation !== version || !allowed || document.hidden) return;
		enableAudio.hidden = true;
		// Keep the check/rights screen legible even on a warm cache.
		const remaining = Math.max(0, 2500 - (performance.now() - openedAt));
		fade = gate.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 800, delay: remaining, fill: "forwards" });
		try { await fade.finished; } catch { return; }
		if (disposed || operation !== version || !allowed || document.hidden) { busy = false; return; }
		fade.cancel(); fade = null;
		busy = false;
		if (intro.currentTime >= 2) {
			resumePhase = null;
			setPhase("selection");
			renderSelection();
			tick();
		} else {
			setPhase("opening");
			try {
				await intro.play(2);
				if (disposed || operation !== version || document.hidden) { intro.pause(); return; }
				tick();
			} catch (error) { showFailure(error); }
		}
	}
	async function prepare(): Promise<void> {
		if (preparing || disposed || terminal || phase === "browse" || !allowed || !apiReady) return;
		preparing = true;
		failed = false;
		retry.hidden = true;
		check("noise-check-assets", "PREPARING / audio · prelude · chart · fonts · notes · textures · homepage");
		status.textContent = "PREPARING";
		try {
			if (!resourcesReady) {
				const json = async (url: string) => {
					const response = await fetch(url, { signal });
					if (!response.ok) throw new Error(`资源加载失败 (${response.status})`);
					return response.json();
				};
				const [chartData, noteData, assets] = await Promise.all([
					json(chartUrl), json(notesUrl), loadPhiraAssets(), loadPostFxAssets(), loadNoteAssets(),
					audio.prepare(signal),
					directPerformance || intro ? Promise.resolve() : prepareSignalIntro(signalCanvas).then(value => {
						if (disposed) value.dispose(); else intro = value;
					}),
					homepage ? Promise.resolve() : prepareHomepage(signal).then(value => {
						if (disposed) value.dispose(); else homepage = value;
					}),
				]);
				if (disposed) return;
				chart = prepareChart(chartData);
				noteChart = prepareNoteChart(noteData, chart);
				if (!directPerformance) {
					difficultyNoise ??= createDifficultyNoise(difficultyCanvas, signalCanvas, assets);
					renderSelection();
				}
				resourcesReady = true;
			}
			check("noise-check-assets", "READY / audio · prelude · chart · fonts · notes · textures · homepage", true);
			if (root.dataset.phase === "browse") return;
			if (allowed && !document.hidden && !native.active) {
				check("noise-check-gpu", "PREPARING / real DOM · full pipeline");
				if (!await native.enter(true)) throw new Error(get("noise-native-status").textContent || "首帧准备失败");
			}
			if (disposed || terminal) return;
			warm = native.active;
			native.setRunning(false);
			check("noise-check-gpu", warm ? "READY / first frame" : "PENDING / first frame", warm);
			if (resumePhase) { resume.hidden = false; resume.disabled = !allowed || !warm; status.textContent = "PAUSED"; }
			else refreshGateStatus();
		} catch (error) {
			if (!disposed) showFailure(error);
		} finally {
			preparing = false;
			if (!disposed) void revealSelection();
		}
	}
	function resize(): void {
		if (disposed || terminal) return;
		const viewport = fitPerformanceViewport(innerWidth, innerHeight);
		stage = viewport.stage;
		syncPresentation();
		const dimensions = innerWidth >= 1024 && innerHeight >= 576 && viewport.supported;
		const pointer = matchMedia("(any-pointer: fine)").matches;
		allowed = dimensions && pointer;
		const probe = document.createElement("canvas") as DrawableCanvas;
		probe.setAttribute("content", "drawable");
		apiReady = probe.content === "drawable" && typeof probe.requestPaint === "function"
			&& typeof probe.getElementImageDefaultSize === "function"
			&& typeof WebGL2RenderingContext !== "undefined" && "texElementSubImage2D" in WebGL2RenderingContext.prototype;
		check("noise-check-viewport", `${innerWidth} × ${innerHeight} / ${dimensions ? "PASS" : "FAIL · min 1024 × 576 · 16:15–20:9"}`, dimensions);
		check("noise-check-input", pointer ? "PASS / pointer" : "FAIL / pointer required", pointer);
		check("noise-check-api", apiReady ? "PASS / Drawable Canvas + WebGL 2 element upload" : "FAIL / experimental API unavailable", apiReady);
		get("noise-browser-help").hidden = apiReady;
		stageOk = allowed && apiReady;
		if (stageOk) {
			if (phase === "performance") applyStageLayers();
		} else if (phase === "performance" || phase === "quiet" || phase === "handoff") {
			// The show keeps playing on a failing viewport; only the stage-dependent layers withdraw.
			applyStageLayers();
			resetPollution();
			contamination.reset();
			contaminationActive = false;
		} else {
			if (phase === "opening" || phase === "prelude") suspend();
			else if (phase === "selection") { cancelVisuals(); setPhase("checking"); }
			else if (busy && phase === "checking") { version++; busy = false; cancelVisuals(); }
			if (native.active) native.exit();
		}
		refreshGateStatus();
		resume.disabled = !allowed || !apiReady || !warm || preparing;
		if (phase === "selection") renderSelection();
		if (allowed && apiReady && !failed && (phase === "checking" || phase === "paused")) void prepare();
	}
	async function startPrelude(): Promise<void> {
		if (!intro || busy || phase !== "selection" || !warm || !allowed) return;
		busy = true;
		const operation = ++version;
		try {
			// Unlock both audio contexts in the trusted AT gesture, without a song blip.
			setPhase("prelude");
			await unlockSong();
			if (operation !== version || disposed || document.hidden) return;
			await intro.play();
			if (operation !== version || disposed || document.hidden) { intro.pause(); return; }
			busy = false;
			if (!animation) tick();
		} catch (error) { showFailure(error); }
	}
	function syncPresentation(): void {
		presentationScale = postfx.enabled ? postFxOverscan : 1;
		infection.rebase();
		projectPerformanceStage(stage, innerWidth, innerHeight, presentationScale, inputStage);
	}
	async function unlockSong(): Promise<void> {
		const muted = audio.element.muted;
		audio.element.muted = true;
		try { await audio.play(); } finally { audio.pause(); audio.seek(0); audio.element.muted = muted; }
	}
	async function enterQuietBlog(reset = true): Promise<void> {
		if (busy || disposed || terminal) return;
		busy = true;
		const operation = ++version;
		if (reset) quietRemaining = postludeTotal;
		resumePhase = "quiet";
		setPhase("handoff");
		try {
			intro?.pause();
			audio.pause();
			postfx.enabled = false;
			postFxStarted = false;
			notesState.enabled = false;
			contamination.reset();
			contaminationActive = false;
			resetPollution();
			syncPresentation();
			native.setRunning(false);
			if (!apiReady) { suspend(); return; }
			if (!native.active && !await native.enter(true)) throw new Error("博客舞台恢复失败");
			if (operation !== version || disposed) return;
			await native.present(false);
			if (operation !== version || disposed) return;
			// This is a stage transition, not a navigation: keep decoded resources and GPU state.
			if (location.pathname !== "/performance/") history.replaceState(history.state, "", "/performance/");
			const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
			const address = canonical?.getAttribute("href");
			if (canonical && address) {
				canonical.href = new URL("/performance/", address).href;
				for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:url"], meta[name="twitter:url"]')) meta.content = canonical.href;
			}
			resumePhase = null;
			applyCurtain(quietRemaining);
			setPhase("quiet");
			quietFrame = 0;
			native.setRunning(true);
			busy = false;
			animation = requestAnimationFrame(tick);
		} catch (error) { if (operation === version) showFailure(error); }
	}
	async function beginPerformance(): Promise<void> {
		if (busy || disposed || terminal) return;
		busy = true;
		const operation = ++version;
		try {
			intro?.pause();
			if (!apiReady) { suspend(); return; }
			if (!native.active && !await native.enter(true)) throw new Error("实时舞台恢复失败");
			if (operation !== version || disposed) return;
			if (resumePhase !== "performance") { postfx.enabled = false; notesState.enabled = true; }
			resumePhase = null;
			setPhase("performance");
			syncPresentation();
			await native.present(true);
			if (operation !== version || disposed) return;
			applyStageLayers();
			// A resumed postlude can still be mid-fade: the show never starts behind a cover.
			clearCurtain();
			await audio.play();
			if (operation !== version || disposed) { audio.pause(); return; }
			native.setRunning(true);
			busy = false;
		} catch (error) { if (operation === version) showFailure(error); }
	}
	async function continuePerformance(): Promise<void> {
		if (!resumePhase || busy || !allowed || !apiReady || disposed) return;
		failed = false;
		await prepare();
		if (!warm || failed || disposed || document.hidden || busy) return;
		if (resumePhase === "quiet") {
			busy = true;
			resume.disabled = true;
			const operation = ++version;
			try {
				await unlockSong();
				if (operation !== version || disposed) return;
				busy = false;
				await enterQuietBlog(false);
			} catch (error) { if (operation === version) showFailure(error); }
		} else if (resumePhase === "performance") await beginPerformance();
		else {
			busy = true;
			const operation = ++version;
			const next = resumePhase;
			setPhase(next);
			try {
				await intro?.play(next === "opening" ? 2 : undefined);
				if (operation !== version || disposed || document.hidden) { intro?.pause(); return; }
				busy = false; tick();
			} catch (error) { showFailure(error); }
		}
	}
	function end(): void {
		if (terminal) return;
		terminal = true;
		version++;
		cancelVisuals();
		setPhase("ended"); // Black first. Restoring source nodes can never flash on screen.
		root.setAttribute("aria-hidden", "true");
		root.inert = true;
		listeners.abort();
		audio.dispose(); intro?.dispose(); difficultyNoise?.dispose();
		native.dispose(); scene.dispose(); contamination.dispose(); postfxControls?.dispose(); homepage?.dispose();
		signalCanvas.width = signalCanvas.height = 1;
		document.body.inert = true;
	}
	function dispose(): void {
		if (disposed) return;
		disposed = true;
		end();
	}
	at.addEventListener("click", () => { void startPrelude(); }, { signal });
	enableAudio.addEventListener("click", () => { void intro?.unlockAudio().catch(showFailure); }, { signal });
	resume.addEventListener("click", () => { void continuePerformance(); }, { signal });
	retry.addEventListener("click", () => { failed = false; void prepare(); }, { signal });
	window.addEventListener("resize", resize, { signal, passive: true });
	root.addEventListener("noise-postfx-change", syncPresentation, { signal });
	// A background tab never pauses the show: the song runs on and the stage catches up on repaint.
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) resize();
	}, { signal });
	document.addEventListener("pointermove", event => {
		if (phase !== "performance" || event.pointerType === "touch") return;
		const permitted = !(event.target instanceof Element && event.target.closest("[data-noise-ui], input, textarea, select, button, [role=dialog]"));
		const now = performance.now();
		const record = (point: PointerEvent) => {
			const stamp = point.timeStamp > now + 1000 ? point.timeStamp - performance.timeOrigin : point.timeStamp;
			infection.move(point.clientX, point.clientY, Math.max(0, Math.min(now, stamp)), permitted, true);
		};
		for (const point of event.getCoalescedEvents?.() ?? []) record(point);
		record(event);
	}, { signal, passive: true });
	document.addEventListener("pointerout", event => { if (!event.relatedTarget) infection.leave(performance.now(), phase === "performance"); }, { signal, passive: true });
	window.addEventListener("blur", () => infection.leave(performance.now(), phase === "performance"), { signal });
	audio.element.addEventListener("ended", end, { signal });
	audio.element.addEventListener("error", () => { if (resourcesReady) showFailure("音乐播放失败"); }, { signal });
	window.addEventListener("pagehide", event => {
		if (event.persisted) suspend();
		else dispose();
	}, { signal });
	window.addEventListener("pageshow", event => { if (event.persisted && !terminal) resize(); }, { signal });
	if (dev) {
		const browse = () => {
			version++; cancelVisuals(); audio.pause(); intro?.pause(); contamination.reset();
			for (const [node, inert] of sourceElements) node.inert = inert;
			native.exit(); warm = false; resumePhase = null;
			setPhase("browse"); get("noise-launch").hidden = false;
		};
		get("noise-dismiss").addEventListener("click", browse, { signal });
		get("noise-exit").addEventListener("click", browse, { signal });
		get("noise-launch").addEventListener("click", () => { setPhase("checking"); resize(); }, { signal });
		get("noise-toggle").addEventListener("click", () => suspend(), { signal });
		get("noise-restart").addEventListener("click", () => { contamination.reset(); resetPollution(); audio.seek(0); }, { signal });
		get("noise-mute").addEventListener("click", () => { audio.element.muted = !audio.element.muted; }, { signal });
		get("noise-notes").addEventListener("click", () => {
			notesState.enabled = !notesState.enabled;
			get("noise-notes").textContent = `音符 / Auto Play：${notesState.enabled ? "开" : "关"}`;
			root.dispatchEvent(new CustomEvent("noise-notes-change"));
		}, { signal });
		seek.addEventListener("input", () => { contamination.reset(); resetPollution(); audio.seek(Number(seek.value) / 100 * audio.element.duration); }, { signal });
		document.addEventListener("keydown", event => { if (event.key === "Escape") suspend(); }, { signal });
	}
	setPhase("checking");
	resize();
}
