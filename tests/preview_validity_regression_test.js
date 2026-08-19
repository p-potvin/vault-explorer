const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const previews = read('src/previews.js');
const utils = read('src/utils.js');

assert.match(previews, /typeof isValid !== 'boolean' \|\| !isValidCheckedAt/,
    'A video must only be sampled when it has not already been checked');
assert.match(previews, /hasVideo\s*\?\s*await utils\.validateVideoSamples\(videoPath, duration\)/,
    'Video validity must be based on video-only samples, not audio presence');
assert.match(previews, /meta\.isValidCheckedAt = isValidCheckedAt/,
    'Validity checks must persist their timestamp');
assert.doesNotMatch(previews, /hasVideo && hasAudio && refDuration/,
    'Missing audio must not make an otherwise decodable video invalid');
assert.match(utils, /normalizedDuration - 2/,
    'Validation must sample near the end of the video');
assert.match(utils, /for \(const sampleTime of sampleTimes\)/,
    'Validation samples must run sequentially and stop at the first failure');
assert.match(utils, /'-map', '0:v:0', '-an', '-sn', '-dn'/,
    'The samples must inspect video only');
assert.match(utils, /'-xerror'/,
    'The sample decode must fail deterministically on decoding errors');
assert.match(utils, /'-hwaccel', 'cuda'/,
    'FFmpeg input commands must prefer NVIDIA hardware acceleration');
assert.match(utils, /retrying on CPU/,
    'FFmpeg commands must retry on CPU when NVIDIA acceleration fails');
assert.match(previews, /new PreviewQueue\(2\)/,
    'Preview generation must cap concurrent preview workers at two');
assert.doesNotMatch(previews, /items\.slice\(0, 80\)/,
    'Preview scheduling must not silently truncate a requested batch');

console.log('Preview validity regression checks passed.');
