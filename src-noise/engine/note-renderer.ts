// SPDX-License-Identifier: GPL-3.0-only
// Geometry/pack conventions ported from Phira-Pro/Phira-Pro
// @0c5cf2ee9d2bac1292f16287bb6b662ceee40365: prpr/src/core/{note,resource}.rs,
// prpr/src/core.rs and prpr/src/particle.rs. No RPEN resources are used.
import type { NoteAssets } from "./note-assets";
import { noteHitDuration, type NoteKind, type NotePerformanceFrame, type NoteSprite } from "./note-types";
import type { Stage } from "./types";

export interface NoteRenderer {
	/** Draws into the caller's currently bound framebuffer; never binds a framebuffer. */
	render(stage: Stage, notes: NotePerformanceFrame, viewportWidth: number, viewportHeight: number, dpr: number): void;
	dispose(): void;
}

/** Native NoteKind::order, global across lines; normal then highlighted within each type. */
export type NoteDrawBatches = readonly [
	NoteSprite[], NoteSprite[], NoteSprite[], NoteSprite[],
	NoteSprite[], NoteSprite[], NoteSprite[], NoteSprite[],
];

const notePriority: Record<NoteKind, number> = { hold: 0, drag: 1, tap: 2, flick: 3 };

export function createNoteDrawBatches(): NoteDrawBatches {
	return [[], [], [], [], [], [], [], []];
}

/** Stable partition, without sorting/copying the sampled frame or allocating per frame. */
export function fillNoteDrawBatches(sprites: readonly NoteSprite[], output: NoteDrawBatches): void {
	for (const batch of output) batch.length = 0;
	for (const note of sprites) output[notePriority[note.kind] * 2 + Number(note.highlight)].push(note);
}

