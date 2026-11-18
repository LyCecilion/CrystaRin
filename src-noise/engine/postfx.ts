// SPDX-License-Identifier: GPL-3.0-only
// Clean-room preview based on recorded parameters, not original shader code.
import { gridReference, type PostFxAssets, type PostFxState } from "./postfx-settings";
import type { PostFxTimelineFrame } from "./postfx-timeline";

const vertex = `#version 300 es
out vec2 uv;
void main() {
 vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
 uv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;
const fragment = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 uv;
out vec4 result;
uniform sampler2D source, auxiliary, atlas, displacement, gateMap, gridImage;
uniform sampler2DArray wire;
uniform int mode;
uniform float time, gridTime, aspect;
uniform vec2 texel;
uniform vec4 a,b,c,d,e,f,g,h,i,j;
uniform vec4 slashes[5];
uniform vec2 directions[5];
vec3 scene(vec2 p) { return texture(source,p).rgb; }
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec3 vignette() {
 vec2 p=uv-a.xy;
 float edge=clamp(length(p)*1.41421356,0.0,1.0);
 float falloff=pow(max(1.0-edge,0.0),max(abs(b.x),0.001));
 falloff=pow(falloff,1.0/max(a.z,0.001));
 vec3 color=scene(uv)*mix(1.0,falloff,clamp(a.w,0.0,1.0));
 vec2 np=floor(uv*vec2(1920.0,1080.0)*max(b.w,0.001));
 vec3 noise=vec3(hash(np+time),hash(np+time+17.0),hash(np+time+39.0));
 noise=mix(vec3(dot(noise,vec3(0.299,0.587,0.114))),noise,b.z);
 color+=(noise-0.5)*b.y;
 return color*(1.0-c.x*(0.5+0.5*sin(uv.y*1080.0*3.14159265)));
}
vec3 rgbShift() {
 vec2 p=uv-a.xy;
 vec2 offset=p*a.z*a.w/1080.0*pow(clamp(length(p)*2.0,0.0,1.0),2.0);
 return vec3(scene(uv+offset).r,scene(uv).g,scene(uv-offset).b);
}
vec3 glitch() {
 vec2 offset=vec2(0.0);
 for(int layer=0;layer<3;layer++) {
  vec4 params=layer==0?b:(layer==1?c:d);
  vec2 quadrant=layer==0?vec2(0.0): (layer==1?vec2(0.5,0.0):vec2(0.0,0.5));
  vec3 n=texture(atlas,quadrant+fract(uv+vec2(time*params.z,0.0))*0.5).rgb;
  offset+=(n.rg*2.0-1.0)*params.xy*step(0.45,n.b);
 }
 offset*=a.x*16.0/1080.0;
 vec3 color=scene(uv+offset);
 if(a.y>0.5) color=vec3(scene(uv+offset*1.8).r,color.g,scene(uv-offset*0.8).b);
 return color;
}
vec3 dog() {
 // a: frame count/move/evolve/scale; b: noise scale+offset; c: seam/displacement/disp speed/blend.
 vec2 np=uv*b.xy+b.zw+vec2(time*a.y*0.03,0.0);
 float layer=mod(floor(time*a.z),max(a.x,1.0));
 float n=texture(wire,vec3(fract(np),layer)).r;
 vec2 seam=min(fract(np),1.0-fract(np));
 n*=smoothstep(0.0,max(c.x,0.00001),min(seam.x,seam.y));
 vec2 dp=uv*d.xy+d.zw+vec2(time*c.z*0.03,0.0);
 vec2 shift=vec2(texture(displacement,fract(dp)).r,texture(displacement,fract(dp+vec2(0.37,0.61))).r)*2.0-1.0;
 // Preview mapping: brightness is mask gain, so its recorded opening zero leaves the scene intact.
 float gate=clamp((texture(gateMap,fract(uv*e.xy+e.zw)).r-0.5)*f.y+0.5,0.0,1.0)*clamp(f.x,0.0,1.0);
 float distance=length((uv-0.5)*vec2(aspect,1.0));
 float center=1.0-smoothstep(f.z,f.z+max(f.w,0.00001),distance);
 float edge=1.0-smoothstep(g.x,g.x+max(g.y,0.00001),distance);
 vec4 tint=mix(i,h,center);
 float mask=n*gate*edge;
 vec2 base=(uv-0.5)/max(abs(a.w),0.01)+0.5;
 vec3 displaced=scene(base+shift*c.y*0.1*mask);
 return mix(scene(uv),mix(displaced,tint.rgb,c.w*tint.a),mask);
}
vec3 slash() {
 vec2 offset=vec2(0.0); float light=0.0;
 for(int s=0;s<5;s++) {
  vec4 line=slashes[s];
  vec2 normal=vec2(-sin(line.z),cos(line.z));
  float distance=dot(uv-line.xy,normal);
  offset+=sign(distance)*line.w*directions[s];
  light+=exp(-abs(distance)*max(b.y,0.001))*abs(line.w)*b.x;
 }
 return scene(uv+offset)+a.rgb*a.a*light;
}
vec3 lens() {
 float ratio=a.w>0.5?aspect:max(b.x,0.01);
 vec2 p=(uv-a.xy)*vec2(ratio,1.0); float r2=dot(p,p);
 vec2 warped=a.xy+p*(1.0+a.z*0.001*r2+b.y*0.001*r2*r2)/vec2(ratio,1.0);
 vec3 color=scene(warped);
 if(b.z>0.0) {
  float edge=min(min(warped.x,warped.y),min(1.0-warped.x,1.0-warped.y));
  color=mix(scene(uv),color,smoothstep(0.0,b.z,edge));
 }
 return color;
}
vec3 downsample() {
 vec2 o=texel*a.x;
 return (scene(uv)*4.0+scene(uv-o)+scene(uv+o)+scene(uv+vec2(o.x,-o.y))+scene(uv+vec2(-o.x,o.y)))/8.0;
}
vec3 upsample() {
 vec2 o=texel*a.x;
 vec3 sum=scene(uv+vec2(-2.0*o.x,0.0))+scene(uv+vec2(0.0,2.0*o.y))+scene(uv+vec2(2.0*o.x,0.0))+scene(uv+vec2(0.0,-2.0*o.y));
 sum+=2.0*(scene(uv-o)+scene(uv+o)+scene(uv+vec2(o.x,-o.y))+scene(uv+vec2(-o.x,o.y)));
 return (sum/12.0+texture(auxiliary,uv).rgb)*0.5;
}
void main() {
 vec3 color;
 if(mode==0) color=vignette();
 else if(mode==1) color=rgbShift();
 else if(mode==2) color=glitch();
 else if(mode==3) color=dog();
 else if(mode==4) color=slash();
 else if(mode==5) color=lens();
 else if(mode==6) { color=scene(uv); float peak=max(max(color.r,color.g),color.b); color*=max(peak-a.x,0.0)/max(peak,0.00001)*a.y; }
 else if(mode==7) color=downsample();
 else if(mode==8) color=upsample();
 else if(mode==9) color=scene(uv)+texture(auxiliary,uv).rgb*b.rgb*a.x;
 else {
  // Same R-channel frame border, two UV scales: the phase-wrap endpoint is identical.
  float phase=fract(gridTime*d.x);
  float scale=exp2(-phase);
  // Height-normalized screen space keeps cells square at every viewport aspect.
  vec2 local=(uv-0.5)*vec2(aspect,1.0);
  vec2 uvA=0.5+local*scale;
  vec2 uvB=0.5+local*(2.0*scale);
  float grid=mix(texture(gridImage,fract(uvA*a.xy+a.zw)).r,
                 texture(gridImage,fract(uvB*a.xy+a.zw)).r,phase);
  float radial=pow(clamp(1.0-length(uv-b.xy)*1.41421356,0.0,1.0),c.w);
  color=scene(uv)+grid*c.rgb*b.z*b.w*radial;
 }
 result=vec4(color,1.0);
}`;

