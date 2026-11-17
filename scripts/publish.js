// Publish pack: publish.md (3 titles with a ⭐ pick, description, ≤3 hashtags, tags, pinned question, cover, related video,
// upload checklist) + thumbnail.png (1080×1920 cover from the payoff frame, big 2–3 word text in the video's design system).
// Data comes from script.json → "publish": { titles: [..3], best: 0, description, hashtags: [..≤3], tags: [..], pinned, thumb: "2-3 WORDS", related }
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { run, launchBrowser } = require('./lib/util');

async function thumbnail(edit, p, out) {
  const pay = edit.segments.find((s) => s.role === 'payoff') || edit.segments[0], jpg = out.replace(/\.png$/, '_src.jpg');
  await run(['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(pay.peak), '-i', edit.source, '-frames:v', '1', '-q:v', '2', jpg]);
  const img = 'data:image/jpeg;base64,' + fs.readFileSync(jpg).toString('base64'), mg = fs.readFileSync(path.join(__dirname, '..', 'templates', 'mg.js'), 'utf8');
  const b = await launchBrowser(), pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.setContent(`<canvas id=c width=1080 height=1920></canvas><script>${mg}</script>`);
  const data = await pg.evaluate(async ([src, text, acc]) => {
    const c = document.getElementById('c'), x = c.getContext('2d'), im = new Image(); im.src = src; await im.decode();
    const s = Math.max(1080 / im.width, 1920 / im.height) * 1.08; x.filter = 'saturate(1.35) contrast(1.12)';
    x.drawImage(im, (1080 - im.width * s) / 2, (1920 - im.height * s) / 2 + 60, im.width * s, im.height * s); x.filter = 'none';
    const v = x.createRadialGradient(540, 1000, 300, 540, 1000, 1150); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.65)'); x.fillStyle = v; x.fillRect(0, 0, 1080, 1920);
    MG.draw(x, { type: 'hook', text, dur: 9 }, 1.2, acc);                                  // settled hook-title look
    x.strokeStyle = '#ff2d2d'; x.lineWidth = 18; x.beginPath(); x.ellipse(540, 1080, 250, 210, -0.1, 0, 6.283); x.stroke(); // one red circle on the action
    return c.toDataURL('image/png');
  }, [img, (p.thumb || 'WAIT FOR IT').toUpperCase(), edit.accent]);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); fs.rmSync(jpg); await b.close();
  return out;
}
async function publishPack(edit, script, dir) {
  const p = script.publish || {}, best = p.best || 0, titles = (p.titles || []).map((t, i) => `${i + 1}. ${t}${i === best ? ' ⭐' : ''}`);
  const tags = (p.hashtags || []).slice(0, 3).map((h) => '#' + h.replace(/^#/, '')).join(' ');
  const md = `# Publish pack — ${script.title || ''}\n\n## Title:\n${titles.join('\n')}\n\n## Description:\n${(p.description || '').trim()}\n\n${tags}\n\n` +
    `## Tags:\n${(p.tags || []).join(', ')}\n\n## Pinned comment:\n${p.pinned || ''}\n\n## Cover:\nthumbnail.png (pick it as the Shorts cover at upload)\n\n` +
    `## Related video:\n${p.related || 'Related video: none yet — link part 2 when it is up'}\n\n## Upload checklist:\nAudience: not made for kids · altered-content disclosure: no (real gameplay) · playlist: Unstable SMP lore\n`;
  const mdFile = path.join(dir, 'publish.md'); fs.writeFileSync(mdFile, md);
  const thumb = await thumbnail(edit, p, path.join(dir, 'thumbnail.png'));
  const r = spawnSync(process.execPath, [path.join(__dirname, 'publish_check.js'), mdFile], { encoding: 'utf8' });
  return { md: mdFile, thumb, check: (r.stdout || '').trim(), pass: r.status === 0, data: { titles: p.titles || [], best, description: (p.description || '').trim() + '\n\n' + tags, tags: p.tags || [], pinned: p.pinned || '' } };
}
module.exports = { publishPack };
