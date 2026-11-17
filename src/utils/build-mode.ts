// Astro config reads the environment directly; Vite replaces this value in browser bundles.
export const isNoiseBuild: boolean = process.env.CRYSTARIN_BUILD === "noise";
