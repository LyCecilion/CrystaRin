// SPDX-License-Identifier: GPL-3.0-only
// Recorded controls/choreography: blockarea/main 789e10f / ef32e4b; approximate shaders.
import { postFxOrder, resetPostFxState, type PostFxPass, type PostFxState } from "./postfx-settings";

type Path = (string | number)[];
type Bounds = readonly [min: number, max: number, step: number];
let nextPanelId = 0;

const mainFields: Record<PostFxPass, readonly string[]> = {
	VignettePlus: ["radius", "darkness", "smoothness"],
	RGBShift: ["screenDeform", "radius"],
	Glitch: ["glitchRange", "rgbChannelOffset"],
	GlitchDog: ["displaceStrength", "scale", "colorBlend"],
	DimensionSlash: ["SlashLightStrength", "SlashLightFalloff"],
	LensDistortion: ["size", "convergence", "edgeSmoothness"],
	Bloom: ["radius", "threshold", "intensity", "brightness"],
};

function boundsFor(pass: PostFxPass, path: Path): Bounds {
	const key = String(path[path.length - 1]);
	const parent = String(path[path.length - 2] ?? "");
	if (key === "rgbChannelOffset" || key === "useScreenAspect") return [0, 1, 1];
	if (key === "iteration") return [1, 8, 1];
	if (key === "noiseFrameCount") return [1, 11, 1];
	if (["r", "g", "b", "a"].includes(key)) return [0, 1, 0.001];
	if (key === "LineDirection" || key === "Direction") return [-180, 180, 0.1];
	if (key === "Strength") return [0, 100, 0.01];
	if (key === "SlashLightStrength" || key === "SlashLightFalloff") return [0, 100, 0.1];
	if (key === "size") return [1, 150, 0.1];
	if (key === "manualAspect") return [0.1, 4, 0.01];
	if (key === "convergence") return [-20, 20, 0.01];
	if (key === "radius") {
		if (pass === "VignettePlus") return [-5, 5, 0.001];
		return [0, pass === "RGBShift" ? 50 : 10, 0.01];
	}
	if (key === "x" || key === "y") {
		if (parent === "center") return [0, 1, 0.001];
		if (/Scale|noiseScale/.test(parent)) return [0.01, 12, 0.001];
		return [-5, 5, 0.001];
	}
	if (/Speed$/.test(key)) return [-10, 10, 0.01];
	if (key === "glitchMapBrightness") return [-2, 2, 0.01];
	if (key === "brightness") return [0, 25, 0.01];
	if (key === "glitchMapContrast" || key === "intensity" || key === "darkness") return [0, 10, 0.01];
	if (key === "scale") return [0.01, 10, 0.01];
	if (key === "noiseSampleRate" || key === "sampleRate") return [0.01, 1, 0.001];
	return [0, 1, 0.001];
}

