const assert = require('assert').strict;

console.log('======================================================================');
console.log(' VAULT EXPLORER: TAB CATEGORY ISOLATION & SELF-CONTAINMENT TEST SUITE ');
console.log('======================================================================\n');

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
    currentTab: 'files',
    currentFilesSubtab: 'all',
    currentFolderId: null,
    allItems: [
        { name: 'Video 1.mp4', path: 'C:\\Vault\\Video 1.mp4', type: 'video' },
        { name: 'Photo 1.jpg', path: 'C:\\Vault\\Photo 1.jpg', type: 'image' },
        { name: 'Audio 1.mp3', path: 'C:\\Vault\\Audio 1.mp3', type: 'audio' }
    ],
    displayedItems: [],
    selectedIndices: new Set(),
    electronAPI: {
        saveSettings: async (s) => { mockSettings = s; return true; },
        getSettings: async () => mockSettings,
    },
    translations: {
        en: { noItemsFound: 'No Items', adjustFilters: 'Adjust' }
    },
    currentLang: 'en',
    updateStatusBar: () => {},
    escapeHtml: (s) => s,
    formatDuration: (s) => s + 's',
    sanitizePath: (p) => p,
    createCardElement: (item, idx) => ({ item, idx }),
};

global.requestAnimationFrame = (cb) => setImmediate(cb);
global.CSS = { escape: (s) => s };

global.document = {
    getElementById: (id) => {
        if (id === 'search-box') return { value: '' };
        if (id === 'filter-type') return { value: 'all' };
        if (id === 'sort-by') return { value: 'name' };
        if (id === 'btn-sort-order') return { dataset: { order: 'asc' } };
        if (id === 'file-grid') return { innerHTML: '', appendChild: () => {} };
        return null;
    },
    createDocumentFragment: () => ({ appendChild: () => {} })
};
global.el = global.document.getElementById;

// Load virtual-folders module & filters module
require('../js/navigation/virtual-folders.js');
require('../js/navigation/filters.js');

const vf = window.vf;

// ── TEST 1: Create Collections, Playlists, and Albums ───────────────────────
console.log('[Test 1] Creating distinct Collections, Playlists, and Albums...');
const col1 = vf.create({ name: 'Sci-Fi Movies', type: 'collection' });
const col2 = vf.create({ name: 'Documentaries', type: 'collection' });
const pl1  = vf.create({ name: 'Synthwave Beats', type: 'playlist' });
const pl2  = vf.create({ name: 'Rock Classics', type: 'playlist' });
const alb1 = vf.create({ name: 'Summer Vacation 2026', type: 'album' });
const alb2 = vf.create({ name: 'Architecture Shots', type: 'album' });

assert.ok(col1.ok && col2.ok, 'Collections created');
assert.ok(pl1.ok && pl2.ok, 'Playlists created');
assert.ok(alb1.ok && alb2.ok, 'Albums created');
console.log('✓ [PASS] Collections, Playlists, and Albums minted successfully.\n');

// ── TEST 2: Verify Files Tab ("All Files" vs "Collections" Subtab) Isolation ──
console.log('[Test 2] Verifying Files Tab subtab isolation (All Files has 0 collections; Collections subtab contains Collections ONLY)...');
window.currentTab = 'files';
window.currentFilesSubtab = 'all';
window.currentFolderId = null;

window.applyFilters();

const renderedInAll = window.displayedItems.filter(i => i.type === 'fakeFolder');
assert.equal(renderedInAll.length, 0, 'Collections must NOT appear in All Files subtab');

// Switch to Collections subtab
window.currentFilesSubtab = 'collections';
window.applyFilters();

const renderedFolders = window.displayedItems.filter(i => i.type === 'fakeFolder');
console.log('Rendered folders in Files -> Collections:', renderedFolders.map(f => `${f.name} (${f.folderType})`));

assert.ok(renderedFolders.some(f => f.name === 'Sci-Fi Movies'), 'Sci-Fi Movies must be present in Collections');
assert.ok(renderedFolders.some(f => f.name === 'Documentaries'), 'Documentaries must be present in Collections');

