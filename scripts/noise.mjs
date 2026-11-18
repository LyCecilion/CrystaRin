import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "preview"].includes(command)) {
	console.error("Usage: node scripts/noise.mjs <dev|build|preview> [Astro options]");
	process.exit(1);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
// Keep these target-specific servers in the foreground, including when launched by an agent.
const env = {
	...process.env,
	CRYSTARIN_BUILD: "noise",
	ASTRO_DEV_BACKGROUND: "1",
	ASTRO_PREVIEW_BACKGROUND: "1",
};

function run(packageName, args) {
	const manifestPath = require.resolve(`${packageName}/package.json`);
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin[packageName];
	const result = spawnSync(process.execPath, [path.resolve(path.dirname(manifestPath), bin), ...args], {
		cwd: root,
		env,
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

if (command === "build") {
	run("tsx", ["scripts/generate-github-card-data.ts"]);
	run("tsx", ["scripts/generate-lqips.ts"]);
}

run("astro", [command, ...(command === "build" ? ["--force"] : ["--ignore-lock"]), ...args]);

if (command === "build") {
	run("tsx", ["scripts/prune-pio-assets.ts"]);
	run("tsx", ["scripts/subset-fonts.ts"]);
	run("tsx", ["scripts/minify-inline-scripts.ts"]);
	run("tsx", ["scripts/run-pagefind.ts"]);
	// License/provenance travel with the executable; ordinary blog builds stay MIT.
	for (const name of ["LICENSE", "NOTICE"]) {
		copyFileSync(path.join(root, "src-noise", name), path.join(root, "dist-noise", `NOISE-${name}`));
	}
	copyFileSync(path.join(root, "src-noise", "signal", "LICENSE"), path.join(root, "dist-noise", "SIGNAL-LICENSE"));
	copyFileSync(path.join(root, "src-noise", "signal", "NOTICE.txt"), path.join(root, "dist-noise", "SIGNAL-NOTICE"));
	copyFileSync(path.join(root, "src-noise", "signal", "assets", "OFL.txt"), path.join(root, "dist-noise", "SIGNAL-FONT-LICENSE"));
}
