// 3-round review: each round measures the rendered short, fails what's weak and IMPROVES the edit for the next render.
// Checks: length ≤ 45 s · hook (loud teaser + title + voice in the first 0.4 s) · structure (nametag/context, lore, payoff stamp, CTA)
// · pacing (no shot > 3 s, a pattern interrupt at least every 2.5 s, no dead air) · graphics never collide · loudness −14 LUFS ±1.5.
const fs = require('fs'), path = require('path');
const { run } = require('./lib/util');
const ZONE = { hook: 'top', lore: 'top', chapter: 'top', nametag: 'mid', stamp: 'mid', pop: 'mid', counter: 'mid', marker: 'mid', cta: 'low', caption: 'cap', words: 'cap' };
const MAXSHOT = 3.0, GAP = 2.5, MAXLEN = 45;

async function measure(mp4) {
  const { err } = await run(['-hide_banner', '-i', mp4, '-af', 'ebur128', '-f', 'null', '-'], { allowFail: true });
  const I = /I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/.exec(err) || [...err.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  const { err: bl } = await run(['-hide_banner', '-i', mp4, '-vf', 'blackdetect=d=0.3:pix_th=0.08', '-an', '-f', 'null', '-'], { allowFail: true });
  return { lufs: I ? +I[1] : null, black: [...bl.matchAll(/black_start:([\d.]+)/g)].map((m) => +m[1]) };
}
function check(edit, vo, m) {
  const f = [], ev = [], g = edit.graphics;
  if (edit.duration > MAXLEN) f.push({ k: 'length', msg: `${edit.duration.toFixed(1)} s > ${MAXLEN} s` });
  const hookSeg = edit.segments[0];
  if (hookSeg.role !== 'hook' || hookSeg.out - hookSeg.in > 2.2) f.push({ k: 'hook', msg: 'frame 1 is not a ≤ 2 s teaser of the best moment' });
  if (!g.some((x) => x.type === 'hook' && x.at < 0.1)) f.push({ k: 'hook', msg: 'no hook title on frame 1' });
  if (vo && vo.words[0]?.start > 0.4) f.push({ k: 'hook', msg: `voice starts late (${vo.words[0].start}s)` });
  for (const [t, why] of [['nametag', 'who is this (nametag)'], ['stamp', 'payoff stamp'], ['cta', 'ending CTA/loop']]) if (!g.some((x) => x.type === t)) f.push({ k: 'structure', msg: `missing ${why}` });
  let t = 0;
  edit.segments.forEach((s, i) => { const d = s.out - s.in; if (d > MAXSHOT + 0.01) f.push({ k: 'pacing', msg: `shot ${i} is ${d.toFixed(1)} s`, i }); ev.push(t); t += d; });
  ev.push(...g.filter((x) => x.type !== 'words').map((x) => x.at)); ev.sort((a, b) => a - b); ev.push(edit.duration);
  for (let i = 1; i < ev.length; i++) if (ev[i] - ev[i - 1] > GAP) f.push({ k: 'interrupt', msg: `nothing new from ${ev[i - 1].toFixed(1)} to ${ev[i].toFixed(1)} s`, a: ev[i - 1], b: ev[i] });
  if (vo) for (let i = 1; i < vo.words.length; i++) if (vo.words[i].start - vo.words[i - 1].end > 1.3) f.push({ k: 'deadair', msg: `voice gap at ${vo.words[i - 1].end}s` });
  const zs = g.filter((x) => ZONE[x.type] && x.type !== 'words');
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) { const a = zs[i], b = zs[j];
    if (ZONE[a.type] === ZONE[b.type] && a.at < b.at + b.dur && b.at < a.at + a.dur) f.push({ k: 'collide', msg: `${a.type}@${a.at} hits ${b.type}@${b.at}`, a, b }); }
  if (m.lufs !== null && Math.abs(m.lufs + 14) > 1.5) f.push({ k: 'loudness', msg: `${m.lufs} LUFS` });
  if (m.black.length) f.push({ k: 'black', msg: `black frames at ${m.black.join(', ')}s` });
  return f;
}
function improve(edit, fails, vo, round) {
  const done = [];
  // pacing: split long shots into jump-cuts with alternating punch-in (content kept, rhythm ×2)
  if (fails.some((x) => x.k === 'pacing')) {
    const out = []; let n = 0;
    for (const s of edit.segments) {
      const d = s.out - s.in; if (d <= MAXSHOT || s.role === 'hook') { out.push(s); continue; }
      const parts = Math.ceil(d / (round === 1 ? 2.6 : 2.2)), L = d / parts;
      for (let p = 0; p < parts; p++) out.push({ ...s, in: +(s.in + p * L).toFixed(3), out: +(s.in + (p + 1) * L).toFixed(3), zoom: [1, 1.14, 1.26][(n++ + p) % 3], role: p === parts - 1 ? s.role : 'beat' });
    }
    edit.segments = out; done.push('long shots → jump-cuts with punch-ins');
  }
  // collisions: push the later graphic until its zone is free
  for (const x of fails.filter((x) => x.k === 'collide')) { const late = x.a.at >= x.b.at ? x.a : x.b, early = late === x.a ? x.b : x.a; late.at = +(early.at + early.dur + 0.05).toFixed(3); }
  if (fails.some((x) => x.k === 'collide')) done.push('moved colliding graphics');
  // dead stretches: a pop of the strongest spoken word there (or an impact flash)
  for (const x of fails.filter((x) => x.k === 'interrupt')) {
    const mid = (x.a + x.b) / 2, w = vo?.words.filter((w) => w.start > x.a + 0.4 && w.start < x.b - 0.4).sort((p, q) => q.w.length - p.w.length)[0];
    edit.graphics.push(w && w.w.replace(/\W/g, '').length > 3 ? { type: 'pop', text: w.w.replace(/[^\w'!?]/g, '').toUpperCase(), at: +w.start.toFixed(3), dur: 1.1 } : { type: 'flash', at: +mid.toFixed(3), dur: 0.4 });
  }
  if (fails.some((x) => x.k === 'interrupt')) done.push('pattern interrupts added');
  if (fails.some((x) => x.k === 'hook') && edit.segments[0].role === 'hook') { const h = edit.segments[0]; h.in = +(h.peak - 0.8).toFixed(3); h.out = +(h.peak + 0.6).toFixed(3); done.push('tighter hook teaser'); }
  if (!edit.graphics.some((x) => x.type === 'cta')) edit.graphics.push({ type: 'cta', text: 'FOLLOW FOR PART 2', at: Math.max(0, edit.duration - 2.4), dur: 2.4 });
  edit.graphics.sort((a, b) => a.at - b.at);
  return done;
}
module.exports = { measure, check, improve, MAXLEN };
