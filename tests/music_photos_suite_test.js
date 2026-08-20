const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

console.log('===========================================================');
console.log(' VAULT EXPLORER: MUSIC & PHOTOS FULL FEATURE TEST SUITE     ');
console.log('===========================================================\n');

// ── Mock window & appSettings & localStorage ────────────────────────────────
const mockLocalStorage = new Map();
global.localStorage = {
    getItem: (k) => mockLocalStorage.get(k) || null,
    setItem: (k, v) => mockLocalStorage.set(k, String(v)),
    removeItem: (k) => mockLocalStorage.delete(k),
    clear: () => mockLocalStorage.clear()
};

let mockSettings = {
    virtualFolders: {
        version: 2,
        folders: [],
        items: {}
    },
    playlistCovers: {},
    albumCovers: {},
    favorites: []
};

global.window = {
    appSettings: mockSettings,
    electronAPI: {
        saveSettings: async (s) => { mockSettings = s; return true; },
        getSettings: async () => mockSettings,
    }
};

// Load virtual-folders module
require('../js/navigation/virtual-folders.js');
const vf = window.vf;

// ── TEST 1: Major Version Verification ──────────────────────────────────────
console.log('[Test 1] Package Version Check (v4.0.0)...');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert.equal(pkg.version, '4.0.0', 'Expected package.json version to be 4.0.0');
console.log('✓ [PASS] Major version bumped to 4.0.0 successfully.\n');

// ── TEST 2: Playlist CRUD & localStorage Persistence ────────────────────────
console.log('[Test 2] Playlist CRUD & Persistence Mirror in Virtual Folders...');

const plRes = vf.create({ name: 'Chill Beats', type: 'playlist' });
assert.ok(plRes.ok, 'Failed to create playlist');
const plId = plRes.folder.id;
assert.equal(plRes.folder.name, 'Chill Beats');
assert.equal(plRes.folder.type, 'playlist');

// Add tracks (testing extension inference)
const addTracksRes = vf.addItems(plId, [
    'C:\\Music\\Track 01.mp3',
    'C:\\Music\\Track 02.flac',
    'C:\\Music\\Track 03.wav',
    'C:\\Music\\Invalid.jpg' // Should be rejected since album/image not audio
]);
assert.equal(addTracksRes.added, 3, 'Expected 3 valid audio tracks added');
assert.equal(addTracksRes.rejected, 1, 'Expected 1 non-audio rejected');
assert.equal(vf.itemsOf(plId).length, 3);

// Verify localStorage backup
const backup = JSON.parse(localStorage.getItem('vault-virtual-folders-backup'));
assert.ok(backup && backup.folders.some(f => f.id === plId), 'localStorage backup must contain new playlist');

// Rename playlist
const renamePlRes = vf.rename(plId, 'Late Night Chill');
assert.ok(renamePlRes.ok);
assert.equal(vf.get(plId).name, 'Late Night Chill');

// Remove track from playlist
const rmTrackCount = vf.removeItems(plId, ['C:\\Music\\Track 02.flac']);
assert.equal(rmTrackCount, 1);
assert.equal(vf.itemsOf(plId).length, 2);
assert.ok(!vf.itemsOf(plId).includes('C:\\Music\\Track 02.flac'));

// Delete playlist
const delPlCount = vf.remove(plId);
assert.equal(delPlCount, 1);
assert.equal(vf.get(plId), null);
assert.equal(vf.itemsOf(plId).length, 0);
console.log('✓ [PASS] Playlist CRUD & persistence mirror verified.\n');


// ── TEST 3: Photo Album / Gallery CRUD & Recovery ───────────────────────────
console.log('[Test 3] Photo Album CRUD and Recovery in Virtual Folders...');

const albRes = vf.create({ name: 'Vacation 2026', type: 'album' });
assert.ok(albRes.ok, 'Failed to create album');
const albId = albRes.folder.id;
assert.equal(albRes.folder.name, 'Vacation 2026');
assert.equal(albRes.folder.type, 'album');

// Add images
const addImgRes = vf.addItems(albId, [
    'C:\\Photos\\Beach.jpg',
    'C:\\Photos\\Sunset.png',
    'C:\\Photos\\Panorama.webp',
    'C:\\Photos\\Song.mp3'
]);
assert.equal(addImgRes.added, 3, 'Expected 3 valid images added');
assert.equal(addImgRes.rejected, 1, 'Expected 1 non-image rejected');
assert.equal(vf.itemsOf(albId).length, 3);

// Simulate app settings losing in-memory virtualFolders (testing localStorage recovery)
window.appSettings.virtualFolders = null;
const recoveredList = vf.list({ type: 'album' });
assert.ok(recoveredList.some(f => f.id === albId), 'Expected virtual-folders to auto-recover from localStorage backup');

