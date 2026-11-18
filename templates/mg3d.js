// SMP 3D motion graphics — Three.js (r149, global THREE). The SAME code renders the CapCut/ffmpeg .mov layers and draws live
// in the device-render artifact, so what you preview is what you export. Every graphic is a pure function of time t
// (no hidden state, no Math.random) → deterministic frames, no glitches, safe to cache and reuse (see scripts/mglib.js).
// Design system: Minecraft voxels, one accent colour, black outlines, lit 3D with ACES tone mapping, additive glow,
// easing with overshoot + settle, staggered motion, camera shake on impacts, optional motion blur (MG.blur sub-frames).
(function () {
if (!window.THREE || !window.MG) return;
if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false; // hex colours are sRGB → correct, saturated colours
const T = THREE, W = 1080, H = 1920, VH = 12.6;            // camera z=20, fov 35 → 12.6 world units = 1920 px at z=0
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const E = { out: (x) => 1 - (1 - x) ** 3, in: (x) => x ** 3, inOut: (x) => x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2,
  back: (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
  elastic: (x) => x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * 2.0944) + 1,
  bounce(x) { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; } };
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const yAt = (fy) => (0.5 - fy) * VH, xAt = (fx) => (fx - 0.5) * VH * W / H;
const outK = (t, d, o = 0.3) => E.in(cl((t - (d - o)) / o));   // 0 → 1 during the outro
let R = null, CV = null, ACC = '#FFD23F';

function gl() {
  if (R) return R;
  CV = document.createElement('canvas'); CV.width = W; CV.height = H;
  R = new T.WebGLRenderer({ canvas: CV, alpha: true, antialias: true, preserveDrawingBuffer: true });
  R.setClearColor(0x000000, 0); R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.NoToneMapping;
  return R;
}

// ───────── pixel textures (16×16, nearest filter = Minecraft look) ─────────
const TX = {};
function px(name, fn) {
  if (TX[name]) return TX[name];
  const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d');
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { x.fillStyle = fn(i, j, rnd(i * 17.3 + j * 31.7 + name.length * 7.1)); x.fillRect(i, j, 1, 1); }
  const t = new T.CanvasTexture(c); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.encoding = T.sRGBEncoding; t.userData.keep = 1;
  return (TX[name] = t);
}
const pal = (cols) => (i, j, r) => cols[Math.floor(r * cols.length) % cols.length];
const edge = (base, dark, w = 1) => (i, j, r) => (i < w || j < w || i > 15 - w || j > 15 - w) ? dark : base(i, j, r);
const shade = (hex, l) => '#' + new T.Color(hex).offsetHSL(0, 0, l).getHexString();
const TEX = {
  gold: () => px('gold', edge(pal(['#FCD34D', '#F5C02C', '#FBE38A', '#E8AE1C', '#FCD34D']), '#9A6A0C')),
  obsidian: () => px('obsidian', pal(['#100818', '#1B1029', '#2A1A40', '#3D2766', '#100818', '#1B1029'])),
  netherrack: () => px('netherrack', pal(['#6E1F1F', '#8E2B2B', '#5A1818', '#A33A3A', '#7a2424'])),
  grasstop: () => px('grasstop', pal(['#5DBB3A', '#4FA32F', '#6CCB45', '#55B034'])),
  grassside: () => px('grassside', (i, j, r) => (j < 3 || (j === 3 && r > 0.45)) ? ['#5DBB3A', '#4FA32F', '#6CCB45'][Math.floor(r * 3)] : ['#7A4E26', '#8B5A2B', '#6E4520', '#5E3B1C'][Math.floor(r * 4)]),
  dirt: () => px('dirt', pal(['#7A4E26', '#8B5A2B', '#6E4520', '#5E3B1C'])),
  endstone: () => px('endstone', pal(['#E8EDB0', '#DDE3A2', '#CBD08E', '#F2F5C8'])),
  iron: () => px('iron', edge(pal(['#E2E2E2', '#CFCFCF', '#BDBDBD', '#d8d8d8']), '#6b6b6b')),
  stone: () => px('stone', pal(['#8a8a8a', '#7a7a7a', '#999999', '#6e6e6e'])),
  accent: () => px('accent' + ACC, edge(pal([ACC, shade(ACC, 0.06), shade(ACC, -0.05), ACC]), shade(ACC, -0.32))),
};
const M = {};
function mat(name, o = {}) {
  const k = name + JSON.stringify(o); if (M[k]) return M[k];
  const m = new T.MeshStandardMaterial({ map: TEX[name](), roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, emissive: o.emissive ? new T.Color(o.emissive) : new T.Color(0), emissiveIntensity: o.ei ?? 1 });
  if (o.emissiveMap) m.emissiveMap = m.map; m.userData.keep = 1; return (M[k] = m);
}
const BOX = new T.BoxGeometry(1, 1, 1); BOX.userData.keep = 1;
function solid(col, o = {}) { const k = 'c' + col + JSON.stringify(o); if (M[k]) return M[k]; const m = new T.MeshStandardMaterial({ color: col, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, emissive: new T.Color(o.emissive || 0), emissiveIntensity: o.ei ?? 1 }); m.userData.keep = 1; return (M[k] = m); }
let GLOW = null;
function glowTex() {
  if (GLOW) return GLOW; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  GLOW = new T.CanvasTexture(c); GLOW.userData.keep = 1; return GLOW;
}
function glow(col, size) { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: col, blending: T.AdditiveBlending, transparent: true, depthWrite: false })); s.scale.set(size, size, 1); return s; }
function label(text, { fg = '#fff', bg = '#111', size = 120, pad = 36, border = null } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), font = `900 ${size}px "Arial Black","Segoe UI Black",Impact,sans-serif`;
  x.font = font; const w = Math.ceil(x.measureText(text).width) + pad * 2, h = Math.round(size * 1.45);
  c.width = w + 24; c.height = h + 24; x.font = font;
  x.fillStyle = '#000'; x.fillRect(16, 16, w, h); x.fillStyle = bg; x.fillRect(0, 0, w, h); if (border) { x.fillStyle = border; x.fillRect(0, 0, 18, h); }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2 + (border ? 9 : 0), h / 2 + size * 0.04);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return { tex: t, aspect: c.width / c.height };
}

