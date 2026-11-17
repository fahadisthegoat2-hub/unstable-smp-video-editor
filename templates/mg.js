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
    const size = 104; g.font = `900 ${size}px ${FONT}`;
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
};

window.MG = { types: Object.keys(TYPES), draw(ctx, gr, t, accent) { g = ctx; G = gr; ACC = accent || ACC; ctx.save(); (TYPES[gr.type] || TYPES.pop)(t, gr.dur); ctx.restore(); ctx.globalAlpha = 1; } };
})();
