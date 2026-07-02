const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cardEvents = fs.readFileSync(path.join(root, 'js', 'navigation', 'card-events.js'), 'utf8');
const player = fs.readFileSync(path.join(root, 'js', 'player', 'player.js'), 'utf8');
const scanner = fs.readFileSync(path.join(root, 'src', 'scanner.js'), 'utf8');
const previews = fs.readFileSync(path.join(root, 'src', 'previews.js'), 'utf8');

assert.doesNotMatch(
    scanner,
    /if\s*\(!vaultRoot\s*&&\s*filesArray\.length\s*>\s*0\)/,
    'scan-specific-files must not infer .thumbs from the first scanned file folder'
);

assert.match(
    cardEvents,
    /generateWebm\(item\.path,\s*window\.currentRealPath\)[\s\S]*updateSingleVideoCard\(item\.path\)/,
    'card context menu WebM generation should rescan the generated file path after success'
);

assert.match(
    player,
    /generateWebm\(itemPath,\s*window\.currentRealPath\)[\s\S]*scanSpecificFiles\(\[itemPath\]\)/,
    'player context menu WebM generation should rescan the generated file path after success'
);

const forcedWebmOutputs = previews.match(/['"]-f['"]\s*,\s*['"]webm['"]\s*,\s*webmWritePath/g) || [];
assert.ok(
    forcedWebmOutputs.length >= 4,
    'all WebM temp outputs should force the webm muxer because .webm.tmp has no inferable format'
);

const forcedImageOutputs = previews.match(/['"]-f['"]\s*,\s*['"]image2['"]\s*,\s*thumbWritePath/g) || [];
assert.ok(
    forcedImageOutputs.length >= 3,
    'all thumbnail temp outputs should force the image2 muxer because .jpg.tmp has no inferable format'
);
