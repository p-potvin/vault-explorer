const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const main = read('main.js');
assert.match(main, /arg === '\.'/, 'the npm start placeholder "." must not be treated as a launch folder');

const tabs = read('js/navigation/tabs.js');
const defaultIdx = tabs.indexOf('if (s.defaultFolder) {');
const lastPathIdx = tabs.indexOf('} else if (lp) {');
assert.ok(defaultIdx > 0, 'startup must check the defaultFolder setting');
assert.ok(lastPathIdx > defaultIdx, 'defaultFolder must take precedence over lastPath at startup');

console.log('Startup folder: ok');
