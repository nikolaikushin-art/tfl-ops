// Usage: node tools/hash-password.mjs "the password"   → prints a scrypt hash for TFL_USERS
import { randomBytes, scryptSync } from "node:crypto";
const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error("Give a password of at least 10 characters."); process.exit(1); }
const salt = randomBytes(16);
console.log(`scrypt$16384$${salt.toString("hex")}$${scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex")}`);
