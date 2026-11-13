// RBAC schema migration: pre-RBAC employee records -> `roles` schema (see api/_lib/employees.js).
//
//   node scripts/migrate-rbac.mjs                  DRY RUN (default): prints what would change, writes nothing
//   node scripts/migrate-rbac.mjs --apply          takes a backup, then rewrites only the records that change
//   node scripts/migrate-rbac.mjs --rollback <id>  restores the employee records saved in backup <id>
//
// Safe by design:
//   * additive — every field already on a record is kept; `roles` and `rbacVersion` are added
//   * legacy `permissions` / `toolRoles` stay on the record, kept in sync, so the previous build still works
//   * idempotent — records that are already current are left alone
//   * a Yes/No permission converts to the LOWEST role available by default; nothing
//     is ever raised to Admin
//   * the app also reads un-migrated records correctly, so running this is not required for the app to work —
//     it exists so every record carries `roles` for other tools reading Upstash
//
// Run it AFTER the new build is deployed (an older build would not keep `roles` up to date).
// Uses KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*), read from the environment or .env.local.
// `--local` targets the dev file store (.data/db.json) instead of Redis.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#") && process.env[l.slice(0, i)] === undefined) process.env[l.slice(0, i)] = l.slice(i + 1);
  }
}

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
if (flag("--local")) for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
const hasRedis = !!((process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN));
if (!hasRedis && !flag("--local")) {
  console.error("No Upstash Redis credentials found. Set them (or .env.local), or pass --local to use .data/db.json.");
  process.exit(2);
}

const lib = (p) => import(pathToFileURL(path.join(root, p)).href);
const store = await lib("api/_lib/store.js");
const { normalize, toRecord } = await lib("api/_lib/employees.js");
const { TOOLS_META } = await lib("shared/toolsMeta.js");
const { ROLE_LABEL } = await lib("shared/rbac.js");

const target = hasRedis ? "Upstash Redis" : "local file store (.data/db.json)";
const title = (id) => TOOLS_META.find((t) => t.id === id)?.title || id;

// ---------- rollback ----------
const rb = args.indexOf("--rollback");
if (rb !== -1) {
  const id = args[rb + 1];
  if (!id) { console.error("Usage: --rollback <backup id>"); process.exit(2); }
  const backup = (await store.readBackup(id)) || tryFile(id);
  if (!backup) { console.error(`Backup "${id}" not found in ${target} or .data/backups/.`); process.exit(1); }
  for (const emp of backup.employees) await store.saveEmployee(emp);
  await store.addLogs([{ type: "rbac_migrated", actor: "migrate-rbac", target: "RBAC schema", detail: `Rolled back ${backup.employees.length} employee record(s) from backup ${id}` }]);
  console.log(`Restored ${backup.employees.length} employee record(s) from backup ${id} (${target}).`);
  console.log("Employees added after the backup were not touched. Settings were not touched.");
  process.exit(0);
}
function tryFile(id) {
  const f = path.join(root, ".data", "backups", `${id}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}

// ---------- plan ----------
const raws = (await store.listEmployees()).sort((a, b) => a.email.localeCompare(b.email));
const plan = raws.map((raw) => {
  const emp = normalize(raw);
  const next = toRecord(emp);
  return { raw, emp, next, changed: JSON.stringify(next) !== JSON.stringify(raw) };
});
const todo = plan.filter((p) => p.changed);

console.log(`Target: ${target}`);
console.log(`Employees: ${plan.length} · to migrate: ${todo.length} · already current: ${plan.length - todo.length}\n`);
for (const p of plan) {
  if (!p.changed) { console.log(`= ${p.raw.email}  (already current)`); continue; }
  console.log(`~ ${p.raw.email}${p.raw.active ? "" : "  [inactive]"}`);
  for (const t of TOOLS_META) {
    const before = t.internal ? `role: ${p.raw.toolRoles?.[t.id] ?? "(none)"}` : `permission: ${p.raw.permissions?.[t.id] === true ? "Yes" : "No"}`;
    console.log(`    ${title(t.id).padEnd(26)} ${before.padEnd(22)} -> ${ROLE_LABEL[p.emp.roles[t.id]]}`);
  }
}

if (!flag("--apply")) {
  console.log("\nDRY RUN — nothing was written. Re-run with --apply to migrate.");
  process.exit(0);
}
if (!todo.length) { console.log("\nNothing to do."); process.exit(0); }

// ---------- apply ----------
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "Z");
const backupId = `rbac-${stamp}`;
const snapshot = { id: backupId, takenAt: new Date().toISOString(), target, employees: raws, settings: await store.getSettings() };
const dir = path.join(root, ".data", "backups");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${backupId}.json`), JSON.stringify(snapshot, null, 2));
await store.writeBackup(backupId, snapshot); // also kept in Upstash (zms:backup:<id>)
console.log(`\nBackup written: ${backupId}  (Upstash key zms:backup:${backupId} and .data/backups/${backupId}.json)`);

for (const p of todo) await store.saveEmployee(p.next);
await store.addLogs([{ type: "rbac_migrated", actor: "migrate-rbac", target: "RBAC schema", detail: `Migrated ${todo.length} employee record(s) to roles schema. Backup: ${backupId}` }]);
console.log(`Migrated ${todo.length} record(s). To undo: node scripts/migrate-rbac.mjs --rollback ${backupId}`);
