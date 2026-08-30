// Generates the ADMIN_PASSWORD_SALT / ADMIN_PASSWORD_HASH pair for .env.local.
// Usage: npx tsx scripts/hashPassword.ts "new-password-here"
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npx tsx scripts/hashPassword.ts "password-baru"');
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");

console.log(`ADMIN_PASSWORD_SALT=${salt}`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
