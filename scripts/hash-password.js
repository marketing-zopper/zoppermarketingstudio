// Usage: npm run hash-password -- "<your admin password>"
// Prints values to paste into Vercel -> Project Settings -> Environment Variables.
import crypto from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: npm run hash-password -- "<password of at least 10 characters>"');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt.toString("base64")}:${hash.toString("base64")}`);
console.log(`SESSION_SECRET=${crypto.randomBytes(48).toString("base64url")}`);