// Playlists and Albums MUST NOT appear in Files tab!
assert.ok(!renderedFolders.some(f => f.name === 'Synthwave Beats'), 'Playlists must NOT appear in Files tab');
assert.ok(!renderedFolders.some(f => f.name === 'Rock Classics'), 'Playlists must NOT appear in Files tab');
assert.ok(!renderedFolders.some(f => f.name === 'Summer Vacation 2026'), 'Albums must NOT appear in Files tab');
assert.ok(!renderedFolders.some(f => f.name === 'Architecture Shots'), 'Albums must NOT appear in Files tab');

// All rendered folders must have folderType === 'collection'
renderedFolders.forEach(f => {
    assert.equal(f.folderType, 'collection', `Expected folderType 'collection', got '${f.folderType}' for folder ${f.name}`);
});
console.log('✓ [PASS] Files Tab Collections subtab correctly isolates Collections and excludes Playlists and Albums.\n');

// ── TEST 3: Verify Search Isolation in Files Tab ───────────────────────────
console.log('[Test 3] Verifying global search in Files tab excludes Playlists and Albums...');
document.getElementById = (id) => {
    if (id === 'search-box') return { value: 's' }; // Matches 'Sci-Fi', 'Synthwave', 'Summer'
    if (id === 'filter-type') return { value: 'all' };
    if (id === 'sort-by') return { value: 'name' };
    if (id === 'btn-sort-order') return { dataset: { order: 'asc' } };
    if (id === 'file-grid') return { innerHTML: '', appendChild: () => {} };
    return null;
};
global.el = document.getElementById;

window.applyFilters();

const searchFolders = window.displayedItems.filter(i => i.type === 'fakeFolder');
console.log('Search matching folders:', searchFolders.map(f => `${f.name} (${f.folderType})`));

assert.ok(searchFolders.some(f => f.name === 'Sci-Fi Movies'), 'Sci-Fi Movies should match search');
assert.ok(!searchFolders.some(f => f.name === 'Synthwave Beats'), 'Playlist should NOT appear in search');
assert.ok(!searchFolders.some(f => f.name === 'Summer Vacation 2026'), 'Album should NOT appear in search');
console.log('✓ [PASS] Global search in Files Tab strictly isolates Collections.\n');

// ── TEST 4: Verify Music Tab queries Playlists Only ────────────────────────
console.log('[Test 4] Verifying Music Tab queries Playlists only...');
const musicPlaylists = vf.list({ type: 'playlist', parentId: null });
console.log('Music tab playlists:', musicPlaylists.map(p => p.name));
assert.equal(musicPlaylists.length, 2);
assert.ok(musicPlaylists.some(p => p.name === 'Synthwave Beats'));
assert.ok(musicPlaylists.some(p => p.name === 'Rock Classics'));
assert.ok(!musicPlaylists.some(p => p.name === 'Sci-Fi Movies'));
assert.ok(!musicPlaylists.some(p => p.name === 'Summer Vacation 2026'));
console.log('✓ [PASS] Music tab isolated to Playlists only.\n');

// ── TEST 5: Verify Photos Tab queries Albums Only ──────────────────────────
console.log('[Test 5] Verifying Photos Tab queries Albums only...');
const photoAlbums = vf.list({ type: 'album', parentId: null });
console.log('Photos tab albums:', photoAlbums.map(a => a.name));
assert.equal(photoAlbums.length, 2);
assert.ok(photoAlbums.some(a => a.name === 'Summer Vacation 2026'));
assert.ok(photoAlbums.some(a => a.name === 'Architecture Shots'));
assert.ok(!photoAlbums.some(a => a.name === 'Sci-Fi Movies'));
assert.ok(!photoAlbums.some(a => a.name === 'Synthwave Beats'));
console.log('✓ [PASS] Photos tab isolated to Albums only.\n');

console.log('======================================================================');
console.log(' ALL CATEGORY ISOLATION TESTS PASSED SUCCESSFULLY! (5/5)             ');
console.log('======================================================================');
