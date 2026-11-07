declare module "vitest" {
  export const describe: (n: string, f: () => void) => void;
  export const it: (n: string, f: () => void) => void;
  export const expect: any;
}
