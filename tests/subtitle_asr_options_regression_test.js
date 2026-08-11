const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const subtitles = fs.readFileSync(path.join(root, 'js', 'player', 'subtitles.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const normalization = fs.readFileSync(path.join(root, 'src', 'normalization.js'), 'utf8');
const enhancements = fs.readFileSync(path.join(root, 'src', 'enhancements.js'), 'utf8');
const enhanceAudio = fs.readFileSync(path.join(root, 'python-scripts', 'enhance_audio.py'), 'utf8');

assert.match(subtitles, /menu\.style\.left\s*=/, 'ASR popup should position with fixed left coordinates');
assert.match(subtitles, /menu\.style\.top\s*=/, 'ASR popup should position with fixed top coordinates');
assert.doesNotMatch(subtitles, /menu\.style\.right\s*=\s*`\$\{left\}px`/, 'ASR popup must not write computed left into right');
assert.doesNotMatch(subtitles, /menu\.style\.bottom\s*=\s*`\$\{top\}px`/, 'ASR popup must not write computed top into bottom');
assert.match(subtitles, /asr-volume-boost/, 'ASR popup should expose a volume boost control');
assert.match(subtitles, /volumeBoost/, 'ASR popup should return a volumeBoost option');
assert.match(subtitles, /preferredASRLangs/, 'AI subtitle languages should be persisted for later starts');
for (const code of ['en', 'qc', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar', 'hi', 'bn', 'tr', 'pl', 'sv', 'no', 'da', 'fi', 'cs', 'el', 'he', 'id', 'vi', 'uk']) {
    assert.match(subtitles, new RegExp(`code: '${code}'`), `ASR picker should expose ${code}`);
}
assert.match(subtitles, /Québécois \(QC\)/, 'Quebec French must be front-facing as QC');
assert.match(subtitles, /e\.altKey \|\| e\.shiftKey/, 'AI subtitle language selection should have an explicit override path');
assert.match(preload, /enhanceAudio:\s*\([^)]*options\s*=\s*\{\}/, 'preload enhanceAudio should accept an options object');
assert.match(preload, /volumeBoost/, 'preload should forward volumeBoost');
assert.match(preload, /generateSubtitles:/, 'preload should expose a dedicated subtitle generation call');
assert.match(preload, /translateVideo:/, 'preload should expose a dedicated translation call');
assert.match(enhancements, /Number\.isFinite\(parsed\) \? Math\.min\(2\.5, Math\.max\(1, parsed\)\) : 1\.5/, 'enhancement IPC should clamp volumeBoost and default it to 1.5');
assert.match(enhancements, /--volume-boost/, 'enhancement IPC should pass --volume-boost to Python');
assert.match(enhanceAudio, /--volume-boost/, 'enhance_audio.py should parse --volume-boost');
assert.match(enhanceAudio, /vocal_weight/, 'enhance_audio.py should use a configurable vocal mix weight');

// One channel per action; the legacy alias must not accept the old flags.
for (const channel of ['enhance-audio', 'generate-subtitles', 'translate-video', 'enhance-video']) {
    assert.match(enhancements, new RegExp(`'${channel}'`), `enhancements should define the ${channel} action`);
}
assert.match(normalization, /Ignoring transcribe\/translateTo/, 'the legacy normalize-audio alias must not re-couple transcription');
console.log('subtitle/asr options: ok');
