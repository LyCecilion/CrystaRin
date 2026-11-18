import { APP_CONFIG } from "../signal/config.js";
import { DEFAULT_SETTINGS } from "../signal/default-settings.js";
import { SignalRenderer } from "../signal/engine.js";

export interface SignalSelectionBounds {
	readonly label: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface SignalIntro {
	readonly duration: number;
	readonly currentTime: number;
	/** Viewport CSS pixels, including the canvas's position in the viewport. */
	readonly selectionBounds: readonly SignalSelectionBounds[];
	render(seconds: number): void;
	readonly audioReady: boolean;
	unlockAudio(): Promise<void>;
	/** Resume the audio clock, optionally scheduling a sample-accurate stop. */
	play(until?: number): Promise<void>;
	pause(): void;
	dispose(): void;
}

const audioUrl = new URL("../signal/assets/audio.wav", import.meta.url).href;
const fontUrl = new URL("../signal/assets/Saira-variable.ttf", import.meta.url).href;

/** All resource I/O finishes here, before the selection is made interactive. */
export async function prepareSignalIntro(canvas: HTMLCanvasElement): Promise<SignalIntro> {
	const context = new AudioContext();
	const font = new FontFace("Saira", `url("${fontUrl}")`, {
		weight: "100 900",
		stretch: "50% 125%",
		style: "normal",
	});
	let renderer: SignalRenderer | null = null;
	try {
		const [buffer] = await Promise.all([
			fetch(audioUrl).then(async (response) => {
				if (!response.ok) throw new Error(`Signal audio failed to load (${response.status}).`);
				return context.decodeAudioData(await response.arrayBuffer());
			}),
			font.load(),
		]);
		document.fonts.add(font);
		if (context.state === "running") await context.suspend();

		const duration = APP_CONFIG.duration;
		let source: AudioBufferSourceNode | null = null;
		let offset = 0;
		let startedAt = 0;
		let playing = false;
		let stopAt = duration;
		let disposed = false;
		let playGeneration = 0;
		let pixelWidth = 0;
		let pixelHeight = 0;
		let bounds: readonly SignalSelectionBounds[] = [];
		let previousLeft = Number.NaN;
		let previousTop = Number.NaN;
		let previousWidth = 0;
		let previousHeight = 0;
		const time = () => playing ? Math.min(stopAt, offset + context.currentTime - startedAt) : offset;
		const stopSource = () => {
			if (!source) return;
			source.onended = null;
			source.stop();
			source.disconnect();
			source = null;
		};
		const resize = () => {
			if (disposed) return;
			const rect = canvas.getBoundingClientRect();
			const width = rect.width || window.innerWidth;
			const height = rect.height || window.innerHeight;
			const ratio = window.devicePixelRatio || 1;
			const nextWidth = Math.max(1, Math.round(width * ratio));
			const nextHeight = Math.max(1, Math.round(height * ratio));
			if (nextWidth !== pixelWidth || nextHeight !== pixelHeight) {
				renderer?.dispose();
				canvas.width = pixelWidth = nextWidth;
				canvas.height = pixelHeight = nextHeight;
				renderer = new SignalRenderer(canvas, {
					aspect: DEFAULT_SETTINGS.preview.aspect,
					framing: "reflow",
				});
				renderer.setDesign(DEFAULT_SETTINGS.design);
				previousWidth = 0;
			}
			if (rect.left !== previousLeft || rect.top !== previousTop || width !== previousWidth || height !== previousHeight) {
				previousLeft = rect.left;
				previousTop = rect.top;
				previousWidth = width;
				previousHeight = height;
				// Original single-panel arrangement: panel (240, 0), scale 2.
				// Idle label centres: 645, 855, 1065, 1275 at y=540.
				// Match the renderer's default 16:9 fit, including letterboxing.
				const scale = Math.min(pixelWidth / 1920, pixelHeight / 1080);
				const left = (pixelWidth - 1920 * scale) / 2;
				const top = (pixelHeight - 1080 * scale) / 2;
				const cssX = width / pixelWidth;
				const cssY = height / pixelHeight;
				bounds = Object.freeze(DEFAULT_SETTINGS.options.map((option, index) => Object.freeze({
					label: option.label,
					x: rect.left + (left + (550 + index * 210) * scale) * cssX,
					y: rect.top + (top + 484 * scale) * cssY,
					width: 190 * scale * cssX,
					height: 112 * scale * cssY,
				})));
			}
		};
		const render = (seconds: number) => {
			if (disposed) return;
			resize();
			renderer!.render(
				Number.isFinite(seconds) ? Math.max(0, Math.min(duration, seconds)) : 0,
				DEFAULT_SETTINGS.options,
				DEFAULT_SETTINGS.preview.view,
				DEFAULT_SETTINGS.preview.selectedId,
			);
		};
		const pause = () => {
			++playGeneration;
			offset = time();
			playing = false;
			stopSource();
		};

		// Warm the original font-dependent label caches and curvature shader now.
		render(Number(DEFAULT_SETTINGS.design.introDuration));
		return {
			duration,
			get currentTime() { return time(); },
			get selectionBounds() { resize(); return bounds; },
			render,
			get audioReady() { return context.state === "running"; },
			async unlockAudio() {
				if (disposed) throw new Error("Signal intro has been disposed.");
				await context.resume();
			},
			async play(until = duration) {
				if (disposed) throw new Error("Signal intro has been disposed.");
				if (playing) return;
				const generation = ++playGeneration;
				await context.resume();
				if (disposed || generation !== playGeneration) return;
				if (context.state !== "running") throw new Error("Signal audio could not start.");
				stopAt = Math.max(offset, Math.min(duration, until));
				if (offset >= stopAt) return;
				if (offset < buffer.duration) {
					source = context.createBufferSource();
					source.buffer = buffer;
					source.connect(context.destination);
					const playingSource = source;
					source.onended = () => {
						playingSource.disconnect();
						if (source === playingSource) {
							source = null;
							if (stopAt < duration) { offset = stopAt; playing = false; }
						}
					};
					source.start(0, offset);
					if (stopAt < duration) source.stop(context.currentTime + stopAt - offset);
				}
				startedAt = context.currentTime;
				playing = true;
			},
			pause,
			dispose() {
				if (disposed) return;
				pause();
				disposed = true;
				renderer?.dispose();
				renderer = null;
				document.fonts.delete(font);
				void context.close();
			},
		};
	} catch (error) {
		document.fonts.delete(font);
		void context.close();
		throw error;
	}
}
