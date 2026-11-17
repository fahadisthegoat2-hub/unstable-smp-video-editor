#!/usr/bin/env node
// Finds the parts of SMP footage worth keeping and writes edit.json.
// Signals: loudness spikes (screams, explosions, kills), sudden energy, scene cuts, optional SRT keywords.
// usage: highlights.js <video> [--out edit.json] [--len 45] [--srt subs.srt] [--title "HOOK TEXT"]
const fs = require('fs'), path = require('path');
const { run, ffprobeJSON, arg, log } = require('./lib/util');

const HYPE = /\b(no+|what+|bro+|oh my (god|gosh)|run+|help|dead|died|killed?|betray\w*|traitor|war|trap(ped)?|tnt|creeper|diamonds?|netherite|totem|revenge|lie|lying|why+|wait+|stop+|let'?s go+|clutch|ha(ha)+|lol|insane|crazy|sus)\b/i;

async function loudness(file) {
  const { out } = await run(['-hide_banner', '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-']);
  const s = new Int16Array(out.buffer, out.byteOffset, out.length >> 1), W = 2000, db = []; // 0.25 s windows
  for (let i = 0; i + W <= s.length; i += W) {
    let e = 0; for (let j = i; j < i + W; j++) e += s[j] * s[j];
    db.push(10 * Math.log10(e / W / 1073741824 + 1e-10));
  }
  return db;
}
async function sceneCuts(file) {
  const { err } = await run(['-hide_banner', '-i', file, '-an', '-vf', "scale=320:-2,select='gt(scene,0.32)',showinfo", '-f', 'null', '-'], { allowFail: true });
  return [...err.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]);
}
function srtHits(file) {
  if (!file || !fs.existsSync(file)) return [];
  const t = (h) => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(h); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
  return fs.readFileSync(file, 'utf8').split(/\r?\n\r?\n/).map((b) => {
    const m = /([\d:,.]+)\s*-->\s*([\d:,.]+)\s*\n([\s\S]*)/.exec(b); if (!m) return null;
    const text = m[3].replace(/\s+/g, ' ').trim();
    return { start: t(m[1]), end: t(m[2]), text, hype: HYPE.test(text) || /[!?]{1,}$/.test(text) };
  }).filter(Boolean);
}
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1] ?? -60; };

async function analyze(file, opts = {}) {
  const info = ffprobeJSON(file), target = Math.min(45, +(opts.len || 40));
  log(`analysing ${path.basename(file)} (${info.duration.toFixed(1)} s)…`);
  const [db, cuts] = await Promise.all([info.hasAudio ? loudness(file) : [], sceneCuts(file)]);
  const subs = srtHits(opts.srt);
  const n = Math.max(1, Math.ceil(info.duration / 0.25)), score = new Float32Array(n);
  // 1) loudness above a rolling 20 s baseline (spikes = reactions), plus sudden jumps.
  for (let i = 0; i < db.length; i++) {
    const base = median(db.slice(Math.max(0, i - 40), i + 40));
    const lift = Math.max(0, db[i] - base - 3) / 6, jump = i > 2 ? Math.max(0, db[i] - db[i - 3] - 6) / 6 : 0;
    score[i] += lift + jump * 0.8;
  }
  // 2) scene-cut density (action / fast camera) — small bonus.
  for (const c of cuts) for (let k = -4; k <= 4; k++) { const i = Math.round(c / 0.25) + k; if (i >= 0 && i < n) score[i] += 0.15; }
  // 3) hype words in subtitles — strong bonus; dead air is penalised.
  for (const s of subs) if (s.hype) for (let i = Math.floor(s.start / 0.25); i <= Math.ceil(s.end / 0.25) && i < n; i++) score[i] += 1.2;
  const floor = median(db) - 18;
  for (let i = 0; i < db.length; i++) if (db[i] < floor) score[i] -= 0.5;

  // Smooth (1 s) and pick peaks with non-max suppression.
  const sm = Array.from(score, (_, i) => { let a = 0, c = 0; for (let k = -2; k <= 2; k++) if (score[i + k] !== undefined) { a += score[i + k]; c++; } return a / c; });
  const order = sm.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const peaks = [];
  for (const [v, i] of order) {
    if (v <= 0.15 || peaks.length > 40) break;
    if (peaks.every((p) => Math.abs(p.i - i) > 24)) peaks.push({ i, t: i * 0.25, v });
  }
  if (!peaks.length) peaks.push({ i: 0, t: Math.min(info.duration / 2, 5), v: 0.1 });

  // Each peak → a clip with setup before and reaction after, snapped to nearby scene cuts.
  const snap = (t, dir) => { const c = cuts.filter((x) => Math.abs(x - t) < 0.6); return c.length ? c.sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0] : t; };
  let clips = peaks.map((p) => ({
    in: Math.max(0, snap(p.t - 3.2 - Math.min(2, p.v), -1)),
    out: Math.min(info.duration, snap(p.t + 1.8 + Math.min(1.5, p.v / 2), 1)),
    peak: p.t, score: +p.v.toFixed(3),
  }));
  // Keep the best clips until the target length (minus the hook teaser), then play them in story order.
  clips.sort((a, b) => b.score - a.score);
  const picked = []; let total = 2;
  for (const c of clips) {
    if (picked.some((p) => c.in < p.out + 0.5 && c.out > p.in - 0.5)) continue;
    if (total + (c.out - c.in) > target) continue;
    picked.push(c); total += c.out - c.in;
  }
  const best = picked[0];
  picked.sort((a, b) => a.in - b.in);
  // Hook: a 1.6 s teaser of the best moment at frame 1, then the story, ending on the payoff.
  const segments = [{ in: Math.max(0, best.peak - 0.9), out: Math.min(info.duration, best.peak + 0.7), role: 'hook', peak: best.peak, score: best.score }]
    .concat(picked.map((c, k) => ({ ...c, role: c === best ? 'payoff' : 'beat', zoom: k % 2 ? 1.12 : 1 })));
  segments.forEach((s) => { s.in = +s.in.toFixed(3); s.out = +s.out.toFixed(3); });

  const { duration: dur, graphics } = buildGraphics(segments, subs, opts.title);
  return { source: path.resolve(file), info, duration: dur, accent: opts.accent || '#FFD23F', segments, graphics, subs: subs.filter((s) => segments.some((g) => s.start < g.out && s.end > g.in)) };
}

