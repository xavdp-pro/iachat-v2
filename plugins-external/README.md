# External plugins (Git clones)

Each subdirectory is a **separate Git repository** (your own plugins or community ones).

```bash
cd /apps/iachat-v2/app/plugins-external
git clone https://github.com/you/iachat-plugin-example.git example-plugin
```

Then use the admin **plugin scan** (when implemented) or the existing `plugins/` loader conventions — see `mds/plugin-modular-architecture.md`.
