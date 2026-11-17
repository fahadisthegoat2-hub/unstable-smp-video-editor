#!/usr/bin/env node
// Voiceover with the SAME engine as Motion Forge's Voice Studio: Kokoro-82M (kokoro-js), same voices + tone table.
// usage: voice.mjs <outDir> <script.json> [--voice am_michael] [--speed 1.12]
// script.json = { lines: [{ text, tone, pause }] } or [["text","tone",pause]] · writes vo.wav + vo.json (word timings)
import fs from 'fs'; import path from 'path'; import os from 'os'; import { createRequire } from 'module'; import { pathToFileURL } from 'url'; import { execSync } from 'child_process';
const DEPS = path.join(os.homedir(), '.motion-forge', 'deps'), req = createRequire(import.meta.url);
const find = (id) => { try { return req.resolve(id, { paths: [process.cwd(), DEPS] }); } catch { return null; } };
if (!find('kokoro-js')) {
  fs.mkdirSync(DEPS, { recursive: true }); if (!fs.existsSync(DEPS + '/package.json')) fs.writeFileSync(DEPS + '/package.json', '{"private":true}');
  console.error('[smp-shorts] first-time setup: installing the Kokoro voice engine…'); execSync('npm install --no-audit --no-fund --loglevel=error kokoro-js', { cwd: DEPS, stdio: 'inherit' });
}
const { KokoroTTS } = await import(pathToFileURL(find('kokoro-js')).href);
try { const { env } = await import(pathToFileURL(find('@huggingface/transformers')).href); env.cacheDir = path.join(DEPS, 'models'); if (process.env.KOKORO_MODELS) { env.localModelPath = process.env.KOKORO_MODELS; } } catch {}
const TONES = { neutral: [1, 1], excited: [1.1, 1.15], calm: [0.9, 0.88], serious: [0.95, 1], sad: [0.86, 0.8], whisper: [0.93, 0.6], scared: [1.12, 0.9], dramatic: [0.86, 1.08], shout: [1.04, 1.3], mysterious: [0.88, 0.85], happy: [1.05, 1.05], angry: [1.06, 1.25] };
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
if (!process.argv[2] || !process.argv[3]) { console.error('usage: voice.mjs <outDir> <script.json> [--voice id] [--speed n]'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), BASE = +arg('--speed', raw.speed || 1.12), VOICE = arg('--voice', raw.voice || 'am_michael');
const S = (raw.lines || raw).map((l) => Array.isArray(l) ? [l[0], l[1] || 'neutral', l[2] ?? 0.1] : [l.text, l.tone || 'neutral', l.pause ?? 0.1]);
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
let out = [new Float32Array(1200)], sr = 24000, t = 0.05; const words = [], lines = [];
for (const [text, tone, pause] of S) {
  const [sp, gain] = TONES[tone] || TONES.neutral;
  const a = await tts.generate(text.replace(/\[[^\]]*\]/g, ''), { voice: VOICE, speed: BASE * sp }); sr = a.sampling_rate; let x = a.audio;
  const thr = 0.012; let i0 = 0, i1 = x.length - 1; while (i0 < x.length && Math.abs(x[i0]) < thr) i0++; while (i1 > i0 && Math.abs(x[i1]) < thr) i1--;
  i0 = Math.max(0, i0 - Math.round(sr * 0.02)); i1 = Math.min(x.length, i1 + Math.round(sr * 0.06)); x = x.slice(i0, i1).map((v) => v * gain);
  const d = x.length / sr, ws = text.split(/\s+/).filter(Boolean), wt = ws.map((w) => Math.max(2, w.replace(/[^A-Za-z0-9]/g, '').length) + (/[.,?!:]$/.test(w) ? 2 : 0)), tot = wt.reduce((p, c) => p + c, 0);
  let acc = 0; for (let k = 0; k < ws.length; k++) { const s0 = t + d * acc / tot; acc += wt[k]; words.push({ w: ws[k], start: +s0.toFixed(3), end: +(t + d * acc / tot).toFixed(3), tone }); }
  lines.push({ text, tone, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
  out.push(x); t += d; out.push(new Float32Array(Math.round(sr * pause))); t += pause;
}
const N = out.reduce((p, c) => p + c.length, 0), all = new Float32Array(N); let o = 0; for (const c of out) { all.set(c, o); o += c.length; }
let peak = 0; for (const v of all) peak = Math.max(peak, Math.abs(v)); const k = 0.89 / (peak || 1);
const pcm = Buffer.alloc(N * 2); for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(all[i] * k * 32767))), i * 2);
const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'vo.wav'), Buffer.concat([h, pcm]));
fs.writeFileSync(path.join(dir, 'vo.json'), JSON.stringify({ voice: VOICE, duration: +(N / sr).toFixed(3), lines, words }, null, 1));
console.log(JSON.stringify({ wav: path.resolve(dir, 'vo.wav'), duration: +(N / sr).toFixed(2), words: words.length }));
