// SMP motion-graphics library (shared by the CapCut .mov renderer and the device-render artifact).
(function(){

// SMP motion graphics — one design system: chunky block type, black outline, one accent, hard drop shadow.
let g, W = 1080, H = 1920;
const FONT = '"Arial Black","Segoe UI Black","Impact","Helvetica Neue",sans-serif';
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const E = { out: (x) => 1 - (1 - x) ** 3, back: (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2, in: (x) => x ** 3,
  elastic: (x) => x === 0 || x === 1 ? x : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1 };
const rnd = (s) => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };
let G = {}, ACC = '#FFD23F';
function life(t, d, inT = 0.18, outT = 0.2) { return cl(t / inT) * (1 - cl((t - (d - outT)) / outT)); }
function block(x, y, w, h, col, sh = 12) { g.fillStyle = '#000'; g.fillRect(x + sh, y + sh, w, h); g.fillStyle = col; g.fillRect(x, y, w, h); }
function text(s, x, y, size, col = '#fff', rot = 0, sc = 1, maxW = 960) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = `900 ${size}px ${FONT}`; const w = g.measureText(s).width; const fit = Math.min(1, maxW / w); g.scale(sc * fit, sc * fit);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';

  if (col !== '#000') { g.fillStyle = '#000'; g.fillText(s, 10, 12); g.lineWidth = size * 0.16; g.strokeStyle = '#000'; g.strokeText(s, 0, 0); }
  g.fillStyle = col; g.fillText(s, 0, 0); g.restore();
}
function wrap(s, max = 14) { const out = [], w = s.split(' '); let l = ''; for (const x of w) { if ((l + ' ' + x).trim().length > max && l) { out.push(l); l = x; } else l = (l + ' ' + x).trim(); } if (l) out.push(l); return out; }
const TYPES = {
  hook(t, d) { // slam title: letters drop in staggered, screen-shake, accent bar wipes under
    const lines = wrap(G.text, 12), a = life(t, d, 0.01, 0.25);
    const shake = t < 0.35 ? (rnd(Math.floor(t * 60)) - 0.5) * 26 * (1 - t / 0.35) : 0;
    g.globalAlpha = a;
    const bw = 980 * E.out(cl((t - 0.12) / 0.3)); block(W / 2 - 490, 300, bw, 26 + 150 * lines.length, ACC, 16);
    lines.forEach((ln, i) => {
      const k = cl((t - i * 0.09) / 0.22), s = 2.6 - 1.6 * E.out(k);
      g.globalAlpha = a * cl(k * 3);
      text(ln, W / 2 + shake, 380 + i * 150 + shake * 0.4, 132, i === lines.length - 1 ? '#fff' : '#fff', -0.035, s);
    });
  },
  pop(t, d) { // reaction word: elastic scale + tilt, lower-middle (never on faces/crosshair)
    const k = E.elastic(cl(t / 0.45)), a = life(t, d, 0.05, 0.18);
    g.globalAlpha = a; text(G.text, W / 2, 820, 150, ACC, -0.07 + 0.04 * Math.sin(t * 6), k * (1 + 0.04 * Math.sin(t * 12)));
  },
  flash(t, d) { // impact frame: white flash + radial speed lines
    const k = t / d; g.globalAlpha = 0.85 * (1 - E.out(cl(k * 2.2))); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1 - k; g.strokeStyle = '#fff'; g.lineCap = 'butt';
    for (let i = 0; i < 46; i++) { const an = rnd(i) * 6.283, r0 = 560 + rnd(i + 9) * 260 - k * 120, len = 300 + rnd(i + 3) * 500;
      g.lineWidth = 6 + rnd(i + 5) * 16; g.beginPath(); g.moveTo(W / 2 + Math.cos(an) * r0, H / 2 + Math.sin(an) * r0); g.lineTo(W / 2 + Math.cos(an) * (r0 + len), H / 2 + Math.sin(an) * (r0 + len)); g.stroke(); }
  },
  marker(t, d) { // hand-drawn circle + arrow pointing at the action
    const x = (G.x ?? 0.5) * W, y = (G.y ?? 0.46) * H, k = E.out(cl(t / 0.45)), a = life(t, d, 0.05, 0.25);
    g.globalAlpha = a; g.lineCap = 'round'; g.lineWidth = 22;
    for (const [col, lw] of [['#000', 34], [ACC, 20]]) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (let i = 0; i <= 60 * k; i++) { const an = -1.2 + i / 60 * 6.6, r = 190 + 14 * Math.sin(i * 0.7); const px = x + Math.cos(an) * r * 1.15, py = y + Math.sin(an) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
      const ak = E.back(cl((t - 0.3) / 0.3)), ax = x + 330, ay = y + 360;
      if (ak > 0) { g.beginPath(); g.moveTo(ax + 140 * ak, ay + 140 * ak); g.lineTo(ax, ay); g.moveTo(ax, ay); g.lineTo(ax + 70, ay); g.moveTo(ax, ay); g.lineTo(ax, ay + 70); g.stroke(); }
    }
  },
  chapter(t, d) { // block wipe bar with a label
    const inK = E.out(cl(t / 0.25)), outK = E.in(cl((t - (d - 0.25)) / 0.25)), x = -W + W * inK + W * outK;
    g.globalAlpha = 1; block(x + 60, 220, 960, 170, '#111', 14); block(x + 60, 220, 22, 170, ACC, 0);
    text(G.text, x + W / 2 + 10, 305, 104, '#fff');
  },
  cta(t, d) { // follow button that bounces, then a cursor clicks it
    const k = E.back(cl(t / 0.4)), a = life(t, d, 0.05, 0.25), y = 1420, press = t > 1.1 && t < 1.3 ? 0.92 : 1;
    g.globalAlpha = a; g.save(); g.translate(W / 2, y); g.scale(k * press, k * press);
    block(-420, -95, 840, 190, t > 1.2 ? '#fff' : ACC, 14); g.restore();
    text(t > 1.2 ? 'FOLLOWED ✓' : G.text, W / 2, y, 82, '#000', 0, k * press, 780);
    const cx = W / 2 + 300 - 220 * E.out(cl((t - 0.5) / 0.6)), cy = y + 260 - 200 * E.out(cl((t - 0.5) / 0.6));
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + 110); g.lineTo(cx + 30, cy + 82); g.lineTo(cx + 52, cy + 126); g.lineTo(cx + 70, cy + 116); g.lineTo(cx + 50, cy + 74); g.lineTo(cx + 90, cy + 74); g.closePath(); g.fill(); g.stroke();
  },
  caption(t, d) { // word caption (from SRT), lower third safe zone
    const a = life(t, d, 0.06, 0.08), k = E.back(cl(t / 0.16)); g.globalAlpha = a;
    text(G.text, W / 2, 1180, 96, '#fff', 0, 0.85 + 0.15 * k, 940);
  },
  words(t, d) { // voiceover karaoke captions: 1–3 word groups, live word in accent, pop on each word
    const ws = G.words || []; let i = ws.findIndex((w) => t >= w.start - G.at && t < w.end - G.at + 0.12);
    if (i < 0) return; const gi = Math.floor(i / 3) * 3, grp = ws.slice(gi, gi + 3);
    const size = 92; g.font = `900 ${size}px ${FONT}`;
    const parts = grp.map((w) => w.w.toUpperCase().replace(/[^A-Z0-9'!?.,&-]/g, '')), sp = 28;
    const widths = parts.map((p) => g.measureText(p).width), tot = widths.reduce((a, b) => a + b, 0) + sp * (parts.length - 1), fit = Math.min(1, 960 / tot);
    let x = W / 2 - tot * fit / 2;
    parts.forEach((p, k) => {
      const w = grp[k], lt = t - (w.start - G.at), on = gi + k === i, k2 = cl(lt / 0.12), sc = on ? 1 + 0.18 * (1 - E.out(k2)) + 0.06 : 1;
      g.globalAlpha = gi + k <= i ? 1 : 0.55;
      if (on) { block(x - 14, 1120 - 70, widths[k] * fit + 28, 140, ACC, 10); }
      text(p, x + widths[k] * fit / 2, 1120, size * fit, on ? '#000' : '#fff', on ? -0.03 : 0, sc, 2000);
      x += (widths[k] + sp) * fit;
    });
  },
  nametag(t, d) { // player card: name slides in with accent block + lore role under it
    const a = life(t, d, 0.05, 0.25), k = E.out(cl(t / 0.35)), k2 = E.out(cl((t - 0.15) / 0.35)), x = -700 + 760 * k;
    g.globalAlpha = a; block(x, 560, 640, 130, ACC, 14); text(G.text, x + 320, 625, 92, '#000', 0, 1, 600);
    if (G.sub) { block(x + 40 - 80 * (1 - k2), 700, 600, 84, '#111', 10); text(G.sub, x + 340 - 80 * (1 - k2), 742, 50, '#fff', 0, 1, 560); }
  },
  glitch(t, d) { // RGB-split slices + scanlines (transition / shock)
    const k = 1 - t / d; g.globalAlpha = k;
    for (let i = 0; i < 14; i++) { const y = rnd(i + Math.floor(t * 30) * 7) * H, h = 20 + rnd(i * 3 + Math.floor(t * 30)) * 120, off = (rnd(i + 99 + Math.floor(t * 30)) - 0.5) * 160;
      g.fillStyle = ['rgba(255,0,60,.55)', 'rgba(0,255,230,.5)', 'rgba(255,255,255,.35)'][i % 3]; g.fillRect(off, y, W, h); }
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 3);
  },
  stamp(t, d) { // big stamped word (lore keyword / twist) that slams down and settles
    const k = cl(t / 0.16), s = 3 - 2 * E.out(k), a = life(t, d, 0.02, 0.2); g.globalAlpha = a * k;
    g.save(); g.translate(W / 2, 700); g.rotate(-0.12); g.scale(s, s); g.strokeStyle = ACC; g.lineWidth = 16; g.strokeRect(-430, -120, 860, 240); g.restore();
    text(G.text, W / 2, 700, 150, ACC, -0.12, s, 800);
  },
  lore(t, d) { // "LORE" fact card at the top: real fact from the research, typewriter reveal
    const a = life(t, d, 0.05, 0.25), k = E.back(cl(t / 0.35)), n = Math.floor(cl((t - 0.2) / 0.9) * (G.text || '').length);
    g.globalAlpha = a; g.save(); g.translate(W / 2, 330); g.scale(k, k); block(-470, -120, 940, 240, '#111', 14); block(-470, -120, 200, 64, ACC, 0); g.restore();
    text('LORE', W / 2 - 370, 330 - 88, 46, '#000', 0, k, 180);
    wrap((G.text || '').slice(0, n), 26).slice(0, 3).forEach((ln, i) => text(ln, W / 2, 330 - 14 + i * 60, 54, '#fff', 0, 1, 880));
  },
  counter(t, d) { // e.g. "KILL #3" stamp, top-right
    const k = E.elastic(cl(t / 0.5)), a = life(t, d, 0.05, 0.2); g.globalAlpha = a;
    g.save(); g.translate(820, 640); g.rotate(0.12); g.scale(k, k); block(-200, -80, 400, 160, ACC, 12); g.restore();
    text(G.text, 820, 640, 80, '#000', 0.12, k, 360);
  },
  // ───────── real motion graphics (particles, shapes, FX) ─────────
  embers(t, d) { // nether heat: rising glowing block-embers, heat haze at the bottom, red vignette
    const a = life(t, d, 0.4, 0.5); g.globalAlpha = a;
    let gr = g.createLinearGradient(0, H, 0, H - 760); gr.addColorStop(0, 'rgba(255,70,0,.42)'); gr.addColorStop(1, 'rgba(255,70,0,0)'); g.fillStyle = gr; g.fillRect(0, H - 760, W, 760);
    gr = g.createRadialGradient(W / 2, H / 2, 420, W / 2, H / 2, 1150); gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, 'rgba(90,0,0,.55)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 95; i++) {
      const sp = 140 + rnd(i + 3) * 300, y = H + 100 - ((rnd(i + 1) * (H + 200) + t * sp) % (H + 200)), x = rnd(i) * W + Math.sin(t * (1.5 + rnd(i + 7)) + i) * 40, s = 6 + rnd(i + 5) * 14;
      g.globalAlpha = a * (0.55 + 0.45 * Math.sin(t * 9 + i * 2)) * cl(y / 600);
      g.fillStyle = ['#FFC400', '#FF7A00', '#FF3D00'][i % 3]; g.fillRect(x, y, s, s); g.globalAlpha *= 0.25; g.fillRect(x - s, y - s, s * 3, s * 3);
    }
  },
  portal(t, d) { // dimension portal vortex: particles spiral into the centre, spinning arcs, glow + vignette
    const col = G.color || '#B04CFF', cx = (G.x ?? 0.5) * W, cy = (G.y ?? 0.42) * H, a = life(t, d, 0.25, 0.35), R0 = 620 * E.out(cl(t / 0.4));
    g.globalAlpha = a; let gr = g.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 1150); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col + '99'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    gr = g.createRadialGradient(cx, cy, 0, cx, cy, 300); gr.addColorStop(0, col + 'cc'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fillRect(cx - 300, cy - 300, 600, 600);
    for (let j = 0; j < 3; j++) { g.strokeStyle = col; g.lineWidth = 14 - j * 3; g.globalAlpha = a * 0.8; g.beginPath(); const r = R0 * (0.45 + j * 0.2), s0 = t * (2.4 - j * 0.7) * (j % 2 ? -1 : 1) + j; g.arc(cx, cy, r, s0, s0 + 2.2); g.stroke(); g.beginPath(); g.arc(cx, cy, r, s0 + 3.14, s0 + 4.6); g.stroke(); }
    for (let i = 0; i < 130; i++) {
      const p = 1 - ((t * 0.7 + rnd(i)) % 1), r = R0 * p, an = rnd(i + 2) * 6.283 + t * 3 + (1 - p) * 5, s = 5 + rnd(i + 4) * 12;
      g.globalAlpha = a * p; g.fillStyle = i % 4 ? col : '#fff'; g.fillRect(cx + Math.cos(an) * r, cy + Math.sin(an) * r * 0.9, s, s);
    }
  },
  dims(t, d) { // three dimension blocks (Overworld / Nether / End) drop in, bounce, pulse — lower third
    const a = life(t, d, 0.05, 0.3), y0 = G.y ? G.y * H : 1530;
    const C = [['#5DBB3A', '#7A4E26', '#5E3B1C', 'OVERWORLD'], ['#9E3030', '#6E1F1F', '#521616', 'NETHER'], ['#E8EDB0', '#C9CE8E', '#A9AE72', 'END']];
    C.forEach(([top, l, r, lab], i) => {
      const k = cl((t - i * 0.18) / 0.45); if (k <= 0) return; const x = 200 + i * 340, y = y0 - 500 * (1 - E.back(k)), s = 92 * (1 + 0.04 * Math.sin(t * 5 + i));
      g.globalAlpha = a; g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(x, y0 + s * 1.25, s * 1.1 * k, 22 * k, 0, 0, 6.283); g.fill();
      const P = (pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([px, py], n) => n ? g.lineTo(x + px * s, y + py * s) : g.moveTo(x + px * s, y + py * s)); g.closePath(); g.fill(); g.lineWidth = 7; g.strokeStyle = '#000'; g.stroke(); };
      P([[0, -1], [1, -0.5], [0, 0], [-1, -0.5]], top); P([[-1, -0.5], [0, 0], [0, 1.1], [-1, 0.6]], l); P([[1, -0.5], [0, 0], [0, 1.1], [1, 0.6]], r);
      if (i === 0) { P([[-1, -0.5], [0, 0], [0, 0.22], [-1, -0.28]], top); P([[1, -0.5], [0, 0], [0, 0.22], [1, -0.28]], '#4C9A2F'); }
      g.globalAlpha = a * cl((t - i * 0.18 - 0.3) / 0.2); text(lab, x, y0 + 190, 44, i === 1 ? ACC : '#fff', 0, 1, 320);
    });
    if (t > 0.9) { g.globalAlpha = a * cl((t - 0.9) / 0.3); g.setLineDash([22, 18]); g.lineDashOffset = -t * 80; g.strokeStyle = ACC; g.lineWidth = 8; g.beginPath(); g.moveTo(290, y0 - 40); g.lineTo(450, y0 - 40); g.moveTo(630, y0 - 40); g.lineTo(790, y0 - 40); g.stroke(); g.setLineDash([]); }
  },
  crown(t, d) { // pixel crown drops onto a spot, god-rays spin behind it, sparkles twinkle
    const x = (G.x ?? 0.5) * W, y = (G.y ?? 0.3) * H, a = life(t, d, 0.05, 0.3), k = E.back(cl(t / 0.5)), cy = y - 700 * (1 - k) + (t > 0.5 ? Math.sin(t * 3) * 10 : 0);
    g.globalAlpha = a * cl((t - 0.35) / 0.3) * 0.5; g.save(); g.translate(x, cy); g.rotate(t * 0.6); g.fillStyle = ACC;
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(-40, -520); g.lineTo(40, -520); g.closePath(); g.fill(); } g.restore();
    const R = ['X...X...X', 'XX.XXX.XX', 'XXXXXXXXX', 'XRXXBXXRX', 'XXXXXXXXX'], p = 36, ox = x - 4.5 * p, oy = cy - 2.5 * p;
    g.globalAlpha = a; g.fillStyle = '#000'; R.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') g.fillRect(ox + i * p - 7, oy + j * p - 7, p + 14, p + 14); }));
    R.forEach((row, j) => [...row].forEach((c, i) => { if (c === '.') return; g.fillStyle = c === 'R' ? '#E8222E' : c === 'B' ? '#2EC5FF' : (i + j) % 2 ? '#FFC21A' : '#FFD84D'; g.fillRect(ox + i * p, oy + j * p, p, p); }));
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) { const tw = Math.max(0, Math.sin(t * 6 + i * 1.7)), sx = x + Math.cos(i * 0.8) * (190 + rnd(i) * 60), sy = cy + Math.sin(i * 0.8) * (120 + rnd(i + 1) * 50), s = 34 * tw;
      g.globalAlpha = a * tw; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(sx, sy - s); g.lineTo(sx + s * 0.25, sy); g.lineTo(sx, sy + s); g.lineTo(sx - s * 0.25, sy); g.closePath(); g.fill(); g.fillRect(sx - s, sy - 3, s * 2, 6); }
  },
  cage(t, d) { // prison bars slam down from the top with an impact shake, screen darkens
    const a = life(t, d, 0.02, 0.3), k = E.out(cl(t / 0.2)), sh = t > 0.2 && t < 0.55 ? (rnd(Math.floor(t * 60)) - 0.5) * 30 * (1 - (t - 0.2) / 0.35) : 0;
    g.globalAlpha = a * 0.4; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = a;
    g.save(); g.translate(sh, -H * (1 - k) + sh * 0.5);
    for (let i = 0; i < 8; i++) { const x = 40 + i * 140; g.fillStyle = '#000'; g.fillRect(x - 6, -20, 52, H + 40); g.fillStyle = '#4a4d52'; g.fillRect(x, -20, 40, H + 40); g.fillStyle = '#8b9096'; g.fillRect(x + 6, -20, 10, H + 40); }
    for (const y of [300, 1620]) { g.fillStyle = '#000'; g.fillRect(-10, y - 6, W + 20, 72); g.fillStyle = '#4a4d52'; g.fillRect(-10, y, W + 20, 60); g.fillStyle = '#8b9096'; g.fillRect(-10, y + 6, W + 20, 12);
      for (let i = 0; i < 8; i++) { g.fillStyle = '#2b2d30'; g.fillRect(40 + i * 140 + 8, y + 18, 24, 24); } }
    g.restore();
  },
  shockwave(t, d) { // impact: expanding rings + block debris flying out with gravity
    const cx = (G.x ?? 0.5) * W, cy = (G.y ?? 0.45) * H, cols = G.colors || ['#8E2B2B', '#5E3B1C', '#7f7f7f', ACC];
    for (let j = 0; j < 3; j++) { const kk = cl((t - j * 0.08) / 0.6); if (kk <= 0 || kk >= 1) continue; g.globalAlpha = 1 - kk; g.strokeStyle = j === 1 ? ACC : '#fff'; g.lineWidth = 46 * (1 - kk); g.beginPath(); g.ellipse(cx, cy, 60 + 950 * E.out(kk), (60 + 950 * E.out(kk)) * 0.8, 0, 0, 6.283); g.stroke(); }
    for (let i = 0; i < 28; i++) { const an = rnd(i) * 6.283, v = 700 + rnd(i + 1) * 1100, s = 18 + rnd(i + 2) * 30, px = cx + Math.cos(an) * v * t, py = cy + Math.sin(an) * v * t + 1600 * t * t;
      g.globalAlpha = cl(1 - t / d); g.save(); g.translate(px, py); g.rotate(t * (4 + rnd(i + 3) * 8)); g.fillStyle = '#000'; g.fillRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8); g.fillStyle = cols[i % cols.length]; g.fillRect(-s / 2, -s / 2, s, s); g.restore(); }
  },
  focus(t, d) { // anime focus/speed lines closing in from the frame edges, flickering at 24 fps
    const a = life(t, d, 0.08, 0.2), seed = Math.floor(t * 24), cx = W / 2, cy = (G.y ?? 0.45) * H; g.globalAlpha = a * 0.9; g.fillStyle = G.color || '#fff';
    for (let i = 0; i < 80; i++) { const an = (i / 80) * 6.283 + (rnd(i + seed * 3) - 0.5) * 0.06, rin = 430 + rnd(i * 7 + seed) * 330, w = 0.012 + rnd(i + seed * 5) * 0.02;
      g.beginPath(); g.moveTo(cx + Math.cos(an - w) * 1700, cy + Math.sin(an - w) * 1700); g.lineTo(cx + Math.cos(an) * rin, cy + Math.sin(an) * rin * 1.35); g.lineTo(cx + Math.cos(an + w) * 1700, cy + Math.sin(an + w) * 1700); g.closePath(); g.fill(); }
  },
  march(t, d) { // invasion route: dashed path draws across the map, chevrons stream along it, arrowhead at the end
    const col = G.color || '#FF3B30', y = (G.y ?? 0.76) * H, a = life(t, d, 0.05, 0.3), k = E.out(cl(t / 1.1));
    const pt = (u) => [100 + 880 * u, y + 110 - 220 * u + Math.sin(u * 6.283) * 70]; g.globalAlpha = a;
    g.lineCap = 'round'; for (const [c, lw] of [['#000', 30], [col, 18]]) { g.strokeStyle = c; g.lineWidth = lw; g.setLineDash([40, 26]); g.lineDashOffset = -t * 120; g.beginPath(); for (let u = 0; u <= k; u += 0.01) { const [px, py] = pt(u); u ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); } g.setLineDash([]);
    for (let i = 0; i < 7; i++) { const u = (t * 0.45 + i / 7) % 1; if (u > k) continue; const [px, py] = pt(u), [qx, qy] = pt(Math.min(1, u + 0.01)), an = Math.atan2(qy - py, qx - px);
      g.save(); g.translate(px, py); g.rotate(an); g.fillStyle = '#000'; g.beginPath(); g.moveTo(-30, -38); g.lineTo(20, 0); g.lineTo(-30, 38); g.lineTo(-14, 0); g.closePath(); g.fill(); g.scale(0.72, 0.72); g.fillStyle = '#fff'; g.fill(); g.restore(); }
    const [ex, ey] = pt(k), [fx, fy] = pt(Math.max(0, k - 0.02)), an = Math.atan2(ey - fy, ex - fx); g.save(); g.translate(ex, ey); g.rotate(an); g.fillStyle = '#000'; g.beginPath(); g.moveTo(-50, -60); g.lineTo(60, 0); g.lineTo(-50, 60); g.closePath(); g.fill(); g.scale(0.7, 0.7); g.fillStyle = col; g.fill(); g.restore();
    if (G.text) { const kb = E.back(cl((t - 0.2) / 0.35)); g.save(); g.translate(260, y - 190); g.scale(kb, kb); block(-170, -50, 340, 100, col, 10); g.restore(); text(G.text, 260, y - 190, 54, '#fff', 0, kb, 300); }
  },
  bar(t, d) { // territory bar: fills with hazard stripes to G.value, the unfilled rest is labelled (G.rest)
    const y = (G.y ?? 0.79) * H, a = life(t, d, 0.05, 0.3), v = G.value ?? 0.9, k = E.out(cl((t - 0.25) / 1.1)) * v, kb = E.back(cl(t / 0.3)), col = G.color || '#E8222E';
    g.globalAlpha = a; g.save(); g.translate(W / 2, y); g.scale(kb, kb);
    block(-470, -170, 600, 90, '#111', 10); g.restore(); text(G.text || '', W / 2 - 170, y - 125, 50, '#fff', 0, kb, 560);
    g.save(); g.translate(W / 2, y); g.scale(kb, kb); block(-470, -50, 940, 110, '#fff', 12); g.fillStyle = '#000'; g.fillRect(-462, -42, 924, 94);
    g.beginPath(); g.rect(-462, -42, 924 * k, 94); g.clip(); g.fillStyle = col; g.fillRect(-462, -42, 924, 94); g.fillStyle = 'rgba(0,0,0,.28)';
    for (let x = -600 + ((t * 160) % 80); x < 520; x += 80) { g.beginPath(); g.moveTo(x, 52); g.lineTo(x + 40, 52); g.lineTo(x + 100, -42); g.lineTo(x + 60, -42); g.closePath(); g.fill(); } g.restore();
    if (G.rest && t > 1.2) { g.globalAlpha = a * cl((t - 1.2) / 0.25); text(G.rest, W / 2 - 462 + 924 * v + 924 * (1 - v) / 2, y + 5, 30, '#fff', 0, 1, 924 * (1 - v) - 10); }
  },
  bolt(t, d) { // lightning strike from the sky onto a point: flash, flickering jagged bolt with glow
    const x = (G.x ?? 0.5) * W, y = (G.y ?? 0.5) * H, seed = Math.floor(t / 0.06), fl = t < 0.5 ? 1 : cl(1 - (t - 0.5) / (d - 0.5)) * (seed % 2 ? 1 : 0.5);
    if (t < 0.12) { g.globalAlpha = 0.8 * (1 - t / 0.12); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
    const pts = [[x + (rnd(seed) - 0.5) * 300, -40]]; for (let i = 1; i <= 12; i++) pts.push([x + (rnd(seed * 13 + i) - 0.5) * 160 * (1 - i / 12), -40 + (y + 40) * i / 12]);
    g.globalCompositeOperation = 'lighter'; g.lineJoin = 'miter';
    for (const [c, lw, al] of [[ACC, 60, 0.25], ['#9fd8ff', 26, 0.6], ['#fff', 10, 1]]) { g.globalAlpha = fl * al; g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke(); }
    g.globalAlpha = fl * 0.6; const gr = g.createRadialGradient(x, y, 0, x, y, 260); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - 260, y - 260, 520, 520);
  },
};

window.MG = { types: Object.keys(TYPES), blur: 1,
  register(name, fn) { TYPES[name] = fn; if (!this.types.includes(name)) this.types.push(name); },
  draw(ctx, gr, t, accent) { g = ctx; G = gr; ACC = accent || ACC; ctx.save(); (TYPES[gr.type] || TYPES.pop)(t, gr.dur, ctx, gr, ACC); ctx.restore(); ctx.globalAlpha = 1; } };
})();
