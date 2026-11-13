# Zopper Marketing Studio — RBAC integration contract

For the separate Claude sessions that own the external micro-tools (Design Request Tool, Printables Studio,
Customer Service Triage). **Documentation only** — Phase 1 changed the Master App; it did not change any external
tool. Nothing here has to be implemented until the external-tool phase.

The Master App is the **only writer** of this data. External tools get **read-only** access to it.

## 1. Where the data lives (Upstash Redis, REST API)

| Key | Type | Contents |
|---|---|---|
| `zms:employees` | hash | field = employee email (lower case) → value = JSON string of the employee record (section 3) |
| `zms:settings` | string | JSON: which optional roles are switched on per tool (section 4). May be absent → defaults apply |
| `zms:logs` | list | Audit log. Master App only. Don't read or write |
| `zms:backup:<id>` | string | Migration snapshots. Ignore |

Read with `HGET zms:employees <email>` and `GET zms:settings`. **Never write any `zms:*` key.** The Upstash REST
token is a server secret: use it only in your backend, never in browser code.

## 2. Tools and roles

Tool ids (the keys used inside `roles`):

| Tool | `toolId` |
|---|---|
| Design Request Tool | `design-request` |
| Zopper Printables Studio | `printables-studio` |
| Customer Service Triage | `service-triage` |
| Croma Feedback Dashboard (built into the Master App) | `croma-feedback-dashboard` |

Role values — the same four for every tool, lowest to highest:

`no_access` → `viewer` → `editor` → `admin`

`marketingext@zopper.com` is the **Global Super Admin**: it is not a role, is never stored, and always has full
access to everything.

Role availability — Viewer and Editor can be switched off per tool by the Global Super Admin. No Access and Admin
are always available. Defaults until the Super Admin changes them:

| Tool | no_access | viewer | editor | admin |
|---|---|---|---|---|
| `design-request` | on | **off** | on | on |
| `printables-studio` | on | on | on | on |
| `service-triage` | on | on | on | on |
| `croma-feedback-dashboard` | on | on | **off** | on |

A role that is switched off stays on the employee's record but grants **no access** until it is switched back on.

