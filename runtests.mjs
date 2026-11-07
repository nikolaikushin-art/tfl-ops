import { __results, __run } from "./tsshim/vitest-standin.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "src/lib");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.ts")).sort();
const skipped = [];
for (const f of files) {
  try { await import(path.join(dir, f)); }
  catch (e) { skipped.push([f, e.message.split("\n")[0]]); }
}
await __run();
console.log(`\n${"=".repeat(60)}`);
console.log(`PASS ${__results.pass}   FAIL ${__results.fail}   files ${files.length - skipped.length}/${files.length}`);
console.log("=".repeat(60));
if (skipped.length) { console.log("\nCould not load:"); skipped.forEach(([f, m]) => console.log(`  ! ${f}: ${m}`)); }
if (__results.failures.length) {
  console.log("\nFAILURES:");
  __results.failures.forEach((x) => console.log(`\n  ✗ ${x.full}\n    ${x.msg}${x.assert ? "" : "\n    [non-assertion error]"}`));
}
