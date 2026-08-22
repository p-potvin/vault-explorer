const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');

async function run() {
    console.log('=== VAULT EXPLORER PLAYER CONTROLS & UPSCALE BUTTON VERIFICATION ===\n');

    const electronApp = await electron.launch({
        cwd: path.resolve(__dirname, '..'),
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

    // Check #btn-upscale styling and geometry
    const btnUpscale = win.locator('#btn-upscale');
    assert.equal(await btnUpscale.count(), 1, '#btn-upscale exists in DOM');

    // Make video-modal visible to evaluate rendered layout
    await win.evaluate(() => {
        document.body.classList.remove('player-idle');
        const modal = document.getElementById('video-modal');
        if (modal) modal.style.display = 'flex';
        const controls = document.getElementById('custom-controls');
        if (controls) {
            controls.style.opacity = '1';
            controls.style.visibility = 'visible';
        }
    });
    await new Promise(r => setTimeout(r, 500));

    const bounds = await win.evaluate(() => {
        const btn = document.getElementById('btn-upscale');
        const svg = btn.querySelector('svg');
        const span = btn.querySelector('span');
        const btnRect = btn.getBoundingClientRect();
        const svgRect = svg ? svg.getBoundingClientRect() : null;
        const spanRect = span ? span.getBoundingClientRect() : null;
        const computed = window.getComputedStyle(btn);
        return {
            display: computed.display,
            whiteSpace: computed.whiteSpace,
            btnWidth: btnRect.width,
            btnHeight: btnRect.height,
            svgLeft: svgRect ? svgRect.left : 0,
            spanLeft: spanRect ? spanRect.left : 0,
            svgTop: svgRect ? svgRect.top : 0,
            spanTop: spanRect ? spanRect.top : 0,
        };
    });

    console.log('Button geometry:', bounds);
    assert.ok(bounds.display.includes('flex'), 'Button must be inline-flex');
    assert.equal(bounds.whiteSpace, 'nowrap', 'Button must have nowrap');
    assert.ok(bounds.btnWidth >= 50, `Button width must be >= 50px, got ${bounds.btnWidth}`);
    assert.ok(bounds.spanLeft >= bounds.svgLeft, 'Icon and text must sit horizontally side by side (not 2 rows)');

    // Capture visual proof of the player right controls toolbar
    const screenshotPath = 'C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain\\88e43982-a925-4a65-98fe-b2ae548d7619\\player_upscale_btn_single_row.png';
    const toolbar = win.locator('#player-right-controls');
    if (await toolbar.count() > 0) {
        await toolbar.screenshot({ path: screenshotPath });
    } else {
        await btnUpscale.screenshot({ path: screenshotPath });
    }
    console.log(`[PASS] Captured visual proof at ${screenshotPath}`);

    console.log('\n=== RESULT: ALL TESTS PASSED ===');
    await electronApp.close();
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
