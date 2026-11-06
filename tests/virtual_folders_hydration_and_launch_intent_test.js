const assert = require('assert').strict;
const path = require('path');

console.log('======================================================================');
console.log(' VAULT EXPLORER: VIRTUAL FOLDERS HYDRATION & LAUNCH INTENT TEST SUITE ');
console.log('======================================================================\n');

// ── Mock DOM, localStorage, and electronAPI ─────────────────────────────────
const mockLocalStorage = new Map();
global.localStorage = {
    getItem: (k) => mockLocalStorage.get(k) || null,
    setItem: (k, v) => mockLocalStorage.set(k, String(v)),
    removeItem: (k) => mockLocalStorage.delete(k),
    clear: () => mockLocalStorage.clear()
};

let persistedSettings = {
    theme: 'golden-slate',
    lang: 'en',
    defaultFolder: 'F:\\amd\\Models\\DefaultVault',
    lastPath: { navPath: 'root/OldVault', realPath: 'F:\\amd\\Models\\OldVault', folderId: null },
    virtualFolders: {
        version: 2,
        folders: [
            { id: 'vf_col1', name: 'Best Of', type: 'collection', parentId: null, lastUsed: 1700000000000 }
        ],
        items: {
            'vf_col1': [
                'G:\\ExternalVault\\Clip1.mp4',
                'F:\\OtherDir\\Clip2.mkv'
            ]
        }
    }
};

