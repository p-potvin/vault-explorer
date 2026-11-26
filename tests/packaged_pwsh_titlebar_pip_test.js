const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const utils = require('../src/utils');
const aiSubtitles = require('../src/ai-subtitles');

const rootDir = path.resolve(__dirname, '..');

function verifyPackagedPwshResolution() {
    console.log('[Test 1] Verifying ASAR unpack config & PowerShell script path resolution...');
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const asarUnpack = (pkg.build && pkg.build.asarUnpack) || [];
    assert.ok(asarUnpack.includes('scripts/pwsh/**'), 'package.json build.asarUnpack must include "scripts/pwsh/**"');

    const asarResolved = utils.resolveUnpackedPathFrom(
        'C:\\app\\resources\\app.asar\\src',
        'C:\\app\\resources',
        'scripts',
        'pwsh',
        'Start-Subtitles.ps1'
    );
    assert.equal(
        asarResolved,
        path.join('C:\\app\\resources', 'app.asar.unpacked', 'scripts', 'pwsh', 'Start-Subtitles.ps1'),
        'Packaged app.asar baseDir must resolve to app.asar.unpacked'
    );
    assert.doesNotMatch(asarResolved, /app\.asar(?:[\\/]|$)/, 'Resolved path must not stay inside app.asar');

    const alreadyUnpacked = utils.resolveUnpackedPathFrom(
        'C:\\app\\resources\\app.asar.unpacked\\src',
        'C:\\app\\resources',
        'scripts',
        'pwsh',
        'Start-Subtitles.ps1'
    );
    assert.doesNotMatch(
        alreadyUnpacked,
        /app\.asar\.unpacked\.unpacked/i,
        'Unpacked baseDir must never produce app.asar.unpacked.unpacked'
    );

    const delegator = liveSubtitles.subtitlesDelegator();
    assert.ok(fs.existsSync(delegator), `Start-Subtitles.ps1 must exist on disk: ${delegator}`);
    assert.ok(
        delegator.endsWith(path.join('scripts', 'pwsh', 'Start-Subtitles.ps1')),
        `Unexpected delegator path: ${delegator}`
    );
    assert.doesNotMatch(delegator, /app\.asar(?:[\\/]|$)/i, 'Delegator path must not resolve inside app.asar');

    const parseRes = spawnSync('pwsh.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `& { $errs = @(); [System.Management.Automation.Language.Parser]::ParseFile('${delegator.replace(/'/g, "''")}', [ref]$null, [ref]$errs) | Out-Null; if ($errs.Count -gt 0) { $errs | ForEach-Object { Write-Error $_ }; exit 1 } }`,
    ], { encoding: 'utf8', windowsHide: true });
    assert.ifError(parseRes.error);
    assert.equal(parseRes.status, 0, `pwsh parser failed for Start-Subtitles.ps1:\n${parseRes.stderr}`);

    const fileCheckRes = spawnSync('pwsh.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        delegator,
    ], { encoding: 'utf8', windowsHide: true });
    assert.ifError(fileCheckRes.error);
    const combinedOutput = `${fileCheckRes.stdout || ''}\n${fileCheckRes.stderr || ''}`;
    assert.notEqual(fileCheckRes.status, 64, `pwsh -File must recognize the script path:\n${combinedOutput}`);
    assert.doesNotMatch(
        combinedOutput,
        /not recognized as the name of a script file/i,
        `pwsh -File must resolve Start-Subtitles.ps1:\n${combinedOutput}`
    );
    console.log('✓ [PASS] PowerShell ASAR unpack and Start-Subtitles.ps1 resolution verified.\n');
}

async function verifyTitlebarZoomAndPipIcons() {
    console.log('[Test 2] Verifying titlebar SETTINGS visibility across zoom levels and PiP control icons...');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 've-pwsh-tb-pip-'));
    const electronApp = await electron.launch({
        cwd: rootDir,
        args: ['.'],
        env: {
            ...process.env,
            VAULT_EXPLORER_E2E: '1',
            VAULT_EXPLORER_E2E_USER_DATA: userDataDir,
        },
    });

    try {
        const win = await electronApp.firstWindow();
        const pageErrors = [];
        win.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

        await win.waitForLoadState('domcontentloaded');
        await win.waitForFunction(() => typeof window.initSettingsListeners === 'function');
        await win.waitForTimeout(500);

        for (const zoomFactor of [1.0, 0.8944, 0.5, 1.5]) {
            await electronApp.evaluate(({ BrowserWindow }, zf) => {
                BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zf);
            }, zoomFactor);
            await win.waitForTimeout(250);

            const metrics = await win.evaluate(() => {
                const tb = document.querySelector('.titlebar');
                const btn = document.getElementById('settings-trigger');
                const txt = document.getElementById('settings-btn-text');
                const wco = navigator.windowControlsOverlay
                    ? navigator.windowControlsOverlay.getTitlebarAreaRect().toJSON()
                    : null;
                return {
                    titlebarRect: tb.getBoundingClientRect().toJSON(),
                    settingsBtnRect: btn.getBoundingClientRect().toJSON(),
                    settingsTxtRect: txt.getBoundingClientRect().toJSON(),
                    wco,
                };
            });

            assert.ok(metrics.wco, 'windowControlsOverlay must be available');
            const clearance = metrics.wco.right - metrics.settingsBtnRect.right;
            assert.ok(
                clearance >= 8,
                `zoom=${zoomFactor}: settings button clipped by overlay (clearance=${clearance.toFixed(2)}px, wco.right=${metrics.wco.right}, btn.right=${metrics.settingsBtnRect.right})`
            );
            assert.ok(
                metrics.settingsTxtRect.width > 20 && metrics.settingsTxtRect.right <= metrics.wco.right,
                `zoom=${zoomFactor}: SETTINGS text clipped (width=${metrics.settingsTxtRect.width}, right=${metrics.settingsTxtRect.right}, wco.right=${metrics.wco.right})`
            );
            assert.ok(
                metrics.titlebarRect.height >= metrics.wco.height - 1,
                `zoom=${zoomFactor}: titlebar height (${metrics.titlebarRect.height}) smaller than overlay height (${metrics.wco.height})`
            );
            console.log(`  -> zoom=${zoomFactor}: clearance=${clearance.toFixed(1)}px, txtWidth=${metrics.settingsTxtRect.width.toFixed(1)}px [PASS]`);
        }

        // Reset zoom to 1.0 and exercise Settings UI interactions
        await electronApp.evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.0);
        });
        await win.waitForTimeout(200);

        const settingsTrigger = win.locator('#settings-trigger');
        await settingsTrigger.hover();
        await settingsTrigger.click();
        await win.locator('#settings-panel').waitFor({ state: 'visible' });
        await win.locator('.settings-section-tab[data-settings-section="playback"]').click();
        assert.equal(await win.locator('#settings-default-sub-lang').isVisible(), true, 'Playback settings tab should become visible');
        await win.locator('.settings-section-tab[data-settings-section="general"]').click();
        assert.equal(await win.locator('#settings-default-folder').isVisible(), true, 'General settings tab should become visible');
        await win.locator('#settings-close').click();
        await win.locator('#settings-panel').waitFor({ state: 'hidden' });
        console.log('  -> Settings trigger hover, open, tab navigation, and close [PASS]');

        // Verify PiP control icons are not squished to 0 width by button padding.
        // Hover near the top-left of .video-wrapper so the center play button is not pre-scaled by :hover.
        await win.evaluate(() => {
            const modal = document.getElementById('video-modal');
            modal.style.display = 'flex';
            modal.classList.add('minimized');
        });
        await win.locator('#video-modal.minimized .video-wrapper').hover({ position: { x: 20, y: 20 } });
        await win.waitForTimeout(250);

        const pipMetrics = await win.evaluate(() => {
            const overlay = document.getElementById('pip-controls-overlay');
            const ctrlIds = ['pip-btn-prev', 'pip-btn-play', 'pip-btn-next'];
            const controls = ctrlIds.map((id) => {
                const btn = document.getElementById(id);
                const svg = btn.querySelector('svg');
                const cs = getComputedStyle(btn);
                return {
                    id,
                    padding: cs.padding,
                    btnRect: btn.getBoundingClientRect().toJSON(),
                    svgRect: svg ? svg.getBoundingClientRect().toJSON() : null,
                };
            });
            const closeBtn = document.getElementById('pip-close-btn');
            const closeSvg = closeBtn.querySelector('svg');
            return {
                overlayDisplay: getComputedStyle(overlay).display,
                controls,
                closeSvgRect: closeSvg ? closeSvg.getBoundingClientRect().toJSON() : null,
            };
        });

        assert.equal(pipMetrics.overlayDisplay, 'flex', 'PiP controls overlay must appear on hover');
        for (const ctrl of pipMetrics.controls) {
            assert.equal(ctrl.padding, '0px', `${ctrl.id} padding must be reset to 0px`);
            assert.ok(
                ctrl.btnRect.width >= 34 && ctrl.btnRect.width <= 38 &&
                ctrl.btnRect.height >= 34 && ctrl.btnRect.height <= 38,
                `${ctrl.id} button dimensions out of range: ${ctrl.btnRect.width}x${ctrl.btnRect.height}`
            );
            assert.ok(
                ctrl.svgRect && ctrl.svgRect.width >= 12 && ctrl.svgRect.height >= 12,
                `${ctrl.id} SVG icon collapsed: ${JSON.stringify(ctrl.svgRect)}`
            );
            console.log(`  -> ${ctrl.id}: padding=${ctrl.padding}, svg=${ctrl.svgRect.width.toFixed(1)}x${ctrl.svgRect.height.toFixed(1)} [PASS]`);
        }

        assert.ok(
            pipMetrics.closeSvgRect && pipMetrics.closeSvgRect.width >= 10 && pipMetrics.closeSvgRect.height >= 10,
            `#pip-close-btn SVG collapsed: ${JSON.stringify(pipMetrics.closeSvgRect)}`
        );

        await win.locator('#pip-btn-play').hover();
        await win.waitForTimeout(100);
        assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join(' | ')}`);
        console.log('✓ [PASS] Titlebar SETTINGS clearance & PiP icon visibility verified.\n');
    } finally {
        await electronApp.close();
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

async function run() {
    verifyPackagedPwshResolution();
    await verifyTitlebarZoomAndPipIcons();
    console.log('ALL PACKAGED PWSH, TITLEBAR ZOOM & PIP ICON CHECKS PASSED.');
}

run().catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
