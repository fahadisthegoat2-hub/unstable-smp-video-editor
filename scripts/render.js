#!/usr/bin/env node
// Cuts the edit LAST: keeps the chosen segments, makes it 9:16, alternates zoom, overlays the pre-rendered graphics and the
// final soundtrack (mix.wav) → short.mp4.   base:true → picture only, no graphics/audio (for the device-render artifact).
// usage: render.js edit.json [--out short.mp4] [--layout blur|crop] [--fast]
const fs = require('fs'), path = require('path');
const { run, arg, flag, log } = require('./lib/util');

function cutFilters(edit, layout) {
  const f = [], W = 1080, H = 1920;
  edit.segments.forEach((s, i) => {
    const z = s.zoom || (s.role === 'hook' ? 1.15 : 1), v = `[0:v]trim=${s.in}:${s.out},setpts=PTS-STARTPTS,fps=30`;
    if (layout === 'crop') f.push(`${v},scale=-2:${Math.round(H * z)},crop=${W}:${H},setsar=1[v${i}]`);
    else f.push(`${v},split[a${i}][b${i}];[a${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.12[bg${i}];` +
      `[b${i}]scale=${Math.round(W * z * 1.25)}:-2,crop='min(iw,${W})':ih[fg${i}];[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[v${i}]`);
  });
  f.push(`${edit.segments.map((_, i) => `[v${i}]`).join('')}concat=n=${edit.segments.length}:v=1:a=0[cv]`);
  return f;
}
const STAGE = 14; // graphics composited per ffmpeg pass → memory stays flat however many graphics an edit has
function overlays(list, inBase, firstInput, f) { // adds overlay filters for `list` onto label inBase → returns the last label
  let last = inBase;
  list.forEach((g, k) => { const idx = firstInput + k, lb = `o${idx}`;
    f.push(`[${idx}:v]format=rgba,setpts=PTS-STARTPTS+${g.at}/TB[g${idx}]`, `[${last}][g${idx}]overlay=0:0:eof_action=pass:format=auto:enable='between(t,${g.at},${(g.at + g.dur).toFixed(3)})'[${lb}]`);
    last = lb; });
  return last;
}
const gin = (g) => ['-threads', '1', '-thread_queue_size', '8', '-i', g.file];
async function renderShort(edit, out, layout = 'blur', fast = false, opts = {}) {
  const gs = opts.base ? [] : edit.graphics.filter((g) => g.file && fs.existsSync(g.file)).sort((a, b) => (a.type === 'words') - (b.type === 'words') || a.at - b.at);
  const enc = (o, final) => { const br = opts.bitrate ? ['-b:v', opts.bitrate, '-maxrate', opts.bitrate, '-bufsize', opts.bitrate, '-g', '30'] : ['-crf', final ? (fast ? '28' : '17') : '10'];
    return ['-c:v', 'libx264', '-preset', final && !fast ? 'slow' : 'ultrafast', ...br, '-pix_fmt', 'yuv420p', '-r', '30', '-t', String(edit.duration), '-movflags', '+faststart', o]; };
  log(`rendering ${path.basename(out)} (${edit.duration.toFixed(1)} s, ${edit.segments.length} cuts${opts.base ? ', picture only' : `, ${gs.length} graphics`})…`);
  const tmp = []; let src = null, rest = gs;
  try {
    do { // stage: (cut footage | previous stage) + up to STAGE graphics
      const batch = rest.slice(0, STAGE); rest = rest.slice(STAGE); const final = rest.length === 0;
      const args = ['-y', '-hide_banner', '-loglevel', 'error'], f = [];
      let base;
      if (!src) { args.push('-i', edit.source); f.push(...cutFilters(edit, layout)); base = 'cv'; } else { args.push('-i', src); f.push('[0:v]null[cv]'); base = 'cv'; }
      batch.forEach((g) => args.push(...gin(g)));
      const last = overlays(batch, base, 1, f), n = 1 + batch.length;
      const mix = final && !opts.base && edit.mix && fs.existsSync(edit.mix);
      if (mix) args.push('-i', edit.mix);
      args.push('-filter_complex', f.join(';'), '-map', `[${last}]`);
      if (mix) args.push('-map', `${n}:a`, '-c:a', 'aac', '-b:a', '192k'); else args.push('-an');
      const o = final ? out : out.replace(/\.mp4$/, `.stage${tmp.length}.mp4`); if (!final) tmp.push(o);
      await run([...args, ...enc(o, final)]); src = o;
    } while (rest.length);
  } finally { tmp.forEach((t) => fs.rmSync(t, { force: true })); }
  return out;
}
if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.error('usage: render.js edit.json [--out short.mp4] [--layout blur|crop]'); process.exit(1); }
  const edit = JSON.parse(fs.readFileSync(f, 'utf8'));
  renderShort(edit, arg('out', path.join(path.dirname(f), 'short.mp4')), arg('layout', 'blur'), flag('fast'))
    .then((o) => console.log(JSON.stringify({ out: path.resolve(o) }))).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { renderShort };
