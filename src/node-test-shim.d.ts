// Minimal Node typings for the file-reading tests only (the app itself never uses these).
declare module "node:fs" { export function readFileSync(path: string, encoding?: string): any; }
declare module "node:path" { export function resolve(...parts: string[]): string; export function dirname(p: string): string; }
declare module "node:url" { export function fileURLToPath(u: string | URL): string; }
declare const __dirname: string;
