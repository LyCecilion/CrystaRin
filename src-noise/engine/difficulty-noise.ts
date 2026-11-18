// SPDX-License-Identifier: GPL-3.0-only
import { createPhiraMaterial, type PhiraAssets, type PhiraFrame } from "./phira-material";

export interface DifficultyBounds { label: string; x: number; y: number; width: number; height: number }

export interface DifficultyNoise {
	render(time: number, bounds: readonly DifficultyBounds[], sourceChanged?: boolean): void;
	dispose(): void;
}

/** Refract the reference's actual selection pixels with the same material as the song. */
export function createDifficultyNoise(canvas: HTMLCanvasElement, source: HTMLCanvasElement, assets: PhiraAssets): DifficultyNoise {
	const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
	if (!gl) throw new Error("无法创建难度选择的 WebGL 2 画面");
	const shaders: WebGLShader[] = [];
	const program = gl.createProgram();
	const texture = gl.createTexture();
	const vao = gl.createVertexArray();
	if (!program || !texture || !vao) throw new Error("无法分配难度选择画面");
	for (const [kind, code] of [
		[gl.VERTEX_SHADER, `#version 300 es
		out vec2 uv;
		void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); uv=vec2(p.x,1.0-p.y); gl_Position=vec4(p*2.0-1.0,0,1);}`],
		[gl.FRAGMENT_SHADER, `#version 300 es
		precision highp float; uniform sampler2D image; in vec2 uv; out vec4 color;
		void main(){color=texture(image,uv);}`],
	] as const) {
		const shader = gl.createShader(kind);
		if (!shader) throw new Error("无法编译难度选择画面");
		shaders.push(shader);
		gl.shaderSource(shader, code);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
		gl.attachShader(program, shader);
	}
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	const material = createPhiraMaterial(gl, assets);
	const areas: PhiraFrame["chart"]["areas"] = [0, 1, 2].map(() => ({ cx: 0, cy: 0, width: 0, height: 0, rotation: 0, subtract: false, phase: "active", opacity: 1 }));
	const frame: PhiraFrame = { stage: {left: 0, top: 0, width: 0, height: 0}, chart: { areas, lines: [] }, touches: [], time: 0 };
	let live = true;
	let sourceWidth = 0;
	let sourceHeight = 0;
	return {
		render(time: number, bounds: readonly DifficultyBounds[], sourceChanged = false) {
			if (!live) return;
			const dpr = Math.min(devicePixelRatio, 2);
			const w = Math.round(innerWidth * dpr);
			const h = Math.round(innerHeight * dpr);
			if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, w, h);
			gl.disable(gl.BLEND);
			gl.bindVertexArray(vao);
			gl.useProgram(program);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			if (sourceChanged || sourceWidth !== source.width || sourceHeight !== source.height) {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
				sourceWidth = source.width; sourceHeight = source.height;
			}
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			frame.stage.width = innerWidth; frame.stage.height = innerHeight; frame.time = time;
			for (let i = 0; i < areas.length; i++) {
				const box = bounds[i];
				const area = areas[i];
				area.cx = box.x + box.width / 2; area.cy = box.y + box.height / 2;
				area.width = box.width + 36; area.height = box.height + 32;
			}
			material.render(null, innerWidth, innerHeight, dpr, frame);
		},
		dispose() {
			if (!live) return;
			live = false;
			material.dispose(); gl.deleteTexture(texture); gl.deleteProgram(program); gl.deleteVertexArray(vao);
			for (const shader of shaders) gl.deleteShader(shader);
			canvas.width = canvas.height = 1;
		},
	};
}