type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number };

export interface PostFxPipeline {
	render(input: WebGLTexture, width: number, height: number, time: number, state: PostFxState, timeline?: PostFxTimelineFrame): WebGLTexture;
	dispose(): void;
}

/** Gamma/LDR throughout. All equations and runtime envelopes are explicitly preview approximations. */
export function createPostFxPipeline(gl: WebGL2RenderingContext, assets: PostFxAssets): PostFxPipeline {
	const textures: WebGLTexture[] = [];
	const targets: Target[] = [];
	const shaders: WebGLShader[] = [];
	const program = gl.createProgram();
	const vao = gl.createVertexArray();
	const uniforms = new Map<string, WebGLUniformLocation>();
	const slashData = new Float32Array(20);
	const slashDirections = new Float32Array(10);
	const ping: Target[] = [];
	const down: Target[] = [];
	const up: Target[] = [];
	let disposed = false;
	function dispose() {
		if (disposed) return;
		disposed = true;
		for (const target of targets) gl.deleteFramebuffer(target.framebuffer);
		for (const texture of textures) gl.deleteTexture(texture);
		for (const shader of shaders) gl.deleteShader(shader);
		gl.deleteProgram(program);
		gl.deleteVertexArray(vao);
	}
	function texture(array = false) {
		const value = gl.createTexture();
		if (!value) throw new Error("Cannot allocate postfx texture");
		textures.push(value);
		const type = array ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
		gl.bindTexture(type, value);
		gl.texParameteri(type, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(type, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(type, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(type, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return value;
	}
	function target() {
		const image = texture();
		const framebuffer = gl.createFramebuffer();
		if (!framebuffer) throw new Error("Cannot allocate postfx framebuffer");
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, image, 0);
		const value = { texture: image, framebuffer, width: 0, height: 0 };
		targets.push(value);
		return value;
	}
	function size(target: Target, width: number, height: number) {
		if (target.width === width && target.height === height) return;
		gl.bindTexture(gl.TEXTURE_2D, target.texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Incomplete postfx framebuffer");
		target.width = width; target.height = height;
	}
	function u(name: string) { return uniforms.get(name)!; }
	function v(name: string, x: number, y = 0, z = 0, w = 0) { gl.uniform4f(u(name), x, y, z, w); }
	function bind(unit: number, texture: WebGLTexture) {
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, texture);
	}
	function draw(mode: number, source: WebGLTexture, output: Target, sourceWidth: number, sourceHeight: number) {
		bind(0, source);
		gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
		gl.viewport(0, 0, output.width, output.height);
		gl.uniform1i(u("mode"), mode);
		gl.uniform2f(u("texel"), 1 / sourceWidth, 1 / sourceHeight);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}
	try {
		if (!program || !vao) throw new Error("Cannot allocate postfx program");
		for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Cannot allocate postfx shader");
			shaders.push(shader);
			gl.shaderSource(shader, source); gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Postfx shader: ${gl.getShaderInfoLog(shader)}`);
			gl.attachShader(program, shader);
		}
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Postfx linking: ${gl.getProgramInfoLog(program)}`);
		for (const name of ["source", "auxiliary", "atlas", "displacement", "gateMap", "gridImage", "wire", "mode", "time", "gridTime", "aspect", "texel", "a", "b", "c", "d", "e", "f", "g", "h", "i", "slashes[0]", "directions[0]"]) {
			const value = gl.getUniformLocation(program, name);
			if (value === null) throw new Error(`Missing postfx uniform ${name}`);
			uniforms.set(name, value);
		}
		gl.useProgram(program);
		gl.uniform1i(u("source"), 0); gl.uniform1i(u("auxiliary"), 1);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
		const imageTextures: WebGLTexture[] = [];
		for (const [name, image] of [["atlas", assets.glitch], ["displacement", assets.displace], ["gateMap", assets.glitchMap], ["gridImage", assets.grid]] as const) {
			const unit = imageTextures.length + 2;
			gl.activeTexture(gl.TEXTURE0 + unit);
			const imageTexture = texture(); imageTextures.push(imageTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
			gl.uniform1i(u(name), unit);
		}
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.activeTexture(gl.TEXTURE6);
		const wireTexture = texture(true);
		gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8, assets.wire.width, assets.wire.height, assets.wire.depth, 0, gl.RED, gl.UNSIGNED_BYTE, assets.wire.pixels);
		gl.uniform1i(u("wire"), 6);
		gl.activeTexture(gl.TEXTURE0);
		ping.push(target(), target());
		// Retained targets: parameter changes only resize the affected pyramid levels.
		for (let level = 0; level < 8; level++) { down.push(target()); up.push(target()); }
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return {
			render(input: WebGLTexture, width: number, height: number, time: number, state: PostFxState, timeline?: PostFxTimelineFrame): WebGLTexture {
				if (disposed) throw new Error("Postfx pipeline has been disposed");
				gl.useProgram(program); gl.bindVertexArray(vao); gl.disable(gl.BLEND);
				gl.uniform1f(u("time"), timeline?.animationTime ?? time); gl.uniform1f(u("aspect"), width / height);
				// Grid's material clock keeps cycling through the outro; its opacity is a separate track.
				gl.uniform1f(u("gridTime"), time);
				// A previous one-level Bloom leaves its extraction target on unit 1.
				// Reset it before drawing there again to avoid a framebuffer feedback loop.
				bind(1, input);
				for (let index = 0; index < imageTextures.length; index++) bind(index + 2, imageTextures[index]);
				gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D_ARRAY, wireTexture);
				gl.activeTexture(gl.TEXTURE0);
				size(ping[0], width, height); size(ping[1], width, height);
				let source = input; let slot = 0;
				function pass(mode: number) { const output = ping[slot]; draw(mode, source, output, width, height); source = output.texture; slot = 1 - slot; }
				const settings = state.settings;
				const wallTime = performance.now() / 1000;
				if (timeline ? timeline.gridOpacity > 0 : state.grid) {
					const grid = gridReference;
					const uv = grid.textures._MainTex;
					v("a", uv.scale.x, uv.scale.y, uv.offset.x, uv.offset.y);
					v("b", grid.colors._Center.r, grid.colors._Center.g, grid.floats._GridBrightness, grid.floats._GlobalBrightness * (timeline?.gridOpacity ?? 1));
					v("c", grid.colors._GridColor.r, grid.colors._GridColor.g, grid.colors._GridColor.b, grid.floats._Radius);
					v("d", grid.floats._ScaleSpeed);
					pass(10);
				}
				const vig = settings.VignettePlus;
				if (vig.enabled) {
					v("a", vig.center.x, vig.center.y, vig.smoothness, timeline?.vignetteDarkness ?? vig.darkness);
					v("b", timeline?.vignetteRadius ?? vig.radius, vig.noiseBrightness, vig.noiseSaturation, vig.noiseSampleRate); v("c", vig.lineOpacity); pass(0);
				}
				const rgb = settings.RGBShift;
				if (rgb.enabled) { v("a", rgb.center.x, rgb.center.y, rgb.screenDeform, timeline?.shiftRadius ?? rgb.radius); pass(1); }
				const glitch = settings.Glitch;
				if (glitch.enabled) {
					const elapsed = wallTime - state.glitchTrigger;
					const pulse = elapsed >= 0 && elapsed < 0.45 ? Math.sin(elapsed / 0.45 * Math.PI) * 0.35 : 0;
					v("a", (timeline?.glitchRange ?? glitch.glitchRange) + pulse, glitch.rgbChannelOffset);
					v("b", glitch.layer1Strength.x, glitch.layer1Strength.y, glitch.layer1Speed);
					v("c", glitch.layer2Strength.x, glitch.layer2Strength.y, glitch.layer2Speed);
					v("d", glitch.layer3Strength.x, glitch.layer3Strength.y, glitch.layer3Speed); pass(2);
				}
				const dog = settings.GlitchDog;
				if (dog.enabled) {
					v("a", Math.max(1, Math.min(assets.wire.depth, Math.round(dog.noiseFrameCount))), dog.noiseMoveSpeed, dog.noiseEvolveSpeed, timeline?.glitchDogScale ?? dog.scale);
					v("b", dog.noiseScale.x, dog.noiseScale.y, dog.noiseOffset.x, dog.noiseOffset.y);
					v("c", dog.seamBlend, dog.displaceStrength, dog.displaceSpeed, dog.colorBlend);
					v("d", dog.displaceMapScale.x, dog.displaceMapScale.y, dog.displaceMapOffset.x, dog.displaceMapOffset.y);
					v("e", dog.glitchMapScale.x, dog.glitchMapScale.y, dog.glitchMapOffset.x, dog.glitchMapOffset.y);
					v("f", timeline?.glitchMapBrightness ?? dog.glitchMapBrightness, timeline?.glitchMapContrast ?? dog.glitchMapContrast, dog.centerMaskRadius, dog.centerMaskSmoothness);
					v("g", dog.edgeMaskRadius, dog.edgeMaskSmoothness);
					v("h", dog.centerColor.r, dog.centerColor.g, dog.centerColor.b, dog.centerColor.a);
					v("i", dog.edgeColor.r, dog.edgeColor.g, dog.edgeColor.b, dog.edgeColor.a); pass(3);
				}
				const slash = settings.DimensionSlash;
				if (slash.enabled) {
					let manual = false;
					for (let index = 0; index < 5; index++) {
						const line = slash.Slashes[index];
						const authored = timeline?.slashes[index];
						const elapsed = wallTime - state.slashTrigger - index * 0.06;
						const pulse = elapsed >= 0 && elapsed < 0.5 ? Math.sin(elapsed / 0.5 * Math.PI) : 0;
						manual ||= pulse > 0;
						const offset = index * 4;
						slashData[offset] = pulse > 0 ? 0.2 + index * 0.15 : authored?.position.x ?? line.Position.x;
						slashData[offset + 1] = pulse > 0 ? 0.5 : authored?.position.y ?? line.Position.y;
						slashData[offset + 2] = pulse > 0 ? 0.4 + index * 0.3 : (authored?.lineDirection ?? line.LineDirection) * Math.PI / 180;
						slashData[offset + 3] = ((authored?.strength ?? line.Strength) + pulse * 3) * 0.01;
						const direction = pulse > 0 ? (index % 2 ? -1 : 1) * Math.PI / 2 : (authored?.direction ?? line.Direction) * Math.PI / 180;
						slashDirections[index * 2] = Math.cos(direction);
						slashDirections[index * 2 + 1] = Math.sin(direction);
					}
					gl.uniform4fv(u("slashes[0]"), slashData); gl.uniform2fv(u("directions[0]"), slashDirections);
					// Static alpha=0 has no animation track; automatic preview uses the recorded RGB for visible light.
					v("a", slash.SlashColor.r, slash.SlashColor.g, slash.SlashColor.b, manual || timeline ? 1 : slash.SlashColor.a);
					v("b", slash.SlashLightStrength, slash.SlashLightFalloff); pass(4);
				}
				const lens = settings.LensDistortion;
				if (lens.enabled) { v("a", lens.center.x, lens.center.y, lens.size, lens.useScreenAspect); v("b", lens.manualAspect, timeline?.convergence ?? lens.convergence, lens.edgeSmoothness); pass(5); }
				const bloom = settings.Bloom;
				if (bloom.enabled) {
					const levels = Math.max(1, Math.min(8, Math.round(bloom.iteration)));
					const scale = Math.max(0.01, Math.min(1, bloom.sampleRate));
					for (let index = 0; index < levels; index++) {
						const w = Math.max(1, Math.round(width * scale / 2 ** index));
						const h = Math.max(1, Math.round(height * scale / 2 ** index));
						size(down[index], w, h); size(up[index], w, h);
					}
					v("a", bloom.threshold, timeline?.bloomBrightness ?? bloom.brightness); draw(6, source, down[0], width, height);
					v("a", bloom.radius);
					for (let index = 1; index < levels; index++) draw(7, down[index - 1].texture, down[index], down[index - 1].width, down[index - 1].height);
					let blurred = down[levels - 1];
					for (let index = levels - 2; index >= 0; index--) {
						bind(1, down[index].texture); draw(8, blurred.texture, up[index], blurred.width, blurred.height); blurred = up[index];
					}
					bind(1, blurred.texture); v("a", bloom.intensity); v("b", bloom.bloomColor.r, bloom.bloomColor.g, bloom.bloomColor.b); pass(9);
				}
				return source;
			},
			dispose,
		};
	} catch (error) { dispose(); throw error; }
}
