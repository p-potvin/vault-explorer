const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');

async function testVaultExplorer() {
    console.log('--- Testing Vault Explorer AI Separation Setting ---');
    const appPath = path.resolve(__dirname, '..');
    const electronApp = await electron.launch({
        cwd: appPath,
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' },
    });

    try {
        await electronApp.context().waitForEvent('page');
        await new Promise(r => setTimeout(r, 3000));
        const windows = electronApp.windows();
        let win = windows.find(w => !w.isClosed());
        assert.ok(win, 'Vault Explorer window found');

        // Open settings modal
        await win.locator('#settings-trigger').click();
        await win.locator('#settings-panel').waitFor({ state: 'visible' });

        // Switch to AI tab
        await win.locator('.settings-section-tab[data-settings-section="ai"]').click();
        const sepCheckbox = win.locator('#settings-ai-separate');
        await sepCheckbox.waitFor({ state: 'visible' });
        console.log('[PASS] #settings-ai-separate is present and visible in AI tab');

        // Toggle it off
        await sepCheckbox.setChecked(false);
        assert.equal(await sepCheckbox.isChecked(), false, 'Checkbox should be unchecked');

        // Save
        await win.locator('#settings-btn-save').click();
        await win.locator('#settings-panel').waitFor({ state: 'hidden' });
        console.log('[PASS] Settings saved with separation = false');

        // Verify stored settings via electronAPI
        const stored = await win.evaluate(() => window.electronAPI.getSettings());
        assert.equal(stored.aiSeparate, false, 'Stored aiSeparate should be false');
        console.log('[PASS] Stored settings persisted aiSeparate = false');

        // Reopen settings modal and verify hydration
        await win.locator('#settings-trigger').click();
        await win.locator('#settings-panel').waitFor({ state: 'visible' });
        await win.locator('.settings-section-tab[data-settings-section="ai"]').click();
        assert.equal(await sepCheckbox.isChecked(), false, 'Checkbox should still be unchecked upon reopen');

        // Toggle it back on and save
        await sepCheckbox.setChecked(true);
        await win.locator('#settings-btn-save').click();
        await win.locator('#settings-panel').waitFor({ state: 'hidden' });
        const storedReenabled = await win.evaluate(() => window.electronAPI.getSettings());
        assert.equal(storedReenabled.aiSeparate, true, 'Stored aiSeparate should be true after re-enabling');
        console.log('[PASS] Re-enabled separation and verified persistence');

        // Screenshot visual proof
        await win.locator('#settings-trigger').click();
        await win.locator('#settings-panel').waitFor({ state: 'visible' });
        await win.locator('.settings-section-tab[data-settings-section="ai"]').click();
        const screenshotPath = 'C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain\\ee944685-963e-46b2-b55b-01b221549c47\\vault_explorer_ai_separate_setting.png';
        await win.locator('#settings-panel').screenshot({ path: screenshotPath });
        console.log(`[PASS] Captured visual proof at ${screenshotPath}`);

    } finally {
        await electronApp.close();
    }
}

async function main() {
    await testVaultExplorer();
    console.log('\n[ALL VAULT EXPLORER SETTINGS TESTS PASSED]');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