/** Screen-space controls; settings are resolved from state on every read and write. */
export function mountPostFxControls(root: HTMLElement, state: PostFxState): { dispose(): void } {
	const listeners = new AbortController();
	const { signal } = listeners;
	const refreshers: (() => void)[] = [];
	const id = `noise-postfx-${++nextPanelId}`;
	const launch = document.createElement("button");
	launch.type = "button";
	launch.className = "noise-postfx-launch";
	launch.textContent = "后处理预览";
	launch.setAttribute("aria-controls", id);
	launch.setAttribute("aria-expanded", "false");
	const panel = document.createElement("section");
	panel.id = id;
	panel.className = "noise-postfx-panel";
	panel.hidden = true;
	panel.setAttribute("aria-labelledby", `${id}-title`);

	function button(label: string, action: () => void, container: HTMLElement): HTMLButtonElement {
		const node = document.createElement("button");
		node.type = "button";
		node.textContent = label;
		node.addEventListener("click", action, { signal });
		container.append(node);
		return node;
	}
	function sync(): void { for (const refresh of refreshers) refresh(); }
	function changed(): void {
		sync();
		root.dispatchEvent(new CustomEvent("noise-postfx-change"));
	}
	function checkbox(label: string, read: () => boolean, write: (value: boolean) => void, container: HTMLElement): void {
		const wrapper = document.createElement("label");
		wrapper.className = "noise-postfx-check";
		const input = document.createElement("input");
		input.type = "checkbox";
		input.addEventListener("change", () => { write(input.checked); changed(); }, { signal });
		wrapper.append(input, document.createTextNode(label));
		container.append(wrapper);
		refreshers.push(() => { input.checked = read(); });
	}
	function close(restoreFocus: boolean): void {
		panel.hidden = true;
		launch.setAttribute("aria-expanded", "false");
		if (restoreFocus && !launch.hidden) launch.focus({ preventScroll: true });
	}
	const header = document.createElement("header");
	header.className = "noise-postfx-heading";
	const title = document.createElement("h2");
	title.id = `${id}-title`;
	title.textContent = "后处理 · 本地调参";
	header.append(title);
	const closeButton = button("关闭", () => close(true), header);
	closeButton.setAttribute("aria-label", "关闭后处理面板");
	panel.append(header);
	const note = document.createElement("p");
	note.className = "noise-postfx-note";
	note.textContent = "已接入 ef32e4b 歌曲时间轴，Shader 仍为近似实现。自动模式随音乐暂停和跳转，以 bgAlpha 压暗博客底图（不压暗音符或面板）；无音乐入口使用手动基准值。打开面板不会自动启用效果。素材仅限本地预览。";
	panel.append(note);
	checkbox("启用后处理（默认关闭）", () => state.enabled, value => { state.enabled = value; }, panel);
	checkbox("跟随音乐时间轴（默认开启）", () => state.followTimeline, value => { state.followTimeline = value; }, panel);
	checkbox("Grid · 手动叠层（调整后退出自动）", () => state.grid, value => { state.grid = value; state.followTimeline = false; }, panel);
	const actions = document.createElement("div");
	actions.className = "noise-postfx-actions";
	const ab = button("", () => { state.enabled = !state.enabled; changed(); }, actions);
	refreshers.push(() => {
		ab.textContent = state.enabled ? "A/B：效果中 → 看原图" : "A/B：原图中 → 看效果";
		ab.setAttribute("aria-pressed", String(state.enabled));
	});
	button("重置参考值", () => { resetPostFxState(state); changed(); }, actions);
	button("手动预览：Glitch 脉冲", () => {
		state.enabled = true;
		state.settings.Glitch.enabled = 1;
		state.glitchTrigger = performance.now() / 1000;
		changed();
	}, actions);
	button("手动预览：Slash 脉冲", () => {
		state.enabled = true;
		state.settings.DimensionSlash.enabled = 1;
		state.slashTrigger = performance.now() / 1000;
		changed();
	}, actions);
	panel.append(actions);
	const triggerNote = document.createElement("p");
	triggerNote.className = "noise-postfx-note";
	triggerNote.textContent = "下方参数为手动基准值，调整数值将退出自动模式；逐通道开关和手动脉冲仍可与时间轴叠加。重置恢复时间轴模式，保留总开关。冻结阶段仅近似冻结噪声运动，复位值尚待确认。";
	panel.append(triggerNote);

	function field(pass: PostFxPass, path: Path, container: HTMLElement): void {
		// Resolve each path afresh because reset replaces the whole settings object.
		function slot(): { object: Record<string | number, unknown>; key: string | number } {
			let object: unknown = state.settings[pass];
			for (const key of path.slice(0, -1)) object = (object as Record<string | number, unknown>)[key];
			return { object: object as Record<string | number, unknown>, key: path[path.length - 1] };
		}
		const row = document.createElement("div");
		row.className = "noise-postfx-field";
		const label = document.createElement("label");
		const fieldId = `${id}-field-${refreshers.length}`;
		label.htmlFor = fieldId;
		label.textContent = path.map(key => typeof key === "number" ? String(key + 1) : key).join(" · ")
			+ (["LineDirection", "Direction"].includes(String(path[path.length - 1])) ? "（度）" : "");
		const range = document.createElement("input");
		range.type = "range";
		range.id = fieldId;
		const number = document.createElement("input");
		number.type = "number";
		number.setAttribute("aria-label", `${pass} ${label.textContent} 精确值`);
		const output = document.createElement("output");
		output.htmlFor = fieldId;
		output.setAttribute("aria-live", "off");
		const [min, max, step] = boundsFor(pass, path);
		for (const input of [range, number]) {
			input.min = String(min);
			input.max = String(max);
			input.step = String(step);
			input.addEventListener("input", () => {
				if (!Number.isFinite(input.valueAsNumber)) return;
				const value = Math.min(max, Math.max(min, input.valueAsNumber));
				const current = slot();
				current.object[current.key] = value;
				state.followTimeline = false;
				changed();
			}, { signal });
		}
		// Do not rewrite a focused number field on every keystroke: that would
		// erase intermediate decimal points and minus signs during normal typing.
		number.addEventListener("change", () => {
			const current = slot();
			number.value = String(current.object[current.key]);
		}, { signal });
		refreshers.push(() => {
			const current = slot();
			const value = Number(current.object[current.key]);
			range.value = String(value);
			if (document.activeElement !== number) number.value = String(value);
			output.value = Number(value.toPrecision(5)).toString();
		});
		row.append(label, output, range, number);
		container.append(row);
	}
	function fields(pass: PostFxPass, value: unknown, path: Path, container: HTMLElement): void {
		if (typeof value === "number") { field(pass, path, container); return; }
		if (!value || typeof value !== "object") return;
		const group = document.createElement("fieldset");
		const legend = document.createElement("legend");
		const key = path[path.length - 1];
		legend.textContent = typeof key === "number" ? `Slash ${key + 1}` : String(key);
		group.append(legend);
		container.append(group);
		for (const [key, child] of Object.entries(value)) {
			fields(pass, child, [...path, Array.isArray(value) ? Number(key) : key], group);
		}
	}
	for (const pass of postFxOrder) {
		const details = document.createElement("details");
		const summary = document.createElement("summary");
		summary.textContent = pass;
		details.append(summary);
		checkbox(`启用 ${pass}`, () => state.settings[pass].enabled !== 0, value => { state.settings[pass].enabled = value ? 1 : 0; }, details);
		const advanced = document.createElement("details");
		advanced.className = "noise-postfx-advanced";
		const advancedSummary = document.createElement("summary");
		advancedSummary.textContent = "高级 · 向量 / 颜色 / 其他参数";
		advanced.append(advancedSummary);
		for (const [key, value] of Object.entries(state.settings[pass])) {
			if (key === "enabled") continue;
			if (typeof value === "string") {
				const asset = document.createElement("p");
				asset.className = "noise-postfx-note";
				asset.textContent = `${key}: ${value}（本地素材）`;
				advanced.append(asset);
			} else fields(pass, value, [key], mainFields[pass].includes(key) ? details : advanced);
		}
		details.append(advanced);
		panel.append(details);
	}
	root.append(launch, panel);
	launch.addEventListener("click", () => {
		if (!panel.hidden) { close(true); return; }
		sync();
		panel.hidden = false;
		launch.setAttribute("aria-expanded", "true");
		closeButton.focus({ preventScroll: true });
	}, { signal });
	// Capture before the performance's document shortcuts, without trapping Tab.
	window.addEventListener("keydown", event => {
		if (event.key !== "Escape" || panel.hidden) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		close(panel.contains(document.activeElement));
	}, { capture: true, signal });
	root.addEventListener("noise-postfx-change", sync, { signal });
	function updateVisibility(): void {
		const visible = ["playing", "paused", "ended"].includes(root.dataset.state ?? "")
			|| root.dataset.nativeState === "active" || root.dataset.sceneState === "active";
		launch.hidden = !visible;
		if (!visible) close(false);
	}
	const observer = new MutationObserver(updateVisibility);
	observer.observe(root, { attributes: true, attributeFilter: ["data-state", "data-native-state", "data-scene-state"] });
	sync();
	updateVisibility();
	return { dispose(): void {
		listeners.abort();
		observer.disconnect();
		launch.remove();
		panel.remove();
	} };
}
