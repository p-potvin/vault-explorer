// Every <script src> in index.html must parse. A half-applied review suggestion
// once left filters.js/favorites.js unterminated, so window.applyFilters and
// window.displayedItems were never defined and directory.js crashed the Files tab.
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\s+src="([^"]+\.js)"/g)].map(m => m[1]);
assert.ok(scripts.length > 10, `Expected renderer scripts in index.html, found ${scripts.length}`);

const failures = [];
for (const rel of scripts) {
    const code = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    try {
        new vm.Script(code, { filename: rel });
    } catch (error) {
        failures.push(`${rel}: ${error.message}`);
    }
}
assert.deepEqual(failures, [], `Renderer scripts failed to parse:\n${failures.join('\n')}`);

// globToRegex must treat regex metacharacters literally so a user glob can't throw.
const sandbox = { window: {}, document: {} };
vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js/utils.js'), 'utf8'), sandbox);
const toRx = sandbox.window.globToRegex;
assert.equal(typeof toRx, 'function', 'utils.js must expose window.globToRegex');
assert.ok(toRx('*.nfo').test('Movie.NFO'));
assert.ok(!toRx('*.nfo').test('movie_nfo'));
assert.ok(toRx('sample(1)*').test('sample(1).mkv'));
assert.ok(toRx('[draft]?.txt').test('[draft]a.txt'));

console.log(`Renderer script syntax passed (${scripts.length} scripts).`);
