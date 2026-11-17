#!/usr/bin/env node
// Builds the final soundtrack (mix.wav): game audio of the kept segments, ducked under the voiceover, plus synthesized
// SFX on every motion graphic (boom on slams/flashes, whoosh on wipes/cards, glitch on glitches, tick on pops). −14 LUFS.
const fs = require('fs'), path = require('path');
const { run, log } = require('./lib/util');
const SR = 48000;
function wav(file, data) {
  const pcm = Buffer.alloc(data.length * 2); data.forEach((v, i) => pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2));
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); fs.writeFileSync(file, Buffer.concat([h, pcm]));
}
let seed = 1; const noise = () => ((seed = (seed * 16807) % 2147483647) / 1073741823.5) - 1;
const SFX = {
  boom(d = 1.1) { const a = new Float32Array(SR * d); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / SR, f = 32 + 90 * Math.exp(-t * 9); ph += 2 * Math.PI * f / SR; a[i] = Math.sin(ph) * Math.exp(-t * 3.2) * 0.95 + noise() * Math.exp(-t * 40) * 0.5; } return a; },
  whoosh(d = 0.55) { const a = new Float32Array(SR * d); let lp = 0, lp2 = 0; for (let i = 0; i < a.length; i++) { const t = i / d / SR, env = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 2, c = 0.04 + 0.35 * t; lp += c * (noise() - lp); lp2 += c * (lp - lp2); a[i] = (lp - lp2) * env * 2.4; } return a; },
  glitch(d = 0.4) { const a = new Float32Array(SR * d); for (let i = 0; i < a.length; i++) { const blk = Math.floor(i / 1400); a[i] = (blk % 3 ? Math.sign(Math.sin(i * (0.05 + (blk % 5) * 0.03))) * 0.35 : noise() * 0.4) * (1 - i / a.length); } return a; },
  tick(d = 0.12) { const a = new Float32Array(SR * d); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = Math.sin(2 * Math.PI * (1400 - 4000 * t) * t) * Math.exp(-t * 45) * 0.7; } return a; },
};
const MAP = { hook: 'boom', flash: 'boom', stamp: 'boom', chapter: 'whoosh', nametag: 'whoosh', lore: 'whoosh', cta: 'whoosh', glitch: 'glitch', pop: 'tick', counter: 'tick', marker: 'tick' };

async function buildMix(edit, dir, vo) {
  const sdir = path.join(dir, 'sfx'); fs.mkdirSync(sdir, { recursive: true });
  for (const k of Object.keys(SFX)) wav(path.join(sdir, k + '.wav'), SFX[k]());
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', edit.source], f = [];
  edit.segments.forEach((s, i) => f.push(edit.info.hasAudio ? `[0:a]atrim=${s.in}:${s.out},asetpts=PTS-STARTPTS,aresample=${SR},aformat=channel_layouts=stereo[s${i}]` : `anullsrc=r=${SR}:cl=stereo,atrim=0:${(s.out - s.in).toFixed(3)}[s${i}]`));
  f.push(`${edit.segments.map((_, i) => `[s${i}]`).join('')}concat=n=${edit.segments.length}:v=0:a=1[game]`);
  let inputs = 1, bus = '[game]';
  if (vo) {
    args.push('-i', vo); const vi = inputs++;
    f.push(`[${vi}:a]aresample=${SR},aformat=channel_layouts=stereo,volume=1.6,apad,asplit[v1][v2]`, `[game]volume=0.8[g0]`, `[g0][v1]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=350[duck]`);
    bus = '[duck]'; f.push(`[v2]anull[vox]`);
  }
  const hits = edit.graphics.filter((g) => MAP[g.type]).slice(0, 60), labels = [];
  for (const [k, g] of hits.entries()) {
    args.push('-i', path.join(sdir, MAP[g.type] + '.wav')); const ii = inputs++, ms = Math.max(0, Math.round((g.at - (MAP[g.type] === 'whoosh' ? 0.15 : 0)) * 1000));
    f.push(`[${ii}:a]adelay=${ms}|${ms},volume=${MAP[g.type] === 'boom' ? 0.8 : 0.55}[x${k}]`); labels.push(`[x${k}]`);
  }
  const all = [bus, ...(vo ? ['[vox]'] : []), ...labels];
  f.push(`${all.join('')}amix=inputs=${all.length}:duration=first:normalize=0,atrim=0:${edit.duration},loudnorm=I=-14:TP=-1.2:LRA=9,aresample=${SR}[out]`);
  const out = path.join(dir, 'mix.wav');
  await run([...args, '-filter_complex', f.join(';'), '-map', '[out]', '-ac', '2', '-c:a', 'pcm_s16le', out]);
  log(`soundtrack: game${vo ? ' + voiceover (ducked)' : ''} + ${hits.length} SFX`);
  return out;
}
module.exports = { buildMix };