// ───────── 5×7 block font (voxel titles) ─────────
const FONT = { A: '0E11111F111111', B: '1E11111E11111E', C: '0E11101010110E', D: '1E11111111111E', E: '1F10101E10101F', F: '1F10101E101010', G: '0E11101711110F', H: '1111111F111111',
  I: '0E04040404040E', J: '0702020202120C', K: '11121418141211', L: '1010101010101F', M: '111B1515111111', N: '11111915131111', O: '0E11111111110E', P: '1E11111E101010',
  Q: '0E11111115120D', R: '1E11111E141211', S: '0F10100E01011E', T: '1F040404040404', U: '1111111111110E', V: '11111111110A04', W: '1111111515150A', X: '11110A040A1111',
  Y: '1111110A040404', Z: '1F01020408101F', 0: '0E11131519110E', 1: '040C040404040E', 2: '0E11010204081F', 3: '1F02040201110E', 4: '02060A121F0202', 5: '1F101E0101110E',
  6: '0608101E11110E', 7: '1F010204080808', 8: '0E11110E11110E', 9: '0E11110F01020C', '!': '04040404040004', '?': '0E110102040004', '.': '00000000000C0C', ',': '000000000C0408', "'": '0C040800000000',
  '-': '0000001F000000', ':': '000C0C000C0C00', '#': '0A0A1F0A1F0A0A', '&': '0C12140815120D', ' ': '00000000000000' };
function wrap(s, max) { const out = [], w = s.split(/\s+/); let l = ''; for (const x of w) { if ((l + ' ' + x).trim().length > max && l) { out.push(l); l = x; } else l = (l + ' ' + x).trim(); } if (l) out.push(l); return out; }
function voxels(text, max = 10) { // → { pts: [[x,y]], w, h } in voxel units, centred
  const lines = wrap(text.toUpperCase().replace(/…/g, '...'), max).slice(0, 3), pts = []; let wmax = 0;
  lines.forEach((ln, li) => { const w = ln.length * 6 - 1; wmax = Math.max(wmax, w);
    [...ln].forEach((ch, ci) => { const f = FONT[ch] || FONT[' ']; for (let r = 0; r < 7; r++) { const bits = parseInt(f.slice(r * 2, r * 2 + 2), 16); for (let b = 0; b < 5; b++) if (bits & (16 >> b)) pts.push([ci * 6 + b - w / 2, -(li * 9 + r), li]); } }); });
  const h = lines.length * 9 - 2; pts.forEach((p) => { p[1] += h / 2; }); return { pts, w: wmax, h, lines: lines.length };
}

