import { describe, it, expect } from "vitest";
import { formatSize, ownerKey, checkFile, MAX_FILE_BYTES } from "./attachments";

describe("attachments", () => {
  it("formats sizes", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
  it("builds an owner key from module and id", () => {
    expect(ownerKey("locations", "l1")).toBe("locations:l1");
  });
  it("accepts normal files and rejects empty or oversized ones", () => {
    expect(checkFile({ name: "a.pdf", size: 1000 })).toBe("");
    expect(checkFile({ name: "a.pdf", size: MAX_FILE_BYTES })).toBe("");
    expect(checkFile({ name: "big.pdf", size: MAX_FILE_BYTES + 1 })).toMatch(/larger than 10 MB/);
    expect(checkFile({ name: "e.txt", size: 0 })).toMatch(/empty/);
  });
});
