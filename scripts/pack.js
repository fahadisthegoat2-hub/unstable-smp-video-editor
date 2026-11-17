#!/usr/bin/env node
// Packs the finished edit as a claude.ai Artifact that renders the MP4 ON THE VIEWER'S DEVICE (reads its CPU/RAM/GPU, picks the best
// quality it can encode, WebCodecs → MP4, Save button). Base picture is pre-cut 9:16 in ≤14 MB chunks; motion graphics are drawn
// live at the device resolution; the soundtrack is mix.wav.
// usage: pack.js edit.json [--dir artifact] [--title "..."]   → prints { page, files } for the Artifact publish (capabilities: { downloads: true })
const fs = require('fs'), path = require('path');
const { run, arg, log } = require('./lib/util');
const { renderShort } = require('./render');
const T = path.join(__dirname, '..', 'templates');

async function pack(edit, dir, title, layout = 'blur', pub = null) {
  fs.mkdirSync(dir, { recursive: true });
  const kbps = Math.min(10000, Math.floor(55 * 8192 / Math.max(10, edit.duration))), CH = Math.max(4, Math.floor(13.5 * 8192 / kbps));
  const base = path.join(dir, 'base_full.mp4');
  await renderShort(edit, base, layout, false, { base: true, bitrate: kbps + 'k' });
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', base, '-c', 'copy', '-f', 'segment', '-segment_time', String(CH), '-reset_timestamps', '1', path.join(dir, 'base_%02d.mp4')]);
  fs.rmSync(base);
  const chunks = fs.readdirSync(dir).filter((f) => /^base_\d+\.mp4$/.test(f)).sort().map((f, i, a) => ({ file: f, dur: i < a.length - 1 ? CH : +(edit.duration - CH * i).toFixed(3) }));
  for (const c of chunks) if (fs.statSync(path.join(dir, c.file)).size > 15e6) throw new Error(`${c.file} is over 15 MB`);
  fs.copyFileSync(edit.mix, path.join(dir, 'mix.wav'));
  if (pub?.thumb) fs.copyFileSync(pub.thumb, path.join(dir, 'thumbnail.png'));
  for (const f of ['mg.js', 'mp4-muxer.mjs']) fs.copyFileSync(path.join(T, f), path.join(dir, f));
  const data = { duration: edit.duration, accent: edit.accent, chunkDur: CH, chunks, mix: 'mix.wav', quality: edit.quality,
    graphics: edit.graphics.map(({ file, ...g }) => g), publish: pub ? { ...pub.data, thumb: 'thumbnail.png' } : null };
  const html = fs.readFileSync(path.join(T, 'player.html'), 'utf8').replace('__TITLE__', (title || 'SMP Short').replace(/[<>&]/g, ''))
    .replace('__ACCENT__', edit.accent).replace('__EDIT__', () => JSON.stringify(data)).replace('__PANEL__', () => fs.readFileSync(path.join(T, 'render_panel.html'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  const files = {}; for (const f of [...chunks.map((c) => c.file), 'mix.wav', 'mg.js', 'mp4-muxer.mjs', ...(pub?.thumb ? ['thumbnail.png'] : [])]) files[f] = path.join(dir, f);
  const mb = Object.values(files).reduce((s, f) => s + fs.statSync(f).size, 0) / 1e6;
  log(`artifact packed: ${chunks.length} video chunks, ${mb.toFixed(1)} MB total`);
  return { page: path.join(dir, 'index.html'), files, capabilities: { downloads: true } };
}
if (require.main === module) {
  const f = process.argv[2]; const edit = JSON.parse(fs.readFileSync(f, 'utf8'));
  pack(edit, arg('dir', path.join(path.dirname(f), 'artifact')), arg('title'), arg('layout', 'blur')).then((r) => console.log(JSON.stringify(r, null, 1))).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { pack };
