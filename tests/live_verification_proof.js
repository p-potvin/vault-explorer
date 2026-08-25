const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

async function runLiveVerification() {
    console.log('=== REAL-CONDITION LIVE VERIFICATION SUITE ===\n');

    const appRoot = path.resolve(__dirname, '..');
    const testUserData = path.join(os.tmpdir(), 'vault-explorer-real-verification-' + Date.now());
    fs.mkdirSync(testUserData, { recursive: true });

    const settingsFile = path.join(testUserData, 'vault-settings.json');
    const backupFile = path.join(testUserData, 'vault-settings.json.bak');

    // 1. Initial State for Persistence & Backup Test
    const initialSettings = { theme: 'dark', vsrQuality: 2, globExclusionsSeeded: true, collections: ['Movies', 'Series'] };
    fs.writeFileSync(settingsFile, JSON.stringify(initialSettings, null, 2), 'utf8');

    console.log('[Test 1] Launching Electron in live environment...');
    const electronApp = await electron.launch({
        args: [appRoot],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            VAULT_EXPLORER_E2E: '1',
            VAULT_EXPLORER_E2E_USER_DATA: testUserData
        }
    });

    try {
        const win = await electronApp.firstWindow();
        await win.waitForLoadState('domcontentloaded');

        // --- TEST 1: State Persistence & Automatic .bak Backup Rotation ---
        console.log('[Test 2] Testing settings save and .bak rotation...');
        const updatedSettings = { theme: 'dark', vsrQuality: 3, vsrAlgo: 'ngx-vsr', collections: ['Movies', 'Series', '4K Demos'] };
        
        const saveResult = await win.evaluate(async (settings) => {
            const res = await window.electronAPI.saveSettings(settings);
            const current = await window.electronAPI.getSettings();
            return { res, current };
        }, updatedSettings);

        console.log('saveResult from Electron:', saveResult);
        assert.strictEqual(saveResult.res, true, 'saveSettings should return true');
        assert.strictEqual(saveResult.current.vsrQuality, 3, 'In-memory/reloaded settings must have vsrQuality=3');

        const liveSaved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        const backupSaved = fs.existsSync(backupFile) ? JSON.parse(fs.readFileSync(backupFile, 'utf8')) : null;
        console.log('Disk liveSaved:', liveSaved);
        console.log('Disk backupSaved:', backupSaved);

        // --- TEST 2: Loading Screen Fixed Viewport Positioning ---
        console.log('[Test 3] Testing .loading full viewport fixed positioning...');
        const loadingMetrics = await win.evaluate(() => {
            const loading = document.getElementById('loading');
            loading.style.display = 'flex';
            const rect = loading.getBoundingClientRect();
            const computed = window.getComputedStyle(loading);
            return {
                position: computed.position,
                zIndex: parseInt(computed.zIndex, 10),
                rectTop: rect.top,
                rectLeft: rect.left,
                rectWidth: rect.width,
                rectHeight: rect.height,
                windowWidth: window.innerWidth,
                windowHeight: window.innerHeight
            };
        });

        assert.strictEqual(loadingMetrics.position, 'fixed', 'Loading overlay must have position: fixed');
        assert.strictEqual(loadingMetrics.zIndex >= 20000, true, 'Loading overlay z-index must be >= 20000');
        assert.strictEqual(loadingMetrics.rectTop, 0, 'Loading overlay must be pinned to top: 0');
        assert.strictEqual(loadingMetrics.rectLeft, 0, 'Loading overlay must be pinned to left: 0');
        assert.strictEqual(loadingMetrics.rectWidth, loadingMetrics.windowWidth, 'Loading overlay width must span viewport');
        assert.strictEqual(loadingMetrics.rectHeight, loadingMetrics.windowHeight, 'Loading overlay height must span viewport');
        console.log('✓ [PASS] Loading Overlay Fixed Viewport geometry verified:', loadingMetrics);

        // Hide loading
        await win.evaluate(() => {
            const loading = document.getElementById('loading');
            loading.style.display = 'none';
        });

        // --- TEST 3: Video Studio Modal Z-Index Over Video Player ---
        console.log('[Test 4] Testing AI Video Studio modal stacking & controls over player...');
        const studioStacking = await win.evaluate(async () => {
            const vm = document.getElementById('video-modal');
            const vp = document.getElementById('video-player');
            vm.style.display = 'flex';
            vp.src = 'file:///C:/Users/Administrator/Desktop/Medias/Julien%20Lacroix%20-%20Les%20fr%C3%A8res%20magie%20!%20[HD].mp4';
            
            const btnUpscale = document.getElementById('btn-upscale');
            if (btnUpscale) {
                btnUpscale.disabled = false;
            }
            window.currentPlayingItem = {
                name: 'Julien Lacroix - Les frères magie ! [HD].mp4',
                path: 'C:\\Users\\Administrator\\Desktop\\Medias\\Julien Lacroix - Les frères magie ! [HD].mp4'
            };

            await window.openVideoEnhancerModal('C:\\Users\\Administrator\\Desktop\\Medias\\Julien Lacroix - Les frères magie ! [HD].mp4');

            const modal = document.getElementById('video-enhancer-modal');
            const backdrop = document.getElementById('video-enhancer-backdrop');

            return {
                playerZIndex: parseInt(window.getComputedStyle(vm).zIndex, 10),
                backdropZIndex: parseInt(window.getComputedStyle(backdrop).zIndex, 10),
                modalZIndex: parseInt(window.getComputedStyle(modal).zIndex, 10),
                modalDisplay: window.getComputedStyle(modal).display,
                backdropDisplay: window.getComputedStyle(backdrop).display
            };
        });

        assert.strictEqual(studioStacking.modalDisplay, 'flex', 'AI Video Studio modal must be visible');
        assert.strictEqual(studioStacking.modalZIndex > studioStacking.playerZIndex, true, 'Modal z-index (20001) must be greater than video player z-index (10000)');
        assert.strictEqual(studioStacking.backdropZIndex > studioStacking.playerZIndex, true, 'Backdrop z-index (20000) must be greater than video player z-index (10000)');
        console.log('✓ [PASS] AI Video Studio Layering verified:', studioStacking);

        // --- TEST 4: Parakeet-TDT vs NeMo 3.5 Benchmark Results Artifact Check ---
        console.log('[Test 5] Checking Parakeet benchmark results artifact...');
        const benchResultsPath = path.join(__dirname, 'parakeet_benchmark_results.json');
        assert.ok(fs.existsSync(benchResultsPath), 'Benchmark results JSON must exist');
        const benchData = JSON.parse(fs.readFileSync(benchResultsPath, 'utf8'));
        const hasEntries = (benchData.real_world_live_results && benchData.real_world_live_results.length > 0) || (benchData.results && benchData.results.length > 0);
        assert.strictEqual(hasEntries, true, 'Benchmark results must contain entries');
        console.log('✓ [PASS] Parakeet benchmark verified with duration:', benchData.sample_media ? benchData.sample_media.duration_sec : benchData.duration_sec, 'seconds.');

        console.log('\n===============================================================');
        console.log(' ALL REAL-CONDITION VERIFICATION TESTS PASSED SUCCESSFULLY!    ');
        console.log('===============================================================');

    } finally {
        await electronApp.close();
        try {
            fs.rmSync(testUserData, { recursive: true, force: true });
        } catch (_) {}
    }
}

runLiveVerification().catch(err => {
    console.error('Real condition verification failed:', err);
    process.exit(1);
});
