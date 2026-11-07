import { pathToFileURL } from "node:url";
import fs from "node:fs";
const ROOT = new URL("./", import.meta.url).href;
const tryExt = (base) => {
  for (const c of [base, base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"]) {
    try { if (fs.statSync(new URL(c)).isFile()) return c; } catch {}
  }
  return null;
};
export function resolve(spec, ctx, next) {
  if (spec === "vitest") return { url: new URL("./tsshim/vitest-standin.mjs", import.meta.url).href, shortCircuit: true };
  if (spec.startsWith("@/")) {
    const hit = tryExt(ROOT + "src/" + spec.slice(2));
    if (hit) return { url: hit, shortCircuit: true };
  }
  if (spec.startsWith(".")) {
    const base = new URL(spec, ctx.parentURL).href;
    const hit = tryExt(base);
    if (hit) return { url: hit, shortCircuit: true };
  }
  return next(spec, ctx);
}
