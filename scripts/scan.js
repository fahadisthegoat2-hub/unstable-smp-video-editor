#!/usr/bin/env node
// Lets Claude SEE the footage before writing: one contact sheet per kept segment (6 frames, timestamps burned in)
// + an overview sheet of the whole video. Look at them to identify players (nametags, skins), places and what happens.
// usage: scan.js edit.json [--dir sheets]
const fs = require('fs'), path = require('path');
const { run, arg } = require('./lib/util');
async function scan(edit, dir) {
  fs.mkdirSync(dir, { recursive: true }); const out = [];
  const sheet = async (from, to, n, file, label) => {
    const step = Math.max(0.2, (to - from) / n);
    await run(['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(from), '-t', String(to - from), '-i', edit.source, '-frames:v', '1', '-vf',
      `fps=1/${step.toFixed(3)},scale=480:-2,drawtext=text='${label} %{pts\\:hms\\:${from}}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=3x${Math.ceil(n / 3)}`, file]);
    out.push(file);
  };
  await sheet(0, edit.info.duration, 12, path.join(dir, 'overview.png'), 'src');
  for (const [i, s] of edit.segments.entries()) await sheet(s.in, s.out, 6, path.join(dir, `seg${String(i).padStart(2, '0')}_${s.role}.png`), `#${i} ${s.role}`);
  return out;
}
if (require.main === module) {
  const f = process.argv[2]; const edit = JSON.parse(fs.readFileSync(f, 'utf8'));
  scan(edit, arg('dir', path.join(path.dirname(f), 'sheets'))).then((o) => console.log(JSON.stringify(o, null, 1))).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { scan };
