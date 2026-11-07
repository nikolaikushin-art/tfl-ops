import assert from "node:assert";
export const __results = { pass: 0, fail: 0, failures: [] };
let stack = [];
const pending = [];
export function describe(name, fn) { stack.push(name); try { fn(); } finally { stack.pop(); } }
export function it(name, fn) { const full = [...stack, name].join(" > "); pending.push({ full, fn }); }
export const test = it;
export async function __run() {
  for (const { full, fn } of pending.splice(0)) {
    try { await fn(); __results.pass++; }
    catch (e) { __results.fail++; __results.failures.push({ full, msg: String(e.message).split("\n").slice(0, 3).join(" "), assert: e instanceof assert.AssertionError }); }
  }
}
const AC = Symbol("ac");
export function expect(actual) {
  const mk = (neg) => {
    const chk = (ok, msg) => { if (neg ? ok : !ok) throw new assert.AssertionError({ message: (neg ? "NOT " : "") + msg }); };
    const j = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
    return {
      toBe: (e) => chk(Object.is(actual, e), `expected ${j(actual)} toBe ${j(e)}`),
      toEqual: (e) => { if (e && e[AC]) { chk(Array.isArray(actual) && e[AC].every((x) => actual.some((y) => Object.is(x, y))), `expected ${j(actual)} arrayContaining ${j(e[AC])}`); return; } let ok = true; try { assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(e))); } catch { ok = false; } chk(ok, `expected ${j(actual)} toEqual ${j(e)}`); },
      toMatchObject: (e) => { const m = (a, b) => b && b[AC] ? Array.isArray(a) && b[AC].every((x) => a.some((y) => m(y, x))) : b && typeof b === "object" ? a && typeof a === "object" && Object.keys(b).every((k) => m(a[k], b[k])) : Object.is(a, b); chk(m(actual, e), `expected ${j(actual)} toMatchObject ${j(e)}`); },
      toContain: (e) => chk(actual != null && (typeof actual === "string" ? actual.includes(e) : [...actual].includes(e)), `expected ${j(actual)} toContain ${j(e)}`),
      toHaveLength: (n) => chk(actual?.length === n, `expected length ${actual?.length} toBe ${n}`),
      toBeNull: () => chk(actual === null, `expected ${j(actual)} null`),
      toBeUndefined: () => chk(actual === undefined, `expected ${j(actual)} undefined`),
      toBeDefined: () => chk(actual !== undefined, `expected defined`),
      toBeTruthy: () => chk(!!actual, `expected truthy ${j(actual)}`),
      toBeFalsy: () => chk(!actual, `expected falsy ${j(actual)}`),
      toBeGreaterThan: (e) => chk(actual > e, `expected ${actual} > ${e}`),
      toBeGreaterThanOrEqual: (e) => chk(actual >= e, `expected ${actual} >= ${e}`),
      toBeLessThan: (e) => chk(actual < e, `expected ${actual} < ${e}`),
      toBeLessThanOrEqual: (e) => chk(actual <= e, `expected ${actual} <= ${e}`),
      toBeCloseTo: (e, d = 2) => chk(Math.abs(actual - e) < Math.pow(10, -d) / 2, `expected ${actual} close to ${e}`),
      toMatch: (re) => chk(re.test(actual), `expected ${j(actual)} toMatch ${re}`),
    };
  };
  const o = mk(false); o.not = mk(true); return o;
}
expect.arrayContaining = (arr) => ({ [AC]: arr });
