#!/usr/bin/env node
// SMP Shorts pipeline.
//  PLAN:   smp.js <video | CapCut project> [--len 45] [--srt subs.srt]            → out/edit.json + out/sheets/*.png (look at them)
//  FINISH: smp.js <video> --script script.json --lore lore.json --project "<CapCut name>" [--title HOOK] [--voice am_michael]
//          → lore check → voiceover (Kokoro, Voice Studio engine) → fit edit to the voice → motion graphics FIRST → sound mix
//          → edit LAST (short.mp4) → CapCut project → device-render artifact (out/artifact)
//          → 3 review rounds (check + improve each) → final render → publish pack (publish.md + thumbnail.png)
// common: [--out dir] [--layout blur|crop] [--accent #hex] [--capcut (CapCut PC project)]
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { arg, flag, log } = require('./lib/util');
const { analyze, buildGraphics } = require('./highlights'), { renderGraphics } = require('./mograph'), { renderShort } = require('./render');
const { scan } = require('./scan'), { buildMix } = require('./mix'), { pack } = require('./pack'), { check } = require('./lore_check');
const cc = require('./capcut'), { measure, check: review, improve, MAXLEN } = require('./review'), { publishPack } = require('./publish');

function fitEdit(edit, target) { // stretch/trim the clips so the edit ends ~1 s after the voice
  const src = edit.info.duration, body = edit.segments.filter((s) => s.role !== 'hook');
  for (let pass = 0; pass < 40; pass++) {
    const total = edit.segments.reduce((a, s) => a + s.out - s.in, 0), delta = target - total;
    if (Math.abs(delta) < 0.05) break;
    const step = delta / body.length;
    body.sort((a, b) => a.in - b.in).forEach((s, i) => {
      const prev = body[i - 1], next = body[i + 1];
      if (step > 0) { s.out = Math.min(src, next ? next.in - 0.1 : src, s.out + step * 0.6); s.in = Math.max(0, prev ? prev.out + 0.1 : 0, s.in - step * 0.4); }
      else { const room = Math.max(0, s.peak - 1.2 - s.in); s.in += Math.min(room, -step * 0.7); s.out = Math.max(s.peak + 1, s.out + step * 0.3); }
    });
    if (step > 0 && edit.segments.reduce((a, s) => a + s.out - s.in, 0) <= total + 0.01) break; // source exhausted
  }
  edit.segments.forEach((s) => { s.in = +s.in.toFixed(3); s.out = +s.out.toFixed(3); });
}
function voiceGraphics(edit, vo, script) {
  const g = edit.graphics;
  // karaoke captions, one graphic per 3-word group
  for (let i = 0; i < vo.words.length; i += 3) {
    const grp = vo.words.slice(i, i + 3), at = grp[0].start, end = Math.min(edit.duration, (vo.words[i + 3]?.start ?? grp[grp.length - 1].end + 0.3));
    g.push({ type: 'words', words: grp, at, dur: +(end - at).toFixed(3) });
  }
  // per-line designed graphics from the script (nametag / lore / stamp / counter / pop / marker / chapter / glitch)
  (script.lines || []).forEach((l, i) => {
    const ln = vo.lines[i]; if (!ln) return;
    for (const x of l.gfx || []) g.push({ dur: x.type === 'stamp' ? 1.4 : 2.4, ...x, at: +Math.max(2.3, ln.start + (x.offset || 0)).toFixed(3) }); // never under the hook title
    if (['shout', 'dramatic', 'angry'].includes(l.tone)) g.push({ type: 'flash', at: ln.start, dur: 0.4 });
  });
  g.sort((a, b) => a.at - b.at);
}
function voice(dir, scriptFile, v) {
  const env = { ...process.env }; if (fs.existsSync('/root/.ccr/ca-bundle.crt')) Object.assign(env, { NODE_USE_ENV_PROXY: '1', NODE_EXTRA_CA_CERTS: '/root/.ccr/ca-bundle.crt' });
  const r = spawnSync(process.execPath, [path.join(__dirname, 'voice.mjs'), dir, scriptFile, ...(v ? ['--voice', v] : [])], { env, encoding: 'utf8', maxBuffer: 1e8 });
  if (r.status !== 0) throw new Error('voiceover failed: ' + (r.stderr || '').slice(-600));
  return JSON.parse(fs.readFileSync(path.join(dir, 'vo.json'), 'utf8'));
}

