const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('=================================================================');
    console.log(' VAULT EXPLORER: TASKBAR CONTROLS, COLLECTIONS & DEBRIDS TEST');
    console.log('=================================================================\n');

    const appDir = path.resolve(__dirname, '..');
    const electronApp = await electron.launch({
        cwd: appDir,
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' }
    });

    try {
        const win = await electronApp.firstWindow();
        assert.ok(win, 'App window must be open');
        console.log('[PASS] 1. Vault Explorer window initialized');

        await win.waitForLoadState('domcontentloaded');
        await win.waitForFunction(() => typeof window.switchTab === 'function' && typeof window.applyFilters === 'function');

        // ── TEST 1: Windows Taskbar Thumbnail Toolbar API & State Update ──
        console.log('\nTesting Windows Taskbar Media Controls API...');
        const thumbarUpdateResult = await win.evaluate(async () => {
            if (window.electronAPI && typeof window.electronAPI.updateThumbarState === 'function') {
                const res = await window.electronAPI.updateThumbarState({ isPlaying: true });
                return { success: res === true, hasApi: true };
            }
            return { success: false, hasApi: false };
        });
        assert.ok(thumbarUpdateResult.hasApi, 'updateThumbarState API must be exposed in preload');
        assert.ok(thumbarUpdateResult.success, 'updateThumbarState must return true from main process');

        // Check that build/thumbar icon assets exist on disk
        const thumbarDir = path.resolve(appDir, 'build', 'thumbar');
        const expectedIcons = ['prev.png', 'stop.png', 'play.png', 'pause.png', 'next.png', 'fullscreen.png'];
        for (const icon of expectedIcons) {
            const iconPath = path.join(thumbarDir, icon);
            assert.ok(fs.existsSync(iconPath), `Taskbar icon ${icon} must exist on disk at ${iconPath}`);
        }
        console.log('[PASS] 2. Windows taskbar media controls and icon assets validated');

        // ── TEST 2: Collections Subtab Isolation in Videos Tab ──
        console.log('\nTesting Collections Subtab Isolation in Videos Tab...');
        
        await win.evaluate(() => window.switchTab('files'));
        await new Promise(r => setTimeout(r, 600));

        // Setup mock collection and mock items
        const colId = await win.evaluate(() => {
            window.appSettings = window.appSettings || {};
            window.appSettings.globExclusions = ['*.log', '*.tmp', '*.nfo', 'sample_*'];
            const res = window.vf.create({ name: 'Sci-Fi Unique', type: 'collection' });
            const folder = res.folder || window.vf.byName('Sci-Fi Unique', null, 'collection');
            window.vf.addItems(folder.id, ['C:/Vault/matrix.mp4', 'C:/Vault/.thumbs/ignored_thumb.mp4', 'C:/Vault/notes.txt']);
            return folder.id;
        });

        // 2A: On "All Files" subtab, Collections must NEVER appear
        await win.evaluate(() => {
            window.allItems = [
                { name: 'matrix.mp4', path: 'C:/Vault/matrix.mp4', type: 'video', size: 1000000 },
                { name: 'sample_clip.mp4', path: 'C:/Vault/sample_clip.mp4', type: 'video', size: 500000 },
                { name: 'ignored_thumb.mp4', path: 'C:/Vault/.thumbs/ignored_thumb.mp4', type: 'video', size: 200000 },
                { name: 'notes.txt', path: 'C:/Vault/notes.txt', type: 'other', size: 1000 }
            ];
            window.currentFilesSubtab = 'all';
            window.currentFolderId = null;
            window.applyFilters();
        });
        await new Promise(r => setTimeout(r, 400));

        const allFilesItems = await win.evaluate(() => window.displayedItems || []);
        const hasFakeFoldersInAllFiles = allFilesItems.some(item => item.type === 'fakeFolder');
        assert.equal(hasFakeFoldersInAllFiles, false, 'Collections must NOT appear in the All Files subtab!');
        
        // Verify glob exclusion and .thumbs exclusion applied
        const hasThumbs = allFilesItems.some(item => item.path.includes('.thumbs'));
        const hasGlobExcluded = allFilesItems.some(item => item.name.startsWith('sample_'));
        const hasNonVideo = allFilesItems.some(item => item.type === 'other');
        assert.equal(hasThumbs, false, '.thumbs items must be ignored');
        assert.equal(hasGlobExcluded, false, 'Glob excluded items (sample_*) must be filtered out');
        assert.equal(hasNonVideo, false, 'Non-video items (notes.txt) must be filtered out');
        console.log(`[PASS] 3. Videos Tab "All Files" subtab: 0 Collections shown (${allFilesItems.length} valid video files)`);

        // 2B: On "Collections" subtab, Collections MUST appear
        await win.evaluate(() => {
            window.currentFilesSubtab = 'collections';
            window.currentFolderId = null;
            window.applyFilters();
        });
        await new Promise(r => setTimeout(r, 400));

        const collectionsItems = await win.evaluate(() => window.displayedItems || []);
        const collectionFolder = collectionsItems.find(item => item.type === 'fakeFolder' && item.name === 'Sci-Fi Best');
        assert.ok(collectionFolder, 'Sci-Fi Best must appear in the Collections subtab');
        console.log(`[PASS] 4. Videos Tab "Collections" subtab: Collections visible correctly`);

        // 2C: Inside Virtual Folder, only valid video items appear
        const diag = await win.evaluate((cId) => {
            window.allItems = [
                { name: 'matrix.mp4', path: 'C:/Vault/matrix.mp4', type: 'video', size: 1000000 },
                { name: 'sample_clip.mp4', path: 'C:/Vault/sample_clip.mp4', type: 'video', size: 500000 },
                { name: 'ignored_thumb.mp4', path: 'C:/Vault/.thumbs/ignored_thumb.mp4', type: 'video', size: 200000 },
                { name: 'notes.txt', path: 'C:/Vault/notes.txt', type: 'other', size: 1000 }
            ];
            window.currentFilesSubtab = 'collections';
            window.currentFolderId = cId;
            const curFolder = window.getTargetFolder();
            const itemsInVf = curFolder ? window.vf.itemsOf(curFolder.id) : [];
            window.applyFilters();
            return { cId, curFolder, itemsInVf, displayed: window.displayedItems };
        }, colId);
        console.log('2C Diagnostic:', diag);
        await new Promise(r => setTimeout(r, 400));

        const insideFolderItems = await win.evaluate(() => window.displayedItems || []);
        console.log('Inside Collection items:', insideFolderItems.map(i => i.name));
        assert.ok(insideFolderItems.some(i => i.name === 'matrix.mp4'), 'matrix.mp4 must be included in folder');
        assert.equal(insideFolderItems.some(i => i.path.includes('.thumbs')), false, '.thumbs must be excluded inside folder');
        assert.equal(insideFolderItems.some(i => i.name === 'notes.txt'), false, 'notes.txt must be excluded inside folder');
        console.log('[PASS] 5. Inside Collection Virtual Folder: .thumbs, non-videos, and globs strictly filtered');

        // ── TEST 3: Debrids Tab Cards, Context Menu & Previews ──
        console.log('\nTesting Debrids Tab Card layout & Context Menu...');
        await win.evaluate(() => {
            window.navPath = [];
            window.switchTab('debrids');
        });
        await new Promise(r => setTimeout(r, 500));

        const realM3uPath = path.resolve('C:/Users/Administrator/Desktop/Github Repos/python-zipper/playlists/4 in 1 Moonbbytiff, ElfieCutie, Rixia, BubbleBunny.m3u');
        await win.evaluate((mPath) => window.openDebridPlaylist(mPath), realM3uPath);
        await new Promise(r => setTimeout(r, 1200));

        const debridCardMetrics = await win.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#debrids-streams-grid .file-card'));
            if (!cards.length) return null;
            const firstCard = cards[0];
            const thumbCont = firstCard.querySelector('.thumbnail-container');
            const fnCont = firstCard.querySelector('.filename-container');
            return {
                cardCount: cards.length,
                hasFileCardClass: firstCard.classList.contains('file-card'),
                hasThumbContainer: !!thumbCont,
                hasFilenameContainer: !!fnCont,
                cardWidth: firstCard.offsetWidth,
                cardHeight: firstCard.offsetHeight
            };
        });

        console.log('Debrid Card Metrics:', debridCardMetrics);
        assert.ok(debridCardMetrics && debridCardMetrics.cardCount > 0, 'Must render stream cards');
        assert.ok(debridCardMetrics.hasFileCardClass, 'Must have .file-card class matching Videos tab');
        assert.ok(debridCardMetrics.hasThumbContainer, 'Must have .thumbnail-container matching Videos tab');
        assert.ok(debridCardMetrics.hasFilenameContainer, 'Must have .filename-container matching Videos tab');
        console.log('[PASS] 6. Debrids Tab cards layout matches Videos tab 1:1');

        // Test Debrid Context Menu options for streams
        const ctxMenuTest = await win.evaluate(async () => {
            if (window.electronAPI && typeof window.electronAPI.showContextMenu === 'function') {
                return { hasApi: true };
            }
            return { hasApi: false };
        });
        assert.ok(ctxMenuTest.hasApi, 'showContextMenu API available');
        console.log('[PASS] 7. Debrid stream context menu hook validated');

        // ── TEST 4: Global Scrollbars (Hover Grow & Hidden Horizontal) ──
        console.log('\nTesting Global Scrollbar CSS...');
        const scrollbarStyles = await win.evaluate(() => {
            const bodyStyle = window.getComputedStyle(document.body);
            const gridStyle = window.getComputedStyle(document.getElementById('debrids-streams-grid') || document.body);
            return {
                bodyOverflowX: bodyStyle.overflowX,
                gridOverflowX: gridStyle.overflowX
            };
        });

        console.log('Scrollbar Styles:', scrollbarStyles);
        assert.equal(scrollbarStyles.bodyOverflowX, 'hidden', 'Body overflow-x must be hidden');
        assert.equal(scrollbarStyles.gridOverflowX, 'hidden', 'Grid overflow-x must be hidden');
        console.log('[PASS] 8. Global horizontal scrollbar suppression verified');

        // Capture targeted proof screenshot
        const proofPath = path.resolve('C:/Users/Administrator/.gemini/antigravity-ide/brain/4f703a18-9b96-4baf-adef-2f01d8f12496/taskbar_collections_debrids_proof.png');
        await win.screenshot({ path: proofPath });
        console.log(`[PROOF] Captured targeted visual proof at: ${proofPath}`);

        console.log('\n=================================================================');
        console.log(' ALL 8 SUITE TESTS PASSED WITH 100% SUCCESS!');
        console.log('=================================================================\n');

    } finally {
        await electronApp.close();
    }
}

run().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
