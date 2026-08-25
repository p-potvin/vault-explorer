const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

async function captureVisuals() {
    const appRoot = path.resolve(__dirname, '..');
    const artifactDir = 'C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain\\88e43982-a925-4a65-98fe-b2ae548d7619';

    console.log('Launching Electron to capture visual proofs...');
    const electronApp = await electron.launch({
        args: [appRoot],
        env: { ...process.env, NODE_ENV: 'test', VAULT_EXPLORER_TEST: '1' }
    });

    try {
        const win = await electronApp.firstWindow();
        await win.waitForLoadState('domcontentloaded');

        // 1. Open Video Enhancer Studio Modal
        await win.evaluate(() => {
            window.openVideoEnhancerModal('C:\\Test\\cyberpunk_trailer.mp4');
        });
        await win.locator('#video-enhancer-modal').waitFor({ state: 'visible' });

        const studioShot = path.join(artifactDir, 'video_enhancer_studio_modal.png');
        await win.screenshot({ path: studioShot });
        console.log('Saved studio modal screenshot to:', studioShot);

        // Close Studio Modal
        await win.click('#enh-modal-close');
        await win.locator('#video-enhancer-modal').waitFor({ state: 'hidden' });

        // 2. Open Settings Panel AI Tab
        await win.click('#settings-trigger');
        await win.locator('#settings-panel').waitFor({ state: 'visible' });
        await win.locator('.settings-section-tab[data-settings-section="ai"]').click();

        const settingsShot = path.join(artifactDir, 'settings_ai_categorized_upscaler.png');
        await win.screenshot({ path: settingsShot });
        console.log('Saved settings AI tab screenshot to:', settingsShot);

    } finally {
        await electronApp.close();
    }
}

captureVisuals().catch(err => {
    console.error('Visual capture error:', err);
    process.exit(1);
});
