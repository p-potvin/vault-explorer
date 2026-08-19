const { _electron: electron } = require('playwright');
const assert = require('assert').strict;

const GLOBALS = [
    'loadDirectory', 'navigateTo', 'applyFilters', 'updateStatusBar',
    'createCardElement', 'renderMore', 'initNavigationListeners',
    'triggerCryptoPrompt', 'showLanguageModal',
    'playItem', 'initPlayer', 'stopUpscaleMode', 'initUpscaleListeners',
    'loadActiveSubtitles', 'setLanguage', 'updateSortOrderButtonUI', 'switchTab', 'toggleFavorite',
    'initSettingsListeners', 'renderFavorites', 'showToast', 'formatBytes', 'formatDuration',
    'escapeHtml', 'sanitizePath', 'killAllHoverVideos', 'attachHoverWebmToCard',
    'electronAPI', 'appSettings', 'allItems', 'displayedItems',
    'selectedIndices', 'currentPlayingIndex', 'translations',
];

const DOM_IDS = [
    'file-grid', 'video-modal', 'video-player', 'search-box',
    'filter-type', 'sort-by', 'path-display', 'btn-refresh',
    'btn-back', 'settings-panel', 'tab-files', 'tab-music',
    'tab-photoalbums', 'subtab-files-all', 'settings-single-instance',
];

async function run() {
    console.log('=== VAULT EXPLORER REFACTOR SMOKE TEST ===\n');

    const electronApp = await electron.launch({
        cwd: 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer',
        args: ['.'],
    });

    await electronApp.context().waitForEvent('page');
    await new Promise(r => setTimeout(r, 4000));

    const windows = electronApp.windows();
    let win = null;
    for (const w of windows) {
        const t = await w.title();
        if (t === 'Vault Explorer') { win = w; break; }
    }
    if (!win) win = windows[0];
    assert.ok(win, 'App window found');
    console.log('[PASS] App window launched');

    let passed = 0;
    let failed = 0;

    for (const name of GLOBALS) {
        const exists = await win.locator('body').evaluate((el, n) => typeof window[n] !== 'undefined', name);
        if (exists) {
            passed++;
        } else {
            failed++;
            console.log(`[FAIL] window.${name} is missing`);
        }
    }
    console.log(`[Globals] ${passed}/${GLOBALS.length} present`);

    let domPassed = 0;
    for (const id of DOM_IDS) {
        const exists = await win.locator('body').evaluate((el, i) => !!document.getElementById(i), id);
        if (exists) {
            domPassed++;
        } else {
            console.log(`[FAIL] DOM #${id} missing`);
        }
    }
    console.log(`[DOM]     ${domPassed}/${DOM_IDS.length} present`);

    const errors = await win.evaluate(() => window.__consoleErrors || []);
    const jsErrors = await win.evaluate(() => {
        return new Promise(resolve => {
            const errs = [];
            window.onerror = (msg) => errs.push(msg);
            setTimeout(() => resolve(errs), 500);
        });
    });

    const totalFailed = failed + (DOM_IDS.length - domPassed);
    console.log(`\n=== RESULT: ${totalFailed === 0 ? 'ALL PASSED' : totalFailed + ' FAILURES'} ===`);

    await electronApp.close();
    process.exit(totalFailed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Smoke test crashed:', err);
    process.exit(1);
});
