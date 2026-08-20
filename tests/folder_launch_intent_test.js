const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

console.log('=== VAULT EXPLORER FOLDER LAUNCH INTENT TEST ===\n');

// 1. Recreate argument parser logic from main.js
function getOpenTargetFromArgs(args, workingDirectory) {
    for (const arg of args) {
        if (!arg || arg.startsWith('--')) continue;
        try {
            const resolvedPath = workingDirectory
                ? path.resolve(workingDirectory, arg)
                : path.resolve(arg);
            if (fs.existsSync(resolvedPath)) {
                const stat = fs.statSync(resolvedPath);
                if (stat.isDirectory()) return { type: 'folder', path: resolvedPath };
                if (stat.isFile()) return { type: 'file', path: resolvedPath };
            }
        } catch (_) { }
    }
    return null;
}

function getLaunchIntentFromArgs(args, workingDirectory) {
    const target = getOpenTargetFromArgs(args, workingDirectory);
    if (!target) return null;
    if (target.type === 'folder') {
        return {
            type: 'folder',
            folderPath: target.path,
            prioritizePlayer: false,
        };
    }
    return {
        type: 'file',
        filePath: target.path,
        prioritizePlayer: args.includes('--prioritize-player'),
    };
}

// 2. Test directory argument resolution
const testDir = __dirname;
const dirIntent = getLaunchIntentFromArgs([testDir]);
console.log('[Test 1] Directory Launch Intent:', dirIntent);
assert.ok(dirIntent, 'Launch intent must not be null for directory');
assert.equal(dirIntent.type, 'folder');
assert.equal(dirIntent.folderPath, path.resolve(testDir));
assert.equal(dirIntent.prioritizePlayer, false, 'Directory intent must not prioritize player');
console.log('[PASS] Directory launch intent parsed correctly.\n');

// 3. Test file argument resolution
const testFile = __filename;
const fileIntent = getLaunchIntentFromArgs([testFile, '--prioritize-player']);
console.log('[Test 2] File Launch Intent:', fileIntent);
assert.ok(fileIntent, 'Launch intent must not be null for file');
assert.equal(fileIntent.type, 'file');
assert.equal(fileIntent.filePath, path.resolve(testFile));
assert.equal(fileIntent.prioritizePlayer, true, 'File intent with flag must prioritize player');
console.log('[PASS] File launch intent parsed correctly.\n');

// 4. Test normalizeLaunchIntent logic from js/app.js
function normalizeLaunchIntent(intent) {
    if (typeof intent === 'string') {
        if (/\.(mp4|webm|mkv|avi|mov)$/i.test(intent)) {
            return { type: 'file', filePath: intent, prioritizePlayer: false };
        }
        return { type: 'folder', folderPath: intent, prioritizePlayer: false };
    }
    if (!intent) return null;
    if (intent.folderPath || intent.type === 'folder') {
        return { type: 'folder', folderPath: intent.folderPath, prioritizePlayer: false };
    }
    if (typeof intent.filePath === 'string') {
        return { type: 'file', filePath: intent.filePath, prioritizePlayer: intent.prioritizePlayer === true };
    }
    return null;
}

const normDir = normalizeLaunchIntent(dirIntent);
assert.equal(normDir.type, 'folder');
assert.equal(normDir.folderPath, path.resolve(testDir));
assert.equal(normDir.prioritizePlayer, false);

const normFile = normalizeLaunchIntent(fileIntent);
assert.equal(normFile.type, 'file');
assert.equal(normFile.filePath, path.resolve(testFile));
assert.equal(normFile.prioritizePlayer, true);

console.log('[PASS] normalizeLaunchIntent accurately handles both folder and file intents.\n');

console.log('======================================================');
console.log(' ALL FOLDER LAUNCH INTENT TESTS PASSED                ');
console.log('======================================================\n');
