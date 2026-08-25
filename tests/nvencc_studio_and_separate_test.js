const { _electron: electron } = require('playwright');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const nvencc = require('../src/nvencc');
const enhancements = require('../src/enhancements');

const appRoot = path.resolve(__dirname, '..');

async function runUnitAndE2ETest() {
    console.log('--- Testing NVEncC Module & Arguments Builder ---');

    // 1. Verify NVEncC Path Discovery
    const nvenccExe = nvencc.resolveNvenccPath();
    console.log('[Test] Resolved NVEncC path:', nvenccExe);
    assert(nvenccExe, 'NVEncC64.exe should be resolved on system');
    assert(fs.existsSync(nvenccExe), 'NVEncC64.exe file must exist');

    // 2. Verify Command Arguments Generation
    const testArgs = nvencc.buildNvenccArgs('input.mp4', 'output.mp4', {
        codec: 'hevc',
        vsr: true,
        algo: 'ngx-vsr',
        quality: 3,
        scale: 2,
        truehdr: true,
        hdrContrast: 125,
        hdrSaturation: 75,
        hdrMaxLuminance: 1000,
        sharpen: true,
        sharpenMode: 'unsharp',
        unsharpRadius: 3,
        unsharpWeight: 0.5,
        deband: true,
        debandMode: 'libplacebo',
        debandIterations: 2,
        denoise: true,
        denoiseMode: 'fft3d',
        denoiseSigma: 1.5,
        fruc: true,
    });

    const argStr = testArgs.join(' ');
    console.log('[Test] Generated NVEncC args:', argStr);

    assert(argStr.includes('--codec hevc'), 'Must include --codec hevc');
    assert(argStr.includes('--vpp-resize algo=ngx-vsr,vsr-quality=3'), 'Must include VSR quality 3');
    assert(argStr.includes('--output-res 2x'), 'Must include --output-res 2x');
    assert(argStr.includes('--vpp-ngx-truehdr contrast=125,saturation=75,middlegray=44,maxluminance=1000'), 'Must include TrueHDR params');
    assert(argStr.includes('--vpp-unsharp radius=3,weight=0.5,threshold=10'), 'Must include unsharp params');
    assert(argStr.includes('--vpp-libplacebo-deband iterations=2,threshold=4'), 'Must include deband params');
    assert(argStr.includes('--vpp-fft3d sigma=1.5'), 'Must include fft3d denoise params');
    assert(argStr.includes('--vpp-fruc'), 'Must include --vpp-fruc');
    assert(argStr.includes('--audio-copy'), 'Must copy audio losslessly');
    console.log('✓ [PASS] NVEncC buildNvenccArgs generated all required flags correctly.');

    // 3. Verify Start-Subtitles.ps1 contains -Separate
    const startSubtitlesPath = path.join(appRoot, 'scripts', 'pwsh', 'Start-Subtitles.ps1');
    const startSubtitlesContent = fs.readFileSync(startSubtitlesPath, 'utf8');
    assert(startSubtitlesContent.includes('[switch]$Separate'), 'Start-Subtitles.ps1 must declare [switch]$Separate');
    assert(startSubtitlesContent.includes('$forward.Separate = $true'), 'Start-Subtitles.ps1 must forward Separate parameter');
    console.log('✓ [PASS] Start-Subtitles.ps1 has [switch]$Separate support.');

    // 4. Launch Electron App for UI & DOM Verification
    console.log('--- Launching Electron for Video Studio Modal E2E Verification ---');
    const electronApp = await electron.launch({
        args: [appRoot],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            VAULT_EXPLORER_TEST: '1'
        }
    });

    try {
        const win = await electronApp.firstWindow();
        await win.waitForLoadState('domcontentloaded');

        // Check Video Studio Modal in DOM
        const studioModalCount = await win.locator('#video-enhancer-modal').count();
        assert.equal(studioModalCount, 1, 'Video Enhancer Modal must exist in DOM');

        const vsrAlgoCount = await win.locator('#enh-vsr-algo').count();
        const vsrQualityCount = await win.locator('#enh-vsr-quality').count();
        const hdrToggleCount = await win.locator('#enh-hdr-toggle').count();
        const sharpModeCount = await win.locator('#enh-sharp-mode').count();
        const debandModeCount = await win.locator('#enh-deband-mode').count();
        const applyBtnCount = await win.locator('#enh-btn-apply').count();

        assert.equal(vsrAlgoCount, 1, 'VSR Algo dropdown must exist');
        assert.equal(vsrQualityCount, 1, 'VSR Quality dropdown must exist');
        assert.equal(hdrToggleCount, 1, 'HDR Toggle checkbox must exist');
        assert.equal(sharpModeCount, 1, 'Sharpen Mode dropdown must exist');
        assert.equal(debandModeCount, 1, 'Deband Mode dropdown must exist');
        assert.equal(applyBtnCount, 1, 'Apply button must exist');

        // Test opening Video Studio Modal programmatically
        await win.evaluate(() => {
            window.openVideoEnhancerModal('C:\\Test\\sample_video.mp4');
        });

        const isModalVisible = await win.locator('#video-enhancer-modal').isVisible();
        assert.equal(isModalVisible, true, 'Video Studio Modal must be visible after openVideoEnhancerModal call');
        console.log('✓ [PASS] Video Studio modal successfully opened with full controls.');

        // Test closing Video Studio Modal
        await win.click('#enh-modal-close');
        const isModalHidden = !(await win.locator('#video-enhancer-modal').isVisible());
        assert.equal(isModalHidden, true, 'Video Studio Modal must hide after close click');
        console.log('✓ [PASS] Video Studio modal successfully closed.');

        // Test Settings panel AI section has separated categories
        await win.click('#settings-trigger');
        await win.locator('#settings-panel').waitFor({ state: 'visible' });

        const settingsVsrAlgo = await win.locator('#settings-vsr-algo').count();
        const settingsVsrQuality = await win.locator('#settings-vsr-quality').count();
        const settingsVsrCodec = await win.locator('#settings-vsr-codec').count();

        assert.equal(settingsVsrAlgo, 1, 'Settings must have separate VSR Algo dropdown');
        assert.equal(settingsVsrQuality, 1, 'Settings must have separate VSR Quality Level dropdown');
        assert.equal(settingsVsrCodec, 1, 'Settings must have separate NVENC Codec dropdown');
        console.log('✓ [PASS] Settings modal categorized AI upscaler fields successfully verified.');

        console.log('\n===============================================================');
        console.log('   ALL NVENCC STUDIO & SEPARATE TESTS PASSED SUCCESSFULLY!    ');
        console.log('===============================================================');
    } finally {
        await electronApp.close();
    }
}

runUnitAndE2ETest().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
