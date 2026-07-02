const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const subtitles = fs.readFileSync(path.join(root, 'js', 'player', 'subtitles.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const normalization = fs.readFileSync(path.join(root, 'src', 'normalization.js'), 'utf8');
const audioNormalize = fs.readFileSync(path.join(root, 'python-scripts', 'audio_normalize.py'), 'utf8');

assert.match(subtitles, /menu\.style\.left\s*=/, 'ASR popup should position with fixed left coordinates');
assert.match(subtitles, /menu\.style\.top\s*=/, 'ASR popup should position with fixed top coordinates');
assert.doesNotMatch(subtitles, /menu\.style\.right\s*=\s*`\$\{left\}px`/, 'ASR popup must not write computed left into right');
assert.doesNotMatch(subtitles, /menu\.style\.bottom\s*=\s*`\$\{top\}px`/, 'ASR popup must not write computed top into bottom');

assert.match(subtitles, /asr-volume-boost/, 'ASR popup should expose a volume boost control');
assert.match(subtitles, /volumeBoost/, 'ASR popup should return a volumeBoost option');
assert.match(subtitles, /normalizeAudio\(videoPath,\s*window\.currentRealPath,\s*true,\s*null,\s*\{[^}]*volumeBoost/s, 'Subtitle generator should pass volumeBoost to normalizeAudio');

assert.match(preload, /normalizeAudio:\s*\([^)]*options\s*=\s*\{\}/, 'preload normalizeAudio should accept an options object');
assert.match(preload, /volumeBoost/, 'preload normalizeAudio should forward volumeBoost');
assert.match(normalization, /volumeBoost\s*=\s*1\.5/, 'normalization IPC should default volumeBoost to 1.5');
assert.match(normalization, /--volume-boost/, 'normalization IPC should pass --volume-boost to Python');
assert.match(audioNormalize, /--volume-boost/, 'audio_normalize.py should parse --volume-boost');
assert.match(audioNormalize, /vocal_mix_weight/, 'audio_normalize.py should use a configurable vocal mix weight');