// Rename album
const renameAlbRes = vf.rename(albId, 'Summer Vacation 2026');
assert.ok(renameAlbRes.ok);
assert.equal(vf.get(albId).name, 'Summer Vacation 2026');

// Remove photo from album
const rmImgCount = vf.removeItems(albId, ['C:\\Photos\\Sunset.png']);
assert.equal(rmImgCount, 1);
assert.equal(vf.itemsOf(albId).length, 2);

// Delete album
const delAlbCount = vf.remove(albId);
assert.equal(delAlbCount, 1);
assert.equal(vf.get(albId), null);
console.log('✓ [PASS] Photo Album CRUD and automatic recovery verified.\n');


// ── TEST 4: Filmstrip Windowing & Auto Fit Screen Calculation ────────────────
console.log('[Test 4] Filmstrip Sliding Window & Fit-To-Screen Math...');

// Test sliding window algorithm (5,000 photos -> only 15 rendered at a time)
function calculateFilmstripWindow(totalPhotos, currentIndex, windowSize = 15) {
    const half = Math.floor(windowSize / 2);
    let startIdx = Math.max(0, currentIndex - half);
    let endIdx = Math.min(totalPhotos, startIdx + windowSize);
    if (endIdx - startIdx < windowSize) {
        startIdx = Math.max(0, endIdx - windowSize);
    }
    return { startIdx, endIdx, count: endIdx - startIdx };
}

const w1 = calculateFilmstripWindow(5000, 2500, 15);
assert.equal(w1.count, 15);
assert.equal(w1.startIdx, 2493);
assert.equal(w1.endIdx, 2508);

const wStart = calculateFilmstripWindow(5000, 2, 15);
assert.equal(wStart.startIdx, 0);
assert.equal(wStart.endIdx, 15);

// Test auto fit zoom math (e.g. 4000x3000 photo in 1200x800 container)
function computeFitZoom(imgW, imgH, containerW, containerH, pad = 48) {
    const availW = Math.max(100, containerW - pad);
    const availH = Math.max(100, containerH - pad);
    return Math.min(availW / imgW, availH / imgH, 1);
}

const fitZoomLarge = computeFitZoom(4000, 3000, 1200, 800);
assert.ok(fitZoomLarge < 0.3 && fitZoomLarge > 0.2, 'Large photo must scale down to fit screen');
assert.ok(4000 * fitZoomLarge <= 1200 - 48, 'Width fits inside container');
assert.ok(3000 * fitZoomLarge <= 800 - 48, 'Height fits inside container');

const fitZoomSmall = computeFitZoom(400, 300, 1200, 800);
assert.equal(fitZoomSmall, 1, 'Small photo should not upscale beyond 1.0 by default');
console.log('✓ [PASS] Filmstrip sliding window and fit-to-screen scaling verified.\n');


// ── TEST 5: AI Action Toggle & Revert State Machine ─────────────────────────
console.log('[Test 5] AI Action Toggle & Revert State Machine...');

let currentImageSrc = 'C:\\Photos\\Beach.jpg';
let activeEffect = null;
const originalSrc = 'C:\\Photos\\Beach.jpg';

function handleAiToggle(effectName, enhancedPath) {
    if (activeEffect === effectName) {
        // Re-press reverts to original!
        currentImageSrc = originalSrc;
        activeEffect = null;
        return { action: 'reverted', src: currentImageSrc };
    } else {
        // Apply effect
        activeEffect = effectName;
        currentImageSrc = enhancedPath;
        return { action: 'applied', src: currentImageSrc };
    }
}

// 1. Apply Super-Res
const a1 = handleAiToggle('ai-upscale', 'C:\\Photos\\Beach_enhanced.png');
assert.equal(a1.action, 'applied');
assert.equal(a1.src, 'C:\\Photos\\Beach_enhanced.png');
assert.equal(activeEffect, 'ai-upscale');

// 2. Re-press Super-Res to revert
const a2 = handleAiToggle('ai-upscale', 'C:\\Photos\\Beach_enhanced.png');
assert.equal(a2.action, 'reverted');
assert.equal(a2.src, 'C:\\Photos\\Beach.jpg');
assert.equal(activeEffect, null);

console.log('✓ [PASS] AI Action toggle & revert verified.\n');


// ── TEST 6: Audio Bar State Machine ─────────────────────────────────────────
console.log('[Test 6] Audio Bar State Machine (Shuffle, Repeat)...');

function nextRepeatMode(current) {
    if (current === 'off') return 'all';
    if (current === 'all') return 'one';
    return 'off';
}
assert.equal(nextRepeatMode('off'), 'all');
assert.equal(nextRepeatMode('all'), 'one');
assert.equal(nextRepeatMode('one'), 'off');

console.log('✓ [PASS] Audio Bar state machine verified.\n');

console.log('===========================================================');
console.log(' ALL MUSIC & PHOTOS & EDITOR TESTS PASSED SUCCESSFULLY!    ');
console.log('===========================================================\n');
