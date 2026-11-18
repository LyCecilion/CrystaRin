// SPDX-License-Identifier: GPL-3.0-only
import { createPhiraMaterial, createPhiraDemo, type PhiraAssets, type PhiraFrame, type PhiraMaterial } from "./phira-material";
import type { DrawableCanvas, DrawableWebGL } from "./native-canvas";
import { createPostFxPipeline, type PostFxPipeline } from "./postfx";
import { postFxOverscan, type PostFxAssets, type PostFxState } from "./postfx-settings";
import { createNoteRenderer, type NoteRenderer } from "./note-renderer";
import type { NoteAssets } from "./note-assets";
import { createPostFxTimelineFrame, samplePostFxTimeline } from "./postfx-timeline";
import { unprojectPresentation } from "./performance-viewport";

export type SceneAsset = { id: string; image: HTMLImageElement } | { id: string; element: HTMLElement };

export interface SceneOptions {
	effect: boolean;
	pointerX: number;
	pointerY: number;
	time: number;
	noise?: PhiraFrame;
	postfx?: PostFxState;
}

export interface SceneCompositor {
	readonly frames: number;
	readonly textureCount: number;
	resize(width: number, height: number, dpr: number): void;
	updateElement(id: string, element: HTMLElement): void;
	render(
		layers: readonly { id: string; x: number; y: number; width: number; height: number }[],
		options: SceneOptions,
	): void;
	dispose(): void;
}

const vertexSource = `#version 300 es
layout(location = 0) in vec2 position;
uniform vec2 viewport;
uniform vec4 rect;
out vec2 uv;
void main() {
	uv = position;
	vec2 pixel = rect.xy + position * rect.zw;
	gl_Position = vec4(pixel.x / viewport.x * 2.0 - 1.0,
		1.0 - pixel.y / viewport.y * 2.0, 0.0, 1.0);
}`;

const compositionSource = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform float sceneOpacity;
in vec2 uv;
out vec4 color;
void main() {
	color = texture(image, uv);
	color.rgb *= sceneOpacity;
}`;

const finalSource = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 viewport;
in vec2 uv;
out vec4 color;
void main() {
	color = texture(image, vec2(uv.x, 1.0 - uv.y));
}`;

function parseBackground(background: string): Uint8ClampedArray {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 1;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Cannot parse the scene background color.");
	// Two sentinels distinguish an invalid CSS color from either valid sentinel.
	context.fillStyle = "#010203";
	context.fillStyle = background;
	const first = context.fillStyle;
	context.fillStyle = "#040506";
	context.fillStyle = background;
	if (first !== context.fillStyle) throw new Error(`Invalid scene background: ${background}`);
	context.fillRect(0, 0, 1, 1);
	return context.getImageData(0, 0, 1, 1).data;
}

