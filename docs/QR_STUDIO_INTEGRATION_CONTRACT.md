# Zopper QR Studio — access integration contract

For the **Zopper QR Studio** Claude session (https://zopper-qr-studio.vercel.app). The Master App (Zopper Marketing
Studio) stores who may use QR Studio and at what level. **QR Studio itself must enforce it**, by reading that data
from Upstash Redis. The Master App changes nothing inside QR Studio and does not enforce QR Studio's actions.

Contains no secrets. QR Studio needs its own Upstash credentials (section 6).

## 1. What the Master App provides

* Tool id: **`qr-studio`**
* Roles: `no_access` (default) → `viewer` → `editor` → `admin`. All four are available initially.
* The Global Super Admin, **`marketingext@zopper.com`**, is not a role: it has full access to everything and is
  never stored in an employee record.
* Employees are added and given roles in the Master App Admin Portal → **Employees and Access Control**. Only the
  Global Super Admin can open it, and only the Master App writes this data. **QR Studio must treat it as read-only.**

## 2. Approved permission matrix (QR Studio enforces this)

| Role | Access | View dashboard + QR data | Create QR | Pause live QR | Delete live QR |
|---|---|---|---|---|---|
| `no_access` | no | – | – | – | – |
| `viewer` | yes | yes | no | no | no |
| `editor` | yes | yes | **yes** | no | no |
| `admin` | yes | yes | yes | **yes** | **yes** |
| Global Super Admin | yes | yes | yes | yes | yes |

**Pause and Delete are two separate actions. Authorise each one on its own — never treat one as implying the
other.** Capability names used below: `view`, `create`, `pause`, `delete`.

## 3. Where the data lives (Upstash Redis, REST API)

| Key | Type | Contents |
|---|---|---|
| `zms:employees` | hash | field = employee email (lower case) → value = JSON string of the employee record |
| `zms:settings` | string (JSON) | role availability per tool. Missing → defaults |

Read with `HGET zms:employees <email>` and `GET zms:settings`. Never write any `zms:*` key.

Employee record (the parts QR Studio uses):

```json
{
  "email": "priya.sharma@zopper.com",
  "active": true,
  "rbacVersion": 2,
  "roles": { "qr-studio": "editor", "design-request": "no_access", "…": "…" },
  "permissions": { "qr-studio": true, "…": true }
}
```

* `roles["qr-studio"]` is the source of truth: `no_access | viewer | editor | admin`.
* An employee **who has never been assigned a QR Studio role has no `roles["qr-studio"]` entry** — that means
  **No Access**. Deny.
* `permissions["qr-studio"]` is a legacy Yes/No mirror the Master App keeps in sync (`true` for any role other than
  `no_access`). Require it to be `true` as well; if it isn't, deny.
* `active: false` → deactivated employee → deny.
* Role availability, in `zms:settings`:
  ```json
  { "qr-studio": { "viewerEnabled": true, "editorEnabled": false } }
  ```
  Keys are optional booleans. **Missing key = enabled** (for `qr-studio` both default to on). `admin` and `no_access`
  are always available. A role that the Super Admin has switched off **grants no access**, even though it stays on the
  employee's record; it works again when switched back on.

## 4. The access check

Run it in QR Studio's **backend**, for the identity QR Studio's own Google login verified. Fail closed: any Redis
error, or any value you don't understand, is a denial.

1. Identity: verified Google account (`email_verified`), email ends in `@zopper.com` — lower-case it.
2. `email === "marketingext@zopper.com"` → **super_admin**, all four capabilities. Stop.
3. `rec = HGET zms:employees email`. No record → deny. `rec.active !== true` → deny.
4. `rec.rbacVersion !== 2` or `rec.roles` is not an object → deny.
5. `role = rec.roles["qr-studio"]` must be `viewer`, `editor` or `admin` (treat the old spelling `"none"` as
   `no_access`). Also `rec.permissions["qr-studio"] === true`. Otherwise deny.
6. `viewer` / `editor`: read `zms:settings`; `settings["qr-studio"][role + "Enabled"]` — if it is `false` → deny.
7. Allow with `role`; the capabilities are in the matrix above.

