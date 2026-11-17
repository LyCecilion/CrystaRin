// SPDX-License-Identifier: GPL-3.0-only
// Asset provenance: Phigros 4.0.1.2 APKPure packs; original texture artwork,
// not clean-room shader code. PNGs copied from extracted/effects unchanged.
// WireNoise_R8_Array: data/assets/bin/Data/2c1018acc62b85c47bf6a397e74d9789,
// Texture2DArray path ID 1. GraphicsFormat 5 is R8_UNorm (not TextureFormat 5).
// One mip, 1024×1024×11, 11,534,336 bytes: no EAC decoding or conversion.
// Raw Unity layer order and bottom-left-first rows are preserved verbatim.
import glitchUrl from "../assets/postfx/Glitch4in1.png?url";
import displaceUrl from "../assets/postfx/DisplaceMap.png?url";
import glitchMapUrl from "../assets/postfx/GlitchMap.png?url";
import gridUrl from "../assets/postfx/FrameBase.png?url";
import wireUrl from "../assets/postfx/WireNoise_R8_Array.bin?url";
import type { PostFxAssets } from "./postfx-settings";

let assetsPromise: Promise<PostFxAssets> | undefined;

async function loadImage(url: string): Promise<HTMLImageElement> {
	const image = new Image();
	image.src = url;
	await image.decode();
	return image;
}

async function loadWire(): Promise<PostFxAssets["wire"]> {
	const response = await fetch(wireUrl);
	if (!response.ok) {
		throw new Error(`Cannot load postfx wire noise: HTTP ${response.status}`);
	}
	const pixels = new Uint8Array(await response.arrayBuffer());
	const width = 1024;
	const height = 1024;
	const depth = 11;
	if (pixels.byteLength !== width * height * depth) {
		throw new Error(`Invalid postfx wire noise size: ${pixels.byteLength}`);
	}
	return { width, height, depth, pixels };
}

/** Decode once, sharing the original assets across preview instances. */
export function loadPostFxAssets(): Promise<PostFxAssets> {
	return assetsPromise ??= Promise.all([
		loadImage(glitchUrl),
		loadImage(displaceUrl),
		loadImage(glitchMapUrl),
		loadImage(gridUrl),
		loadWire(),
	]).then(([glitch, displace, glitchMap, grid, wire]) => ({
		glitch, displace, glitchMap, grid, wire,
	}));
}
