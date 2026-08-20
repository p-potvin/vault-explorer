const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { getFFmpegPath } = require('../src/utils');

async function run() {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-direct-launch-'));
    const fixturePath = path.join(fixtureDir, 'direct-launch.mp4');
    const ffmpegResult = spawnSync(getFFmpegPath(), [
        '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=3',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', fixturePath,
    ], { windowsHide: true, encoding: 'utf8' });
    assert.equal(ffmpegResult.status, 0, `Could not create direct-launch fixture: ${ffmpegResult.stderr}`);

    let electronApp;
    try {
        electronApp = await electron.launch({
            cwd: 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer',
            args: ['.', '--prioritize-player', fixturePath],
            env: { ...process.env, VAULT_EXPLORER_E2E: '1' },
        });
        const page = await electronApp.context().waitForEvent('page');
        await page.waitForFunction(() => Array.isArray(window.__launchPriorityTrace) && window.__launchPriorityTrace.includes('folder-scan'), null, { timeout: 15000 });
        const state = await page.evaluate(() => ({
            trace: window.__launchPriorityTrace,
            paused: document.getElementById('video-player').paused,
        }));
        assert.ok(state.trace.indexOf('playing') >= 0, `Video never reached playing: ${state.trace.join(', ')}`);
        assert.ok(state.trace.indexOf('playing') < state.trace.indexOf('folder-scan'), `Folder scan started too early: ${state.trace.join(', ')}`);
        assert.equal(state.paused, false, 'Direct priority launch must leave the selected video playing');
        console.log('Direct priority launch ordering passed.');
    } finally {
        if (electronApp) await electronApp.close();
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
