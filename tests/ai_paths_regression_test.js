const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const player = read('js/player/player.js');
const upscale = read('js/player/upscale.js');
const cardEvents = read('js/navigation/card-events.js');
const livePython = read('python-scripts/live_subtitles.py');
const idle = read('js/navigation/idle.js');
const index = read('index.html');

assert.doesNotMatch(player, /showVideoEnhancementDialog/, 'context AI enhancement must not call a missing dialog');
assert.match(player, /electronAPI\.upscaleVideo/, 'player context menu must invoke permanent AI enhancement');
assert.match(upscale, /URL\.revokeObjectURL\(upscaleMsUrl\)/, 'player upscale must revoke its MediaSource URL');
assert.match(upscale, /MAX_UPSCALE_QUEUE_BYTES/, 'player upscale must bound queued MediaSource data');
assert.match(upscale, /upscaleOrigSrc/, 'player upscale must retain the original source for recovery');
assert.match(cardEvents, /normalizeAudio\([^\n]*\{ volumeBoost \}/, 'context subtitle generation must pass voice boost options');
assert.match(cardEvents, /electronAPI\.upscaleVideo/, 'card context menu must invoke video enhancement');
assert.match(livePython, /\.ai\.\{primary_lang\}\.srt/, 'AI live subtitles must write an additive sidecar');
assert.doesNotMatch(idle, /currentTab === 'files' && window\.appSettings.*devMode/, 'idle previews must run for non-dev users');
assert.match(idle, /idleLog/, 'idle preview diagnostics must be silent outside dev mode');
assert.match(read('src/previews.js'), /generateThumbAndPreview\(item\.path, thumbPath, webmPath, event\.sender, false, true\)/, 'idle preview progress must be silent');
assert.doesNotMatch(index, /id="btn-upscale"[^>]*disabled/, 'player AI control must be enabled for local playback');
console.log('AI paths: ok');