const noteWidthRatio = 0.13175016;
const vertexSource = `#version 300 es
layout(location=0) in vec2 corner;
uniform vec2 viewport;
uniform vec2 origin;
uniform vec4 axes;
uniform vec4 crop;
out vec2 uv;
void main() {
	vec2 pixel = origin + axes.xy * corner.x + axes.zw * corner.y;
	gl_Position = vec4(pixel.x / viewport.x * 2.0 - 1.0,
		1.0 - pixel.y / viewport.y * 2.0, 0.0, 1.0);
	uv = crop.xy + corner * crop.zw;
}`;
const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec4 tint;
in vec2 uv;
out vec4 color;
void main() { color = texture(image, uv) * tint; }`;

interface Texture {
	handle: WebGLTexture;
	width: number;
	height: number;
}

export function createNoteRenderer(gl: WebGL2RenderingContext, assets: NoteAssets): NoteRenderer {
	const textures: Texture[] = [];
	const shaders: WebGLShader[] = [];
	const drawBatches = createNoteDrawBatches();
	let program: WebGLProgram | null = null;
	let vao: WebGLVertexArrayObject | null = null;
	let buffer: WebGLBuffer | null = null;
	let disposed = false;

	function dispose(): void {
		if (disposed) return;
		disposed = true;
		for (const texture of textures) gl.deleteTexture(texture.handle);
		for (const shader of shaders) gl.deleteShader(shader);
		gl.deleteBuffer(buffer);
		gl.deleteVertexArray(vao);
		gl.deleteProgram(program);
	}

	function compile(type: number, source: string): WebGLShader {
		const shader = gl.createShader(type);
		if (!shader) throw new Error("Cannot allocate note shader.");
		shaders.push(shader);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw new Error(`Cannot compile note shader: ${gl.getShaderInfoLog(shader)}`);
		}
		return shader;
	}

	function upload(image: HTMLImageElement): Texture {
		const handle = gl.createTexture();
		if (!handle) throw new Error("Cannot allocate note texture.");
		const texture = { handle, width: image.naturalWidth, height: image.naturalHeight };
		textures.push(texture);
		gl.bindTexture(gl.TEXTURE_2D, handle);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
		return texture;
	}

	try {
		program = gl.createProgram();
		if (!program) throw new Error("Cannot allocate note program.");
		gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(`Cannot link note program: ${gl.getProgramInfoLog(program)}`);
		}
		vao = gl.createVertexArray();
		buffer = gl.createBuffer();
		if (!vao || !buffer) throw new Error("Cannot allocate note geometry.");
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		const viewport = gl.getUniformLocation(program, "viewport");
		const origin = gl.getUniformLocation(program, "origin");
		const axes = gl.getUniformLocation(program, "axes");
		const crop = gl.getUniformLocation(program, "crop");
		const tint = gl.getUniformLocation(program, "tint");
		const imageUniform = gl.getUniformLocation(program, "image");

		// DOM PNGs are straight-alpha and top-row first. Do not inherit a scene upload's flags.
		const oldFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
		const oldPremultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean;
		gl.activeTexture(gl.TEXTURE0);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		let tap: Texture, tapHighlight: Texture, drag: Texture, dragHighlight: Texture;
		let flick: Texture, flickHighlight: Texture, hold: Texture, holdHighlight: Texture, hit: Texture;
		try {
			tap = upload(assets.tap);
			tapHighlight = upload(assets.tapHighlight);
			drag = upload(assets.drag);
			dragHighlight = upload(assets.dragHighlight);
			flick = upload(assets.flick);
			flickHighlight = upload(assets.flickHighlight);
			hold = upload(assets.hold);
			holdHighlight = upload(assets.holdHighlight);
			hit = upload(assets.hit);
		} finally {
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, oldFlip);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, oldPremultiply);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.bindVertexArray(null);
		}

		let boundTexture: Texture | undefined;
		function quad(texture: Texture, x: number, y: number, xx: number, xy: number, yx: number, yy: number,
			u: number, v: number, uw: number, vh: number): void {
			if (texture !== boundTexture) {
				gl.bindTexture(gl.TEXTURE_2D, texture.handle);
				boundTexture = texture;
			}
			gl.uniform2f(origin, x, y);
			gl.uniform4f(axes, xx, xy, yx, yy);
			gl.uniform4f(crop, u, v, uw, vh);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}

		return {
			dispose,
			render(stage, notes, viewportWidth, viewportHeight, dpr): void {
				if (disposed || (!notes.sprites.length && !notes.hits.length) || stage.width <= 0 || stage.height <= 0 ||
					viewportWidth <= 0 || viewportHeight <= 0 || dpr <= 0) return;
				const physicalWidth = Math.round(viewportWidth * dpr);
				const physicalHeight = Math.round(viewportHeight * dpr);
				gl.viewport(0, 0, physicalWidth, physicalHeight);
				gl.useProgram(program);
				gl.bindVertexArray(vao);
				gl.activeTexture(gl.TEXTURE0);
				gl.uniform1i(imageUniform, 0);
				gl.uniform2f(viewport, viewportWidth, viewportHeight);
				gl.disable(gl.DEPTH_TEST);
				gl.disable(gl.CULL_FACE);
				gl.enable(gl.BLEND);
				gl.blendEquation(gl.FUNC_ADD);
				gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				gl.enable(gl.SCISSOR_TEST);
				const left = Math.max(0, Math.floor(stage.left * dpr));
				const right = Math.min(physicalWidth, Math.ceil((stage.left + stage.width) * dpr));
				const bottom = Math.max(0, physicalHeight - Math.ceil((stage.top + stage.height) * dpr));
				const top = Math.min(physicalHeight, physicalHeight - Math.floor(stage.top * dpr));
				gl.scissor(left, bottom, Math.max(0, right - left), Math.max(0, top - bottom));
				boundTexture = undefined;
				const baseWidth = stage.width * noteWidthRatio;
				const highlightScale = tapHighlight.width / tap.width;
				fillNoteDrawBatches(notes.sprites, drawBatches);
				try {
					for (const batch of drawBatches) {
						for (const note of batch) {
							if (note.opacity <= 0) continue;
							const width = baseWidth * (note.highlight ? highlightScale : 1);
							const angle = note.rotation + (note.side === 1 ? Math.PI : 0);
							const c = Math.cos(angle), s = Math.sin(angle);
							const x = stage.left + note.x, y = stage.top + note.y;
							gl.uniform4f(tint, 1, 1, 1, note.opacity);
							if (note.kind !== "hold") {
								const texture = note.kind === "tap" ? (note.highlight ? tapHighlight : tap) :
									note.kind === "drag" ? (note.highlight ? dragHighlight : drag) : (note.highlight ? flickHighlight : flick);
								const height = width * texture.height / texture.width;
								quad(texture, x - c * width / 2 + s * height / 2, y - s * width / 2 - c * height / 2,
									c * width, s * width, -s * height, c * height, 0, 0, 1, 1);
								continue;
							}
							const texture = note.highlight ? holdHighlight : hold;
							const atlas = note.highlight ? assets.holdAtlasHighlight : assets.holdAtlas;
							const headHeight = width * atlas[1] / texture.width;
							const tailHeight = width * atlas[0] / texture.width;
							const dx = note.tailX - note.x, dy = note.tailY - note.y;
							const length = Math.hypot(dx, dy);
							// Image top points toward the tail; preserve the below-line 180-degree turn.
							const inwardX = length > 0 ? -dx / length : -s;
							const inwardY = length > 0 ? -dy / length : c;
							const acrossX = inwardY, acrossY = -inwardX;
							const tx = stage.left + note.tailX, ty = stage.top + note.tailY;
							if (length > 0) quad(texture, tx - acrossX * width / 2, ty - acrossY * width / 2,
								acrossX * width, acrossY * width, inwardX * length, inwardY * length,
								0, atlas[0] / texture.height, 1, (texture.height - atlas[0] - atlas[1]) / texture.height);
							// nomo uses the native non-compact layout: head behind its anchor, cap beyond tail.
							if (note.headVisible) quad(texture, x - acrossX * width / 2, y - acrossY * width / 2,
								acrossX * width, acrossY * width, inwardX * headHeight, inwardY * headHeight,
								0, 1 - atlas[1] / texture.height, 1, atlas[1] / texture.height);
							quad(texture, tx - acrossX * width / 2 - inwardX * tailHeight,
								ty - acrossY * width / 2 - inwardY * tailHeight,
								acrossX * width, acrossY * width, inwardX * tailHeight, inwardY * tailHeight,
								0, 0, 1, atlas[0] / texture.height);
						}
					}
					const columns = assets.hitGrid[0], rows = assets.hitGrid[1];
					const cellWidth = hit.width / columns, cellHeight = hit.height / rows;
					// Native particle quad spans [-1,1]; size = hitFxScale / 5 in width-normalized space.
					const hitHeight = stage.width * assets.hitScale / 5;
					const hitWidth = hitHeight * cellWidth / cellHeight;
					for (const effect of notes.hits) {
						if (effect.age < 0 || effect.age >= noteHitDuration || effect.opacity <= 0) continue;
						const progress = effect.age / noteHitDuration;
						const frame = Math.min(columns * rows - 1, Math.floor(progress * columns * rows));
						// Native default color 0xe1ffec9f and white->.7 alpha->0 color curve.
						const fade = progress < 0.5 ? 1 - progress * 0.6 : (1 - progress) * 1.4;
						gl.uniform4f(tint, 1, 236 / 255, 159 / 255, effect.opacity * fade * 225 / 255);
						// nomo's hitFxRotate defaults false: the original atlas remains screen-aligned.
						quad(hit, stage.left + effect.x - hitWidth / 2, stage.top + effect.y - hitHeight / 2,
							hitWidth, 0, 0, hitHeight, frame % columns / columns, Math.floor(frame / columns) / rows,
							1 / columns, 1 / rows);
					}
				} finally {
					gl.disable(gl.SCISSOR_TEST);
				}
			},
		};
	} catch (error) {
		dispose();
		throw error;
	}
}
