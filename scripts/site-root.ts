import { existsSync } from "node:fs";

/**
 * 构建产物根目录。
 *
 * 噪域实例输出到 dist-noise；普通博客输出到 dist。
 * Cloudflare adapter 的静态资源位于输出目录的 client 子目录。
 */
export function resolveSiteRoot(): string {
	const outDir = process.env.CRYSTARIN_BUILD === "noise" ? "dist-noise" : "dist";
	return existsSync(`${outDir}/client`) ? `${outDir}/client` : outDir;
}
