const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

async function captureVisuals() {
    const appRoot = path.resolve(__dirname, '..');
    const artifactDir = 'C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain\\88e43982-a925-4a65-98fe-b2ae548d7619';

    console.log('Launching Electron for visual proofs of fixes...');
    const electronApp = await electron.launch({
        args: [appRoot],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            VAULT_EXPLORER_E2E: '1',
            VAULT_EXPLORER_E2E_USER_DATA: path.join(require('os').tmpdir(), 'vault-explorer-visual-test')
        }
    });

    try {
        const win = await electronApp.firstWindow();
        await win.waitForLoadState('domcontentloaded');

        await win.evaluate(async () => {
            const vp = document.getElementById('video-player');
            const vm = document.getElementById('video-modal');
            vm.style.display = 'flex';
            vp.src = 'file:///C:/Users/Administrator/Desktop/Medias/Julien%20Lacroix%20-%20Les%20fr%C3%A8res%20magie%20!%20[HD].mp4';
            const btnUpscale = document.getElementById('btn-upscale');
            if (btnUpscale) {
                btnUpscale.disabled = false;
                btnUpscale.style.opacity = '1';
                btnUpscale.style.cursor = 'pointer';
            }
            window.currentPlayingItem = {
                name: 'Julien Lacroix - Les frères magie ! [HD].mp4',
                path: 'C:\\Users\\Administrator\\Desktop\\Medias\\Julien Lacroix - Les frères magie ! [HD].mp4'
            };
            await window.openVideoEnhancerModal('C:\\Users\\Administrator\\Desktop\\Medias\\Julien Lacroix - Les frères magie ! [HD].mp4');
        });

        await win.locator('#video-enhancer-modal').waitFor({ state: 'visible' });

        const playerModalShot = path.join(artifactDir, 'ai_video_studio_over_player.png');
        await win.screenshot({ path: playerModalShot });
        console.log('Saved AI Video Studio over player screenshot to:', playerModalShot);

        // Close Studio Modal & hide player
        await win.evaluate(() => {
            window.closeVideoEnhancerModal();
            const vm = document.getElementById('video-modal');
            if (vm) vm.style.display = 'none';
            const vp = document.getElementById('video-player');
            if (vp) vp.pause();
        });

        // 2. Test fixed full-screen loading overlay
        await win.evaluate(() => {
            const loading = document.getElementById('loading');
            loading.style.display = 'flex';
        });
        await win.locator('#loading').waitFor({ state: 'visible' });

        const loadingShot = path.join(artifactDir, 'loading_fixed_full_screen.png');
        await win.screenshot({ path: loadingShot });
        console.log('Saved loading screen screenshot to:', loadingShot);

    } finally {
        await electronApp.close();
    }
}

captureVisuals().catch(err => {
    console.error('Visual capture failed:', err);
    process.exit(1);
});
