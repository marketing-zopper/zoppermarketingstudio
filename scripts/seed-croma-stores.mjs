// Idempotent import of supabase/seed/croma_stores.json into public.croma_stores.
//
//   node scripts/seed-croma-stores.mjs                      upsert every store (safe to re-run)
//   node scripts/seed-croma-stores.mjs --deactivate-missing also mark stores NOT in the file as inactive
//
// Needs FORM_SUPABASE_URL and FORM_SUPABASE_SERVICE_ROLE_KEY (read from the environment or .env.local).
// Feedback rows are never touched.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
try {
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#") && process.env[line.slice(0, i)] === undefined) process.env[line.slice(0, i)] = line.slice(i + 1);
  }
} catch {}

const URL_ = (process.env.FORM_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.FORM_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Set FORM_SUPABASE_URL and FORM_SUPABASE_SERVICE_ROLE_KEY (environment or .env.local).");
  process.exit(1);
}
const headers = {
  apikey: KEY,
  ...(KEY.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${KEY}` }),
  "Content-Type": "application/json",
};

const stores = JSON.parse(fs.readFileSync(path.join(root, "supabase", "seed", "croma_stores.json"), "utf8"));
if (!Array.isArray(stores) || !stores.length) throw new Error("Seed file is empty");

const rows = stores.map((s) => ({ ...s, is_active: true }));
for (let i = 0; i < rows.length; i += 200) {
  const res = await fetch(`${URL_}/rest/v1/croma_stores?on_conflict=store_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows.slice(i, i + 200)),
  });
  if (!res.ok) throw new Error(`Upsert failed (${res.status}): ${await res.text()}`);
}
console.log(`Upserted ${rows.length} stores.`);

if (process.argv.includes("--deactivate-missing")) {
  const keep = `(${stores.map((s) => s.store_id).join(",")})`;
  const res = await fetch(`${URL_}/rest/v1/croma_stores?store_id=not.in.${keep}&is_active=eq.true`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ is_active: false }),
  });
  if (!res.ok) throw new Error(`Deactivate failed (${res.status}): ${await res.text()}`);
  console.log(`Deactivated ${(await res.json()).length} stores that are no longer in the file.`);
}

const count = await fetch(`${URL_}/rest/v1/croma_stores?select=store_id&is_active=eq.true`, {
  headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
});
console.log(`Active stores in database: ${count.headers.get("content-range")?.split("/")[1]}`);
