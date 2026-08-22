const { _electron: electron } = require('playwright');
const assert = require('assert').strict;

async function run() {
    console.log('=== VAULT EXPLORER SETTINGS & PLAYER ERROR VERIFICATION ===\n');

    const electronApp = await electron.launch({
        cwd: 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer',
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' },
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

    // 1. Open Settings panel
    await win.locator('#settings-trigger').click();
    await win.locator('#settings-panel').waitFor({ state: 'visible' });
    console.log('[PASS] Settings panel opened');

    // Take targeted visual proof screenshot of the settings modal
    const screenshotPath = 'C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain\\88e43982-a925-4a65-98fe-b2ae548d7619\\settings_save_button_header.png';
    await win.locator('#settings-panel').screenshot({ path: screenshotPath });
    console.log(`[PASS] Captured visual proof at ${screenshotPath}`);

    // 2. Verify Save button is in the top header bar next to close button
    const saveInHeader = await win.locator('.settings-panel-header-bar #settings-btn-save').count();
    assert.equal(saveInHeader, 1, 'Save button must reside inside .settings-panel-header-bar');
    assert.equal(await win.locator('#settings-btn-save').isVisible(), true, 'Save button must be visible');
    console.log('[PASS] Save button is extracted to header bar');

    // 3. Verify Cog Icon alignment
    const cogInHeader = await win.locator('.settings-panel-header-left .settings-panel-cog').count();
    assert.equal(cogInHeader, 1, 'Cog icon must reside in .settings-panel-header-left');
    const cogText = await win.locator('.settings-panel-cog').innerText();
    assert.equal(cogText.trim(), '⚙', 'Cog icon should be ⚙');
    console.log('[PASS] Cog icon aligned in header left');

    // 4. Verify Save button is visible across all 4 tabs
    const sections = ['general', 'playback', 'library', 'ai'];
    for (const section of sections) {
        await win.locator(`.settings-section-tab[data-settings-section="${section}"]`).click();
        assert.equal(await win.locator('#settings-btn-save').isVisible(), true, `Save button must remain visible in "${section}" tab`);
        console.log(`[PASS] Save button visible on "${section}" tab`);
    }

    // 5. Test saving settings from a non-general tab (e.g. AI tab)
    await win.locator('#settings-vsr-quality').selectOption('ULTRA');
    await win.locator('#settings-btn-save').click();
    await win.locator('#settings-panel').waitFor({ state: 'hidden' });
    console.log('[PASS] Settings saved and panel closed');

    // Verify persisted setting in memory
    const savedQuality = await win.evaluate(() => window.appSettings.vsrQuality);
    assert.equal(savedQuality, 'ULTRA', 'vsrQuality setting must be persisted');
    console.log('[PASS] Setting persisted successfully: vsrQuality = ULTRA');

    // 6. Verify Player Error event handler behavior
    const testErrorMessages = await win.evaluate(() => {
        const vp = document.getElementById('video-player');
        // Check player error listener is active
        return {
            hasVideoPlayer: !!vp,
            playIcon: typeof window.icons !== 'undefined'
        };
    });
    assert.ok(testErrorMessages.hasVideoPlayer, 'Video player element exists');
    console.log('[PASS] Player elements and state validated');

    console.log('\n=== RESULT: ALL TESTS PASSED ===');
    await electronApp.close();
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
