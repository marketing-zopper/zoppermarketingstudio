// Persistence layer.
// Production: Upstash Redis (REST). Add the "Upstash Redis" integration from the
//   Vercel Marketplace; it injects KV_REST_API_URL / KV_REST_API_TOKEN
//   (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are also accepted).
// Local dev without Redis: a JSON file in .data/ (never used on Vercel).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const REDIS_URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const EMP_KEY = "zms:employees"; // hash: email -> JSON
const LOG_KEY = "zms:logs"; // list, newest first
const MAX_LOGS = 1000;

export class StoreUnavailable extends Error {}

async function redis(command) {
  const res = await fetch(REDIS_URL(), {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN()}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `Redis error ${res.status}`);
  return body.result;
}

// ---- local file fallback (dev only) ----
const FILE = path.join(process.cwd(), ".data", "db.json");
function readFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { employees: {}, logs: [], counters: {} };
  }
}
function writeFile(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function mode() {
  if (REDIS_URL() && REDIS_TOKEN()) return "redis";
  if (process.env.VERCEL) {
    throw new StoreUnavailable(
      "Database is not configured. Connect an Upstash Redis store to this Vercel project."
    );
  }
  return "file";
}

export async function listEmployees() {
  if (mode() === "redis") {
    const flat = (await redis(["HGETALL", EMP_KEY])) || [];
    const out = [];
    for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]));
    return out;
  }
  return Object.values(readFile().employees);
}

export async function getEmployee(email) {
  if (mode() === "redis") {
    const raw = await redis(["HGET", EMP_KEY, email]);
    return raw ? JSON.parse(raw) : null;
  }
  return readFile().employees[email] || null;
}

export async function saveEmployee(emp) {
  if (mode() === "redis") {
    await redis(["HSET", EMP_KEY, emp.email, JSON.stringify(emp)]);
    return;
  }
  const db = readFile();
  db.employees[emp.email] = emp;
  writeFile(db);
}

export async function addLog(entry) {
  const log = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
  if (mode() === "redis") {
    await redis(["LPUSH", LOG_KEY, JSON.stringify(log)]);
    await redis(["LTRIM", LOG_KEY, 0, MAX_LOGS - 1]);
    return log;
  }
  const db = readFile();
  db.logs.unshift(log);
  db.logs = db.logs.slice(0, MAX_LOGS);
  writeFile(db);
  return log;
}

export async function listLogs(limit = 200) {
  if (mode() === "redis") {
    return ((await redis(["LRANGE", LOG_KEY, 0, limit - 1])) || []).map((r) => JSON.parse(r));
  }
  return readFile().logs.slice(0, limit);
}

// Fixed-window counter used for login throttling.
export async function bumpCounter(key, windowSeconds) {
  if (mode() === "redis") {
    const n = await redis(["INCR", key]);
    if (n === 1) await redis(["EXPIRE", key, windowSeconds]);
    return n;
  }
  const db = readFile();
  const now = Date.now();
  const c = db.counters?.[key];
  const fresh = !c || c.expires < now;
  const n = fresh ? 1 : c.n + 1;
  db.counters = { ...(db.counters || {}), [key]: { n, expires: fresh ? now + windowSeconds * 1000 : c.expires } };
  writeFile(db);
  return n;
}

export async function resetCounter(key) {
  if (mode() === "redis") {
    await redis(["DEL", key]);
    return;
  }
  const db = readFile();
  if (db.counters) delete db.counters[key];
  writeFile(db);
}
