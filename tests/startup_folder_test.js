const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts.start, 'node scripts/start.js', 'npm start must go through the settings-aware launcher');

const launcher = read('scripts/start.js');
assert.match(launcher, /vault-settings\.json/, 'launcher must read the app settings file');
assert.match(launcher, /defaultFolder/, 'launcher must read the defaultFolder key');
assert.match(launcher, /\['\.', \.\.\.\(folder \? \[folder\] : \[\]\)\]/, 'launcher must pass defaultFolder after the entry point');

const main = read('main.js');
assert.match(main, /arg === '\.'/, 'the electron entry placeholder "." must not be treated as a launch folder');

console.log('Startup folder: ok');
