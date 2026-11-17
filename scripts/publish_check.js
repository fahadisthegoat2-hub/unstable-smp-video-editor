#!/usr/bin/env node
// Lints a publish pack (publish.md) against what YouTube actually uses. Exit 1 = fix it before delivering.
// Usage: node publish_check.js publish.md [--long]     (--long = 16:9 long-form: chapters + thumbnail concept + end screen required)
const fs = require('fs'), args = process.argv.slice(2), file = args.find((a) => !a.startsWith('--'));
if (!file || !fs.existsSync(file)) { console.error('usage: publish_check.js publish.md [--long]'); process.exit(1); }
const src = fs.readFileSync(file, 'utf8'), fails = [], sec = {}; let cur = '_';
for (const ln of src.split('\n')) { const m = ln.match(/^\s*(?:#{1,4}\s*|\*\*)([^*#:]+?)(?:\*\*|:)\s*:?\s*(.*)$/); if (m && m[1].length < 40 && /^(\s*#|\s*\*\*)/.test(ln)) { cur = m[1].trim().toLowerCase(); sec[cur] = (sec[cur] || '') + (m[2] ? m[2] + '\n' : ''); } else sec[cur] = (sec[cur] || '') + ln + '\n'; }
const get = (re) => { const k = Object.keys(sec).find((k) => re.test(k)); return k ? sec[k].trim() : ''; };
const stamps = [...src.matchAll(/^\s*[-•]?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s+\S/gm)].map((m) => m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]);
const long = args.includes('--long') || stamps.length >= 3;
const titles = get(/^title/).split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);
if (titles.length < 3) fails.push(`TITLE: ${titles.length} option(s) — give 3 and star (⭐) the best`);
if (titles.length && !titles.some((t) => /⭐|★/.test(t))) fails.push('TITLE: no starred (⭐) pick');
for (const t0 of titles) { const t = t0.replace(/[⭐★]/g, '').trim();
  if (t.length > 100) fails.push(`TITLE: "${t.slice(0, 40)}…" is ${t.length} chars — YouTube allows 100`);
  else if (t.length > 60) fails.push(`TITLE: "${t.slice(0, 40)}…" is ${t.length} chars — keep ≤ 60 (it gets cut on phones)`);
  if (t.length > 12 && t === t.toUpperCase() && /[A-Z]/.test(t)) fails.push(`TITLE: "${t.slice(0, 40)}" is all caps — reads as spam`); }
const desc = get(/^description/), d1 = desc.split('\n')[0] || '';
if (!desc) fails.push('DESCRIPTION: missing'); else {
  if (d1.length < 30) fails.push('DESCRIPTION: line 1 must be the hook + the topic words (it shows in search and under the title)');
  if (d1.length > 160) fails.push(`DESCRIPTION: line 1 is ${d1.length} chars — only ~120–150 show before "more"`);
  const tags = desc.match(/#[\p{L}\p{N}_]+/gu) || []; if (tags.length > 3) fails.push(`HASHTAGS: ${tags.length} in the description — use ≤ 3 (YouTube shows 3 above the title; more dilutes them)`);
  if (!tags.length) fails.push('HASHTAGS: add 1–3 topic hashtags at the end of the description'); }
const tg = get(/^tags/); if (tg.length > 500) fails.push(`TAGS: ${tg.length} chars — YouTube's limit is 500 in total`);
const pin = get(/^pinned/); if (!pin) fails.push('PINNED COMMENT: missing'); else if (!/\?/.test(pin)) fails.push('PINNED COMMENT: must be a question viewers want to answer');
if (!get(/^(cover|thumbnail)/)) fails.push(long ? 'THUMBNAIL: missing concept/file (1 face + 1 object + ≤ 3 words; must not repeat the title)' : 'COVER: name the cover frame/file (picked in the app at upload)');
if (long) {
  if (stamps.length < 3) fails.push(`CHAPTERS: ${stamps.length} timestamp(s) — long-form needs ≥ 3 in the description`);
  else { if (stamps[0] !== 0) fails.push('CHAPTERS: the first timestamp must be 0:00');
    stamps.forEach((s, i) => { if (i && s - stamps[i - 1] < 10) fails.push(`CHAPTERS: chapter ${i} is ${s - stamps[i - 1]}s — each must be ≥ 10 s and in order`); }); }
  if (!/end\s*screen/i.test(src)) fails.push('END SCREEN: say which ONE video/playlist the last 5–20 s points to');
} else if (!/related video|part\s*\d|next part|long video/i.test(src)) fails.push('RELATED VIDEO: say what this Short links to (long video / next part) — or "Related video: none yet"');
if (!/upload checklist|altered|made for kids/i.test(src)) fails.push('UPLOAD CHECKLIST: add the line (audience: not made for kids · altered-content disclosure yes/no · playlist)');
console.log(fails.length ? `PUBLISH FAIL (${fails.length}):\n- ` + fails.join('\n- ') : `PUBLISH PASS · ${long ? 'long-form' : 'short'} · ${titles.length} titles`);
process.exit(fails.length ? 1 : 0);
