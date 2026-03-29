# IAChat — Modular plugin architecture (directives)

> **Receipt:** These directives capture the agreed direction for a **mature, developer-friendly plugin system**: core app in one place, plugins in another; optional **separate Git repositories** per plugin; **admin** discovers, enables/disables, and configures credentials; plugins may **contribute UI** (e.g. menu entries) and **functional actions** (AI agent, Nextcloud, local file store, etc.).

---

## 1. Goals

| Goal | Meaning |
|------|---------|
| **Separation** | Core (“ossature”) lives in the main app repo; plugin code is **not** mixed into core source trees in a way that blocks independent versioning. |
| **Simple for any dev** | A **contract** (manifest + folders + APIs) that is documented once; cloning a plugin repo into a known directory is enough to start. |
| **Operational clarity** | Admin can **scan** the plugins directory, **see** what is installed, **toggle** active/inactive, and open a **per-plugin settings** screen for secrets and options. |
| **Extensibility** | Plugins declare **capabilities** (e.g. `llm`, `storage`, `menu`) so the host can wire routes, UI slots, and lifecycle without hardcoding vendor names. |

---

## 2. Proposed repository & directory layout

### 2.1 Main application repository (`iachat-v2` or equivalent)

```
app/
  server/                 # Core API only — stable extension points
  src/                    # Core UI shell — slots for plugin contributions
  packages/               # Optional shared internal packages (types, SDK)
  mds/                    # Specs (this file, stack, rules)
```

### 2.2 Plugins workspace (development & runtime)

**Not** committed as subfolders of the main repo (or committed only as `.gitkeep` + README):

```
app/plugins-external/     # Name TBD: e.g. plugins/, external-plugins/
  .gitignore              # Ignore everything except .gitkeep OR ignore all cloned content
  README.md               # How to clone plugins here
  <plugin-id>/            # Each directory = one git clone (its own remote)
    manifest.json         # Required entry contract
    server/               # Optional: server handlers
    admin/                # Optional: admin UI schema / bundle
    client/               # Optional: chat UI contributions
```

**Convention:** Each plugin is a **standalone Git repository**. Developers run `git clone <url> plugins-external/<plugin-id>` (or a small CLI wrapper: `iachat plugin add <git-url>`).

**Why gitignored (or partially ignored):** Keeps the core repo small; plugins are **dependencies** chosen per deployment, not part of the default tree. Alternative: submodule per plugin — heavier; **clone + scan** matches your described workflow.

---

## 3. Plugin discovery & lifecycle (admin)

1. **Scan** — Button in admin: “Scan plugins folder”. Server walks `plugins-external/*` (and optionally a **bundled** `plugins/bundled/` for first-party plugins that *are* versioned with core).
2. **Register** — For each valid `manifest.json`, register or update a row in DB: `plugin_id`, `version`, `enabled`, `last_scan_at`, `manifest_hash`.
3. **Enable / disable** — Switches in UI call API `PATCH /api/admin/plugins/:id` → toggles `enabled`; on change, host **reloads** or **lazy-loads** only enabled plugins.
4. **Settings** — Each plugin exposes a **JSON Schema** (or structured fields) in the manifest for admin forms; secrets stored **server-side** only (encrypted at rest in a later phase; v1: env + DB column masked in UI).

---

## 4. Plugin manifest contract (minimum viable)

Example shape (illustrative — to be frozen in a JSON Schema later):

```json
{
  "id": "nexcloud-storage",
  "version": "1.0.0",
  "displayName": { "en": "Nextcloud", "fr": "Nextcloud" },
  "capabilities": ["storage", "admin.settings"],
  "admin": {
    "settingsSchema": { "type": "object", "properties": { "baseUrl": { "type": "string" }, "appPassword": { "type": "string", "secret": true } } }
  },
  "server": { "entry": "./server/index.js" },
  "contributions": {
    "menu": [{ "id": "open-files", "labelKey": "plugin.nexcloud.files", "path": "/chat?panel=files" }]
  }
}
```

**Rules:**

- **`id`** is stable, unique, filesystem-safe.
- **`capabilities`** drive which extension points the host loads (LLM router, attachment upload handler, sidebar item, etc.).
- **Secrets** never returned to client in clear text; admin UI shows “••••••” when set.

---

## 5. Functional dimensions (examples you listed)

| Plugin idea | Capability tags | Admin | Chat / core integration |
|-------------|-------------------|-------|-------------------------|
| **AI agent / LLM** | `llm`, `chat.modelPicker` | API URL, keys, model list | Composer or header: model selector; messages routed through plugin |
| **Nextcloud (files)** | `storage`, `attachments.upload` | URL, credentials | Save attachments via WebDAV/API; links in messages |
| **Local filesystem storage** | `storage`, `attachments.local` | Base path, quotas | Server-only paths; never expose raw paths to client |
| **Future** | `stt`, `tts`, `rag`, `tool` | Per manifest | Same pattern: declare capability + server entry |

The host implements **capability interfaces** (TypeScript or JSDoc contracts) so a plugin only implements the hooks it needs.

---

## 6. UI contributions

- **Admin:** One **settings view per plugin** generated from `settingsSchema` (or custom registered component name if we allow optional frontend bundles later).
- **Chat shell:** Plugins declare **menu items**, **composer actions**, or **routes** in manifest; core renders **slots** (e.g. `SidebarFooter`, `ComposerToolbar`, `DiscussionHeader`) and merges enabled contributions.

Avoid unlimited arbitrary DOM injection in v1; prefer **declarative contributions** + host-rendered components for security and consistency.

---

## 7. Developer workflow (summary)

1. Clone core app, run DB + `npm run dev`.
2. `git clone https://github.com/org/iachat-plugin-foo.git plugins-external/foo`.
3. Ensure `plugins-external/foo/manifest.json` is valid.
4. In admin: **Scan** → see **foo** → **Enable** → fill **settings** → Save.
5. Reload chat: contributions appear according to capabilities.

Publish plugin as its **own repo** with README listing required env, capabilities, and minimal host version (`engine.iachat` field in manifest).

---

## 8. Relation to `iachatplug-v1`

A dedicated repo (e.g. **`iachatplug-v1`**) can hold:

- **Plugin SDK** (types, manifest JSON Schema, tiny helper to validate manifest locally).
- **Reference plugins** (template agent, template storage) as folders or separate repos linked from README.

Core app depends only on **contracts**, not on plugin source code, unless you ship curated “bundled” plugins inside the monorepo.

---

## 9. Security & ops notes

- Scanning directories must **not** execute arbitrary code before manifest validation; load server `entry` only for **enabled** plugins.
- Version pinning: manifest `engine` field + admin warning if incompatible.
- Rate-limit and audit admin actions on plugin enable/disable.

---

## 10. Next implementation steps (for a future sprint)

1. Freeze **manifest JSON Schema** v1.
2. Add DB tables: `plugins`, `plugin_settings` (encrypted JSON blob).
3. Implement **scan** + **list** + **toggle** API + admin UI.
4. Refactor current `server/routes/plugins.js` / `plugin-loader` to match this layout (`plugins-external/` + manifest-driven load).
5. Document one **reference plugin** repo under `iachatplug-v1`.

---

*Document status: directives acknowledged; ready to align iachat-v2 codebase and optional `iachatplug-v1` SDK/templates with this spec.*
