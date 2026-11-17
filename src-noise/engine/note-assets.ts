// SPDX-License-Identifier: GPL-3.0-only
// Original nomo pack: Phira-Pro/Phira-Pro@0c5cf2ee9d2bac1292f16287bb6b662ceee40365,
// assets/respack/. Upstream README's GPL declaration applies; assets/rpen/ is excluded.
import tapUrl from "../assets/notes/click.png?url";
import tapHighlightUrl from "../assets/notes/click_mh.png?url";
import dragUrl from "../assets/notes/drag.png?url";
import dragHighlightUrl from "../assets/notes/drag_mh.png?url";
import flickUrl from "../assets/notes/flick.png?url";
import flickHighlightUrl from "../assets/notes/flick_mh.png?url";
import holdUrl from "../assets/notes/hold.png?url";
import holdHighlightUrl from "../assets/notes/hold_mh.png?url";
import hitUrl from "../assets/notes/hit_fx.png?url";

export interface NoteAssets {
	readonly tap: HTMLImageElement;
	readonly tapHighlight: HTMLImageElement;
	readonly drag: HTMLImageElement;
	readonly dragHighlight: HTMLImageElement;
	readonly flick: HTMLImageElement;
	readonly flickHighlight: HTMLImageElement;
	readonly hold: HTMLImageElement;
	readonly holdHighlight: HTMLImageElement;
	readonly hit: HTMLImageElement;
	/** Top tail rows, bottom head rows; body is everything between them. */
	readonly holdAtlas: readonly [number, number];
	readonly holdAtlasHighlight: readonly [number, number];
	readonly hitGrid: readonly [number, number];
	readonly hitScale: number;
}

/** Retained verbatim from the original info.yml; no RPEN or Phigros game art. */
export const notePackCredit = {
	name: "nomo",
	author: "星鹿ELEC & 不会读谱的FW小赵呀",
	description: "星鹿ELEC负责绘制，不会读谱的FW小赵呀负责音效",
	upstream: "Phira-Pro/Phira-Pro@0c5cf2ee9d2bac1292f16287bb6b662ceee40365",
} as const;

let assetsPromise: Promise<NoteAssets> | undefined;

export function loadNoteAssets(): Promise<NoteAssets> {
	return (assetsPromise ??= load());
}

async function decode(url: string): Promise<HTMLImageElement> {
	const image = new Image();
	image.src = url;
	await image.decode();
	return image;
}

async function load(): Promise<NoteAssets> {
	const [tap, tapHighlight, drag, dragHighlight, flick, flickHighlight, hold, holdHighlight, hit] =
		await Promise.all([
			decode(tapUrl), decode(tapHighlightUrl), decode(dragUrl), decode(dragHighlightUrl),
			decode(flickUrl), decode(flickHighlightUrl), decode(holdUrl), decode(holdHighlightUrl), decode(hitUrl),
		]);
	return {
		tap, tapHighlight, drag, dragHighlight, flick, flickHighlight, hold, holdHighlight, hit,
		holdAtlas: [50, 50],
		holdAtlasHighlight: [130, 130],
		hitGrid: [8, 7],
		hitScale: 0.9,
	};
}