export function createSceneCompositor(
	canvas: HTMLCanvasElement,
	assets: readonly SceneAsset[],
	background: string,
	phiraAssets: PhiraAssets,
	postfxAssets: PostFxAssets,
	noteAssets?: NoteAssets,
): SceneCompositor {
	const backgroundColor = parseBackground(background);
	const context = canvas.getContext("webgl2", {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: true,
	});
	if (!context) throw new Error("The homepage scene requires WebGL 2.");
	const gl: WebGL2RenderingContext = context;

	const shaders: WebGLShader[] = [];
	const programs: WebGLProgram[] = [];
	const textures: WebGLTexture[] = [];
	const layerTextures = new Map<string, WebGLTexture>();
	const elementSizes = new Map<string, { width: number; height: number }>();
	let vao: WebGLVertexArrayObject | null = null;
	let buffer: WebGLBuffer | null = null;
	let framebuffer: WebGLFramebuffer | null = null;
	let disposed = false;
	let frames = 0;
	let width = 0;
	let height = 0;
	let targetWidth = 0;
	let targetHeight = 0;
	let dpr = 1;
	let material: PhiraMaterial | null = null;
	let postfx: PostFxPipeline | null = null;
	let notes: NoteRenderer | null = null;
	const demo = createPhiraDemo();
	const timelineFrame = createPostFxTimelineFrame();

	function dispose(): void {
		if (disposed) return;
		disposed = true;
		material?.dispose();
		postfx?.dispose();
		notes?.dispose();
		for (const texture of textures) gl.deleteTexture(texture);
		for (const program of programs) gl.deleteProgram(program);
		for (const shader of shaders) gl.deleteShader(shader);
		gl.deleteFramebuffer(framebuffer);
		gl.deleteBuffer(buffer);
		gl.deleteVertexArray(vao);
		layerTextures.clear();
		elementSizes.clear();
	}

	function assertLive(): void {
		if (disposed) throw new Error("The scene compositor has been disposed.");
		if (gl.isContextLost()) throw new Error("The scene compositor lost its WebGL context.");
	}

	function checkError(stage: string): void {
		const error = gl.getError();
		if (error !== gl.NO_ERROR) throw new Error(`Scene compositor ${stage}: WebGL error ${error}.`);
	}

	function compile(type: number, source: string): WebGLShader {
		const shader = gl.createShader(type);
		if (!shader) throw new Error("Cannot allocate a scene shader.");
		shaders.push(shader);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw new Error(`Cannot compile scene shader: ${gl.getShaderInfoLog(shader)}`);
		}
		return shader;
	}

	function program(vertex: WebGLShader, fragment: string): WebGLProgram {
		const result = gl.createProgram();
		if (!result) throw new Error("Cannot allocate a scene program.");
		programs.push(result);
		gl.attachShader(result, vertex);
		gl.attachShader(result, compile(gl.FRAGMENT_SHADER, fragment));
		gl.linkProgram(result);
		if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
			throw new Error(`Cannot link scene program: ${gl.getProgramInfoLog(result)}`);
		}
		return result;
	}

	function uniform(program: WebGLProgram, name: string): WebGLUniformLocation {
		const location = gl.getUniformLocation(program, name);
		if (location === null) throw new Error(`Missing scene uniform: ${name}`);
		return location;
	}

	function texture(): WebGLTexture {
		const result = gl.createTexture();
		if (!result) throw new Error("Cannot allocate a scene texture.");
		textures.push(result);
		gl.bindTexture(gl.TEXTURE_2D, result);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return result;
	}

	try {
		assertLive();
		const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
		const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
		const vertex = compile(gl.VERTEX_SHADER, vertexSource);
		const composition = program(vertex, compositionSource);
		const final = program(vertex, finalSource);
		const compositionViewport = uniform(composition, "viewport");
		const compositionRect = uniform(composition, "rect");
		const compositionOpacity = uniform(composition, "sceneOpacity");
		const finalViewport = uniform(final, "viewport");
		const finalRect = uniform(final, "rect");
		gl.useProgram(composition);
		gl.uniform1i(uniform(composition, "image"), 0);
		gl.useProgram(final);
		gl.uniform1i(uniform(final, "image"), 0);

		vao = gl.createVertexArray();
		buffer = gl.createBuffer();
		framebuffer = gl.createFramebuffer();
		if (!vao || !buffer || !framebuffer) throw new Error("Cannot allocate scene geometry or framebuffer.");
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		// Image UVs start at the DOM's top left. Only the FBO is flipped in the final pass.
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
		for (const asset of assets) {
			if (layerTextures.has(asset.id)) throw new Error(`Duplicate scene layer: ${asset.id}`);
			if ("element" in asset) {
				layerTextures.set(asset.id, texture());
				elementSizes.set(asset.id, { width: 0, height: 0 });
				continue;
			}
			if (!asset.image.complete || asset.image.naturalWidth < 1 || asset.image.naturalHeight < 1) {
				throw new Error(`Scene image is not loaded: ${asset.id}`);
			}
			if (asset.image.naturalWidth > maxTextureSize || asset.image.naturalHeight > maxTextureSize) {
				throw new Error(`Scene image exceeds the GPU texture limit: ${asset.id}`);
			}
			const imageTexture = texture();
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset.image);
			layerTextures.set(asset.id, imageTexture);
			checkError(`uploading ${asset.id}`);
		}
		const sceneTexture = texture();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.SCISSOR_TEST);
		gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		checkError("initialization");
		material = createPhiraMaterial(gl, phiraAssets);
		postfx = createPostFxPipeline(gl, postfxAssets);
		if (noteAssets) notes = createNoteRenderer(gl, noteAssets);

		return {
			get frames() { return frames; },
			get textureCount() { return layerTextures.size; },
			updateElement(id, element) {
				assertLive();
				const nativeCanvas = canvas as DrawableCanvas;
				const nativeGl = gl as DrawableWebGL;
				if (typeof nativeCanvas.getElementImageDefaultSize !== "function" || typeof nativeGl.texElementSubImage2D !== "function") {
					throw new Error("当前浏览器未提供原生 HTML-in-Canvas GPU 输入");
				}
				const imageTexture = layerTextures.get(id);
				const allocated = elementSizes.get(id);
				if (!imageTexture || !allocated) throw new Error(`Unknown native scene texture: ${id}`);
				const size = nativeCanvas.getElementImageDefaultSize(element);
				const pixelWidth = Math.ceil(size.width);
				const pixelHeight = Math.ceil(size.height);
				if (!(pixelWidth > 0 && pixelHeight > 0) || pixelWidth > maxTextureSize || pixelHeight > maxTextureSize) {
					throw new Error(`Native scene texture exceeds GPU limits: ${pixelWidth} × ${pixelHeight}`);
				}
				gl.activeTexture(gl.TEXTURE0);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
				gl.bindTexture(gl.TEXTURE_2D, imageTexture);
				if (allocated.width !== pixelWidth || allocated.height !== pixelHeight) {
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pixelWidth, pixelHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
					allocated.width = pixelWidth;
					allocated.height = pixelHeight;
				}
				nativeGl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, element);
				checkError(`uploading native ${id}`);
			},
			resize(nextWidth, nextHeight, nextDpr) {
				assertLive();
				if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || !Number.isFinite(nextDpr)
					|| nextWidth <= 0 || nextHeight <= 0 || nextDpr <= 0) {
					throw new Error("Scene dimensions and pixel ratio must be finite and positive.");
				}
				dpr = nextDpr;
				const pixelWidth = Math.max(1, Math.round(nextWidth * dpr));
				const pixelHeight = Math.max(1, Math.round(nextHeight * dpr));
				if (pixelWidth > Math.min(maxTextureSize, maxViewport[0])
					|| pixelHeight > Math.min(maxTextureSize, maxViewport[1])) {
					throw new Error("The scene viewport exceeds the GPU size limit.");
				}
				width = nextWidth;
				height = nextHeight;
				if (pixelWidth === targetWidth && pixelHeight === targetHeight) return;
				canvas.width = pixelWidth;
				canvas.height = pixelHeight;
				gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pixelWidth, pixelHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
				gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
				const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Incomplete scene framebuffer: ${status}`);
				checkError("resizing");
				targetWidth = pixelWidth;
				targetHeight = pixelHeight;
			},
			render(layers, options) {
				assertLive();
				if (!targetWidth || !targetHeight) throw new Error("Resize the scene before rendering.");
				// The blog replaces the game backdrop. Fade it before lines, notes and noise,
				// never the already-composited frame or the screen-space controls.
				const timeline = options.postfx?.enabled && options.postfx.followTimeline && options.noise ? timelineFrame : undefined;
				if (timeline) samplePostFxTimeline(timeline, options.noise!.time);
				const sceneOpacity = timeline?.bgAlpha ?? 1;
				const presentationScale = options.postfx?.enabled ? postFxOverscan : 1;
				gl.bindVertexArray(vao);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
				gl.activeTexture(gl.TEXTURE0);
				gl.viewport(0, 0, targetWidth, targetHeight);
				gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
				gl.clearColor(backgroundColor[0] / 255 * sceneOpacity, backgroundColor[1] / 255 * sceneOpacity, backgroundColor[2] / 255 * sceneOpacity, 1);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.enable(gl.BLEND);
				gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				gl.useProgram(composition);
				gl.uniform2f(compositionViewport, width, height);
				gl.uniform1f(compositionOpacity, sceneOpacity);
				for (let index = 0; index < layers.length; index++) {
					const layer = layers[index];
					if (layer.width <= 0 || layer.height <= 0 || layer.x >= width || layer.y >= height
						|| layer.x + layer.width <= 0 || layer.y + layer.height <= 0) continue;
					const imageTexture = layerTextures.get(layer.id);
					if (!imageTexture) throw new Error(`Missing scene texture: ${layer.id}`);
					gl.bindTexture(gl.TEXTURE_2D, imageTexture);
					gl.uniform4f(compositionRect, layer.x, layer.y, layer.width, layer.height);
					gl.drawArrays(gl.TRIANGLES, 0, 6);
				}
				if (options.effect) {
					material!.render(framebuffer!, width, height, dpr,
						options.noise ?? demo(width, height,
							unprojectPresentation(options.pointerX, width, presentationScale),
							unprojectPresentation(options.pointerY, height, presentationScale), options.time), notes ?? undefined);
				} else if (options.noise?.notes) {
					if (!notes) throw new Error("Note performance assets are not loaded.");
					gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
					notes.render(options.noise.stage, options.noise.notes, width, height, dpr);
				}
				const output = options.postfx?.enabled
					? postfx!.render(sceneTexture, targetWidth, targetHeight, options.noise?.time ?? options.time, options.postfx, timeline)
					: sceneTexture;
				gl.bindVertexArray(vao);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				gl.disable(gl.BLEND);
				gl.viewport(0, 0, targetWidth, targetHeight);
				gl.useProgram(final);
				gl.uniform2f(finalViewport, width, height);
				gl.uniform4f(finalRect, width * (1 - presentationScale) / 2, height * (1 - presentationScale) / 2,
					width * presentationScale, height * presentationScale);
				gl.bindTexture(gl.TEXTURE_2D, output);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
				frames++;
			},
			dispose,
		};
	} catch (error) {
		dispose();
		throw error;
	}
}
