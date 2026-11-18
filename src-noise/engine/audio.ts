export class PerformanceAudio {
	readonly element: HTMLAudioElement;
	private readonly url: string;
	private context: AudioContext | null = null;
	private source: MediaElementAudioSourceNode | null = null;
	private filter: BiquadFilterNode | null = null;
	private dry: GainNode | null = null;
	private wet: GainNode | null = null;
	private pollution = -1;
	private prepared = false;
	private disposed = false;
	private blobUrl: string | null = null;
	private preparation: Promise<void> | null = null;
	private preparationAbort: AbortController | null = null;

	constructor(url: string) {
		this.url = url;
		// Do not let the media element issue a separate, potentially partial request.
		this.element = new Audio();
		this.element.preload = "auto";
		this.element.volume = 0.65;
	}

	/**
	 * Fetch and verify the entire track, then prime the genuine media-element clock
	 * from a local blob. Concurrent callers share the attempt; its first signal
	 * cancels that attempt. Failed/aborted attempts may be retried.
	 */
	prepare(signal?: AbortSignal): Promise<void> {
		if (this.disposed) return Promise.reject(new Error("Performance audio is disposed"));
		if (signal?.aborted) return Promise.reject(signal.reason);
		if (this.prepared) return Promise.resolve();
		if (this.preparation) return this.preparation;

		const abort = new AbortController();
		const onAbort = () => abort.abort(signal?.reason);
		signal?.addEventListener("abort", onAbort, { once: true });
		this.preparationAbort = abort;
		const preparation = this.prepareTrack(abort.signal).finally(() => {
			signal?.removeEventListener("abort", onAbort);
			if (this.preparation === preparation) {
				this.preparation = null;
				this.preparationAbort = null;
			}
		});
		this.preparation = preparation;
		return preparation;
	}

	private async prepareTrack(signal: AbortSignal): Promise<void> {
		let blobUrl: string | null = null;
		try {
			const response = await fetch(this.url, { signal });
			if (!response.ok) throw new Error(`Cannot load performance audio: HTTP ${response.status}`);
			const bytes = await response.arrayBuffer();
			signal.throwIfAborted();
			// Construct the blob before decodeAudioData is allowed to detach bytes.
			const blob = new Blob([bytes], { type: response.headers.get("content-type") ?? "" });
			const context = this.context ??= new AudioContext();
			if (context.state === "running") await this.untilAborted(context.suspend(), signal);
			const decoded = await this.untilAborted(context.decodeAudioData(bytes), signal);
			if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.length === 0) {
				throw new Error("Performance audio contains no playable samples");
			}
			signal.throwIfAborted();
			blobUrl = URL.createObjectURL(blob);
			await this.primeElement(blobUrl, signal);
			signal.throwIfAborted();
			this.blobUrl = blobUrl;
			this.prepared = true;
		} catch (error) {
			if (blobUrl) {
				this.element.pause();
				this.element.removeAttribute("src");
				this.element.load();
				URL.revokeObjectURL(blobUrl);
			}
			throw error;
		}
	}

	/** Decoding itself cannot be cancelled, but must not retain the preparation. */
	private untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
		const { promise, resolve, reject } = Promise.withResolvers<T>();
		const onAbort = () => {
			signal.removeEventListener("abort", onAbort);
			reject(signal.reason);
		};
		if (signal.aborted) {
			// Still observe a native promise that might reject after cancellation.
			void pending.catch(() => {});
			reject(signal.reason);
			return promise;
		}
		signal.addEventListener("abort", onAbort, { once: true });
		pending.then(
			(value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
			(error) => { signal.removeEventListener("abort", onAbort); reject(error); },
		);
		return promise;
	}

	private primeElement(url: string, signal: AbortSignal): Promise<void> {
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const cleanup = () => {
			this.element.removeEventListener("canplay", onReady);
			this.element.removeEventListener("error", onError);
			signal.removeEventListener("abort", onAbort);
		};
		const onReady = () => {
			if (this.element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
			cleanup();
			if (!Number.isFinite(this.element.duration) || this.element.duration <= 0) {
				reject(new Error("Performance audio has no finite media duration"));
			} else {
				resolve();
			}
		};
		const onError = () => {
			cleanup();
			reject(new Error(`Cannot prepare performance audio: ${this.element.error?.message ?? "media error"}`));
		};
		const onAbort = () => { cleanup(); reject(signal.reason); };
		if (signal.aborted) { reject(signal.reason); return promise; }
		this.element.addEventListener("canplay", onReady);
		this.element.addEventListener("error", onError);
		signal.addEventListener("abort", onAbort, { once: true });
		this.element.src = url;
		this.element.load();
		onReady();
		return promise;
	}

	async play(): Promise<void> {
		if (this.disposed) throw new Error("Performance audio is disposed");
		if (!this.prepared) await this.prepare();
		if (this.disposed) throw new Error("Performance audio is disposed");
		if (!this.source) {
			this.context ??= new AudioContext();
			this.source = this.context.createMediaElementSource(this.element);
			this.filter = this.context.createBiquadFilter();
			this.filter.type = "lowpass";
			this.filter.Q.value = Math.SQRT1_2;
			this.dry = this.context.createGain();
			this.wet = this.context.createGain();
			this.wet.gain.value = 0;
			this.source.connect(this.dry).connect(this.context.destination);
			this.source.connect(this.filter).connect(this.wet).connect(this.context.destination);
			this.setPollution(0);
		}
		try {
			await Promise.all([this.context!.resume(), this.element.play()]);
		} catch (error) {
			this.element.pause();
			throw error;
		}
	}

	pause(): void {
		this.element.pause();
		this.setPollution(0);
	}

	seek(seconds: number): void {
		if (Number.isFinite(this.element.duration)) {
			this.element.currentTime = Math.max(0, Math.min(this.element.duration, seconds));
		}
	}

	setPollution(strength: number): void {
		if (!this.context || !this.filter || !this.dry || !this.wet) return;
		const value = Math.max(0, Math.min(1, strength));
		if (Math.abs(value - this.pollution) < 0.01) return;
		this.pollution = value;
		const now = this.context.currentTime;
		const ceiling = Math.min(22000, this.context.sampleRate * 0.49);
		const cutoff = 1500 * (ceiling / 1500) ** (1 - value);
		this.filter.frequency.setTargetAtTime(cutoff, now, 0.035);
		this.dry.gain.setTargetAtTime(1 - value, now, 0.035);
		this.wet.gain.setTargetAtTime(value, now, 0.035);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.preparationAbort?.abort(new DOMException("Performance audio disposed", "AbortError"));
		this.prepared = false;
		this.element.pause();
		this.element.removeAttribute("src");
		this.element.load();
		if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
		this.blobUrl = null;
		this.source?.disconnect();
		this.filter?.disconnect();
		this.dry?.disconnect();
		this.wet?.disconnect();
		if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
		this.source = null;
		this.filter = null;
		this.dry = null;
		this.wet = null;
		this.context = null;
	}
}
