#!/usr/bin/env node
// Blocks made-up lore. lore.json = { facts: [{ id, fact, source }] } (source = the URL the fact was read on).
// script.json lines: { text, tone, pause, facts: [ids] | ["footage"], gfx?: [...] }. Every line must cite facts; every cited fact
// must exist with an http(s) source; every Name / number in a line must appear in its cited facts (or be marked footage).
// usage: lore_check.js script.json lore.json   → prints LORE PASS or the failures
const fs = require('fs');
function check(script, lore) {
  const facts = new Map((lore.facts || []).map((f) => [f.id, f])), errs = [];
  for (const f of facts.values()) if (!/^https?:\/\//.test(f.source || '')) errs.push(`fact ${f.id}: no source URL`);
  const COMMON = new Set('The A An And But So He She They It This That These Those His Her Their I We You My Our Your In On At Of To For With From By Then When Why What Who How Nobody Everyone Everybody Someone No Not Now Just One Two Three First Last Day Night Minecraft SMP Server Part Follow Wait Meanwhile Until After Before Because If Even Still Only All Every Was Were Is Are Be Been Being Had Has Have Did Do Does Never Ever Yet Or Nor Him Them Its Here There Where Which While Inside Outside Back Over Into Out Up Down Off Again Once Twice Bro Oh Yes Yeah Okay OK Run Help'.split(' '));
  (script.lines || script).forEach((l, i) => {
    const ids = l.facts || [];
    if (!ids.length) return errs.push(`line ${i + 1} "${l.text}": cites no facts (use ["footage"] if it only describes the clip)`);
    const txt = ids.map((id) => id === 'footage' ? (script.footage || '') : facts.get(id)?.fact).join(' ');
    for (const id of ids) if (id !== 'footage' && !facts.has(id)) errs.push(`line ${i + 1}: unknown fact "${id}"`);
    const names = (l.text.match(/\b[A-Z][a-zA-Z0-9_']+/g) || []).filter((w, k, a) => !COMMON.has(w.replace(/'s$/, '')) && !(k === 0 && l.text.trim().startsWith(w) && COMMON.has(w)));
    for (const n of names) if (!new RegExp(n.replace(/'s$/, ''), 'i').test(txt)) errs.push(`line ${i + 1}: "${n}" is not in its cited facts — research it or remove it`);
    for (const num of l.text.match(/\b\d[\d,.]*\b/g) || []) if (!txt.includes(num)) errs.push(`line ${i + 1}: number ${num} is not in its cited facts`);
  });
  return errs;
}
if (require.main === module) {
  const [s, l] = process.argv.slice(2); if (!s || !l) { console.error('usage: lore_check.js script.json lore.json'); process.exit(1); }
  const errs = check(JSON.parse(fs.readFileSync(s, 'utf8')), JSON.parse(fs.readFileSync(l, 'utf8')));
  if (errs.length) { console.log('LORE FAIL\n' + errs.join('\n')); process.exit(1); } console.log('LORE PASS');
}
module.exports = { check };
