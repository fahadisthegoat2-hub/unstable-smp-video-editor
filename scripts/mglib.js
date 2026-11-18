#!/usr/bin/env node
// Motion-graphics LIBRARY: every graphic the plugin renders is saved and reused.
//  · cache  — each rendered graphic is stored once as a lossless PNG-in-MOV keyed by (graphics code version + type + params + dur +
//             accent). Same graphic again (rerun, review round, next video) = instant, byte-identical reuse, no re-render.
//             Lives in ~/.motion-forge/mglib (MG_CACHE overrides), pruned to MG_CACHE_GB (default 4 GB), least-recently-used first.
//  · presets — every designed graphic (not captions/flashes) is saved to library/index.json with a thumbnail in library/thumbs/,
//             so a script can reuse it by name:  "gfx": [ { "preset": "crown3d-1a2b" } ]  (+ any overrides: text, at offset, dur…).
// usage:  mglib.js list [type]            → names, types, params
//         mglib.js sheet [out.png]        → contact sheet of every saved graphic (thumbnails)
//         mglib.js show <name>            → one preset as JSON
//         mglib.js prune [GB]             → trim the render cache
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), LIB = path.join(ROOT, 'library'), INDEX = path.join(LIB, 'index.json'), THUMBS = path.join(LIB, 'thumbs');
const CACHE = process.env.MG_CACHE || path.join(os.homedir(), '.motion-forge', 'mglib');
const SKIP = new Set(['words', 'caption', 'flash', 'glitch']);      // per-video or trivial → cached, not saved as presets
let VER = null;
function version() { // hash of the graphics code: change mg.js / mg3d.js / three → old cache entries are never reused
  if (VER) return VER; const h = crypto.createHash('sha1');
  for (const f of ['mg.js', 'mg3d.js', 'three.min.js']) { const p = path.join(ROOT, 'templates', f); if (fs.existsSync(p)) h.update(fs.readFileSync(p)); }
  return (VER = h.digest('hex').slice(0, 10));
}
const params = (gr) => { const { at, file, preset, offset, ...p } = gr; return Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('_')).sort(([a], [b]) => a.localeCompare(b))); };
const key = (gr, accent) => crypto.createHash('sha1').update(version() + JSON.stringify(params(gr)) + (accent || '')).digest('hex').slice(0, 20);
const cachePath = (gr, accent) => path.join(CACHE, key(gr, accent) + '.mov');
function cached(gr, accent) { const f = cachePath(gr, accent); if (!fs.existsSync(f) || fs.statSync(f).size < 1000) return null; const now = new Date(); try { fs.utimesSync(f, now, now); } catch {} return f; }
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
function readIndex() { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return { version: 1, graphics: [] }; } }
function save(gr, accent, thumbPng, project) { // → preset name (or null for per-video graphics)
  if (SKIP.has(gr.type)) return null;
  const idx = readIndex(), k = key(gr, accent); let e = idx.graphics.find((x) => x.key === k);
  if (!e) { e = { name: `${gr.type}${gr.text ? '-' + slug(gr.text) : ''}-${k.slice(0, 4)}`, key: k, type: gr.type, params: params(gr), accent, created: new Date().toISOString(), uses: 0, projects: [] }; idx.graphics.push(e); }
  e.uses++; e.lastUsed = new Date().toISOString(); if (project && !e.projects.includes(project)) e.projects.push(project);
  if (thumbPng) { fs.mkdirSync(THUMBS, { recursive: true }); const tp = path.join(THUMBS, e.name + '.png'); if (!fs.existsSync(tp)) fs.copyFileSync(thumbPng, tp); e.thumb = 'thumbs/' + e.name + '.png'; }
  fs.mkdirSync(LIB, { recursive: true }); fs.writeFileSync(INDEX, JSON.stringify(idx, null, 1)); return e.name;
}
function preset(name) { const e = readIndex().graphics.find((x) => x.name === name || x.key === name); if (!e) throw new Error(`no saved graphic "${name}" — run: node scripts/mglib.js list`); return { ...e.params }; }
function prune(gb = +(process.env.MG_CACHE_GB || 4)) {
  if (!fs.existsSync(CACHE)) return 0; const fl = fs.readdirSync(CACHE).map((f) => { const p = path.join(CACHE, f), s = fs.statSync(p); return { p, size: s.size, t: s.mtimeMs }; }).sort((a, b) => b.t - a.t);
  let tot = 0, n = 0; for (const f of fl) { tot += f.size; if (tot > gb * 1e9) { fs.rmSync(f.p, { force: true }); n++; } } return n;
}
module.exports = { CACHE, version, key, cachePath, cached, save, preset, prune, readIndex };

if (require.main === module) {
  const [cmd = 'list', a] = process.argv.slice(2), idx = readIndex();
  if (cmd === 'list') { for (const e of idx.graphics.filter((e) => !a || e.type === a)) console.log(`${e.name.padEnd(40)} ${String(e.uses).padStart(3)}×  ${JSON.stringify(e.params).slice(0, 110)}`); console.log(`${idx.graphics.length} saved graphics · cache ${CACHE}`); }
  else if (cmd === 'show') console.log(JSON.stringify(idx.graphics.find((e) => e.name === a || e.key === a) || null, null, 1));
  else if (cmd === 'prune') console.log(`removed ${prune(a ? +a : undefined)} cached renders`);
  else if (cmd === 'sheet') {
    const { run } = require('./lib/util'), th = idx.graphics.filter((e) => e.thumb && fs.existsSync(path.join(LIB, e.thumb)));
    if (!th.length) { console.log('no thumbnails yet'); process.exit(0); }
    const out = a || path.join(LIB, 'sheet.png'), cols = Math.min(6, th.length), rows = Math.ceil(th.length / cols), args = ['-y', '-hide_banner', '-loglevel', 'error'];
    th.forEach((e) => args.push('-i', path.join(LIB, e.thumb)));
    const f = th.map((e, i) => `[${i}]scale=216:384,pad=216:420:0:0:0x15151b,drawtext=text='${e.name.replace(/[':\\]/g, '')}':fontcolor=white:fontsize=13:x=6:y=392[t${i}]`);
    f.push(`${th.map((_, i) => `[t${i}]`).join('')}xstack=inputs=${th.length}:layout=${th.map((_, i) => `${(i % cols) * 216}_${Math.floor(i / cols) * 420}`).join('|')}:fill=0x15151b`);
    run([...args, '-filter_complex', th.length > 1 ? f.join(';') : f[0].replace(/\[t0\]$/, ''), '-frames:v', '1', out]).then(() => console.log(out));
  } else { console.error('usage: mglib.js list [type] | sheet [out.png] | show <name> | prune [GB]'); process.exit(1); }
}
