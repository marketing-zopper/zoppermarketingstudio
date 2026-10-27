// Single place that decides "who is this and are they approved?" — always from Redis, never cached.
import { ADMIN_EMAIL, getUserSession } from "./auth.js";
import { getEmployee } from "./store.js";
import { normalize } from "./employees.js";

export async function resolveUser(req) {
  const session = getUserSession(req);
  if (!session) return { state: "signed_out" };
  const { email } = session;

  // The designated administrator is always approved, with or without an employee record.
  const isAdmin = email === ADMIN_EMAIL;
  const record = await getEmployee(email); // throws StoreUnavailable if Redis is down
  const employee = record ? normalize(record) : null;
  if (isAdmin) return { state: "ok", email, isAdmin, employee };

  if (!employee) return { state: "denied", email, reason: "not_registered" };
  if (!employee.active) return { state: "denied", email, reason: "inactive" };
  return { state: "ok", email, isAdmin, employee };
}

// Google claims must all hold; this is the only gate to getting a session cookie.
export function checkGoogleClaims(claims, allowedDomain) {
  const email = String(claims?.email || "").toLowerCase();
  if (claims?.email_verified !== true) return "unverified";
  if (claims?.hd !== allowedDomain || !email.endsWith(`@${allowedDomain}`)) return "domain";
  return null;
}