function buildGraphics(segments, subs = [], titleIn, vo) {
  // Edit timeline positions + auto motion-graphics plan (graphics are rendered BEFORE the cut).
  let t = 0;
  for (const s of segments) { s.at = +t.toFixed(3); t += s.out - s.in; }
  const dur = +t.toFixed(3), title = (titleIn || 'THIS WENT WRONG…').toUpperCase();
  const graphics = [{ type: 'hook', text: title, at: 0, dur: 2.2 }];
  segments.forEach((s, k) => {
    if (k === 0) return;
    graphics.push({ type: k % 2 ? 'glitch' : 'flash', at: Math.max(0, s.at - 0.06), dur: 0.32 }); // cut transition
    const pk = s.at + (s.peak - s.in);
    graphics.push({ type: 'flash', at: Math.max(0, pk - 0.12), dur: 0.5 });
    const line = subs.find((x) => x.hype && x.start <= s.peak + 1 && x.end >= s.peak - 1);
    graphics.push({ type: 'pop', text: (line ? line.text.split(' ').slice(0, 3).join(' ') : ['NO WAY', 'WAIT…', 'BRO?!', 'RUN!', 'OH NO', 'WHAT?!'][k % 6]).toUpperCase(), at: pk, dur: 1.3 });
    if (s.role === 'payoff') graphics.push({ type: 'marker', at: pk + 0.2, dur: 1.6, x: 0.5, y: 0.46 });
    if (k > 1 && k % 3 === 0) graphics.push({ type: 'chapter', text: 'MEANWHILE…', at: s.at, dur: 1.2 });
  });
  if (!vo) // voiceover captions replace subtitle captions
  // Captions from subtitles, mapped into edit time.
  for (const sg of segments) for (const sb of subs) {
    if (sb.end <= sg.in || sb.start >= sg.out) continue;
    const a = sg.at + Math.max(0, sb.start - sg.in), b = sg.at + Math.min(sg.out, sb.end) - sg.in;
    if (b - a > 0.2) graphics.push({ type: 'caption', text: sb.text.toUpperCase().slice(0, 42), at: +a.toFixed(3), dur: +(b - a).toFixed(3) });
  }
  graphics.push({ type: 'cta', text: 'FOLLOW FOR PART 2', at: Math.max(0, dur - 2.4), dur: 2.4 });
  return { duration: dur, graphics };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: highlights.js <video> [--out edit.json] [--len 45] [--srt subs.srt] [--title TEXT]'); process.exit(1); }
  analyze(file, { len: arg('len'), srt: arg('srt'), title: arg('title'), accent: arg('accent') }).then((e) => {
    const out = arg('out', 'edit.json'); fs.writeFileSync(out, JSON.stringify(e, null, 2));
    console.log(JSON.stringify({ out, duration: e.duration, segments: e.segments.length, graphics: e.graphics.length }));
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { analyze, buildGraphics };
