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

    const window = await electronApp.firstWindow();
    
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

    console.log('[Test Setup] Waiting for application load and mock assets...');
    await window.waitForTimeout(4000);

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

    // Check if at least one file card is rendered
    const cardCount = await window.locator('.file-card').count();
    console.log(`  -> Rendered file cards count: ${cardCount}`);
    
    if (cardCount === 0) {
        console.log('  -> Grid is empty on startup. Injecting mock item to perform context menu test...');
        await window.evaluate(() => {
            window.displayedItems = [{
                name: 'Test_Video_Sample.mp4',
                path: 'F:\\amd\\Models\\Test_Video_Sample.mp4',
                type: 'video',
                size: 1048576,
                mtime: Date.now()
            }];
            window.selectedIndices = new Set();
            
            // Trigger a re-render in frontend navigation controller
            const fileGrid = document.getElementById('file-grid');
            if (fileGrid) {
                fileGrid.innerHTML = '';
                const card = window.createCardElement(window.displayedItems[0], 0);
                fileGrid.appendChild(card);
                window.updateStatusBar();
            }
        });
        await window.waitForTimeout(500);
    }

    const firstCard = window.locator('.file-card').first();
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
