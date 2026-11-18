# Motion-graphics library
Every graphic the plugin renders is saved here so it can be reused.
- `index.json` — saved graphics: name, type, params, accent, how often used, which projects.
- `thumbs/` — a frame of each one. `node scripts/mglib.js sheet` builds a contact sheet.
- Reuse in a script line: `"gfx": [{ "preset": "<name>", "offset": 0.3 }]`.
Rendered layers are cached outside the repo in `~/.motion-forge/mglib` (lossless, keyed by graphics-code version + params).
