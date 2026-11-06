const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('=== REAL CONDITIONS E2E: VIRTUAL FOLDERS HYDRATION & LAUNCH ===\n');

    const appDir = path.resolve(__dirname, '..');
    const testClipPath = path.join(appDir, 'tests', 'test_clip.mp4');
    const screenshotPath = 'C:\\Users\\Administrator\\.gemini\\antigravity-cli\\brain\\4408a3a6-4a7c-46e0-8f76-922e7100c2d0\\virtual_folders_e2e_proof.png';

    const electronApp = await electron.launch({
        cwd: appDir,
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' },
    });

    try {
        await electronApp.context().waitForEvent('page');
        await new Promise(r => setTimeout(r, 4000));

        const windows = electronApp.windows();
        let win = null;
        for (const w of windows) {
            const t = await w.title();
            if (t === 'Vault Explorer') { win = w; break; }
        }
        if (!win) win = windows[0];
        assert.ok(win, 'Electron main window launched');
        console.log('[PASS] Electron window launched successfully.');

        // 1. Programmatically create a virtual folder with a file outside the currently loaded folder
        console.log('[Step 1] Creating a virtual folder containing a file not in current directory...');
        const uniqueName = 'Proof Collection ' + Date.now();
        const createResult = await win.evaluate(async ({ name, clipPath }) => {
            const res = window.vf.create({ name, type: 'collection' });
            if (!res.ok) return { ok: false, error: res.error };
            const folderId = res.folder.id;
            const addRes = window.vf.addItems(folderId, [clipPath]);
            return { ok: true, folderId, added: addRes.added };
        }, { name: uniqueName, clipPath: testClipPath });

        assert.ok(createResult.ok, 'Collection creation should succeed: ' + createResult.error);
        assert.equal(createResult.added, 1, 'Should add 1 item to collection');
        console.log('[PASS] Created "Proof Collection" with item:', testClipPath);

        // 2. Navigate into the virtual folder
        console.log('[Step 2] Navigating into Proof Collection...');
        await win.evaluate(async (folderId) => {
            await window.navigateTo(folderId, window.currentRealPath);
        }, createResult.folderId);

        await new Promise(r => setTimeout(r, 1500));

        // 3. Verify that the file item was hydrated and rendered in DOM
        const displayedCount = await win.evaluate(() => window.displayedItems ? window.displayedItems.length : 0);
        console.log(`[Step 3] displayedItems count in collection: ${displayedCount}`);
        assert.equal(displayedCount, 1, 'Collection must display the hydrated item');

        const cardText = await win.evaluate(() => {
            const card = document.querySelector('.file-card');
            return card ? card.innerText : '';
        });
        console.log(`[Step 4] Rendered card text: ${cardText.trim()}`);
        assert.ok(cardText.includes('test_clip'), 'Card should display filename test_clip');

        // 4. Verify in-folder search scoping
        console.log('[Step 5] Verifying search scoping inside virtual folder...');
        const searchMatches = await win.evaluate(() => {
            const sb = document.getElementById('search-box');
            sb.value = 'test_clip';
            window.applyFilters();
            const countWithMatch = window.displayedItems.length;

            sb.value = 'NonExistentFile';
            window.applyFilters();
            const countWithoutMatch = window.displayedItems.length;

            sb.value = '';
            window.applyFilters();
            return { countWithMatch, countWithoutMatch };
        });
        assert.equal(searchMatches.countWithMatch, 1, 'Search matching filename should yield 1');
        assert.equal(searchMatches.countWithoutMatch, 0, 'Search not matching should yield 0');
        console.log('[PASS] Search scoping verified inside virtual folder.');

        // 5. Capture visual proof screenshot
        console.log('[Step 6] Capturing visual proof screenshot...');
        await win.screenshot({ path: screenshotPath });
        console.log(`[PASS] Screenshot captured to: ${screenshotPath}`);

        // Clean up test folder from settings
        await win.evaluate((folderId) => {
            if (typeof window.vf.remove === 'function') window.vf.remove(folderId);
            window.applyFilters();
        }, createResult.folderId);

        console.log('\n=== REAL CONDITIONS E2E PASSED 100% ===');
    } finally {
        await electronApp.close();
    }
}

run().catch(err => {
    console.error('E2E Test Failed:', err);
    process.exit(1);
});
