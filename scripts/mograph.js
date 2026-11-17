#!/usr/bin/env node
// Renders every motion graphic in edit.json to a transparent 1080x1920 ProRes 4444 .mov (CapCut-ready) — BEFORE the edit.
// usage: mograph.js edit.json [--dir graphics] [--fps 30]
const fs = require('fs'), path = require('path');
const { run, launchBrowser, arg, log } = require('./lib/util');

async function renderGraphics(edit, dir, fps = 30) {
  fs.mkdirSync(dir, { recursive: true });
  const browser = await launchBrowser(), page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.join(__dirname, '..', 'templates', 'mograph.html'));
  for (const [i, gr] of edit.graphics.entries()) {
    if (gr.file && fs.existsSync(gr.file)) continue; // already rendered (review rounds only re-render new graphics)
    const file = path.join(dir, `${String(i).padStart(3, '0')}_${gr.type}_${Math.random().toString(36).slice(2, 7)}.mov`), n = Math.max(2, Math.round(gr.dur * fps));
    await page.evaluate(([g, a]) => window.setup(g, a), [gr, edit.accent]);
    const frames = [];
    for (let f = 0; f < n; f++) frames.push(Buffer.from((await page.evaluate((t) => window.frame(t), f / fps)).split(',')[1], 'base64'));
    await run(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', file],
      { stdin: (s) => { for (const fr of frames) s.write(fr); s.end(); } });
    gr.file = path.resolve(file);
    log(`graphic ${i + 1}/${edit.graphics.length}: ${gr.type} ${gr.text ? '“' + gr.text + '”' : ''}`);
  }
  await browser.close();
  return edit;
}
if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.error('usage: mograph.js edit.json [--dir graphics]'); process.exit(1); }
  const edit = JSON.parse(fs.readFileSync(f, 'utf8'));
  renderGraphics(edit, arg('dir', path.join(path.dirname(f), 'graphics')), +arg('fps', 30))
    .then((e) => { fs.writeFileSync(f, JSON.stringify(e, null, 2)); console.log(JSON.stringify({ graphics: e.graphics.length, dir: path.dirname(e.graphics[0].file) })); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { renderGraphics };
