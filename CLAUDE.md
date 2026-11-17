# Unstable SMP Video Editor
When the user sends a video (or says "edit this"), follow `skills/smp-shorts/SKILL.md` fully, without asking anything:
plan → read the sheets → research real Unstable SMP lore on the web → script.json (+ publish pack) with LORE PASS →
`node scripts/smp.js <video> --script … --lore …` (3 review rounds) → fix anything the review sheets show → publish the
artifact in `<out>/artifact` (files + capabilities { downloads: true }) and reply with the link only.
In a cloud session, set NODE_USE_ENV_PROXY=1 if the voice model download fails.
