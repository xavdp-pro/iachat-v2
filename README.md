# IAChat

**IAChat** is an **open-source chat shell** for teams and products that need a **familiar AI conversation UI** (sidebar, projects, threads, composer) without locking into a single vendor. It is meant to be **reused across projects** and extended through **plugins** (LLM backends, tools, future agents) configured from an **admin area**, while day-to-day use happens in the **chat** surface.

## Why this exists

- **Purpose:** Provide a **generic, skinnable front-end** plus a small **Node API** and **MariaDB** persistence so you can ship something that **feels like the chat apps people already know** (clear hierarchy, projects, history, attachments) while you plug in your own AI stack later.
- **Utility:** Use it as a **starting point** for internal tools, customer-facing assistants, or experiments where you want **multi-user auth**, **project isolation**, **discussions and messages**, **i18n**, and **theme/skins** separated from business logic—rather than rebuilding layout and CRUD from scratch.

Longer product and plugin vision: [`mds/interface-vision-plugins.md`](mds/interface-vision-plugins.md).

## What you get today

| Area | Capabilities |
|------|----------------|
| **Auth & roles** | Login, JWT session, **user** vs **admin**; admin user list. |
| **Projects** | Create, rename, archive/unarchive, delete; projects group conversations. |
| **Discussions** | Per-project threads; rename, delete; optional auto-create on first message. |
| **Messages** | Send text; **attachments** (images as preview + lightbox, documents as links); **edit** and **delete** own messages. |
| **UX** | Light/dark mode, **FR / EN / ES**, responsive **sidebar + top bar** on small screens. |
| **Skins** | Default skin under `skins/` (CSS tokens)—swap folder to change look without rewriting React. |
| **Plugins (scaffolding)** | Server-side plugin discovery and `plugins/` manifests; full LLM/STT/TTS pipeline is **roadmap** (see `mds/consignes.md`). |

## Tech stack (summary)

- **Front:** React (Vite), Tailwind (available in the toolchain), Zustand, React Router, react-i18next, Framer Motion, Lucide; primary theming via `skins/` CSS.
- **API:** Express (Node), MariaDB/MySQL via `mysql2`, JWT auth.
- **Details & dev philosophy:** [`mds/stack.md`](mds/stack.md).

## Quick start

### Prerequisites

- Node.js 18+ (or as required by `package.json`)
- MariaDB or MySQL, with a database and user your app can use

### Install

```bash
npm install
```

Configure the API database connection (environment variables used by `server/db/index.js`—typically host, user, password, database name). **Do not commit secrets.**

### Development

Single command runs Vite and the API with file watching:

```bash
npm run dev
```

Frontend is served by Vite (see `package.json` for port); API runs alongside.

### Production build

```bash
npm run build
```

Serve the built assets and run the Node server according to your hosting setup.

## Repository layout (high level)

| Path | Role |
|------|------|
| `src/` | React app (pages, stores, API client). |
| `server/` | Express app, routes, DB, auth middleware. |
| `skins/` | Installable themes (default skin in `skins/default/`). |
| `plugins/` | Plugin manifests (agents, STT, TTS, etc.—evolving). |
| `mds/` | Internal notes: stack, rules, product consignes, UI vision. |

## Contributing & license

This project is intended as **open source**. Add a `LICENSE` file if you want a specific license (e.g. MIT) and mention it here.

---

*IAChat v1 — generic chat shell, plugin-ready, skinnable.*
