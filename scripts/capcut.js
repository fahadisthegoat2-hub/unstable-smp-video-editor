#!/usr/bin/env node
// CapCut PC bridge: finds CapCut's drafts folder, lists/reads projects by name, and writes the edit as a CapCut project.
// usage: capcut.js --list
//        capcut.js --sources "<project name>"          (prints the clips inside an existing project)
//        capcut.js edit.json --project "<name>" [--overwrite] [--layout blur|crop]
// Drafts folder override: --drafts <dir> or env CAPCUT_DRAFTS.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { arg, flag, log, ffprobeJSON } = require('./lib/util');

const US = 1e6, uid = () => crypto.randomUUID().toUpperCase();
function draftsRoot() {
  const own = arg('drafts') || process.env.CAPCUT_DRAFTS; if (own) return own;
  const h = os.homedir(), L = process.env.LOCALAPPDATA || path.join(h, 'AppData', 'Local');
  const c = [path.join(L, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'),
    path.join(L, 'CapCut Drafts'), path.join(h, 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'),
    path.join(h, 'Library', 'Containers', 'com.lemon.lvoverseas', 'Data', 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft')];
  return c.find((p) => fs.existsSync(p)) || c[process.platform === 'darwin' ? 2 : 0];
}
const projects = (root) => fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name) : [];
function findProject(root, name) {
  const all = projects(root), n = name.toLowerCase();
  return all.find((p) => p.toLowerCase() === n) || all.find((p) => p.toLowerCase().includes(n));
}
function readDraft(dir) {
  for (const f of ['draft_content.json', 'draft_info.json']) {
    const p = path.join(dir, f); if (!fs.existsSync(p)) continue;
    try { return { file: p, json: JSON.parse(fs.readFileSync(p, 'utf8')) }; } catch { return { file: p, encrypted: true }; }
  }
  return null;
}
function sources(dir) {
  const d = readDraft(dir); if (!d) return { error: 'no draft file' };
  if (d.encrypted) return { encrypted: true, note: 'This CapCut version encrypts drafts — export the raw clip or give its path instead.' };
  return { clips: (d.json.materials?.videos || []).filter((v) => v.type !== 'photo').map((v) => ({ path: v.path, duration: v.duration / US, name: v.material_name })) };
}

// ---- draft builders ----
const tr = (s, d) => ({ start: Math.round(s * US), duration: Math.round(d * US) });
function videoMat(file, info) {
  return { id: uid(), type: 'video', path: file.replace(/\\/g, '/'), material_name: path.basename(file), duration: Math.round(info.duration * US),
    width: info.width, height: info.height, has_audio: !!info.hasAudio, category_name: 'local', crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
    crop_ratio: 'free', crop_scale: 1, extra_type_option: 0, local_material_id: '', media_path: '', check_flag: 63487, source_platform: 0, stable: { matrix_path: '', stable_level: 0, time_range: tr(0, 0) } };
}
function segment(matId, speedId, src, at, dur, scale, extra = {}) {
  return { id: uid(), material_id: matId, source_timerange: tr(src, dur), target_timerange: tr(at, dur), speed: 1, volume: extra.volume ?? 1, last_nonzero_volume: 1,
    visible: true, reverse: false, render_index: extra.render_index || 0, track_render_index: extra.track_render_index || 0, track_attribute: 0,
    clip: { alpha: 1, flip: { horizontal: false, vertical: false }, rotation: 0, scale: { x: scale, y: scale }, transform: { x: 0, y: 0 } },
    uniform_scale: { on: true, value: 1 }, extra_material_refs: [speedId], keyframe_refs: [], common_keyframes: [], enable_adjust: true, enable_color_curves: true,
    enable_color_wheels: true, enable_lut: true, enable_smart_color_adjust: false, hdr_settings: { intensity: 1, mode: 1, nits: 1000 }, intensifies_audio: false,
    is_placeholder: false, is_tone_modify: false, cartoon: false, caption_info: null, group_id: '', template_id: '', template_scene: 'default', responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, target_follow: '', vertical_pos_layout: 0 } };
}
function buildDraft(edit, name, layout) {
  const mats = { videos: [], speeds: [], canvases: [], audios: [], texts: [], effects: [], transitions: [], material_animations: [], sound_channel_mappings: [], vocal_separations: [], placeholders: [] };
  const speed = () => { const s = { id: uid(), type: 'speed', speed: 1, mode: 0, curve_speed: null }; mats.speeds.push(s); return s.id; };
  const main = videoMat(edit.source, edit.info); mats.videos.push(main);
  // CapCut scale 1 = fit inside 9:16. "crop" fills the height; "blur" = big centred gameplay (add Canvas → Blur in CapCut for the background).
  const fill = (edit.info.width / edit.info.height) / (9 / 16);
  const base = layout === 'crop' ? fill : 1.25;
  const vt = { id: uid(), type: 'video', attribute: 0, flag: 0, is_default_name: true, name: '', segments: [] };
  for (const s of edit.segments) vt.segments.push(segment(main.id, speed(), s.in, s.at, s.out - s.in, +(base * (s.zoom || (s.role === 'hook' ? 1.15 : 1))).toFixed(4), { volume: edit.mix ? 0 : 1 }));
  const tracks = [vt];
  if (edit.mix && fs.existsSync(edit.mix)) { // final soundtrack (voice + ducked game + SFX) on its own audio track
    const d = ffprobeJSON(edit.mix).duration || edit.duration;
    const am = { id: uid(), type: 'extract_music', name: 'SMP mix', path: edit.mix.replace(/\\/g, '/'), duration: Math.round(d * US), music_id: uid(), category_name: 'local', check_flag: 1, source_platform: 0, wave_points: [] };
    mats.audios.push(am); const seg = segment(am.id, speed(), 0, 0, Math.min(d, edit.duration), 1); delete seg.clip; delete seg.uniform_scale;
    tracks.push({ id: uid(), type: 'audio', attribute: 0, flag: 0, is_default_name: true, name: '', segments: [seg] });
  }
  edit.graphics.filter((g) => g.file).forEach((g, k) => {
    const info = ffprobeJSON(g.file), m = videoMat(g.file, { ...info, hasAudio: false }); mats.videos.push(m);
    // Graphics stack on their own tracks so overlapping ones never collide.
    let t = tracks.slice(1).find((x) => x.type === 'video' && !x.segments.some((s) => g.at * US < s.target_timerange.start + s.target_timerange.duration && (g.at + g.dur) * US > s.target_timerange.start));
    if (!t) { t = { id: uid(), type: 'video', attribute: 0, flag: 0, is_default_name: true, name: '', segments: [] }; tracks.push(t); }
    const ri = 10 + tracks.indexOf(t);
    t.segments.push(segment(m.id, speed(), 0, g.at, Math.min(g.dur, info.duration || g.dur), 1, { volume: 0, render_index: ri, track_render_index: ri }));
  });
  const now = Math.floor(Date.now() / 1000);
  const content = { id: uid(), name: '', version: 360000, new_version: '110.0.0', fps: 30, duration: Math.round(edit.duration * US),
    canvas_config: { width: 1080, height: 1920, ratio: '9:16' }, color_space: 0, config: { adjust_max_index: 1, attachment_info: [], combination_max_index: 1, export_range: null,
      extract_audio_last_index: 1, lyrics_recognition_id: '', lyrics_sync: true, lyrics_taskinfo: [], maintrack_adsorb: true, material_save_mode: 0, original_sound_last_index: 1,
      record_audio_last_index: 1, sticker_max_index: 1, subtitle_recognition_id: '', subtitle_sync: true, subtitle_taskinfo: [], system_font_list: [], video_mute: false, zoom_info_params: null },
    cover: null, create_time: now, update_time: now, extra_info: null, free_render_index_mode_on: false, group_container: null, keyframe_graph_list: [],
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] }, last_modified_platform: { app_id: 359289, app_source: 'cc', app_version: '6.0.0', os: process.platform === 'darwin' ? 'mac' : 'windows' },
    platform: { app_id: 359289, app_source: 'cc', app_version: '6.0.0', os: process.platform === 'darwin' ? 'mac' : 'windows' },
    materials: mats, mutable_config: null, relationships: [], render_index_track_mode_on: true, retouch_cover: null, source: 'default', static_cover_image_path: '', time_marks: null, tracks };
  const meta = { draft_id: uid(), draft_name: name, draft_fold_path: '', draft_root_path: '', draft_removable_storage_device: '', draft_timeline_materials_size_: 0,
    tm_draft_create: now * US, tm_draft_modified: now * US, tm_duration: content.duration, draft_cover: '', draft_is_ai_shorts: false, draft_type: '',
    draft_materials: [{ type: 0, value: mats.videos.map((v) => ({ id: v.id, file_Path: v.path, extra_info: v.material_name, metetype: 'video', duration: v.duration, width: v.width, height: v.height, create_time: now, import_time: now })) }] };
  return { content, meta };
}
function writeProject(edit, name, opts = {}) {
  const root = draftsRoot(); fs.mkdirSync(root, { recursive: true });
  let target = findProject(root, name);
  if (target && !opts.overwrite) target = `${target} - SMP edit`; // never touch the original unless asked
  target = target || name;
  const dir = path.join(root, target);
  if (fs.existsSync(dir) && opts.overwrite) fs.cpSync(dir, `${dir}.backup-${Date.now()}`, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  const { content, meta } = buildDraft(edit, target, opts.layout || 'blur');
  meta.draft_fold_path = dir.replace(/\\/g, '/'); meta.draft_root_path = root.replace(/\\/g, '/');
  for (const f of ['draft_content.json', 'draft_info.json']) fs.writeFileSync(path.join(dir, f), JSON.stringify(content));
  fs.writeFileSync(path.join(dir, 'draft_meta_info.json'), JSON.stringify(meta));
  return { project: target, dir };
}

if (require.main === module) {
  const root = draftsRoot();
  if (flag('list')) { console.log(JSON.stringify({ root, projects: projects(root) }, null, 1)); process.exit(0); }
  const src = arg('sources');
  if (src) { const p = findProject(root, src); console.log(JSON.stringify(p ? { project: p, ...sources(path.join(root, p)) } : { error: `no CapCut project like "${src}" in ${root}` }, null, 1)); process.exit(0); }
  const f = process.argv[2], name = arg('project');
  if (!f || !name) { console.error('usage: capcut.js edit.json --project "<name>" | --list | --sources "<name>"'); process.exit(1); }
  const r = writeProject(JSON.parse(fs.readFileSync(f, 'utf8')), name, { overwrite: flag('overwrite'), layout: arg('layout', 'blur') });
  log(`CapCut project written: ${r.project} (restart CapCut if it was open)`); console.log(JSON.stringify(r));
}
module.exports = { draftsRoot, findProject, sources, writeProject, projects };
