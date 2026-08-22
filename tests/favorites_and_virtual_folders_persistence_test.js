const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

console.log('======================================================================');
console.log(' VAULT EXPLORER: FAVORITES & VIRTUAL FOLDERS PERSISTENCE TEST SUITE   ');
console.log('======================================================================\n');

// ── Mock DOM, localStorage, and electronAPI ─────────────────────────────────
const mockLocalStorage = new Map();
global.localStorage = {
    getItem: (k) => mockLocalStorage.get(k) || null,
    setItem: (k, v) => mockLocalStorage.set(k, String(v)),
    removeItem: (k) => mockLocalStorage.delete(k),
    clear: () => mockLocalStorage.clear()
};

let persistedFileContent = JSON.stringify({
    theme: 'golden-slate',
    lang: 'en',
    favorites: ['C:\\Vault\\SciFi\\Dune.mp4', 'C:/Vault/Music/Song.mp3'],
    virtualFolders: {
        version: 2,
        folders: [
            { id: 'vf_col1', name: 'My Movies', type: 'collection', parentId: null, lastUsed: 1700000000000 },
            { id: 'vf_alb1', name: 'Summer 2026', type: 'album', parentId: null, lastUsed: 1700000000000 }
        ],
        items: {
            'vf_col1': ['C:\\Vault\\SciFi\\Dune.mp4', 'C:/Vault/Action/Matrix.mkv'],
            'vf_alb1': ['C:\\Photos\\Beach.jpg']
        }
    }
});

let mockSettings = JSON.parse(persistedFileContent);

