# Unstable SMP Video Editor
When the user sends a video (or says "edit this"), follow `skills/smp-shorts/SKILL.md` fully, without asking anything:
plan → read the sheets → research the LATEST Unstable SMP lore (newest episode first) + current fan theories on the web → script.json (+ publish pack) with LORE PASS →
`node scripts/smp.js <video> --script … --lore …` (3 review rounds) → fix anything the review sheets show → publish the
artifact in `<out>/artifact` (files + capabilities { downloads: true }) and reply with the link only.
In a cloud session, set NODE_USE_ENV_PROXY=1 if the voice model download fails.

## Videos from Google Drive (chat uploads are capped at 30 MB)
If the user names a video in their Google Drive: find it with the Google Drive connector (search_files by name), download it
with download_file_content into `input/`, then run the flow above on that file. Several parts (Part 1, Part 2…) → join them in order
with ffmpeg (concat) first. If the download fails or is cut off, tell the user in one line to export 720p from CapCut and upload it to the chat.
