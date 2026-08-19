const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const main = read('main.js');
const settings = read('js/settings/core.js');
const html = read('index.html');
const en = read('js/translations.en.js');
const qc = read('js/translations.qc.js');

assert.match(main, /const singleInstanceEnabled = loadSettings\(\)\.singleInstance === true;/,
    'single-instance mode must be driven by the saved setting');
assert.match(main, /app\.requestSingleInstanceLock\(\)/,
    'single-instance mode must acquire Electron\'s application lock');
assert.match(main, /function getOpenFileFromArgs\(args, workingDirectory\)[\s\S]*path\.resolve\(workingDirectory, arg\)/,
    'relative paths must be resolved from the second instance working directory');
assert.match(main, /app\.quit\(\);\s*process\.exit\(0\);/,
    'a rejected second instance must exit before it can run startup cleanup');
assert.match(main, /app\.on\('second-instance',[\s\S]*openFileInMainWindow\(getOpenFileFromArgs\(argv\.slice\(1\), workingDirectory\)\)/,
    'a subsequent Explorer open must forward its file to the existing window');
assert.ok(main.indexOf('requestSingleInstanceLock') < main.indexOf('app.whenReady'),
    'the Electron lock must be acquired before the app becomes ready');
assert.match(html, /id="settings-single-instance"/,
    'Settings must expose the single-instance option');
assert.match(settings, /appSettings\.singleInstance = el\('settings-single-instance'\)\.checked/,
    'Settings must persist the single-instance option');
assert.match(en, /singleInstance:/, 'English label is required');
assert.match(qc, /singleInstance:/, 'Quebec French label is required');
assert.match(en, /singleInstanceHint:/, 'English restart hint is required');
assert.match(qc, /singleInstanceHint:/, 'Quebec French restart hint is required');

console.log('Single-instance regression checks passed.');