```js
const CAPS = {
  viewer:      ["view"],
  editor:      ["view", "create"],
  admin:       ["view", "create", "pause", "delete"],
  super_admin: ["view", "create", "pause", "delete"],
};
const DEFAULT_ENABLED = { viewer: true, editor: true };

// -> "super_admin" | "viewer" | "editor" | "admin" | null (deny).  `redis` runs one Upstash REST command.
export async function resolveRole(redis, email) {
  email = String(email).toLowerCase();
  if (!email.endsWith("@zopper.com")) return null;
  if (email === "marketingext@zopper.com") return "super_admin";

  const raw = await redis(["HGET", "zms:employees", email]);        // throws on failure -> caller denies
  if (!raw) return null;
  const rec = JSON.parse(raw);
  if (rec.active !== true || rec.rbacVersion !== 2 || !rec.roles || typeof rec.roles !== "object") return null;

  let role = rec.roles["qr-studio"]; if (role === "none") role = "no_access";
  if (!["viewer", "editor", "admin"].includes(role)) return null;
  if (rec.permissions?.["qr-studio"] !== true) return null;

  if (role !== "admin") {
    const settings = JSON.parse((await redis(["GET", "zms:settings"])) || "{}");
    const flag = settings["qr-studio"]?.[`${role}Enabled`];
    if (!(typeof flag === "boolean" ? flag : DEFAULT_ENABLED[role] === true)) return null;
  }
  return role;
}

export const can = (role, action) => (CAPS[role] || []).includes(action);   // can(role, "pause") !== can(role, "delete") in general
```

## 5. Enforce it on the server, per action

* **Session start:** call `resolveRole`; no role → show your own "Access not allowed" screen and create no session.
* **Every request that changes data:** re-resolve the role (or use a cache of at most ~60 seconds) and check the
  *specific* capability: create → `create`; pause → `pause`; delete → `delete`; dashboard/QR data reads → `view`.
  Hiding a button in the browser is only a convenience — the API must refuse on its own.
* A role change, a switched-off role or a deactivation in the Admin Portal must therefore take effect within that
  cache window, without the employee signing out.
* Never trust a role, email or permission sent by the browser. Never put roles or Redis data in URLs or cookies you
  don't sign yourself.

## 6. Credentials and rules

* QR Studio needs its **own Upstash REST URL + token** in server-side environment variables only (never shipped to the
  browser, never logged, never committed). Prefer an Upstash **read-only** REST token — QR Studio only ever runs
  `HGET` and `GET`. Ask the Master App owner for it; this document deliberately contains none.
* Keep QR Studio's own database separate; this contract only decides who may enter and what they may do.
* Extra fields may appear on records; ignore fields not listed here.

## 7. The two entry routes

**Route A — from the Master App.** The employee signs in to Marketing Studio, clicks the **Zopper QR Studio** card;
the Master App checks the employee's active status, `qr-studio` role and availability in Upstash, and — if allowed —
simply navigates to `https://zopper-qr-studio.vercel.app`. **Nothing is passed in the URL** (no token, role or code),
and there is no session handoff. QR Studio uses its own Google session (or starts Google sign-in, which Google may
complete silently if the browser is already signed in) and then runs the check in section 4 itself. The Master
App's own check is a convenience; QR Studio's is the one that counts.

**Route B — direct URL.** The employee opens QR Studio directly → QR Studio's own Google sign-in → section 4 → access
granted or denied.

Both routes end in the same place: QR Studio's backend decides, from Upstash, on every session and every action.

## 8. Test checklist for QR Studio

| Situation | Expected |
|---|---|
| Employee with no `roles["qr-studio"]` entry | denied |
| `no_access`, inactive employee, unknown email, non-`@zopper.com` | denied |
| `viewer` | can open and view; Create, Pause and Delete all refused by the API |
| `editor` | + Create; Pause and Delete refused by the API |
| `admin` | + Pause and Delete (each authorised separately) |
| `marketingext@zopper.com` | everything |
| `viewerEnabled` / `editorEnabled` set to `false` in `zms:settings` | that role denied; works again when set back |
| Role lowered in the Admin Portal while signed in | the next action is refused within the cache window |
| Redis unreachable | denied (never open) |