// Setup mock window & DOM environment
function setupEnvironment() {
    const domElements = new Map();
    global.document = {
        getElementById: (id) => {
            if (!domElements.has(id)) {
                domElements.set(id, {
                    id,
                    style: {},
                    innerHTML: '',
                    innerText: '',
                    value: '',
                    dataset: {},
                    appendChild: () => {},
                    querySelector: () => null,
                    querySelectorAll: () => [],
                    addEventListener: () => {},
                    remove: () => domElements.delete(id)
                });
            }
            return domElements.get(id);
        },
        createDocumentFragment: () => ({
            appendChild: () => {}
        }),
        querySelectorAll: () => [],
        body: {
            appendChild: () => {}
        }
    };
    global.el = (id) => global.document.getElementById(id);

    global.requestAnimationFrame = (cb) => { if (typeof cb === 'function') cb(); };
    global.window = {
        el: global.el,
        appSettings: JSON.parse(persistedFileContent),
        currentLang: 'en',
        translations: { en: {}, fr: {} },
        currentTab: 'files',
        currentFilesSubtab: 'all',
        showToast: (msg, type) => {},
        killAllHoverVideos: () => {},
        electronAPI: {
            getSettings: async () => JSON.parse(persistedFileContent),
            saveSettings: async (s) => {
                persistedFileContent = JSON.stringify(s);
                mockSettings = JSON.parse(persistedFileContent);
                return true;
            },
            scanSpecificFiles: async (paths) => {
                return (paths || []).map(p => ({
                    path: p.replace(/\//g, '\\'),
                    name: p.split(/[\\/]/).pop(),
                    type: p.endsWith('.mp3') ? 'audio' : p.endsWith('.jpg') ? 'image' : 'video',
                    size: 1024 * 1024
                }));
            }
        },
        createCardElement: (item, index) => ({
            dataset: { path: item.path },
            querySelector: () => ({ setAttribute: () => {}, style: {} })
        }),
        updateStatusBar: () => {}
    };

    // Load modules
    delete require.cache[require.resolve('../js/favorites.js')];
    delete require.cache[require.resolve('../js/navigation/virtual-folders.js')];
    delete require.cache[require.resolve('../js/navigation/filters.js')];
    
    require('../js/favorites.js');
    require('../js/navigation/virtual-folders.js');
    require('../js/navigation/filters.js');
}

setupEnvironment();

// ── TEST 1: Favorites Path Normalization & isFavorite ──────────────────────
console.log('[Test 1] Testing window.isFavorite() normalization...');
assert.ok(window.isFavorite('C:\\Vault\\SciFi\\Dune.mp4'), 'Should match exact Windows path');
assert.ok(window.isFavorite('c:\\vault\\scifi\\dune.mp4'), 'Should match case-insensitively');
assert.ok(window.isFavorite('C:/Vault/SciFi/Dune.mp4'), 'Should match forward slashes');
assert.ok(window.isFavorite('c:/vault/music/song.mp3'), 'Should match forward slash item with lowercase');
assert.ok(!window.isFavorite('C:\\Vault\\Other.mp4'), 'Should return false for unstarred items');
console.log('✓ [PASS] window.isFavorite() path normalization verified.\n');

// ── TEST 2: Toggle Favorite (Add, Remove, Silent) ───────────────────────────
console.log('[Test 2] Testing window.toggleFavorite()...');

// Add a new favorite
window.toggleFavorite('C:/Vault/Movies/BladeRunner.mp4');
assert.ok(window.isFavorite('C:\\Vault\\Movies\\BladeRunner.mp4'), 'Newly added item should be favorited');
assert.ok(JSON.parse(persistedFileContent).favorites.some(p => p.includes('BladeRunner')), 'Persisted settings should include BladeRunner');

// Remove the favorite
window.toggleFavorite('C:\\Vault\\Movies\\BladeRunner.mp4');
assert.ok(!window.isFavorite('C:\\Vault\\Movies\\BladeRunner.mp4'), 'Toggled item should now be unfavorited');
assert.ok(!JSON.parse(persistedFileContent).favorites.some(p => p.includes('BladeRunner')), 'Persisted settings should drop BladeRunner');

// Multi-select silent toggles
window.toggleFavorite('C:\\Vault\\A.mp4', null, true);
window.toggleFavorite('C:\\Vault\\B.mp4', null, true);
assert.ok(window.isFavorite('c:/vault/a.mp4'), 'A.mp4 should be favorited');
assert.ok(window.isFavorite('c:/vault/b.mp4'), 'B.mp4 should be favorited');
console.log('✓ [PASS] window.toggleFavorite() verified.\n');

// ── TEST 3: Virtual Folders CRUD & Normalized Item Matching ─────────────────
console.log('[Test 3] Testing Virtual Folders CRUD & Normalized Item Matching...');
const vf = window.vf;
assert.ok(vf, 'window.vf must be available');

// List initial folders from persisted data
const collections = vf.list({ type: 'collection' });
assert.equal(collections.length, 1);
assert.equal(collections[0].name, 'My Movies');

// Add items with mixed slashes to collection
const addRes = vf.addItems('vf_col1', [
    'C:/Vault/SciFi/Dune.mp4', // duplicate in different slash format -> should not add
    'C:\\Vault\\SciFi\\Interstellar.mkv',
    'C:\\Vault\\Music\\Track.mp3' // Invalid type for collection -> rejected
]);
assert.equal(addRes.added, 1, 'Only 1 new valid video should be added');
assert.equal(addRes.rejected, 1, 'Audio track should be rejected from collection');

const colItems = vf.itemsOf('vf_col1');
assert.equal(colItems.length, 3, 'Collection should contain 3 items');

// Remove item with alternative slash format
const rmCount = vf.removeItems('vf_col1', ['c:/vault/scifi/interstellar.mkv']);
assert.equal(rmCount, 1, 'Should remove item despite slash / case differences');
assert.equal(vf.itemsOf('vf_col1').length, 2);

console.log('✓ [PASS] Virtual Folders item handling verified.\n');

// ── TEST 4: Virtual Folder Navigation & applyFilters Matching ───────────────
console.log('[Test 4] Testing Virtual Folder items rendering in applyFilters()...');
window.currentFolderId = 'vf_col1';
window.currentFilesSubtab = 'collections';
window.allItems = [
    { path: 'C:\\Vault\\SciFi\\Dune.mp4', name: 'Dune.mp4', type: 'video' },
    { path: 'C:\\Vault\\Action\\Matrix.mkv', name: 'Matrix.mkv', type: 'video' },
    { path: 'C:\\Vault\\Other\\Unrelated.mp4', name: 'Unrelated.mp4', type: 'video' }
];

window.applyFilters();
assert.equal(window.displayedItems.length, 2, 'Should display only the 2 items belonging to vf_col1');
assert.ok(window.displayedItems.some(i => i.name === 'Dune.mp4'));
assert.ok(window.displayedItems.some(i => i.name === 'Matrix.mkv'));
console.log('✓ [PASS] applyFilters() virtual folder item matching verified.\n');

// ── TEST 5: Full Reboot Simulation & Persistence Verification ───────────────
console.log('[Test 5] Simulating full app reboot and re-initialization...');

// Reboot: Re-initialize global environment with stored settings from disk / storage
setupEnvironment();

// Emulate app startup lifecycle from js/app.js
if (window.vf && typeof window.vf.migrateLegacy === 'function') {
    window.vf.migrateLegacy();
}
if (window.vf && typeof window.vf.ensureDefaultFavorites === 'function') {
    window.vf.ensureDefaultFavorites();
}
if (window.vf && typeof window.vf.syncFavorites === 'function') {
    window.vf.syncFavorites();
}

// Check favorites after reboot
assert.ok(window.isFavorite('C:\\Vault\\SciFi\\Dune.mp4'), 'Favorites must persist through reboot');
assert.ok(window.isFavorite('c:/vault/music/song.mp3'), 'Favorites with forward slashes must persist through reboot');
assert.ok(window.isFavorite('c:/vault/a.mp4'), 'Multi-selected favorites must persist through reboot');

// Check virtual folders after reboot
const rebootedColls = window.vf.list({ type: 'collection' });
assert.ok(rebootedColls.some(c => c.id === 'vf_col1' && c.name === 'My Movies'), 'Virtual folders must persist through reboot');
const rebootedItems = window.vf.itemsOf('vf_col1');
assert.equal(rebootedItems.length, 2, 'Virtual folder contents must persist through reboot');
assert.ok(rebootedItems.includes('C:\\Vault\\SciFi\\Dune.mp4'));

// Check localStorage backup
const localBackup = JSON.parse(localStorage.getItem('vault-virtual-folders-backup'));
assert.ok(localBackup && Array.isArray(localBackup.folders), 'localStorage backup must be valid after reboot');
assert.ok(localBackup.folders.some(f => f.id === 'vf_col1'));

console.log('✓ [PASS] Full reboot persistence verification passed.\n');

console.log('======================================================================');
console.log(' ALL FAVORITES & VIRTUAL FOLDERS PERSISTENCE TESTS PASSED (5/5)       ');
console.log('======================================================================\n');
