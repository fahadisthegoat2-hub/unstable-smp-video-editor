---
name: smp-shorts
description: Turns a raw Unstable SMP / Minecraft SMP video into a finished viral short with ZERO extra input — finds the moments worth keeping, researches the REAL Unstable SMP lore on the web, writes a lore-checked narration, voices it with the Motion Forge Voice Studio engine (Kokoro), adds karaoke captions and heavy motion graphics (rendered first, edit last), writes a CapCut PC project by name, and publishes an artifact that renders the MP4 on the user's own device at the best quality its specs allow. Use whenever the user sends SMP/Minecraft footage, mentions Unstable SMP, a CapCut project, or "edit this into a short".
---

# SMP Shorts — send a video, get a finished short back

The user only sends the video (or a  Everything else is automatic. Scripts: `${CLAUDE_PLUGIN_ROOT}/scripts`
(in this repo: `plugins/smp-shorts/scripts`). Tools: Node, ffmpeg, Chrome — auto-found.

## 1. PLAN — find the keepers and LOOK at them
`node smp.js <video> [--len 40] [--srt subs.srt]`   (hard cap: 45 s)
→ `<out>/edit.json` (best clips by loudness spikes, sudden jumps, scene cuts, hype words; hook teaser of the best moment first,
story order, payoff last) + `<out>/sheets/*.png`. Read EVERY sheet: write down who is on screen (nametags, skins, chat), where,
and what happens in each segment. That is the footage truth (`script.footage`).

## 2. RESEARCH — real Unstable SMP lore only (never from memory)
- WebSearch (mode "extended") for "Unstable SMP" + every player/place/event seen in the sheets, then WebFetch the pages
  (the Unstable SMP wiki, the creators' own videos/descriptions, Reddit/news recaps). Prefer the wiki and the creators.
- Save `<out>/lore.json`: `{ "facts": [{ "id": "f1", "fact": "<one sentence, as written on the page>", "source": "<url>" }] }`.
  Only facts you actually read on a fetched page. If a name or event can't be confirmed, it does not go in the video.
- Tie the footage to the lore: which arc/conflict/relationship is this clip part of?

## 3. SCRIPT — narration that matches the clip, built for retention
`<out>/script.json`:
```json
{ "title": "HOOK ≤ 6 WORDS", "voice": "am_michael", "footage": "<what the sheets show>",
  "lines": [ { "text": "...", "tone": "dramatic", "pause": 0.2, "facts": ["f1"] | ["footage"],
               "gfx": [ { "type": "nametag", "text": "NAME", "sub": "ROLE FROM LORE" } ] } ] }
```
- LENGTH: 25–45 s, never more — speech ≤ 44 s (~2.6 words/s ⇒ ≤ 110 words); smp.js refuses longer voiceovers. Lines ≤ 12 words.
- STRUCTURE: 0–2 s hook (teaser of the biggest moment + curiosity line) → who/what (nametag + lore) → rising tension → payoff on the loudest moment (stamp) → loop/part-2 tease. Line 1 = curiosity hook, then context from the lore, the clip's moment,
  a twist/payoff on the loudest moment, last line loops or teases part 2.
- Tones: excited calm serious sad whisper scared dramatic shout mysterious happy angry (shout/dramatic/angry lines auto-flash).
- gfx per line — REAL motion graphics, not text. Two engines, one design system (Minecraft voxels, one accent, black outlines):
  **3D (Three.js, `templates/mg3d.js`)**: `blocktitle` (hook title built from voxel blocks that fly in and slam — automatic) ·
  `nametag3d` (3D card flips in: text = player, sub = lore role; first time anyone appears) · `crown3d` (voxel crown drops + god-rays;
  x/y to sit on a head) · `portal3d` (obsidian portal, swirl, particles; color; `through: true` dives the camera in = transition) ·
  `blocks3d` (grass/netherrack/end-stone blocks; `focus` 0–2 grows one) · `explode3d` (block debris burst; `blocks`, `count`) ·
  `sword3d` (voxel sword slash with trail; `metal: "netherite"`) · `cage3d` (iron bars slam down) · `map3d` (3D territory board,
  netherrack spreads; `keep: "Newtopia"` stays) · `ingots3d` (gold rain = money/resources).
  **2D (`templates/mg.js`)**: `embers` (nether heat particles, use dur 5–6 s) · `focus` (anime speed lines) · `shockwave` · `bolt` ·
  `march` (invasion route arrows) · `bar` · `glitch` · `flash` · `stamp` · `counter` · `lore` · `chapter`.
  Rules: 1–2 graphics per line, mostly 3D/visual; at most ONE text card (nametag) per new character; no lore/stamp/counter text spam —
  the karaoke captions already carry the words. `offset` (s) lands a graphic on the exact word. Cut transitions, pattern
  interrupts (3D debris / speed lines / shockwave, never text), impact flashes, CTA and all SFX are added automatically.
- LIBRARY: every graphic rendered is saved and reused (`scripts/mglib.js`). The render cache (lossless PNG-in-MOV, keyed by code
  version + params) means a graphic is never rendered twice; designed graphics are saved by name in `library/index.json` with a
  thumbnail in `library/thumbs/`. Reuse one in a script: `{ "preset": "crown3d-ab12", "offset": 0.3 }`. `node scripts/mglib.js list`
  · `sheet` (contact sheet) · `show <name>` · `prune [GB]`. After a run, commit the new `library/` entries so they persist.
- `"publish"` in script.json (the publish pack): `{ "titles": [3 options, ≤ 60 chars, not all caps], "best": 0, "description": "line 1 = hook + topic words (≤ 150 chars)\n…",
  "hashtags": ["unstablesmp", …≤ 3], "tags": ["unstable smp", …], "pinned": "a question viewers want to answer?", "thumb": "2–3 WORDS", "related": "…" }`
  Titles/description use only researched lore. Thumbnail text must not repeat the title.
- `node lore_check.js script.json lore.json` must print LORE PASS (every line cites facts; every name/number is in its facts).

## 4. FINISH — one command
`node smp.js <video> --script <out>/script.json --lore <out>/lore.json [--layout blur|crop] [--accent #hex]`
Order: lore check → voiceover (`voice.mjs`, Kokoro-82M = the same engine and voices as Motion Forge's Voice Studio) → clips fitted
to the voice (≤ 45 s) → **3 review rounds**, each: motion graphics FIRST → soundtrack (voice + ducked game + SFX, −14 LUFS) → edit LAST →
checks (length · hook · structure · shots ≤ 3 s · an interrupt every ≤ 2.5 s · voice gaps · graphic collisions · loudness · black frames)
→ automatic improvements (jump-cuts with punch-ins, new pops/flashes, moved graphics, tighter hook) → final full-quality render
→ publish pack (`publish.md` passing publish_check + `thumbnail.png`) → device-render artifact.
After the run, read `review.json` and every `review/*.png` sheet yourself (round1–3 + final): faces/action covered, text hard to read,
a boring stretch, a weak hook? Fix script.json/edit.json and rerun. finalIssues must be empty and publish must say PUBLISH PASS.

## 5. DELIVER — artifact that renders on the user's device
Publish `<out>/artifact/index.html` with the Artifact tool: `files` = the printed map, `capabilities: { downloads: true }`, icon "video"
(one publish sends ≤ 64 MB: if it is refused, publish the files in two calls to the same file path — preview.mp4 + thumbnail.png second).
The page opens on the finished edit with sound (preview.mp4, plays everywhere incl. iPad). The ⬇ Render button reads the device's
cores/RAM/GPU, picks the best quality it can encode (Good 1080p30 · High 1080p60 · Epic 1440p60), redraws every 2D/3D graphic crisp at that
resolution (3D with motion blur), encodes the MP4 there with WebCodecs and shows it with a Save button. The page also has a 📦 Publish pack button: thumbnail (save), titles, description + hashtags, tags, pinned comment (copy buttons). Reply with the link only.

## CapCut PC (optional, off by default — not for iPad)
Only with `--capcut` on a computer with CapCut desktop. On iPad, the artifact's MP4 + publish pack is the deliverable.
- `capcut.js --list` · `capcut.js --sources "<name>"` (input can be a project name) · existing projects are never overwritten
  (edit goes to "<name> - SMP edit" unless `--overwrite`, which backs up first). Tracks: gameplay, graphics, full soundtrack.
- Auto-finds the drafts folder (Windows `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft`, macOS `~/Movies/CapCut/...`);
  `--drafts` / `CAPCUT_DRAFTS` override. Close CapCut before writing. Newer CapCut builds encrypt drafts — then use short.mp4 / the artifact.
- CapCut lives on the user's PC: in a cloud session, attach their computer folder first (list_computer_folders → request_computer_folder),
  or skip CapCut (`--no-capcut`) and deliver the artifact.
