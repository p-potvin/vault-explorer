const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const player = read('js/player/player.js');
const upscale = read('js/player/upscale.js');
const cardEvents = read('js/navigation/card-events.js');
const livePython = read('python-scripts/live_subtitles.py');
const subtitlesPy = read('python-scripts/vw_media/subtitles.py');
const translatePy = read('python-scripts/translate_video.py');
const generateSubsPy = read('python-scripts/generate_subtitles.py');
const enhanceAudioPy = read('python-scripts/enhance_audio.py');
const idle = read('js/navigation/idle.js');
const index = read('index.html');

assert.doesNotMatch(player, /showVideoEnhancementDialog/, 'context AI enhancement must not call a missing dialog');
assert.match(player, /electronAPI\.upscaleVideo/, 'player context menu must invoke permanent AI enhancement');
assert.match(upscale, /URL\.revokeObjectURL\(upscaleMsUrl\)/, 'player upscale must revoke its MediaSource URL');
assert.match(upscale, /MAX_UPSCALE_QUEUE_BYTES/, 'player upscale must bound queued MediaSource data');
assert.match(upscale, /upscaleOrigSrc/, 'player upscale must retain the original source for recovery');
assert.match(cardEvents, /electronAPI\.enhanceAudio\([^)]*volumeBoost/s, 'audio enhancement must pass the voice boost option');
assert.match(cardEvents, /electronAPI\.upscaleVideo/, 'card context menu must invoke video enhancement');

// Each menu action must reach its own script. The whole point of the split is
// that asking for subtitles no longer runs the audio pipeline.
assert.match(cardEvents, /electronAPI\.generateSubtitles\(/, 'subtitle generation must use its own IPC channel');
assert.match(cardEvents, /electronAPI\.translateVideo\(/, 'translation must use its own IPC channel');
assert.doesNotMatch(cardEvents, /electronAPI\.normalizeAudio\(/, 'card actions must not funnel through the legacy normalizeAudio alias');
assert.doesNotMatch(player, /electronAPI\.normalizeAudio\(/, 'player actions must not funnel through the legacy normalizeAudio alias');
// Match invocations, not prose: these files name Demucs in their docstrings
// precisely to explain that they do not run it.
assert.doesNotMatch(generateSubsPy, /demucs\.separate/, 'generating subtitles must never invoke Demucs');
assert.doesNotMatch(translatePy, /demucs\.separate/, 'translating must never invoke Demucs');
assert.doesNotMatch(generateSubsPy, /h264_nvenc|libx264/, 'generating subtitles must never re-encode the video');
assert.doesNotMatch(translatePy, /h264_nvenc|libx264/, 'translating must never re-encode the video');
assert.match(enhanceAudioPy, /demucs\.separate/, 'audio enhancement is the action that owns Demucs');

assert.match(subtitlesPy, /def external_code/, 'generated subtitle filenames must normalize QC to an external language code');
assert.match(subtitlesPy, /return 'fr' if code in \{'qc', 'fr-ca', 'ca-fr'\}/, 'QC subtitle output must be written as FR');
assert.match(translatePy, /external_code\(target_language\)/, 'translated subtitle sidecars must use the normalized external code');
assert.match(livePython, /\.ai\.\{primary_lang\}\.srt/, 'AI live subtitles must write an additive sidecar');
assert.doesNotMatch(idle, /currentTab === 'files' && window\.appSettings.*devMode/, 'idle previews must run for non-dev users');
assert.match(idle, /idleLog/, 'idle preview diagnostics must be silent outside dev mode');
assert.match(read('src/previews.js'), /generateThumbAndPreview\(item\.path, thumbPath, webmPath, event\.sender, false, true\)/, 'idle preview progress must be silent');
assert.doesNotMatch(index, /id="btn-upscale"[^>]*disabled/, 'player AI control must be enabled for local playback');
console.log('AI paths: ok');
