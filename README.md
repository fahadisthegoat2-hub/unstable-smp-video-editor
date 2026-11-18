# Unstable SMP Video Editor (Claude Code plugin)

Send an Unstable SMP video → get back a finished short (max 45 s):
- picks the best moments (hook first, payoff last)
- researches the **real** Unstable SMP lore on the web (every line is source-checked)
- voiceover (Kokoro, same engine as Motion Forge's Voice Studio) + karaoke captions
- real 2D + 3D motion graphics (Three.js voxel titles, crowns, portals, swords, cages, 3D maps, particles), rendered first, edit last
- a motion-graphics library: every graphic is saved, cached and reusable by name (`node scripts/mglib.js list`)
- SFX + mastered sound
- 3 check-and-improve rounds (hook, structure, pacing, collisions, loudness)
- publish pack: titles, description, hashtags, tags, pinned comment, thumbnail
- an artifact page that renders the MP4 on **your own device** (iPad/phone/PC) at the best quality it supports

## Install
```
/plugin marketplace add fahadisthegoat2-hub/unstable-smp-video-editor
/plugin install smp-shorts
```
Then: `/smp-edit my-clip.mp4`
