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
async function renderShort(edit, out, layout = 'blur', fast = false, opts = {}) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', edit.source], f = cutFilters(edit, layout);
  let last = 'cv', n = 1;
  if (!opts.base) edit.graphics.filter((g) => g.file && fs.existsSync(g.file)).forEach((g, k) => {
    args.push('-i', g.file); const idx = n++;
    f.push(`[${idx}:v]setpts=PTS-STARTPTS+${g.at}/TB[g${k}]`, `[${last}][g${k}]overlay=0:0:eof_action=pass:enable='between(t,${g.at},${(g.at + g.dur).toFixed(3)})'[o${k}]`);
    last = `o${k}`;
  });
  const mix = !opts.base && edit.mix && fs.existsSync(edit.mix) ? n++ : null;
  if (mix) args.push('-i', edit.mix);
  args.push('-filter_complex', f.join(';'), '-map', `[${last}]`);
  if (mix) args.push('-map', `${mix}:a`, '-c:a', 'aac', '-b:a', '192k'); else args.push('-an');
  const br = opts.bitrate ? ['-b:v', opts.bitrate, '-maxrate', opts.bitrate, '-bufsize', opts.bitrate, '-g', '30'] : ['-crf', fast ? '28' : '17'];
  args.push('-c:v', 'libx264', '-preset', fast ? 'ultrafast' : 'slow', ...br, '-pix_fmt', 'yuv420p', '-r', '30', '-t', String(edit.duration), '-movflags', '+faststart', out);
  log(`rendering ${path.basename(out)} (${edit.duration.toFixed(1)} s, ${edit.segments.length} cuts${opts.base ? ', picture only' : `, ${edit.graphics.length} graphics`})…`);
  await run(args);
  return out;
}
if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.error('usage: render.js edit.json [--out short.mp4] [--layout blur|crop]'); process.exit(1); }
  const edit = JSON.parse(fs.readFileSync(f, 'utf8'));
  renderShort(edit, arg('out', path.join(path.dirname(f), 'short.mp4')), arg('layout', 'blur'), flag('fast'))
    .then((o) => console.log(JSON.stringify({ out: path.resolve(o) }))).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { renderShort };
