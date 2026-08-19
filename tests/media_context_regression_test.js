const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const subtitlesIpc = require(path.join(root, 'src', 'ipc', 'subtitles.ipc.js'));
const main = read('main.js');
const player = read('js/player/player.js');
const subtitles = read('js/player/subtitles.js');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-subtitles-'));
try {
    const srtPath = path.join(tempDir, 'sample.en.srt');
    fs.writeFileSync(srtPath, '1\n00:00:01,250 --> 00:00:02,500\nHello\n', 'utf8');
    const vttPath = subtitlesIpc.convertSrtToVtt(srtPath);
    const vtt = fs.readFileSync(vttPath, 'utf8');
    assert.match(vtt, /^WEBVTT\n\n1\n00:00:01\.250 --> 00:00:02\.500/m,
        'SRT conversion must produce valid WebVTT newlines and timestamps');
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

assert.match(subtitles, /new Blob\(\[vttText\], \{ type: 'text\/vtt' \}\)/,
    'Uploaded SRT files must be converted to a WebVTT blob');
assert.match(subtitles, /replace\(\/\^\\uFEFF\/, ''\)/,
    'Uploaded subtitles must strip a UTF-8 BOM before WebVTT detection');
assert.match(subtitles, /querySelectorAll\('track'\)\.forEach\(\(track\) => track\.remove\(\)\)/,
    'Uploading a subtitle must remove prior tracks');
assert.match(main, /choose-subtitle-file[\s\S]*defaultPath/,
    'Subtitle picker must use the currently playing file folder');
assert.match(main, /before-mouse-event[\s\S]*mouseWheel[\s\S]*adjustWindowZoom/s,
    'Ctrl+wheel zoom must use Electron mouse-event handling');
const beforeInputBlock = main.slice(main.indexOf("before-input-event"), main.indexOf("before-mouse-event"));
assert.doesNotMatch(beforeInputBlock, /mouseWheel/,
    'Keyboard input handling must not contain unreachable wheel logic');
assert.match(player, /buildPlaybackContext[\s\S]*electronAPI\.scanDirectory/s,
    'Playback must build its sequence from the playing file folder');
assert.match(player, /playbackSort\) \|\| 'mtime-desc'/,
    'Playback folder order must default to newest modified first');
assert.match(player, /sortPlaybackItems\(await window\.electronAPI\.scanDirectory\(folder\)\)/,
    'The scanned playback folder must be sorted before navigation');
assert.match(read('index.html'), /value="size-desc"[\s\S]*value="duration-asc"/,
    'Playback settings must offer size and length ordering');
assert.match(player, /getAdjacentPlaybackIndex\(1\)[\s\S]*playItem\(nextIdx, getPlaybackItems\(\)\)/s,
    'Next navigation must use the active playback-folder sequence');
assert.match(player, /const itemFolder = getItemDirectory\(itemPath\) \|\| window\.currentRealPath/,
    'Player actions must use the playing file folder as their working root');

console.log('Media context regression checks passed.');
