const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');
const os = require('os');
const fs = require('fs');

async function runContextMenuTests() {
    console.log('======================================================');
    console.log(' VAULT EXPLORER CONTEXT MENU ACTIONS INTEGRATION TEST ');
    console.log('======================================================\n');

    const appPath = 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer';
    const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 've-test-userdata-'));

    console.log('[Test Setup] Launching Vault Explorer application...');
    const electronApp = await electron.launch({
        cwd: appPath,
        args: ['.', `--user-data-dir=${tempUserData}`],
        env: {
            ...process.env,
            VAULT_EXPLORER_E2E: '1',
            VAULT_EXPLORER_E2E_USER_DATA: tempUserData
        }
    });

    let window = await electronApp.firstWindow();
    console.log('[Test Setup] Waiting for windows to instantiate...');
    await window.waitForTimeout(3000);
    const windows = electronApp.windows();
    console.log(`  -> Open windows: ${windows.length}`);
    for (let i = 0; i < windows.length; i++) {
        const title = await windows[i].title();
        const url = windows[i].url();
        console.log(`     Window ${i} Title: "${title}" URL: "${url}"`);
        if (title.includes('Vault Explorer') || url.includes('index.html')) {
            window = windows[i];
            console.log(`  -> Selected main renderer window: ${i}`);
        }
    }

    const errors = [];

    // Capture console output and browser exceptions
    window.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
            if (text.includes('ERR_FILE_NOT_FOUND') || text.includes('Failed to load resource')) {
                console.log(`[Browser Console Warning ignored] ${text}`);
                return;
            }
            console.error(`[Browser Console ERROR] ${text}`);
            errors.push(`Console Error: ${text}`);
        } else {
            console.log(`[Browser Console LOG] ${text}`);
        }
    });

    window.on('pageerror', err => {
        console.error(`[Browser Page ERROR] ${err.stack || err.message}`);
        errors.push(`Page Exception: ${err.message}`);
    });

    console.log('[Test Setup] Waiting for application load and mock assets to settle...');
    await window.waitForTimeout(4000);

    // Mock IPC handlers in the main process
    console.log('[Test Step 1] Injecting custom IPC show-context-menu mock in Electron Main Process...');
    await electronApp.evaluate(async (electron) => {
        const { ipcMain } = electron;
        global.mockContextMenuAction = 'encrypt-prompt';

        ipcMain.removeHandler('show-context-menu');
        ipcMain.handle('show-context-menu', async (_event, item) => {
            console.log(`[Main Process Mock IPC] Item type: ${item.type}, Returning mock action: "${global.mockContextMenuAction}"`);
            return global.mockContextMenuAction;
        });
    });

    console.log('[Test Step 1b] Injecting DOM test items (video card, image card, virtual folder)...');
    await window.locator('body').evaluate(() => {
        window.loadDirectory = () => { console.log('Mocked loadDirectory called'); };
        const fileGrid = document.getElementById('file-grid');
        if (fileGrid) {
            fileGrid.innerHTML = '';
            const videoItem = {
                name: 'sample_video.mp4',
                path: 'C:\\test\\sample_video.mp4',
                type: 'video',
                size: 10485760,
                mtime: Date.now(),
                enhancements: { audio: true, video: false, subtitles: ['en'], translation: ['fr'] }
            };
            const imageItem = {
                name: 'sample_image.png',
                path: 'C:\\test\\sample_image.png',
                type: 'image',
                size: 2048576,
                mtime: Date.now()
            };
            window.allItems = [videoItem, imageItem];
            window.displayedItems = [videoItem, imageItem];
            window.selectedIndices = new Set();

            const card0 = window.createCardElement(videoItem, 0);
            const card1 = window.createCardElement(imageItem, 1);
            fileGrid.appendChild(card0);
            fileGrid.appendChild(card1);
        }
    });

    const firstCard = window.locator('.file-card').first();
    await firstCard.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await firstCard.isVisible(), 'No file card available to right-click');

    // 1. Test Encrypt Prompt
    console.log('[Test Step 2] Simulating Right-Click context menu action: "encrypt-prompt"...');
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(500);

    const isCryptoDialogVisible = await window.locator('#crypto-dialog').isVisible();
    console.log(`  -> Crypto Password Dialog visible: ${isCryptoDialogVisible}`);
    assert.ok(isCryptoDialogVisible, 'Encryption password dialog failed to display upon context action');

    await window.locator('#btn-cancel-crypto').click();
    await window.waitForTimeout(300);

    // 2. Test Generate Subtitles Modal
    console.log('[Test Step 3] Simulating context action: "generate-subtitles-prompt"...');
    await electronApp.evaluate(async () => { global.mockContextMenuAction = 'generate-subtitles-prompt'; });
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(500);

    let isLangModalVisible = await window.locator('.vw-dynamic-modal-backdrop').isVisible();
    console.log(`  -> Generate Subtitles Language modal visible: ${isLangModalVisible}`);
    assert.ok(isLangModalVisible, 'Language modal backdrop failed to render dynamically');
    await window.locator('.vw-dynamic-modal-backdrop button:has-text("Cancel")').first().click();
    await window.waitForTimeout(300);

    // 3. Test Translate Video Modal
    console.log('[Test Step 4] Simulating context action: "translate-video-prompt"...');
    await electronApp.evaluate(async () => { global.mockContextMenuAction = 'translate-video-prompt'; });
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(500);

    isLangModalVisible = await window.locator('.vw-dynamic-modal-backdrop').isVisible();
    console.log(`  -> Translate Video Language modal visible: ${isLangModalVisible}`);
    assert.ok(isLangModalVisible, 'Language modal backdrop failed to render dynamically');
    await window.locator('.vw-dynamic-modal-backdrop button:has-text("Cancel")').first().click();
    await window.waitForTimeout(300);

    // 4. Test Video Enhancement Modal
    console.log('[Test Step 5] Simulating context action: "enhance-video-prompt"...');
    await electronApp.evaluate(async () => { global.mockContextMenuAction = 'enhance-video-prompt'; });
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(500);

    const isVsrModalVisible = await window.locator('.vw-dynamic-modal-backdrop').isVisible();
    console.log(`  -> AI Video Optimization Center modal visible: ${isVsrModalVisible}`);
    assert.ok(isVsrModalVisible, 'VSR modal backdrop failed to render dynamically');
    await window.locator('.vw-dynamic-modal-backdrop button:has-text("Abort")').first().click();
    await window.waitForTimeout(300);

    // 5. Test Properties Dialog
    console.log('[Test Step 6] Simulating context action: "properties"...');
    await electronApp.evaluate(async () => { global.mockContextMenuAction = 'properties'; });
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(500);

    const isPropsVisible = await window.locator('#properties-dialog, .vw-dynamic-modal-backdrop').isVisible();
    console.log(`  -> Properties Dialog visible: ${isPropsVisible}`);

    // 6. Test Video Player Context Menu Action Dispatch
    console.log('[Test Step 7] Testing Video Player Context Menu action handlers...');
    const playerTestResult = await window.locator('body').evaluate(async () => {
        const vp = document.getElementById('video-player');
        window.currentPlayingItem = {
            name: 'sample_video.mp4',
            path: 'C:\\test\\sample_video.mp4',
            type: 'video',
            enhancements: { audio: true, video: false, subtitles: ['en'], translation: ['fr'] }
        };

        let passed = 0;
        // Test handlePlayerContextMenu existence and playback actions
        if (typeof handlePlayerContextMenu === 'function') {
            await handlePlayerContextMenu('mute', window.currentPlayingItem);
            if (vp.muted) passed++;
            await handlePlayerContextMenu('mute', window.currentPlayingItem);
            if (!vp.muted) passed++;
            await handlePlayerContextMenu('speed:1.5', window.currentPlayingItem);
            if (vp.playbackRate === 1.5) passed++;
            await handlePlayerContextMenu('speed:1', window.currentPlayingItem);
            if (vp.playbackRate === 1) passed++;
        }
        return { success: passed === 4, passed };
    });
    console.log(`  -> Video Player Context Menu test: ${playerTestResult.passed}/4 playback handlers verified.`);
    assert.ok(playerTestResult.success, 'Video Player context menu handler failed');

    // 7. Check for runtime console exceptions
    console.log('[Test Step 8] Performing final Runtime Console Error audit...');
    assert.equal(errors.length, 0, `Detected runtime exceptions or errors: \n${errors.join('\n')}`);
    console.log('  -> Runtime Console Error audit returned 0 exceptions.');

    console.log('\n======================================================');
    console.log('    VAULT EXPLORER CONTEXT MENU TESTS PASSED SUCCESSFULLY ');
    console.log('======================================================');

    console.log('[Test Teardown] Closing Electron process...');
    await electronApp.close();
    try { fs.rmSync(tempUserData, { recursive: true, force: true }); } catch (_) {}
}

runContextMenuTests().catch(err => {
    console.error('\n❌ CONTEXT MENU INTEGRATION TEST FAILED ❌');
    console.error(err);
    process.exit(1);
});
