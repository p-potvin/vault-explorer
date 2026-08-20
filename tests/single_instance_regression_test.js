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

assert.match(main, /VAULT_EXPLORER_FORCE_SINGLE_INSTANCE === '1'[\s\S]*VAULT_EXPLORER_E2E !== '1'/,
    'single-instance mode must be driven by the saved setting');
assert.match(main, /VAULT_EXPLORER_E2E_USER_DATA[\s\S]*app\.setPath\('userData'/,
    'E2E launches must be able to isolate their single-instance user data');
assert.match(main, /app\.requestSingleInstanceLock\(\)/,
    'single-instance mode must acquire Electron\'s application lock');
assert.match(main, /function getOpenFileFromArgs\(args, workingDirectory\)[\s\S]*path\.resolve\(workingDirectory, arg\)/,
    'relative paths must be resolved from the second instance working directory');
assert.match(main, /exitingSecondaryInstance = true;\s*app\.quit\(\);/,
    'a rejected second instance must exit without destroying the primary process');
assert.match(main, /if \(exitingSecondaryInstance\) return;[\s\S]*killAllOwnProcesses\(false\)/,
    'a rejected second instance must skip startup cleanup while forwarding its intent');
assert.match(main, /function getLaunchIntentFromArgs\(args, workingDirectory\)[\s\S]*prioritizePlayer: args\.includes\('--prioritize-player'\)/,
    'the explicit priority argument must travel with the file launch request');
assert.match(main, /app\.on\('second-instance',[\s\S]*openLaunchIntentInMainWindow\(getLaunchIntentFromArgs\(argv\.slice\(1\), workingDirectory\)\)/,
    'a subsequent Explorer open must forward its full launch intent to the existing window');
assert.match(main, /ipcMain\.handle\('get-launch-intent'/,
    'the renderer must be able to read the initial launch intent before startup work begins');
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
