import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access, cp, mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { collectSceneLayers } from "../src-noise/engine/scene-layout.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "public/noise-scene");
const dist = path.join(root, "dist-noise");
const gutter = 24;
const mimeTypes = {
	".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
	".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif",
	".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
	".ttf": "font/ttf", ".otf": "font/otf", ".ogg": "audio/ogg",
	".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
	".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8",
};

function viewports() {
	const values = (process.env.CAPTURE_VIEWPORTS ?? "1280x900,1440x900,1920x1080,2048x1162").split(",");
	return [...new Set(values.map(value => value.trim()))].map(value => {
		const match = /^(\d+)x(\d+)$/.exec(value);
		if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) {
			throw new Error(`Invalid CAPTURE_VIEWPORTS entry: ${value}`);
		}
		return { width: Number(match[1]), height: Number(match[2]) };
	});
}

async function serveDist() {
	const directory = await realpath(dist);
	const inside = filename => filename === directory || filename.startsWith(`${directory}${path.sep}`);
	const server = createServer(async (request, response) => {
		try {
			if (request.method !== "GET" && request.method !== "HEAD") {
				response.writeHead(405, { Allow: "GET, HEAD" }).end();
				return;
			}
			const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
			let filename = path.resolve(directory, `.${pathname}`);
			if (!inside(filename)) {
				response.writeHead(403).end();
				return;
			}
			if ((await stat(filename)).isDirectory()) filename = path.join(filename, "index.html");
			filename = await realpath(filename);
			if (!inside(filename)) {
				response.writeHead(403).end();
				return;
			}
			const info = await stat(filename);
			if (!info.isFile()) {
				response.writeHead(404).end();
				return;
			}
			response.writeHead(200, {
				"Content-Type": mimeTypes[path.extname(filename).toLowerCase()] ?? "application/octet-stream",
				"Content-Length": info.size,
				"Cache-Control": "no-store",
			});
			if (request.method === "HEAD") response.end();
			else createReadStream(filename).on("error", () => response.destroy()).pipe(response);
		} catch (error) {
			response.writeHead(error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 400).end();
		}
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function readyScene(page) {
	await page.waitForFunction(() => document.getElementById("noise-experience")?.dataset.mounted === "true");
	if (await page.locator("#noise-dismiss").count()) {
		await page.locator("#noise-dismiss").click();
	} else {
		// Production has no browse button. Capture only its underlying blog source,
		// in an isolated headless page without the experimental drawable API.
		await page.evaluate(() => {
			document.getElementById("noise-experience").hidden = true;
			document.documentElement.dataset.noiseSurface = "performance";
		});
	}
	await page.addStyleTag({ content: `
		html { scroll-behavior: auto !important; }
		*, *::before, *::after {
			animation-play-state: paused !important;
			transition: none !important;
			caret-color: transparent !important;
		}
	` });
	await page.evaluate(async () => {
		for (const media of document.querySelectorAll("audio, video")) {
			media.muted = true;
			media.pause();
		}
		await document.fonts.ready;
		// Visit the entire document so loading="lazy" covers and intersection-based
		// content settle before collecting geometry. Keep the real scrollbars intact.
		for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(1, innerHeight / 2)) {
			scrollTo(0, y);
			await new Promise(resolve => setTimeout(resolve, 80));
		}
		scrollTo(0, 0);
	});
	await page.evaluate(async () => {
		await Promise.all([...document.images].map(async image => {
			// Scrolling has requested lazy resources; explicitly finish any still pending.
			image.loading = "eager";
			if (!image.complete) await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error(`Image load timed out: ${image.currentSrc || image.src}`)), 30000);
				const finish = () => { clearTimeout(timeout); resolve(); };
				image.addEventListener("load", finish, { once: true });
				image.addEventListener("error", finish, { once: true });
			});
			if ((image.currentSrc || image.src) && !image.naturalWidth) {
				throw new Error(`Image failed to load: ${image.currentSrc || image.src}`);
			}
			if (image.naturalWidth) await image.decode();
		}));
		await document.fonts.ready;
		for (const animation of document.getAnimations()) {
			if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
			animation.pause();
		}
		scrollTo(0, 0);
		await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
}

