// Converts the Croma workbook into supabase/seed/croma_stores.json.
//
//   node scripts/build-croma-stores.mjs "C:/path/to/Croma_Store_Addresses.xlsx"
//
// - "Total" is the canonical store list (542 unique stores).
// - "Where we can Deliver" / "Direct to Store" only supply the optional store_category.
// - Internal columns (POC, contact number, email, sales team address, ...) are deliberately NOT
//   read into the output, so they can never reach the database or the public site.
import fs from "node:fs";
import path from "node:path";
import readXlsxFile from "read-excel-file/node";

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/build-croma-stores.mjs "<path to Croma_Store_Addresses.xlsx>"');
  process.exit(1);
}

const sheets = Object.fromEntries((await readXlsxFile(file)).map((s) => [s.sheet, s.data]));

// Header row is the first row that contains "Store ID".
function table(name) {
  const data = sheets[name];
  if (!data) throw new Error(`Worksheet "${name}" not found`);
  const h = data.findIndex((r) => r.includes("Store ID"));
  const head = data[h];
  return data
    .slice(h + 1)
    .filter((r) => r.some((v) => v != null && String(v).trim() !== ""))
    .map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

const clean = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || s === "#N/A" ? null : s;
};

const ids = (rows) => new Set(rows.map((r) => clean(r["Store ID"])));
const deliver = ids(table("Where we can Deliver"));
const direct = ids(table("Direct to Store"));

const seen = new Set();
const stores = [];
for (const r of table("Total")) {
  const store_id = clean(r["Store ID"]);
  if (!/^A\d{3}$/.test(store_id || "")) throw new Error(`Bad Store ID: ${store_id}`);
  if (seen.has(store_id)) throw new Error(`Duplicate Store ID: ${store_id}`);
  seen.add(store_id);
  stores.push({
    store_id,
    store_name: clean(r["Store Name"]),
    state: clean(r["State"]),
    store_address: clean(r["Store Address"]),
    croma_website_name: clean(r["Store Name on Croma Website"]),
    store_category: deliver.has(store_id) ? "where_we_can_deliver" : direct.has(store_id) ? "direct_to_store" : null,
  });
}
stores.sort((a, b) => a.store_id.localeCompare(b.store_id));

const out = path.join(process.cwd(), "supabase", "seed", "croma_stores.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(stores, null, 1) + "\n");
console.log(`Wrote ${stores.length} stores -> ${path.relative(process.cwd(), out)}`);
console.log(`  where_we_can_deliver: ${stores.filter((s) => s.store_category === "where_we_can_deliver").length}`);
console.log(`  direct_to_store:      ${stores.filter((s) => s.store_category === "direct_to_store").length}`);
console.log(`  uncategorised:        ${stores.filter((s) => !s.store_category).length}`);
console.log(`  missing state:        ${stores.filter((s) => !s.state).length}`);
