// SPDX-License-Identifier: GPL-3.0-only
export interface PreparedHomepage { dispose(): void }

/** Retain decoded image surfaces and local video bytes throughout the performance. */
export async function prepareHomepage(signal: AbortSignal): Promise<PreparedHomepage> {
	if (document.readyState !== "complete") {
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const finish = () => { cleanup(); resolve(); };
		const abort = () => { cleanup(); reject(signal.reason); };
		const cleanup = () => { window.removeEventListener("load", finish); signal.removeEventListener("abort", abort); };
		window.addEventListener("load", finish, { once: true });
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
		await promise;
	}
	const held: HTMLImageElement[] = [];
	const urls: string[] = [];
	const originals: { media: HTMLVideoElement; src: string }[] = [];
	const backgrounds = new Map<string, string>();
	const dispose = () => {
		for (const { media } of originals) { media.pause(); media.removeAttribute("src"); media.load(); }
		for (const url of urls) URL.revokeObjectURL(url);
		held.length = 0;
	};
	try {
		const images = [...document.images];
		for (const image of images) image.loading = "eager";
		await Promise.all(images.map(async image => {
			if (!image.getAttribute("src") && !image.srcset) return;
			await image.decode();
			held.push(image);
		}));
		for (const element of document.querySelectorAll("body *")) {
			if (element.closest("[data-noise-ui]")) continue;
			for (const pseudo of [null, "::before", "::after"]) {
				const background = getComputedStyle(element, pseudo).backgroundImage;
				for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) backgrounds.set(match[1], match[1]);
			}
		}
		await Promise.all([...backgrounds.keys()].map(async url => {
			const image = new Image(); image.src = url; await image.decode(); held.push(image);
		}));
		await Promise.all([...document.querySelectorAll("video")].map(async media => {
			const src = media.currentSrc || media.src;
			if (!src) return;
			const response = await fetch(src, { signal });
			if (!response.ok) throw new Error(`首页视频加载失败 (${response.status})`);
			const url = URL.createObjectURL(await response.blob()); urls.push(url);
			originals.push({ media, src });
			media.pause(); media.src = url; media.preload = "auto";
			const { promise, resolve, reject } = Promise.withResolvers<void>();
			const cleanup = () => { media.removeEventListener("loadeddata", ready); media.removeEventListener("error", error); signal.removeEventListener("abort", abort); };
			const ready = () => { cleanup(); resolve(); };
			const error = () => { cleanup(); reject(new Error("首页视频无法解码")); };
			const abort = () => { cleanup(); reject(signal.reason); };
			media.addEventListener("loadeddata", ready, { once: true });
			media.addEventListener("error", error, { once: true });
			signal.addEventListener("abort", abort, { once: true });
			media.load();
			if (signal.aborted) abort();
			await promise;
		}));
		await document.fonts.ready;
		signal.throwIfAborted();
		return { dispose };
	} catch (error) { dispose(); throw error; }
}