async function capturePreset(browser, url, viewport, theme) {
	const preset = `${viewport.width}x${viewport.height}-${theme}`;
	const directory = path.join(output, preset);
	await mkdir(directory, { recursive: true });
	const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme });
	try {
		// Layout.astro reads this exact key before first paint and resolves the .dark class.
		await context.addInitScript(value => localStorage.setItem("theme", value), theme);
		const page = await context.newPage();
		page.setDefaultTimeout(60000);
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
		await page.waitForFunction(value => document.documentElement.classList.contains("dark") === (value === "dark"), theme);
		await readyScene(page);
		const scene = await page.evaluate(source => {
			const collect = (0, eval)(`(${source})`);
			const layers = collect();
			if (!layers.length) throw new Error("No homepage scene layers found");
			window.__noiseCaptureLayers = layers;
			return {
				layoutWidth: document.documentElement.getBoundingClientRect().width,
				background: [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).backgroundColor]
					.find(color => color !== "transparent" && color !== "rgba(0, 0, 0, 0)") ?? "transparent",
				ids: layers.map(layer => layer.id),
			};
		}, collectSceneLayers.toString());
		// Ancestors stay in layout but invisible: showing only the target subtree
		// preserves its own pixels without leaking ancestor/sibling backgrounds.
		// Backdrop filters cannot reproduce other layers once those layers are hidden.
		// JS-driven banner text is a capture-time snapshot, not a live text animation.
		await page.addStyleTag({ content: `
			html, body { background: transparent !important; }
			body * { visibility: hidden !important; }
			body [data-noise-capture-target], body [data-noise-capture-target] * {
				visibility: visible !important;
			}
		` });
		const layers = [];
		for (const id of scene.ids) {
			const geometry = await page.evaluate(({ id, gutter }) => {
				for (const previous of document.querySelectorAll("[data-noise-capture-target]")) previous.removeAttribute("data-noise-capture-target");
				const source = window.__noiseCaptureLayers.find(layer => layer.id === id).element;
				const top = source.getBoundingClientRect().top;
				scrollTo(0, id.startsWith("navbar-") || id.startsWith("wallpaper-") ? 0 : scrollY + top - gutter);
				const target = window.__noiseCaptureLayers.find(layer => layer.id === id).element;
				target.setAttribute("data-noise-capture-target", "");
				const rect = target.getBoundingClientRect();
				const x = Math.max(0, Math.floor(rect.left - gutter));
				const y = Math.max(0, Math.floor(rect.top - gutter));
				const right = Math.min(document.documentElement.getBoundingClientRect().width, Math.ceil(rect.right + gutter));
				const bottom = Math.min(innerHeight, Math.ceil(rect.bottom + gutter));
				if (rect.top < -0.5 || rect.bottom > innerHeight + 0.5 || right <= x || bottom <= y) {
					throw new Error(`Layer does not fit the capture viewport: ${id}`);
				}
				return {
					clip: { x, y, width: right - x, height: bottom - y },
					elementWidth: rect.width, elementHeight: rect.height,
					insetLeft: rect.left - x, insetTop: rect.top - y,
				};
			}, { id, gutter });
			// Scroll each independent layer into the unchanged viewport. Full-page and
			// captureBeyondViewport screenshots change vw sizing in Chromium.
			const pixels = await page.screenshot({
				path: path.join(directory, `${id}.png`), type: "png",
				omitBackground: true, clip: geometry.clip, scale: "css",
			});
			const stats = await sharp(pixels).stats();
			if (stats.channels.length === 4 && stats.channels[3].max === 0) {
				throw new Error(`Captured an empty homepage layer: ${id}`);
			}
			layers.push({
				id, url: `/noise-scene/${preset}/${id}.png`,
				width: geometry.clip.width, height: geometry.clip.height,
				elementWidth: geometry.elementWidth, elementHeight: geometry.elementHeight,
				insetLeft: geometry.insetLeft, insetTop: geometry.insetTop,
			});
		}
		const finalWidth = await page.evaluate(() => document.documentElement.getBoundingClientRect().width);
		if (finalWidth !== scene.layoutWidth) throw new Error(`Layout width changed during capture: ${scene.layoutWidth} -> ${finalWidth}`);
		const manifest = { version: 1, viewport: { ...viewport, layoutWidth: scene.layoutWidth }, theme, background: scene.background, layers };
		const filename = path.join(directory, "manifest.json");
		await writeFile(filename, `${JSON.stringify(manifest, null, 2)}\n`);
		console.log(`${preset}: ${layers.length} layers, layout width ${scene.layoutWidth}; ${filename}`);
		return { ...viewport, theme, url: `/noise-scene/${preset}/manifest.json` };
	} finally {
		await context.close();
	}
}

let browser;
let server;
try {
	const sizes = viewports();
	let url = process.env.BASE_URL;
	if (!url) ({ server, url } = await serveDist());
	browser = await chromium.launch({
		executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
		headless: !/^(0|false|no)$/i.test(process.env.HEADLESS ?? "true"),
		ignoreDefaultArgs: ["--hide-scrollbars"],
		args: ["--autoplay-policy=user-gesture-required"],
	});
	await rm(output, { recursive: true, force: true });
	await mkdir(output, { recursive: true });
	const presets = [];
	for (const viewport of sizes) {
		for (const theme of ["light", "dark"]) presets.push(await capturePreset(browser, url, viewport, theme));
	}
	const filename = path.join(output, "index.json");
	await writeFile(filename, `${JSON.stringify({ version: 1, presets }, null, 2)}\n`);
	let hasDist = false;
	try { await access(dist); hasDist = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
	if (hasDist) {
		const destination = path.join(dist, "noise-scene");
		await rm(destination, { recursive: true, force: true });
		await cp(output, destination, { recursive: true });
		console.log(`Copied scene assets to ${destination}`);
	}
	console.log(`${presets.length} presets; ${filename}`);
	console.log("Capture limits: backdrop filters omit hidden layers; dynamic banner text is a frozen snapshot. Runtime supports only matching viewport/layout width and theme.");
} finally {
	try { await browser?.close(); }
	finally {
		if (server) await new Promise((resolve, reject) => {
			server.close(error => error ? reject(error) : resolve());
			server.closeAllConnections();
		});
	}
}