What the roles mean (the Master App's definition; each tool maps these onto its own screens):

| Role | Meaning |
|---|---|
| `no_access` | May not use the tool. Default for every new or unassigned employee |
| `viewer` | Read-only use (view) |
| `editor` | Viewer + create/change (view, edit) |
| `admin` | Editor + manage (view, edit, manage) |

(The Croma Feedback Dashboard has its own, finer definition — Viewer/Editor: view + comment, Admin: + archive/restore —
and is enforced inside the Master App.)

## 3. Employee record (`zms:employees`, one JSON value per email)

```json
{
  "email": "priya.sharma@zopper.com",
  "name": "Priya Sharma",
  "active": true,
  "createdAt": "2026-10-27T12:53:55.896Z",
  "updatedAt": "2026-11-13T06:26:54.088Z",
  "rbacVersion": 2,
  "roles": {
    "design-request": "editor",
    "printables-studio": "viewer",
    "service-triage": "no_access",
    "croma-feedback-dashboard": "admin"
  },
  "review": { "design-request": "legacy_access" },
  "permissions": { "design-request": true, "printables-studio": true, "service-triage": false },
  "toolRoles": { "croma-feedback-dashboard": "admin" }
}
```

* `roles` is the **source of truth** — one entry per tool.
* `review` is optional. It marks a role that came from the old Yes/No setting and hasn't been confirmed by an admin
  yet (`legacy_access`, `invalid_role`, `conflict`). It does **not** change access; ignore it.
* `permissions` / `toolRoles` are legacy mirrors the Master App keeps in sync so a code rollback is safe. Don't use
  them to grant access. (They are used in one place only: see rule 5 below.)
* `active: false` means the employee is deactivated: deny everything.
* Un-migrated (pre-RBAC) records have no `rbacVersion` / `roles`. Run `scripts/migrate-rbac.mjs` in the Master App
  repo first; **fail closed (deny) on any record that is not `rbacVersion: 2` with a usable `roles` object.**
* A record whose `rbacVersion` is greater than `2` was written by a newer schema: deny and ask the Master App owner.

Other examples:

```json
{ "email": "new.hire@zopper.com", "name": "", "active": true, "rbacVersion": 2,
  "roles": { "design-request": "no_access", "printables-studio": "no_access", "service-triage": "no_access", "croma-feedback-dashboard": "no_access" },
  "permissions": { "design-request": false, "printables-studio": false, "service-triage": false },
  "toolRoles": { "croma-feedback-dashboard": "none" },
  "createdAt": "2026-11-13T06:00:00.000Z", "updatedAt": "2026-11-13T06:00:00.000Z" }
```

`zms:settings`:

```json
{ "croma-feedback-dashboard": { "editorEnabled": false },
  "design-request": { "viewerEnabled": true } }
```

Keys per tool are optional: `viewerEnabled`, `editorEnabled` (booleans). A missing key means "use the default in the
table in section 2".

## 4. The access check (exact rules)

Run it in the tool's **backend**, using the Google identity the backend itself verified. Fail closed: any error
reading Redis, or any value you don't understand, is a denial.

1. The identity must be a verified Google account whose email ends in `@zopper.com` (lower-case it).
2. `email === "marketingext@zopper.com"` → **allow, full access** (Global Super Admin). Stop.
3. `rec = HGET zms:employees email`. No record → **deny**. `rec.active !== true` → **deny**.
4. `rec.rbacVersion !== 2` or `rec.roles` is not an object → **deny**.
5. `role = rec.roles[toolId]` (treat the old spelling `"none"` as `"no_access"`). If it isn't one of
   `viewer | editor | admin` → **deny**. For the three external tools also require
   `rec.permissions[toolId] === true`, otherwise **deny** (an older Master build revoked it — believe the lower value).
6. Role availability: `admin` is always available. For `viewer` / `editor`, read `zms:settings`:
   `settings[toolId][role + "Enabled"]` if it is a boolean, else the default from section 2.
   Not available → **deny**.
7. Otherwise **allow with `role`**. Map the role to capabilities as in section 2.

Reference implementation:

```js
const DEFAULTS = {
  "design-request":           { viewer: false, editor: true },
  "printables-studio":        { viewer: true,  editor: true },
  "service-triage":           { viewer: true,  editor: true },
  "croma-feedback-dashboard": { viewer: true,  editor: false },
};

export async function resolveRole(redis, email, toolId) {           // -> "super_admin" | "viewer" | "editor" | "admin" | null (deny)
  email = String(email).toLowerCase();
  if (!email.endsWith("@zopper.com")) return null;
  if (email === "marketingext@zopper.com") return "super_admin";

  const raw = await redis(["HGET", "zms:employees", email]);        // throws on failure -> caller denies
  if (!raw) return null;
  const rec = JSON.parse(raw);
  if (rec.active !== true || rec.rbacVersion !== 2 || !rec.roles || typeof rec.roles !== "object") return null;

  let role = rec.roles[toolId]; if (role === "none") role = "no_access";
  if (!["viewer", "editor", "admin"].includes(role)) return null;
  if (toolId !== "croma-feedback-dashboard" && rec.permissions?.[toolId] !== true) return null;

  if (role !== "admin") {
    const settings = JSON.parse((await redis(["GET", "zms:settings"])) || "{}");
    const flag = settings[toolId]?.[`${role}Enabled`];
    if (!(typeof flag === "boolean" ? flag : DEFAULTS[toolId]?.[role] === true)) return null;
  }
  return role;
}
```

Freshness: read Redis when a session is established and re-check on sensitive requests; don't cache a role for
longer than a few minutes, so a revocation in the Admin Portal takes effect quickly.

## 5. Rules for external tools

* Read-only. Never write `zms:*`; employee records are edited only through the Master App's Admin Portal.
* Keep your own Supabase databases separate; this contract only covers *who may enter and at what level*.
* Never expose the Upstash token to a browser. Never log it.
* Don't read or write other keys; don't rely on key order or on fields not listed here (extra fields may appear).
* The Master App's card click is a convenience check only. A direct URL to your tool must be protected by your own
  backend using the rules above.

## 6. Future authentication architecture (not implemented in Phase 1)

**Route A — Master Dashboard.** Employee signs in to Marketing Studio once → Upstash permission check → entry to the
authorised tool **without a second Google login**, via a secure handoff to be designed later (short-lived signed
token, audience = the tool, verified by the tool's backend, then the tool re-checks Upstash with section 4).

**Route B — Direct tool URL.** Employee signs in with Google through the tool's **own Supabase Auth** → the tool's
backend verifies the identity and checks Upstash with section 4 → access granted or denied.

Phase 1 implements neither. It also does not add a general-purpose authorization API, change any external
repository, touch any Supabase database, remove emailed magic links, or alter email notifications — those belong to
the external-tool sessions.

## 7. Migration (done by the Master App owner, not by tools)

`node scripts/migrate-rbac.mjs` is a dry run; `--apply` takes a backup then converts only the records that need it;
`--rollback <id>` restores the saved records. A legacy Yes becomes the *lowest* role available by default
(Viewer; Editor for Design Request, where Viewer is off) and is flagged `review`. Nothing becomes Admin.
