// Pure helpers for TFL record attachments (no browser or React needed, so they are unit-tested offline).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Owner key for a record, e.g. "locations:l1abc". */
export const ownerKey = (k: string, id: string) => `${k}:${id}`;

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Returns an error message, or "" when the file may be attached. */
export function checkFile(f: { name: string; size: number }): string {
  if (f.size <= 0) return `${f.name} is empty.`;
  if (f.size > MAX_FILE_BYTES) return `${f.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  return "";
}
