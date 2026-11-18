#!/usr/bin/env node
// Renders every motion graphic in edit.json to a transparent 1080x1920 layer — BEFORE the edit. 2D (mg.js) and 3D (mg3d.js, Three.js)
// graphics share one renderer; 3D gets motion blur (sub-frames). Each layer is a lossless PNG-in-MOV (frames are copied, not
// re-encoded → small, exact, fast) stored in the motion-graphics library cache, so the same graphic is never rendered twice
// (scripts/mglib.js). CapCut export converts the layers it uses to ProRes 4444.
// usage: mograph.js edit.json [--fps 30]
const fs = require('fs'), path = require('path');
const { run, launchBrowser, arg, log } = require('./lib/util');
const lib = require('./mglib');

async function renderGraphics(edit, dir, fps = 30) {
  fs.mkdirSync(lib.CACHE, { recursive: true }); fs.mkdirSync(dir, { recursive: true });
  const todo = [];
  for (const gr of edit.graphics) {
    if (gr.file && fs.existsSync(gr.file) && gr._key === lib.key(gr, edit.accent)) continue;
    const hit = lib.cached(gr, edit.accent); if (hit) { gr.file = hit; gr._key = lib.key(gr, edit.accent); continue; }
    todo.push(gr);
  }
  const reused = edit.graphics.length - todo.length;
  if (todo.length) {
    const browser = await launchBrowser(), page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    page.on('pageerror', (e) => log('graphics page error: ' + e.message));
    await page.goto('file://' + path.join(__dirname, '..', 'templates', 'mograph.html'));
    for (const [i, gr] of todo.entries()) {
      const file = lib.cachePath(gr, edit.accent), tmp = file + '.part', n = Math.max(2, Math.round(gr.dur * fps)), mid = Math.min(n - 1, Math.round(n * 0.55));
      await page.evaluate(([g, a]) => window.setup(g, a), [gr, edit.accent]);
      const frames = [];
      for (let f = 0; f < n; f++) frames.push(Buffer.from((await page.evaluate((t) => window.frame(t), f / fps)).split(',')[1], 'base64'));
      await run(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'copy', '-f', 'mov', tmp],
        { stdin: (s) => { for (const fr of frames) s.write(fr); s.end(); } });
      fs.renameSync(tmp, file); gr.file = file; gr._key = lib.key(gr, edit.accent);
      const thumb = path.join(dir, '_thumb.png'), big = thumb + '.full.png'; fs.writeFileSync(big, frames[mid]);
      await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', big, '-vf', 'scale=216:384', thumb]); fs.rmSync(big, { force: true });
      const name = lib.save(gr, edit.accent, thumb, edit.project); gr._saved = 1; fs.rmSync(thumb, { force: true });
      log(`graphic ${i + 1}/${todo.length}: ${gr.type}${gr.text ? ' “' + gr.text + '”' : ''}${name ? ' → saved to library as ' + name : ''}`);
    }
    await browser.close();
  }
  for (const gr of edit.graphics) if (!gr._saved) { lib.save(gr, edit.accent, null, edit.project); gr._saved = 1; }
  if (reused) log(`${reused} graphic(s) reused from the library`);
  lib.prune();
  return edit;
}
if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.error('usage: mograph.js edit.json'); process.exit(1); }
  const edit = JSON.parse(fs.readFileSync(f, 'utf8'));
  renderGraphics(edit, path.join(path.dirname(f), 'graphics'), +arg('fps', 30))
    .then((e) => { fs.writeFileSync(f, JSON.stringify(e, null, 2)); console.log(JSON.stringify({ graphics: e.graphics.length, cache: lib.CACHE })); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { renderGraphics };