(async () => {
  let input = process.argv[2];
  if (!input) { console.error('usage: smp.js <video | CapCut project> [--script s.json --lore l.json --project NAME]'); process.exit(1); }
  if (!fs.existsSync(input)) {
    const root = cc.draftsRoot(), p = cc.findProject(root, input), s = p && cc.sources(path.join(root, p));
    if (!s?.clips?.length) throw new Error(s?.note || `"${input}" is not a file or a readable CapCut project`);
    input = s.clips.sort((a, b) => b.duration - a.duration)[0].path; log(`using clip from CapCut project "${p}": ${input}`);
  }
  const name = arg('project', path.parse(input).name + ' SMP'), out = path.resolve(arg('out', path.join(path.dirname(path.resolve(input)), name.replace(/[\\/:*?"<>|]/g, '_'))));
  fs.mkdirSync(out, { recursive: true });
  const layout = arg('layout', 'blur'), scriptFile = arg('script');
  let edit = fs.existsSync(path.join(out, 'edit.json')) && scriptFile ? JSON.parse(fs.readFileSync(path.join(out, 'edit.json'), 'utf8'))
    : await analyze(input, { len: arg('len'), srt: arg('srt'), title: arg('title'), accent: arg('accent') });
  if (!scriptFile) { // PLAN
    fs.writeFileSync(path.join(out, 'edit.json'), JSON.stringify(edit, null, 2));
    const sheets = await scan(edit, path.join(out, 'sheets'));
    console.log(JSON.stringify({ step: 'plan', out, edit: path.join(out, 'edit.json'), sheets, segments: edit.segments.map((s, i) => ({ i, role: s.role, in: s.in, out: s.out, at: s.at })) }, null, 1));
    return;
  }
  const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  if (!flag('no-lore')) {
    const lf = arg('lore'); if (!lf) throw new Error('--lore lore.json is required (real researched Unstable SMP lore)');
    const errs = check(script, JSON.parse(fs.readFileSync(lf, 'utf8'))); if (errs.length) throw new Error('LORE FAIL\n' + errs.join('\n'));
    log('lore check passed');
  }
  const vo = voice(path.join(out, 'voice'), scriptFile, arg('voice')); log(`voiceover ${vo.duration}s (${vo.voice})`);
  if (vo.duration > MAXLEN - 1) throw new Error(`voiceover is ${vo.duration}s — the short is capped at ${MAXLEN}s: cut lines to ≤ ${MAXLEN - 1}s of speech`);
  fitEdit(edit, Math.min(MAXLEN, Math.max(8, vo.duration + 1.0)));
  const title = arg('title') || script.title || edit.graphics.find((g) => g.type === 'hook')?.text;
  Object.assign(edit, buildGraphics(edit.segments, [], title, true), { accent: arg('accent', edit.accent), vo: path.join(out, 'voice', 'vo.wav'), quality: arg('quality') });
  edit.graphics = edit.graphics.filter((g) => g.type !== 'pop' || !(script.lines || []).some((l) => (l.gfx || []).length)); // designed graphics replace generic pops
  voiceGraphics(edit, vo, script);
  const target = Math.min(MAXLEN, Math.max(8, vo.duration + 1.0));
  const retime = () => { let t = 0; for (const sg of edit.segments) { sg.at = +t.toFixed(3); t += sg.out - sg.in; } edit.duration = +t.toFixed(3);
    for (const c of edit.graphics.filter((g) => g.type === 'cta')) c.at = Math.max(0, +(edit.duration - c.dur).toFixed(3)); };
  const log3 = [];
  const pass = async (fast, label) => {
    await renderGraphics(edit, path.join(out, 'graphics'));                    // 1) motion graphics first
    edit.mix = await buildMix(edit, out, edit.vo);                             // 2) sound
    const mp4 = await renderShort(edit, path.join(out, fast ? 'review.mp4' : 'short.mp4'), layout, fast); // 3) edit last
    const fails = review(edit, vo, await measure(mp4));
    const sheet = path.join(out, 'review', label + '.png'); fs.mkdirSync(path.dirname(sheet), { recursive: true });
    const ts = [0.5, ...edit.graphics.filter((g) => ['nametag', 'lore', 'stamp'].includes(g.type)).map((g) => g.at + 0.6), edit.duration - 1].slice(0, 6);
    await require('./lib/util').run(['-y', '-hide_banner', '-loglevel', 'error', '-i', mp4, '-vf', `select='${ts.map((t) => `between(t,${t.toFixed(2)},${(t + 0.04).toFixed(2)})`).join('+')}',scale=360:-2,tile=${ts.length}x1`, '-frames:v', '1', '-fps_mode', 'passthrough', sheet], { allowFail: true });
    return { mp4, fails, sheet };
  };
  for (let r = 1; r <= 3; r++) {                                              // 3 check-and-improve rounds
    const { fails, sheet } = await pass(true, 'round' + r);
    const fixed = improve(edit, fails, vo, r); fitEdit(edit, target); retime();
    log3.push({ round: r, fails: fails.map((f) => `${f.k}: ${f.msg}`), improved: fixed, sheet });
    log(`review round ${r}: ${fails.length} issue(s) → ${fixed.join(', ') || 'clean'}`);
  }
  if (edit.segments.some((sg) => sg.role !== 'hook' && sg.out - sg.in > 3.01)) { improve(edit, [{ k: 'pacing' }], vo, 3); retime(); }
  const fin = await pass(false, 'final'); fs.rmSync(path.join(out, 'review.mp4'), { force: true });
  log3.push({ round: 'final', fails: fin.fails.map((f) => `${f.k}: ${f.msg}`), sheet: fin.sheet });
  fs.writeFileSync(path.join(out, 'review.json'), JSON.stringify(log3, null, 1));
  fs.writeFileSync(path.join(out, 'edit.json'), JSON.stringify(edit, null, 2));
  const pub = await publishPack(edit, script, out);
  const res = { step: 'finish', short: fin.mp4, duration: edit.duration, review: log3.map((r) => `${r.round}: ${r.fails.length} issues`), finalIssues: fin.fails.map((f) => f.msg), sheets: log3.map((r) => r.sheet), publish: pub.check, publishMd: pub.md, thumbnail: pub.thumb };
  if (flag('capcut')) res.capcut = cc.writeProject(edit, name, { overwrite: flag('overwrite'), layout });
  res.artifact = await pack(edit, path.join(out, 'artifact'), title, layout, pub);
  console.log(JSON.stringify(res, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