function stage() {
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(35, W / H, 0.1, 400); cam.position.set(0, 0, 20);
  scene.add(new T.HemisphereLight(0xffffff, 0x2a2040, 0.55));
  const d = new T.DirectionalLight(0xffffff, 0.75); d.position.set(4, 7, 9); scene.add(d);
  const rim = new T.DirectionalLight(new T.Color(ACC), 1.3); rim.position.set(-6, -3, -5); scene.add(rim);
  return { scene, cam };
}
const dummy = new T.Object3D();
function shake(cam, t, t0, amp = 0.35, len = 0.4) { const k = cl(1 - (t - t0) / len); if (t < t0 || k <= 0) return; const s = Math.floor(t * 60); cam.position.x += (rnd(s) - 0.5) * amp * k; cam.position.y += (rnd(s + 9) - 0.5) * amp * k; }

// ───────── 3D graphics: each builder returns { scene, cam, update(t, d) } ─────────
const B = {
  blocktitle(G) { // hook title made of voxel blocks that fly in from the camera, slam into place, sway, then blow apart
    const { scene, cam } = stage(), V = voxels(G.text || 'SMP', G.max || 10), n = V.pts.length, vs = Math.min((G.width || 6.6) / V.w, 1.15 / 7 * (V.lines > 2 ? 0.8 : 1)), grp = new T.Group();
    const front = new T.InstancedMesh(BOX, mat('accent', { rough: 0.55, emissive: ACC, ei: 0.38, emissiveMap: 1 }), n), back = new T.InstancedMesh(BOX, solid('#000', { rough: 1 }), n);
    grp.add(back, front); scene.add(grp); grp.position.y = yAt(G.y ?? 0.19);
    const fl = glow(new T.Color(ACC), 9); fl.position.z = -1; grp.add(fl);
    const cols = V.w + 1;
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); shake(cam, t, 0.52, 0.5, 0.45);
      const o = outK(t, d, 0.35); grp.rotation.y = 0.16 * Math.sin(t * 1.4) * cl(t - 0.6); grp.rotation.x = -0.08 + 0.04 * Math.sin(t * 1.1);
      fl.material.opacity = 0.9 * cl(1 - Math.abs(t - 0.6) / 0.35); fl.scale.setScalar(6 + 10 * E.out(cl((t - 0.45) / 0.5)));
      V.pts.forEach(([x, y], i) => {
        const delay = 0.32 * ((x + V.w / 2) / cols) + 0.1 * rnd(i), k = cl((t - delay) / 0.42), e = E.out(k), sp = 1 - E.back(k);
        const sx = (rnd(i + 1) - 0.5) * 30, sy = (rnd(i + 2) - 0.5) * 22, sz = 22 + rnd(i + 3) * 10;
        let px = x * vs + sx * (1 - e), py = y * vs + sy * (1 - e), pz = sz * (1 - e);
        if (o > 0) { px += (rnd(i + 4) - 0.5) * 18 * o; py += (rnd(i + 5) - 0.2) * 14 * o; pz += 25 * o * rnd(i + 6); }
        const s = vs * (k <= 0 ? 0 : 1) * (1 + 0.25 * Math.max(0, sp)) * (1 - o * 0.6);
        dummy.position.set(px, py, pz); dummy.rotation.set((1 - e) * 6 * rnd(i + 7) + o * 4 * rnd(i), (1 - e) * 6 * rnd(i + 8), (1 - e) * 4 * rnd(i + 9)); dummy.scale.set(s, s, s * 2.2); dummy.updateMatrix(); front.setMatrixAt(i, dummy.matrix);
        dummy.position.set(px + vs * 0.18, py - vs * 0.22, pz - vs * 0.9); dummy.scale.set(s * 1.32, s * 1.32, s * 2); dummy.updateMatrix(); back.setMatrixAt(i, dummy.matrix);
      });
      front.instanceMatrix.needsUpdate = back.instanceMatrix.needsUpdate = true;
    } };
  },
  nametag3d(G) { // 3D slab card flips in with the player name, a sub-slab with the lore role, accent edge light
    const { scene, cam } = stage(), grp = new T.Group(); scene.add(grp);
    const L = label((G.text || '').toUpperCase(), { fg: '#000', bg: ACC, size: 130 }), sub = G.sub ? label(G.sub.toUpperCase(), { fg: '#fff', bg: '#141414', size: 80, border: ACC }) : null;
    const h1 = 1.3, w1 = Math.min(6.2, h1 * L.aspect), m1 = new T.MeshBasicMaterial({ map: L.tex }), side = solid(shade(ACC, -0.3), { rough: 0.4 });
    const card = new T.Mesh(new T.BoxGeometry(w1, h1, 0.32), [side, side, side, side, m1, side]); grp.add(card);
    let card2 = null; if (sub) { const h2 = 0.85, w2 = Math.min(5.6, h2 * sub.aspect); card2 = new T.Mesh(new T.BoxGeometry(w2, h2, 0.24), [solid('#111'), solid('#111'), solid('#111'), solid('#111'), new T.MeshBasicMaterial({ map: sub.tex }), solid('#111')]); grp.add(card2); }
    const gx = xAt(G.x ?? 0.42), gy = yAt(G.y ?? 0.33);
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); const k = E.back(cl(t / 0.45)), o = outK(t, d, 0.3);
      grp.position.set(gx - 7 * (1 - E.out(cl(t / 0.4))) - 7 * o, gy + 0.08 * Math.sin(t * 2.2), 0);
      card.rotation.set(0.06 * Math.sin(t * 1.7), (-1.6 * (1 - k)) + 0.14 * Math.sin(t * 1.3), -0.04);
      if (card2) { const k2 = E.back(cl((t - 0.14) / 0.45)); card2.position.set(0.35 - 3 * (1 - k2), -1.15, 0.1); card2.rotation.set(0, -1.6 * (1 - k2) + 0.1 * Math.sin(t * 1.5 + 1), 0.02); }
    } };
  },
  crown3d(G) { // voxel crown drops in with a bounce, spins, gem glints, god-rays + sparkles
    const { scene, cam } = stage(), grp = new T.Group(), parts = [];
    for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, hgt = 2 + (k % 5 === 0 ? 3 : k % 5 === 1 || k % 5 === 4 ? 1 : 0);
      for (let y = 0; y < hgt; y++) parts.push([Math.cos(a) * 1.6, y * 0.42, Math.sin(a) * 1.6, a, k % 5 === 0 && y === 1 ? (k % 10 ? 'b' : 'r') : 'g']); }
    const gold = new T.InstancedMesh(BOX, mat('gold', { metal: 0.65, rough: 0.32, emissive: '#3a2600', ei: 0.4 }), parts.length); let gi = 0;
    parts.forEach(([x, y, z, a, c]) => { dummy.position.set(x, y, z); dummy.rotation.set(0, -a, 0); dummy.scale.set(0.46, 0.44, 0.46); dummy.updateMatrix();
      if (c === 'g') gold.setMatrixAt(gi++, dummy.matrix); else { const gem = new T.Mesh(BOX, solid(c === 'r' ? '#ff2a3a' : '#2ec5ff', { emissive: c === 'r' ? '#ff1020' : '#10a0ff', ei: 1.4, rough: 0.2 })); gem.position.set(x * 1.06, y, z * 1.06); gem.rotation.y = -a; gem.scale.set(0.3, 0.3, 0.3); grp.add(gem); } });
    gold.count = gi; grp.add(gold); scene.add(grp);
    const rays = new T.Group(); for (let i = 0; i < 14; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.7, 14), new T.MeshBasicMaterial({ color: ACC, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false })); m.geometry.translate(0, 4.5, 0); m.scale.y = 0.65; m.rotation.z = i / 14 * Math.PI * 2; rays.add(m); }
    rays.position.z = -4; scene.add(rays); const halo = glow(new T.Color(ACC), 8); halo.position.z = -2; scene.add(halo);
    const sp = []; for (let i = 0; i < 10; i++) { const s = glow(new T.Color('#fff'), 0.8); scene.add(s); sp.push(s); }
    const cx = xAt(G.x ?? 0.5), cy = yAt(G.y ?? 0.24), sc = G.scale ?? 0.9;
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); shake(cam, t, 0.55, 0.35, 0.35); const o = outK(t, d, 0.3), k = E.bounce(cl(t / 0.6));
      grp.position.set(cx, cy + 12 * (1 - k) + (t > 0.6 ? 0.12 * Math.sin(t * 2.5) : 0) + 10 * o, 0); grp.rotation.set(0.42, t * 1.6, 0.05 * Math.sin(t * 2)); grp.scale.setScalar(sc * (1 - 0.5 * o));
      const ra = cl((t - 0.5) / 0.4) * (1 - o); rays.position.set(cx, cy + 0.6, -4); rays.rotation.z = t * 0.5; rays.children.forEach((m, i) => (m.material.opacity = 0.14 * ra * (0.7 + 0.3 * Math.sin(t * 3 + i)))); rays.scale.setScalar(0.6 + 0.4 * ra);
      halo.position.set(cx, cy + 0.6, -2); halo.material.opacity = ra * 0.8;
      sp.forEach((s, i) => { const tw = Math.max(0, Math.sin(t * 5 + i * 1.9)), a = i * 0.63 + t * 0.6; s.position.set(cx + Math.cos(a) * (2.6 + rnd(i)), cy + 0.8 + Math.sin(a) * (1.6 + rnd(i + 2)), 1); s.scale.setScalar(1.3 * tw * ra + 0.001); });
    } };
  },
  portal3d(G) { // obsidian portal frame flies in, animated swirl surface, particles stream at the camera; G.through → camera dives in
    const { scene, cam } = stage(), col = new T.Color(G.color || '#B04CFF'), grp = new T.Group(); scene.add(grp);
    const frame = []; for (let x = -3; x <= 3; x++) for (let y = -4; y <= 4; y++) if (Math.abs(x) === 3 || Math.abs(y) === 4) frame.push([x, y]);
    const fm = new T.InstancedMesh(BOX, mat('obsidian', { rough: 0.35, metal: 0.2 }), frame.length); frame.forEach(([x, y], i) => { dummy.position.set(x * 0.9, y * 0.9, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.9); dummy.updateMatrix(); fm.setMatrixAt(i, dummy.matrix); }); grp.add(fm);
    const sc = document.createElement('canvas'); sc.width = 128; sc.height = 192; const sx = sc.getContext('2d'), stex = new T.CanvasTexture(sc); stex.magFilter = T.NearestFilter; stex.encoding = T.sRGBEncoding;
    const surf = new T.Mesh(new T.PlaneGeometry(5 * 0.9, 7 * 0.9), new T.MeshBasicMaterial({ map: stex, transparent: true, opacity: 0.92 })); surf.position.z = 0.05; grp.add(surf);
    const halo = glow(col, 12); halo.position.z = -1; grp.add(halo);
    const P = 90, pm = new T.InstancedMesh(BOX, new T.MeshBasicMaterial({ color: col.clone().lerp(new T.Color('#fff'), 0.35), transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }), P); scene.add(pm);
    const base = '#' + col.getHexString(), dark = shade(base, -0.28), light = shade(base, 0.2);
    const gy = yAt(G.y ?? 0.42);
    return { scene, cam, update(t, d) {
      const kin = E.out(cl(t / 0.6)), thr = G.through ? E.inOut(cl((t - (d - 0.9)) / 0.9)) : 0, o = G.through ? 0 : outK(t, d, 0.3);
      grp.position.set(0, gy, -40 * (1 - kin)); grp.rotation.set(0, (1 - kin) * 2.4 + 0.12 * Math.sin(t), (1 - kin) * 0.6); grp.scale.setScalar(1 - o);
      cam.position.set(0, gy * thr, 20 - 19.6 * thr); cam.lookAt(0, gy * thr, -10); shake(cam, t, 0.6, 0.25, 0.3);
      // swirl surface (pixel noise that rotates) — redrawn per frame from t only
      for (let j = 0; j < 24; j++) for (let i = 0; i < 16; i++) { const dx = i - 7.5, dy = j - 11.5, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy * 0.7), v = Math.sin(a * 3 + r * 0.9 - t * 7) + Math.sin(r * 1.3 + t * 4) * 0.6;
        sx.fillStyle = v > 0.9 ? light : v > -0.2 ? base : dark; sx.fillRect(i * 8, j * 8, 8, 8); } stex.needsUpdate = true;
      halo.material.opacity = 0.75 * kin * (0.8 + 0.2 * Math.sin(t * 6));
      for (let i = 0; i < P; i++) { const life = (t * 0.9 + rnd(i)) % 1, a = rnd(i + 1) * 6.283 + life * 3, r = 0.6 + life * (2.5 + rnd(i + 2) * 3);
        dummy.position.set(Math.cos(a) * r, gy + Math.sin(a) * r * 1.2, -40 * (1 - kin) + life * 16); dummy.rotation.set(t * 3 + i, t * 2, 0); dummy.scale.setScalar(0.12 + 0.12 * rnd(i + 3)); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); }
      pm.instanceMatrix.needsUpdate = true; pm.material.opacity = 0.95 * kin * (1 - o);
    } };
  },
  blocks3d(G) { // three dimension blocks (grass / netherrack / end stone) pop in, spin, the focused one grows + glows
    const { scene, cam } = stage(), types = G.blocks || ['grass', 'netherrack', 'endstone'], cubes = [];
    const mats = { grass: [mat('grassside'), mat('grassside'), mat('grasstop'), mat('dirt'), mat('grassside'), mat('grassside')], netherrack: mat('netherrack', { emissive: '#300000', ei: 0.6 }), endstone: mat('endstone'), obsidian: mat('obsidian'), gold: mat('gold', { metal: 0.6, rough: 0.35 }), stone: mat('stone') };
    types.forEach((ty, i) => { const m = new T.Mesh(BOX, mats[ty] || mats.stone), gl2 = glow(new T.Color(ty === 'netherrack' ? '#ff4010' : ty === 'endstone' ? '#d8ff80' : '#7dff60'), 4); scene.add(gl2, m); cubes.push([m, gl2]); });
    const gy = yAt(G.y ?? 0.77), gap = 2.25, f = G.focus ?? -1;
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); const o = outK(t, d, 0.3);
      cubes.forEach(([m, g2], i) => { const k = E.elastic(cl((t - i * 0.15) / 0.7)), foc = f === i ? E.back(cl((t - 1.1) / 0.4)) : 0, dim = f >= 0 && f !== i ? cl((t - 1.1) / 0.4) : 0;
        const s = 1.5 * k * (1 + 0.45 * foc) * (1 - o) * (1 - 0.25 * dim);
        m.position.set((i - (types.length - 1) / 2) * gap * (1 - 0.15 * dim), gy + 0.15 * Math.sin(t * 2 + i) + 0.5 * foc, 0); m.rotation.set(0.5, t * 1.3 + i * 0.7, 0.12); m.scale.setScalar(Math.max(0.001, s));
        g2.position.set(m.position.x, m.position.y, -1.5); g2.material.opacity = (0.35 + 0.65 * foc) * k * (1 - o) * (1 - dim); g2.scale.setScalar(3 + 2 * foc); });
    } };
  },
  explode3d(G) { // impact: block debris bursts toward the camera with gravity + spin, shock ring, flash
    const { scene, cam } = stage(), N = G.count || 70, kinds = G.blocks || ['netherrack', 'obsidian', 'gold', 'stone'];
    const meshes = kinds.map((k) => { const m = new T.InstancedMesh(BOX, mat(k), N); scene.add(m); return m; });
    const ring = new T.Mesh(new T.RingGeometry(0.85, 1, 64), new T.MeshBasicMaterial({ color: ACC, transparent: true, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false })), fl = glow(new T.Color('#fff'), 8);
    scene.add(ring, fl); const cx = xAt(G.x ?? 0.5), cy = yAt(G.y ?? 0.45);
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); shake(cam, t, 0, 0.6, 0.4); const counts = kinds.map(() => 0);
      for (let i = 0; i < N; i++) { const mi = i % kinds.length, a = rnd(i) * 6.283, el = (rnd(i + 1) - 0.3) * 1.6, v = 5 + rnd(i + 2) * 9, tt = t;
        dummy.position.set(cx + Math.cos(a) * Math.cos(el) * v * tt, cy + Math.sin(el) * v * tt - 9 * tt * tt + 2 * tt, Math.sin(a) * v * 0.4 * tt + v * 0.9 * tt); dummy.rotation.set(tt * 9 * rnd(i + 3), tt * 7 * rnd(i + 4), tt * 5);
        dummy.scale.setScalar((0.25 + rnd(i + 5) * 0.45) * cl(1 - (t - (d - 0.35)) / 0.35)); dummy.updateMatrix(); meshes[mi].setMatrixAt(counts[mi]++, dummy.matrix); }
      meshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; });
      const rk = E.out(cl(t / 0.55)); ring.position.set(cx, cy, 1); ring.scale.setScalar(0.5 + 9 * rk); ring.material.opacity = 1 - rk;
      fl.position.set(cx, cy, 2); fl.material.opacity = cl(1 - t / 0.3); fl.scale.setScalar(4 + 14 * E.out(cl(t / 0.3)));
    } };
  },
  sword3d(G) { // voxel sword spins in, a big slash with an additive trail, then gleams
    const { scene, cam } = stage(), grp = new T.Group(), pts = [];
    const C = G.metal === 'netherite' ? ['#4b464b', '#6b656b', '#2a272a'] : ['#4AEDD9', '#A0FFF2', '#1E8F84'];
    for (let k = 5; k <= 13; k++) { pts.push([k, k, C[0]]); pts.push([k + 1, k, C[1]]); if (k < 13) pts.push([k, k + 1, C[2]]); }
    pts.push([14, 14, C[1]]); [[2, 6], [3, 5], [5, 3], [6, 2], [4, 4]].forEach(([x, y]) => pts.push([x, y, '#2a2a2a'])); [[1, 1], [2, 2], [3, 3]].forEach(([x, y]) => pts.push([x, y, '#6B4A2B'])); pts.push([0, 0, C[2]]);
    pts.forEach(([x, y, c]) => { const m = new T.Mesh(BOX, solid(c, { rough: 0.3, metal: 0.3, emissive: c, ei: 0.15 })); m.position.set((x - 7) * 0.3, (y - 7) * 0.3, 0); m.scale.set(0.3, 0.3, 0.3); grp.add(m); });
    scene.add(grp);
    const trail = new T.Mesh(new T.RingGeometry(3.2, 4.4, 64, 1, 0, 1), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false })); scene.add(trail);
    const gx = xAt(G.x ?? 0.5), gy = yAt(G.y ?? 0.45);
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); shake(cam, t, 0.62, 0.5, 0.35); const kin = E.out(cl(t / 0.4)), sl = E.inOut(cl((t - 0.42) / 0.22)), o = outK(t, d, 0.3);
      grp.position.set(gx + 6 * (1 - kin) + 6 * o, gy + 6 * (1 - kin), 2); grp.rotation.set(0.3 * Math.sin(t), 0.4 * Math.sin(t * 1.3) + (1 - kin) * 6, 1.1 - sl * 3.0 + (1 - kin) * 3);
      grp.scale.setScalar(1.2 * (1 + 0.12 * Math.sin(cl((t - 0.42) / 0.22) * Math.PI)));
      const tr = cl((t - 0.42) / 0.5); trail.geometry.dispose(); trail.geometry = new T.RingGeometry(3.0, 4.6, 64, 1, 1.3 - sl * 3.0, Math.max(0.01, 2.6 * Math.min(1, sl * 1.4) * (1 - tr * 0.6)));
      trail.position.set(gx, gy, 1.5); trail.rotation.z = Math.PI / 4; trail.material.opacity = sl > 0 ? 0.85 * (1 - tr) : 0; trail.material.color.set(sl < 1 ? '#ffffff' : ACC);
    } };
  },
  cage3d(G) { // iron bars slam down close to the camera, bounce, dust puffs, camera shake
    const { scene, cam } = stage(), grp = new T.Group(); scene.add(grp);
    for (let i = 0; i < 7; i++) { const b = new T.Mesh(BOX, mat('iron', { metal: 0.6, rough: 0.35 })); b.scale.set(0.32, 16, 0.32); b.position.set((i - 3) * 1.05, 0, 0); grp.add(b); }
    for (const y of [-3.6, 3.6]) { const b = new T.Mesh(BOX, mat('iron', { metal: 0.6, rough: 0.35 })); b.scale.set(8, 0.34, 0.34); b.position.set(0, y, 0.2); grp.add(b); }
    const dust = []; for (let i = 0; i < 16; i++) { const s = glow(new T.Color('#c8c0b0'), 1); scene.add(s); dust.push(s); }
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); shake(cam, t, 0.36, 0.7, 0.45); const k = E.bounce(cl(t / 0.5)), o = outK(t, d, 0.35);
      grp.position.set(0, 14 * (1 - k) + 14 * o, 8); grp.rotation.set(0.05, -0.32 + 0.03 * Math.sin(t * 2), 0.02 * Math.sin(t * 3));
      dust.forEach((s, i) => { const dt = t - 0.36; if (dt < 0) { s.material.opacity = 0; return; } s.position.set((rnd(i) - 0.5) * 8, -6 + dt * (1 + rnd(i + 1)), 9); s.scale.setScalar(1 + dt * 4 * rnd(i + 2)); s.material.opacity = 0.6 * cl(1 - dt / 1); });
    } };
  },
  map3d(G) { // tilted 3D territory board: red netherrack spreads block by block from the corner; one region stays (G.keep label)
    const { scene, cam } = stage(), NX = 12, NZ = 16, s = 0.5, grp = new T.Group(); scene.add(grp);
    const ow = new T.InstancedMesh(BOX, [mat('grassside'), mat('grassside'), mat('grasstop'), mat('dirt'), mat('grassside'), mat('grassside')], NX * NZ), nr = new T.InstancedMesh(BOX, mat('netherrack', { emissive: '#400000', ei: 0.7 }), NX * NZ);
    grp.add(ow, nr); const keep = G.keep ? [NX - 3, NZ - 3] : null, cells = [];
    for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) { const h = 1 + Math.floor(rnd(x * 7 + z * 13) * 2), dist = Math.hypot(x, z) / Math.hypot(NX, NZ), kept = keep && Math.hypot(x - keep[0], z - keep[1]) < 2.4; cells.push({ x, z, h, dist, kept }); }
    let tag = null, beam = null; if (keep) { const L = label(G.keep.toUpperCase(), { fg: '#000', bg: '#7dff60', size: 90 }); tag = new T.Sprite(new T.SpriteMaterial({ map: L.tex, depthTest: false })); tag.scale.set(0.9 * L.aspect, 0.9, 1); grp.add(tag);
      beam = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 8, 16, 1, true), new T.MeshBasicMaterial({ color: '#7dff60', transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); beam.scale.set(0.5, 1, 0.5); grp.add(beam); }
    const gy = yAt(G.y ?? 0.7), front = G.speed ?? 1.4;
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); const kin = E.back(cl(t / 0.6)), o = outK(t, d, 0.3);
      grp.position.set(0, gy - 6 * (1 - E.out(cl(t / 0.6))), 0); grp.rotation.set(0.95, -0.55 + 0.25 * Math.sin(t * 0.6), 0); grp.scale.setScalar(kin * (1 - o) + 0.001);
      let a = 0, b = 0;
      for (const c of cells) { const inf = !c.kept && t > 0.5 + c.dist * front, pop = inf ? E.back(cl((t - 0.5 - c.dist * front) / 0.25)) : 0;
        dummy.position.set((c.x - NX / 2 + 0.5) * s, (c.h * s) / 2 + (inf ? 0.25 * s * Math.sin(pop * Math.PI) : 0), (c.z - NZ / 2 + 0.5) * s); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, c.h * s, s); dummy.updateMatrix();
        if (inf) nr.setMatrixAt(a++, dummy.matrix); else ow.setMatrixAt(b++, dummy.matrix); }
      nr.count = a; ow.count = b; nr.instanceMatrix.needsUpdate = ow.instanceMatrix.needsUpdate = true;
      if (tag) { const kx = (keep[0] - NX / 2 + 0.5) * s, kz = (keep[1] - NZ / 2 + 0.5) * s, kt = E.back(cl((t - 1.2) / 0.4)); tag.position.set(kx, 2.6 + 0.1 * Math.sin(t * 3), kz); tag.material.opacity = kt; tag.scale.setScalar(0.001 + kt); tag.scale.set(kt * 0.9 * (tag.material.map.image.width / tag.material.map.image.height), kt * 0.9, 1);
        beam.visible = false; }
    } };
  },
  ingots3d(G) { // gold ingots rain down, bounce and pile up (resources / money)
    const { scene, cam } = stage(), N = G.count || 26, m = new T.InstancedMesh(BOX, mat('gold', { metal: 0.7, rough: 0.3, emissive: '#3a2600', ei: 0.5 }), N); scene.add(m);
    const gy = yAt(G.y ?? 0.72);
    return { scene, cam, update(t, d) {
      cam.position.set(0, 0, 20); const o = outK(t, d, 0.3);
      for (let i = 0; i < N; i++) { const t0 = rnd(i) * 0.9, k = E.bounce(cl((t - t0) / 0.7)), x = (rnd(i + 1) - 0.5) * 5.4, z = (rnd(i + 2) - 0.5) * 2, floor = gy + Math.floor(rnd(i + 3) * 3) * 0.32;
        dummy.position.set(x, floor + 14 * (1 - k) - 8 * o, z); dummy.rotation.set(0.35, rnd(i + 4) * 3 + (1 - k) * 8, (1 - k) * 4 * rnd(i + 5)); dummy.scale.set(t < t0 ? 0.001 : 1.1, 0.34, 0.55); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }
      m.instanceMatrix.needsUpdate = true;
    } };
  },
};

// ───────── glue: register with MG, cache scenes per graphic, motion blur, cleanup ─────────
const SC = new WeakMap(), LIVE = new Set();
function dispose(S) { S.scene.traverse((o) => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); const ms = o.material ? [].concat(o.material) : []; ms.forEach((m) => { if (m.userData?.keep) return; if (m.map && !m.map.userData.keep) m.map.dispose(); m.dispose(); }); }); }
for (const [name, build] of Object.entries(B)) MG.register(name, (t, d, ctx, G, accent) => {
  if (accent && accent !== ACC) { ACC = accent; }
  let S = SC.get(G); if (!S) { S = build(G); SC.set(G, S); LIVE.add(S); }
  const r = gl(), n = Math.max(1, MG.blur | 0), shutter = 1 / 60;
  for (let i = 0; i < n; i++) { S.update(Math.max(0, t - (i * shutter) / n), d); r.render(S.scene, S.cam); ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(CV, 0, 0, W, H); }
  ctx.globalAlpha = 1;
});
MG.reset3d = () => { LIVE.forEach(dispose); LIVE.clear(); };
MG.types3d = Object.keys(B);
})();
