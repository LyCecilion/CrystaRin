// SPDX-License-Identifier: GPL-3.0-only
// Phira-Pro block_shader.rs / block_shader_full.vert, revision c3873ea3.
// Native fragment arithmetic is kept in phira/block_shader_full.frag; only GLSL
// interface syntax changes for WebGL 2. See ../NOTICE for upstream provenance.
import blockUrl from "../assets/BlockNoise1.png?url";
import pointUrl from "../assets/PointNoise.png?url";
import fieldUrl from "../assets/FD_Noise_00000.png?url";
import touchUrl from "../assets/TouchHover.png?url";
import fragmentSource from "./phira/block_shader_full.frag?raw";
import { createPhiraMasks } from "./phira-masks";
import { createPhiraTouchMask } from "./phira-touch";
import type { PhiraImage, PhiraTouch } from "./phira-types";
import type { ChartFrame, Stage } from "./types";
import type { NotePerformanceFrame } from "./note-types";
import type { NoteRenderer } from "./note-renderer";

export interface PhiraAssets {
	block: PhiraImage;
	point: PhiraImage;
	field: PhiraImage;
	touch: PhiraImage;
}

export interface PhiraFrame {
	stage: Stage;
	chart: ChartFrame;
	touches: readonly PhiraTouch[];
	time: number;
	touchTime?: number;
	/** Optional whole-song note/Auto Play presentation, independently toggleable. */
	notes?: NotePerformanceFrame;
}

let assetsPromise: Promise<PhiraAssets> | undefined;
export function loadPhiraAssets(): Promise<PhiraAssets> {
	return assetsPromise ??= (async () => {
		async function decode(url: string): Promise<PhiraImage> {
			const image = new Image();
			image.src = url;
			await image.decode();
			const canvas = document.createElement("canvas");
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) throw new Error("无法解码 Phira-Pro 材质纹理");
			context.drawImage(image, 0, 0);
			return { width: canvas.width, height: canvas.height, pixels: new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer) };
		}
		const [block, point, field, touch] = await Promise.all([blockUrl, pointUrl, fieldUrl, touchUrl].map(decode));
		return { block, point, field, touch };
	})();
}

const vertexSource = `#version 300 es
layout(location = 0) in vec2 position;
out lowp vec4 color;
out highp vec2 fieldUV;
out highp vec2 sceneUV;
out highp vec2 displaceUV;
out highp vec2 sparkUV;
out highp vec2 disabledDisplaceUV;
out highp vec2 touchDisplaceUV;
out highp vec2 noiseUV;
out highp vec4 screenPos;
void main() {
 gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
 color = vec4(1.0);
 fieldUV = position;
 sceneUV = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
 screenPos = vec4(sceneUV, 0.0, 1.0);
 displaceUV = sceneUV * vec2(0.8, 0.3);
 sparkUV = sceneUV * vec2(3.0, 1.2);
 disabledDisplaceUV = sceneUV * vec2(0.5, 0.2);
 touchDisplaceUV = sceneUV * vec2(0.55, 0.3);
 noiseUV = sceneUV * vec2(1.5, 1.46);
}`;

const floats: Record<string, number> = {
	_EdgeOpacity: 0.8, _FillStrength: 0.667, _FillOpacity: 0.667,
	_GlowIntensity: 0.8, _SparkMapOpacity: 5.69, _SparkHueShiftAmount: 0.2,
	_SparkDisplaceIntensity: 2.39, _DisplaceBlendIntensity: 0.411,
	_DisplaceSpeed: 1.5, _DisplaceStrength: 0.15,
	_TouchPosRadius: 0.5, _TouchPosSDFSmoothness: 0.47, _TouchPosSDFFalloff: 0.41,
	_BackgroundPixelScale: 6, uDisabledFillOpacity: 0.4,
	uDisabledSparkOpacity: 3.5, uDisabledSparkIntensity: 2.29, uDisabledSpeed: 0.3,
	_ShineSpeed: 37.9, _ShineBrightness: 0.12,
	_TouchDisplaceSpeed: 2.9, _TouchDisplaceStrength: 0.08,
	_NoiseEvoSpeed: 0.03, _NoiseDirChangeSpeed: 60, _NoiseDisplaceStrength: 1,
	_NoiseRadius: 0.48, _NoiseSmoothness: 1, _SDFCellSize: 0.11,
	_SDFSmoothness: 0.63, _SDFFalloff: 0.34, _SDFMoveSpeed: 9.3,
	_TouchBackgroundPixelScale: 8, uReadyExtra: 0,
};
const colors: Record<string, number[]> = {
	_EdgeColor: [1, 0.33018857, 0.33018857, 1],
	_FillColor: [0.7132075, 0.23549296, 0.23549296, 1],
	_GlowColor: [1, 0.17924517, 0.17924517, 1],
	_DisplaceDirection: [1, 1, 0, 0],
	uDisabledFillColor: [0.497, 0.13766898, 0.13766898, 1],
	_ShineColor: [1, 1, 1, 1], _TouchDisplaceDirection: [1, 1, 0, 0],
	_NoiseTint: [1, 0, 0, 1], _TouchGlowColor: [1, 0, 0, 1],
};

