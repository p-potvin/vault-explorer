const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sourceFiles = [
    'index.html', 'index.css', 'main.js', 'preload.js', 'js/app.js', 'js/player/player.js',
    'js/player/subtitles.js', 'js/settings/core.js', 'js/navigation/tabs.js', 'js/navigation/directory.js',
    'js/navigation/virtual-folders.js', 'js/utils.js', 'src/scanner.js', 'src/ipc/subtitles.ipc.js',
];
const source = sourceFiles.map(read).join('\n');

for (const term of ['om' + 'db', 'tm' + 'db', 'open' + 'subtitles']) {
    assert.equal(source.toLowerCase().includes(term), false, `migrated provider name must not remain: ${term}`);
}
for (const term of ['settings-open' + 'subtitles', 'settings-subs-include-es', 'tab-' + 'misc', 'misc-container', 'defaultFolder' + 'Misc']) {
    assert.equal(source.includes(term), false, `removed setting/tab identifier must not remain: ${term}`);
}
assert.doesNotMatch(read('.env'), /\S/, 'local environment file must not contain provider credentials');
assert.doesNotMatch(read('.env.example'), /\S/, 'environment template must not contain migrated provider settings');
assert.match(read('index.css'), /\.subtitle-language-pill/, 'subtitle language pill styling must be present');
assert.doesNotMatch(read('index.css'), /subtitles-active[^\{]*\{[^}]*padding-bottom/s, 'subtitles must not resize the video element');
console.log('Explorer cleanup: ok');
