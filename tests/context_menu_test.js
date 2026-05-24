const { _electron: electron } = require('C:/Users/Administrator/Desktop/Github Repos/vault-explorer/node_modules/playwright');
const assert = require('assert').strict;

async function runContextMenuTests() {
    console.log('======================================================');
    console.log(' VAULT EXPLORER CONTEXT MENU ACTIONS INTEGRATION TEST ');
    console.log('======================================================\n');

    const appPath = 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer';
    
    console.log('[Test Setup] Launching Vault Explorer application...');
    const electronApp = await electron.launch({
        cwd: appPath,
        args: ['.']
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
    await window.waitForTimeout(8000);

    // Mock IPC handlers in the main process using electronApp.evaluate
    console.log('[Test Step 1] Injecting custom IPC show-context-menu mock in Electron Main Process...');
    await electronApp.evaluate(async (electron) => {
        const { ipcMain } = electron;
        global.mockContextMenuAction = 'encrypt-prompt';
        
        ipcMain.removeHandler('show-context-menu');
        ipcMain.handle('show-context-menu', async () => {
            console.log(`[Main Process Mock IPC] Returning mock action: "${global.mockContextMenuAction}"`);
            return global.mockContextMenuAction;
        });
    });

    console.log('[Test Step 1b] Directly injecting standard DOM file-card mock item...');
    await window.evaluate(() => {
        window.loadDirectory = () => { console.log('Mocked loadDirectory prevented wipe'); };
        const fileGrid = document.getElementById('file-grid');
        if (fileGrid) {
            fileGrid.innerHTML = '';
            const item = {
                name: 'NVIDIA_USD_Cosmos_Pipeline.mp4',
                path: 'C:\\Users\\Administrator\\Desktop\\Agent Vaultwares files\\NVIDIA_USD_Cosmos_Pipeline.mp4',
                type: 'video',
                size: 6465116,
                mtime: Date.now()
            };
            window.displayedItems = [item];
            window.selectedIndices = new Set();
            const card = window.createCardElement(item, 0);
            fileGrid.appendChild(card);
        }
    });

    const firstCard = window.locator('.file-card').first();
    try {
        await firstCard.waitFor({ state: 'visible', timeout: 5000 });
    } catch (e) {
        const docHtml = await window.evaluate(() => document.documentElement.innerHTML);
        console.log('DOM DOCUMENT HTML DURING FAILURE:', docHtml);
        throw e;
    }
    assert.ok(await firstCard.isVisible(), 'No file card available to right-click');

    // Right click first card with action 'encrypt-prompt'
    console.log('[Test Step 2] Simulating Right-Click context menu action: "encrypt-prompt"...');
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(1000);

    // Assert that the crypto password dialog is displayed
    const isCryptoDialogVisible = await window.locator('#crypto-dialog').isVisible();
    console.log(`  -> Crypto Password Dialog visible: ${isCryptoDialogVisible}`);
    assert.ok(isCryptoDialogVisible, 'Encryption password dialog failed to display upon context action');

    // Type a password
    console.log('  -> Typing mock password...');
    await window.locator('#crypto-password').fill('VaultSecurePassword123');
    await window.waitForTimeout(300);

    // Dismiss dialog using cancel button
    console.log('  -> Dismissing password dialog using cancel button...');
    await window.locator('#btn-cancel-crypto').click();
    await window.waitForTimeout(500);

    const isCryptoDialogHiddenAfterCancel = !(await window.locator('#crypto-dialog').isVisible());
    assert.ok(isCryptoDialogHiddenAfterCancel, 'Crypto dialog failed to dismiss after Cancel click');
    console.log('  -> "encrypt-prompt" cancellation verified successfully.');

    // Switch action to 'upscale-video'
    console.log('[Test Step 3] Simulating Right-Click context menu action: "upscale-video"...');
    await electronApp.evaluate(async (electron) => {
        global.mockContextMenuAction = 'upscale-video';
    });

    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(1000);

    // Ensure no crash or exception occurred and upscale-video trigger complete toasts or alerts
    console.log('  -> Upscale trigger finished without error.');

    // Test Step 3a: Test Generate Subtitles Modal
    console.log('[Test Step 3a] Simulating context action: "generate-subtitles-prompt"...');
    await electronApp.evaluate(async (electron) => {
        global.mockContextMenuAction = 'generate-subtitles-prompt';
    });
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(1500);

    // Check if the dynamic modal backdrop is in the DOM
    let isLangModalVisible = await window.evaluate(() => {
        const backdrops = Array.from(document.querySelectorAll('div')).filter(d => 
            d.style.position === 'fixed' && d.style.zIndex === '5000'
        );
        return backdrops.length > 0;
    });
    console.log(`  -> Generate Subtitles Language modal visible: ${isLangModalVisible}`);
    assert.ok(isLangModalVisible, 'Language modal backdrop failed to render dynamically');

    // Simulate clicking Cancel
    console.log('  -> Clicking Cancel on Language Modal...');
    await window.locator('.vw-dynamic-modal-backdrop button:has-text("Cancel")').first().click();
    await window.waitForTimeout(1000);

    // Test Step 3b: Test Translate Video Modal
    console.log('[Test Step 3b] Simulating context action: "translate-video-prompt"...');
    await electronApp.evaluate(async (electron) => {
        global.mockContextMenuAction = 'translate-video-prompt';
    });
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(1500);

    isLangModalVisible = await window.evaluate(() => {
        const backdrops = Array.from(document.querySelectorAll('.vw-dynamic-modal-backdrop')).filter(d => 
            d.innerHTML.includes('Translate target spoken') || d.innerHTML.includes('Translate Video')
        );
        return backdrops.length > 0;
    });
    console.log(`  -> Translate Video Language modal visible: ${isLangModalVisible}`);
    assert.ok(isLangModalVisible, 'Language modal backdrop failed to render dynamically');

    // Simulate clicking Cancel
    console.log('  -> Clicking Cancel on Translation Modal...');
    await window.locator('.vw-dynamic-modal-backdrop button:has-text("Cancel")').first().click();
    await window.waitForTimeout(1000);

    // Test Step 3c: Test Video Enhancement VSR Modal
    console.log('[Test Step 3c] Simulating context action: "enhance-video-prompt"...');
    await electronApp.evaluate(async (electron) => {
        global.mockContextMenuAction = 'enhance-video-prompt';
    });
    await firstCard.click({ button: 'right' });
    await window.waitForTimeout(1500);

    const isVsrModalVisible = await window.evaluate(() => {
        const backdrops = Array.from(document.querySelectorAll('.vw-dynamic-modal-backdrop')).filter(d => 
            d.innerHTML.includes('AI Video Optimization Center')
        );
        return backdrops.length > 0;
    });
    console.log(`  -> AI Video Optimization Center (VSR) modal visible: ${isVsrModalVisible}`);
    assert.ok(isVsrModalVisible, 'VSR modal backdrop failed to render dynamically');

    // Simulate clicking Abort
    console.log('  -> Clicking Abort on VSR Modal...');
    await window.locator('.vw-dynamic-modal-backdrop button:has-text("Abort")').first().click();
    await window.waitForTimeout(1000);

    // Check application state for errors
    console.log('[Test Step 4] Performing final Runtime Console Error audit...');
    assert.equal(errors.length, 0, `Detected runtime exceptions or errors: \n${errors.join('\n')}`);
    console.log('  -> Runtime Console Error audit returned 0 exceptions.');

    console.log('\n======================================================');
    console.log('    VAULT EXPLORER CONTEXT MENU TESTS PASSED SUCCESSFULLY ');
    console.log('======================================================');

    console.log('[Test Teardown] Closing Electron process...');
    await electronApp.close();
}

runContextMenuTests().catch(err => {
    console.error('\n❌ CONTEXT MENU INTEGRATION TEST FAILED ❌');
    console.error(err);
    process.exit(1);
});