const domElements = new Map();
global.document = {
    getElementById: (id) => {
        if (!domElements.has(id)) {
            domElements.set(id, {
                id,
                style: {},
                classList: {
                    contains: () => false,
                    add: () => {},
                    remove: () => {},
                    toggle: () => {}
                },
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
    createDocumentFragment: () => ({ appendChild: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    body: {
        appendChild: () => {},
        classList: {
            contains: () => false,
            add: () => {},
            remove: () => {},
            toggle: () => {}
        }
    }
};
global.el = (id) => global.document.getElementById(id);
global.requestAnimationFrame = (cb) => { if (typeof cb === 'function') cb(); };

let scannedSpecificPaths = [];
global.window = {
    el: global.el,
    appSettings: JSON.parse(JSON.stringify(persistedSettings)),
    currentLang: 'en',
    translations: { en: {}, fr: {} },
    currentTab: 'files',
    currentFilesSubtab: 'all',
    currentRealPath: 'F:\\amd\\Models\\DefaultVault',
    allItems: [
        { path: 'F:\\amd\\Models\\DefaultVault\\LocalFile.mp4', name: 'LocalFile.mp4', type: 'video', size: 100 }
    ],
    displayedItems: [],
    showToast: () => {},
    formatBytes: (b) => `${b} B`,
    electronAPI: {
        getSettings: async () => JSON.parse(JSON.stringify(persistedSettings)),
        saveSettings: async (s) => { persistedSettings = JSON.parse(JSON.stringify(s)); return true; },
        scanSpecificFiles: async (paths) => {
            scannedSpecificPaths.push(...paths);
            return (paths || []).map(p => ({
                path: p,
                name: p.split(/[\\/]/).pop(),
                type: 'video',
                size: 2048,
                duration: 60,
                thumbnail: 'thumb.jpg'
            }));
        },
        getCachedDirectory: async () => []
    },
    createCardElement: (item, idx) => ({
        dataset: { path: item.path, index: idx },
        querySelector: () => null
    })
};

// Load modules
require('../js/navigation/virtual-folders.js');
require('../js/navigation/filters.js');
require('../js/navigation/directory.js');
require('../js/navigation/tabs.js');

(async () => {
    // ── TEST 1: Virtual Folder Member Hydration across Different Directories ────
    console.log('[Test 1] Testing hydrateVirtualFolderItems and collection display...');
    assert.ok(typeof window.hydrateVirtualFolderItems === 'function', 'hydrateVirtualFolderItems must be exported');

    // Currently allItems contains only 'LocalFile.mp4' from DefaultVault.
    // vf_col1 contains 'G:\\ExternalVault\\Clip1.mp4' and 'F:\\OtherDir\\Clip2.mkv'.
    window.currentFolderId = 'vf_col1';
    window.currentNavPath = window.buildNavPath('vf_col1');
    window.currentFilesSubtab = 'collections';

    // Hydrate items of vf_col1
    const hydrated = await window.hydrateVirtualFolderItems('vf_col1');
    assert.equal(hydrated.length, 2, 'Should hydrate 2 items');
    assert.equal(scannedSpecificPaths.length, 2, 'Should have requested specific files via electronAPI');
    assert.ok(window._vfItemCache.has('g:/externalvault/clip1.mp4'), 'Item 1 should be cached');
    assert.ok(window._vfItemCache.has('f:/otherdir/clip2.mkv'), 'Item 2 should be cached');

    // Now apply filters: should show the 2 hydrated items, even though window.allItems only has LocalFile.mp4
    window.applyFilters();
    assert.equal(window.displayedItems.length, 2, 'displayedItems must have the 2 collection members');
    assert.equal(window.displayedItems[0].name, 'Clip1.mp4');
    assert.equal(window.displayedItems[1].name, 'Clip2.mkv');
    console.log('✓ [PASS] Virtual Folder items hydrated and displayed successfully.\n');

    // ── TEST 2: In-Folder Search Scoping ─────────────────────────────────────────
    console.log('[Test 2] Testing search scoping within virtual folder...');
    el('search-box').value = 'Clip1';
    window.applyFilters();
    assert.equal(window.displayedItems.length, 1, 'Search within collection should yield 1 matching item');
    assert.equal(window.displayedItems[0].name, 'Clip1.mp4');

    el('search-box').value = 'LocalFile'; // File exists in vault root, but NOT in this collection
    window.applyFilters();
    assert.equal(window.displayedItems.length, 0, 'Search within collection must not leak global vault files');

    el('search-box').value = '';
    window.applyFilters();
    assert.equal(window.displayedItems.length, 2, 'Clearing search restores collection items');
    console.log('✓ [PASS] In-Folder Search remains scoped to virtual folder.\n');

    // ── TEST 3: Breadcrumb Display for Virtual Folders ──────────────────────────
    console.log('[Test 3] Testing getDisplayPath for virtual folders...');
    const disp = window.getDisplayPath(window.currentNavPath);
    assert.equal(disp, 'Collections / Best Of', 'Should format as Collections / Best Of');
    console.log('✓ [PASS] Breadcrumb display formatted correctly.\n');

    // ── TEST 4: defaultFolder priority over lastPath on Startup ──────────────────
    console.log('[Test 4] Testing defaultFolder precedence on launch in tabs.js...');
    let loadedDir = null;
    window.loadDirectory = (nav, real, useCache, folderId) => {
        loadedDir = { nav, real, useCache, folderId };
    };
    window.vaultLoaded = false;
    window.switchTab('files');
    assert.ok(loadedDir, 'loadDirectory should have been called');
    assert.equal(loadedDir.real, 'F:\\amd\\Models\\DefaultVault', 'Should load defaultFolder, NOT lastPath OldVault');
    console.log('✓ [PASS] defaultFolder takes precedence over lastPath on startup.\n');

    // ── TEST 5: Zero Infinite Refresh on Repeated Openings (with missing files) ──
    console.log('[Test 5] Testing zero recursive refresh when opening collections multiple times...');
    let filterRunCount = 0;
    const originalApplyFilters = window.applyFilters;
    window.applyFilters = function() {
        filterRunCount++;
        return originalApplyFilters.apply(this, arguments);
    };

    // Open and close collection 5 times
    window.currentFolderId = null;
    for (let i = 0; i < 5; i++) {
        await window.navigateTo('vf_col1', window.currentRealPath);
        await window.navigateTo('root', window.currentRealPath);
    }
    // 5 opens + 5 closes = exactly 10 calls, zero recursive microtask loops!
    assert.equal(filterRunCount, 10, 'Each navigation must trigger exactly 1 filter call without recursive loops');
    console.log('✓ [PASS] Zero infinite refresh: exactly 1 applyFilters call per navigation verified.\n');

    console.log('======================================================================');
    console.log(' ALL VIRTUAL FOLDERS & LAUNCH INTENT TESTS PASSED!                     ');
    console.log('======================================================================');
})().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
