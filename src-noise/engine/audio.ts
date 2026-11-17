export class PerformanceAudio {
	readonly element: HTMLAudioElement;
	private context: AudioContext | null = null;
	private source: MediaElementAudioSourceNode | null = null;
	private filter: BiquadFilterNode | null = null;
	private dry: GainNode | null = null;
	private wet: GainNode | null = null;
	private pollution = -1;

	constructor(url: string) {
		this.element = new Audio(url);
		this.element.preload = "metadata";
		this.element.volume = 0.65;
	}

	async play(): Promise<void> {
		if (!this.context) {
			this.context = new AudioContext();
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
			await Promise.all([this.context.resume(), this.element.play()]);
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
		this.element.pause();
		this.element.removeAttribute("src");
		this.element.load();
		this.source?.disconnect();
		this.filter?.disconnect();
		this.dry?.disconnect();
		this.wet?.disconnect();
		void this.context?.close();
	}
}
