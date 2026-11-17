// Shared helpers: ffmpeg, browser, time.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const log = (m) => process.stderr.write(`[smp-shorts] ${m}\n`);
const DEPS = path.join(os.homedir(), '.motion-forge', 'deps');

function req(id) {
  let g = ''; try { g = execFileSync('npm', ['root', '-g'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  try { return require(require.resolve(id, { paths: [process.cwd(), DEPS, __dirname, g].filter(Boolean) })); } catch { return null; }
}
let _ff;
function ffmpeg() {
  if (_ff) return _ff;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return (_ff = 'ffmpeg'); } catch {}
  let p = req('ffmpeg-static');
  if (!p) {
    fs.mkdirSync(DEPS, { recursive: true });
    if (!fs.existsSync(path.join(DEPS, 'package.json'))) fs.writeFileSync(path.join(DEPS, 'package.json'), '{"private":true}');
    log('first-time setup: downloading ffmpeg…');
    execFileSync('npm', ['install', '--no-audit', '--no-fund', 'ffmpeg-static@5'], { cwd: DEPS, stdio: 'inherit', shell: process.platform === 'win32' });
    p = req('ffmpeg-static');
  }
  if (!p) throw new Error('ffmpeg not found');
  return (_ff = p);
}
const ffprobeJSON = (file) => {
  // ffmpeg -i prints stream info to stderr; parse duration + size without needing ffprobe.
  let err = '';
  try { execFileSync(ffmpeg(), ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { err = String(e.stderr || ''); }
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(err);
  const v = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(err);
  const f = /([\d.]+) fps/.exec(err);
  return { duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, width: v ? +v[1] : 1920, height: v ? +v[2] : 1080, fps: f ? +f[1] : 30, hasAudio: /Audio:/.test(err) };
};
function run(args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg(), args, { stdio: [opts.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const out = []; let err = '';
    p.stdout.on('data', (c) => out.push(c)); p.stderr.on('data', (c) => { err += c; if (err.length > 2e6) err = err.slice(-1e6); });
    p.on('close', (code) => (code === 0 || opts.allowFail ? res({ out: Buffer.concat(out), err }) : rej(new Error(err.slice(-3000)))));
    if (opts.stdin) opts.stdin(p.stdin);
  });
}
async function launchBrowser() {
  const pw = req('playwright') || req('playwright-core');
  if (!pw) throw new Error('playwright not found — run: npm i -g playwright-core');
  for (const channel of [undefined, 'chrome', 'msedge']) {
    try { return await pw.chromium.launch(channel ? { channel } : {}); } catch {}
  }
  if (fs.existsSync('/opt/pw-browsers/chromium')) return pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  throw new Error('No Chrome/Chromium found');
}
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? (process.argv[i + 1] ?? true) : def; };
const flag = (name) => process.argv.includes('--' + name);
module.exports = { log, ffmpeg, ffprobeJSON, run, launchBrowser, arg, flag };