export interface PhiraMaterial {
	render(framebuffer: WebGLFramebuffer | null, width: number, height: number, dpr: number, frame: PhiraFrame, noteRenderer?: NoteRenderer): void;
	dispose(): void;
}

/** Disabled → lines/notes/hits → /6 SceneColor → premultiplied Active/hover. */
export function createPhiraMaterial(gl: WebGL2RenderingContext, assets: PhiraAssets): PhiraMaterial {
	const masks = createPhiraMasks(assets.block);
	const touch = createPhiraTouchMask(assets.touch);
	const programs: WebGLProgram[] = [];
	const textures: WebGLTexture[] = [];
	const shaders: WebGLShader[] = [];
	const vao = gl.createVertexArray();
	const quad = gl.createBuffer();
	const snapshotFbo = gl.createFramebuffer();
	let maskWidth = 0;
	let maskHeight = 0;
	let snapshotWidth = 0;
	let snapshotHeight = 0;
	const positions = new Float32Array(20);

	function dispose(): void {
		for (const p of programs) gl.deleteProgram(p);
		for (const t of textures) gl.deleteTexture(t);
		for (const s of shaders) gl.deleteShader(s);
		gl.deleteVertexArray(vao);
		gl.deleteBuffer(quad);
		gl.deleteFramebuffer(snapshotFbo);
	}
	function shader(type: number, source: string): WebGLShader {
		const s = gl.createShader(type);
		if (!s) throw new Error("Cannot allocate Phira shader");
		shaders.push(s);
		gl.shaderSource(s, source);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Phira shader: ${gl.getShaderInfoLog(s)}`);
		return s;
	}
	function texture(filter: number, wrap: number = gl.CLAMP_TO_EDGE): WebGLTexture {
		const t = gl.createTexture();
		if (!t) throw new Error("Cannot allocate Phira texture");
		textures.push(t);
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
		return t;
	}
	function imageTexture(image: PhiraImage, wrap: number): WebGLTexture {
		const t = texture(gl.NEAREST, wrap);
		const flipped = new Uint8Array(image.pixels.length);
		const row = image.width * 4;
		for (let y = 0; y < image.height; y++) flipped.set(image.pixels.subarray(y * row, (y + 1) * row), (image.height - 1 - y) * row);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
		return t;
	}

	try {
		if (!vao || !quad || !snapshotFbo) throw new Error("Cannot allocate Phira geometry");
		gl.activeTexture(gl.TEXTURE0);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		const displace = imageTexture(assets.block, gl.MIRRORED_REPEAT);
		const spark = imageTexture(assets.point, gl.REPEAT);
		const noise = imageTexture(assets.field, gl.MIRRORED_REPEAT);
		const effect = texture(gl.LINEAR);
		const aux = texture(gl.LINEAR);
		const snapshot = texture(gl.LINEAR);
		const empty = texture(gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
		const units = [displace, spark, effect, snapshot, aux, noise, empty, empty];
		const samplers = ["uDisplaceTex", "uSparkTex", "uMasks", "uScene", "uAuxMasks", "uNoiseTex", "uActiveColors", "uDisabledColors"];
		const vertex = shader(gl.VERTEX_SHADER, vertexSource);
		const fragment = fragmentSource.replace("#version 100", "#version 300 es")
			.replace(/\bvarying\b/g, "in").replace(/\btexture2D\b/g, "texture")
			.replace(/\bgl_FragColor\b/g, "fragmentColor")
			.replace("precision highp float;", "precision highp float;\nout vec4 fragmentColor;")
			.replace("uniform int uColored;", "const int uColored = 0;");
		function material(disabled: boolean, hover: boolean) {
			let source = fragment.replace("uniform int uLayer;", `const int uLayer = ${disabled ? 0 : 3};`);
			if (!hover) {
				source = source.replace(/uniform\s+int _TouchPosCount;/, "const int _TouchPosCount = 0;");
				source = source.replace(/float hoverSample\(vec2 uv\) \{[^}]*\}/, "float hoverSample(vec2 uv) { return 0.0; }");
			}
			const p = gl.createProgram();
			if (!p) throw new Error("Cannot allocate Phira program");
			programs.push(p);
			gl.attachShader(p, vertex);
			gl.attachShader(p, shader(gl.FRAGMENT_SHADER, source));
			gl.linkProgram(p);
			if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Phira material: ${gl.getProgramInfoLog(p)}`);
			const locations = new Map<string, WebGLUniformLocation | null>();
			function uniform(name: string) {
				if (!locations.has(name)) locations.set(name, gl.getUniformLocation(p, name));
				return locations.get(name)!;
			}
			gl.useProgram(p);
			for (const [name, value] of Object.entries(floats)) gl.uniform1f(uniform(name), value);
			for (const [name, value] of Object.entries(colors)) gl.uniform4fv(uniform(name), value);
			gl.uniform3f(uniform("_SparkTint"), 1, 0.28490567, 0.28490567);
			gl.uniform3f(uniform("uDisabledSparkTint"), 0.31132078, 0.077830195, 0.077830195);
			for (let i = 0; i < samplers.length; i++) gl.uniform1i(uniform(samplers[i]), i);
			return { p, uniform };
		}
		const disabled = material(true, false);
		const active = material(false, false);
		const hover = material(false, true);
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		// Judge lines use the same quad, transformed in the vertex stage.
		const line = gl.createProgram();
		if (!line) throw new Error("Cannot allocate judge-line program");
		programs.push(line);
		gl.attachShader(line, shader(gl.VERTEX_SHADER, `#version 300 es
layout(location=0) in vec2 position;
uniform vec2 viewport;
uniform vec4 rect;
uniform float rotation;
void main(){ vec2 p=(position-0.5)*rect.zw;
 float c=cos(rotation), s=sin(rotation);
 p=rect.xy+vec2(c*p.x-s*p.y,s*p.x+c*p.y);
 gl_Position=vec4(p.x/viewport.x*2.0-1.0,1.0-p.y/viewport.y*2.0,0.0,1.0); }`));
		gl.attachShader(line, shader(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform float opacity;
out vec4 color;
void main(){color=vec4(vec3(1.0,0.88,0.53)*opacity,opacity);}`));
		gl.linkProgram(line);
		if (!gl.getProgramParameter(line, gl.LINK_STATUS)) throw new Error(`Judge lines: ${gl.getProgramInfoLog(line)}`);
		const lineViewport = gl.getUniformLocation(line, "viewport");
		const lineRect = gl.getUniformLocation(line, "rect");
		const lineRotation = gl.getUniformLocation(line, "rotation");
		const lineOpacity = gl.getUniformLocation(line, "opacity");

		return {
			render(framebuffer, width, height, dpr, frame, noteRenderer) {
				const w = gl.drawingBufferWidth;
				const h = gl.drawingBufferHeight;
				const m = masks.render(width, height, dpr, frame.stage, frame.chart.areas, frame.time);
				const visible = touch.render(m.aux, m.width, m.height, w / h, frame.touches, frame.touchTime ?? frame.time);
				gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				for (let i = 0; i < 2; i++) {
					gl.activeTexture(gl.TEXTURE0 + 2 + i * 2);
					gl.bindTexture(gl.TEXTURE_2D, i ? aux : effect);
					const bytes = i ? m.aux : m.rgba;
					if (m.width !== maskWidth || m.height !== maskHeight) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, m.width, m.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
					else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, m.width, m.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
				}
				maskWidth = m.width;
				maskHeight = m.height;
				for (let i = 0; i < units.length; i++) {
					gl.activeTexture(gl.TEXTURE0 + i);
					gl.bindTexture(gl.TEXTURE_2D, units[i]);
				}
				gl.bindVertexArray(vao);
				gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
				gl.viewport(0, 0, w, h);
				gl.enable(gl.BLEND);
				// The fragment mask uses bottom-up UVs; the adaptive stage is in CSS pixels.
				const clipLeft = frame.stage.left / width;
				const clipBottom = 1 - (frame.stage.top + frame.stage.height) / height;
				const clipRight = (frame.stage.left + frame.stage.width) / width;
				const clipTop = 1 - frame.stage.top / height;
				function draw(material: typeof active) {
					gl.useProgram(material.p);
					const u = material.uniform;
					gl.uniform4f(u("uStageClip"), clipLeft, clipBottom, clipRight, clipTop);
					gl.uniform4f(u("uUnityTime"), frame.time / 20, frame.time, frame.time * 2, frame.time * 3);
					gl.uniform4f(u("_ScreenParams"), w, h, 1 + 1 / w, 1 + 1 / h);
					gl.uniform4f(u("_EffectRT_TexelSize"), 1 / m.width, 1 / m.height, m.width, m.height);
					gl.uniform1f(u("_TouchPosShine"), (0.63 + 0.37 * (Math.sin(frame.time * 43) * 0.5 + 0.5)) * 2);
					const count = Math.min(frame.touches.length, 10);
					gl.uniform1i(u("_TouchPosCount"), count);
					for (let i = 0; i < count; i++) {
						positions[i * 2] = frame.touches[i].x * w / h;
						positions[i * 2 + 1] = frame.touches[i].y;
					}
					gl.uniform2fv(u("_TouchPos[0]"), positions);
					gl.drawArrays(gl.TRIANGLES, 0, 6);
				}
				gl.blendFunc(gl.ONE, gl.ONE);
				draw(disabled);
				gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				gl.useProgram(line);
				gl.uniform2f(lineViewport, width, height);
				for (const l of frame.chart.lines) {
					gl.uniform4f(lineRect, frame.stage.left + l.x, frame.stage.top + l.y, l.length, Math.max(2, frame.stage.height / 225));
					gl.uniform1f(lineRotation, l.rotation);
					gl.uniform1f(lineOpacity, l.opacity);
					gl.drawArrays(gl.TRIANGLES, 0, 6);
				}
				if (frame.notes) {
					if (!noteRenderer) throw new Error("Note performance assets are not loaded.");
					// Notes and hit FX belong to the scene refracted/covered by Active/hover.
					noteRenderer.render(frame.stage, frame.notes, width, height, dpr);
					gl.bindVertexArray(vao);
					gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, units[0]);
				}
				const sw = Math.max(1, Math.floor(w / 6));
				const sh = Math.max(1, Math.floor(h / 6));
				gl.activeTexture(gl.TEXTURE3);
				gl.bindTexture(gl.TEXTURE_2D, snapshot);
				if (sw !== snapshotWidth || sh !== snapshotHeight) {
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
					gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, snapshotFbo);
					gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, snapshot, 0);
					if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete Phira snapshot framebuffer");
					snapshotWidth = sw;
					snapshotHeight = sh;
				}
				gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
				gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, snapshotFbo);
				gl.blitFramebuffer(0, 0, w, h, 0, 0, sw, sh, gl.COLOR_BUFFER_BIT, gl.LINEAR);
				gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
				draw(visible ? hover : active);
				gl.activeTexture(gl.TEXTURE0);
			},
			dispose,
		};
	} catch (error) {
		dispose();
		throw error;
	}
}

/** Fixed chart-space rectangles, not a synthetic lens, for the silent previews. */
export function createPhiraDemo(): (width: number, height: number, x: number, y: number, time: number) => PhiraFrame {
	const chart: ChartFrame = { areas: [
		{ cx: 0, cy: 0, width: 0, height: 0, rotation: 0, subtract: false, phase: "active", opacity: 1 },
		{ cx: 0, cy: 0, width: 0, height: 0, rotation: 0, subtract: true, phase: "active", opacity: 1 },
		{ cx: 0, cy: 0, width: 0, height: 0, rotation: 0, subtract: false, phase: "disabled", opacity: 1 },
		{ cx: 0, cy: 0, width: 0, height: 0, rotation: 0, subtract: false, phase: "ready", opacity: 1 },
	], lines: [] };
	const finger: PhiraTouch = { id: 0, x: 0, y: 0, strength: 1 };
	const touches = [finger];
	const frame: PhiraFrame = { stage: { left: 0, top: 0, width: 0, height: 0 }, chart, touches, time: 0 };
	return (width, height, x, y, time) => {
		frame.stage.width = width;
		frame.stage.height = height;
		frame.time = time;
		const a = chart.areas;
		a[0].cx = width * 0.52; a[0].cy = height * 0.48; a[0].width = width * 0.42; a[0].height = height * 0.32;
		a[0].rotation = Math.sin(time * 0.24) * 0.15;
		a[1].cx = width * 0.6; a[1].cy = height * 0.48; a[1].width = width * 0.1; a[1].height = height * 0.12;
		a[1].rotation = -time * 0.12;
		a[2].cx = width * 0.24; a[2].cy = height * 0.7; a[2].width = width * 0.19; a[2].height = height * 0.14;
		a[3].cx = width * 0.77; a[3].cy = height * 0.7; a[3].width = width * 0.19; a[3].height = height * 0.14;
		finger.x = x / width;
		finger.y = 1 - y / height;
		return frame;
	};
}
