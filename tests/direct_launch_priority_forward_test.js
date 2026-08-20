const { _electron: electron } = require('playwright');
const electronBinary = require('electron');
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { getFFmpegPath } = require('../src/utils');

async function run() {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-forward-launch-'));
    const fixturePath = path.join(fixtureDir, 'forward-launch.mp4');
    const fixture = spawnSync(getFFmpegPath(), [
        '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=3',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', fixturePath,
    ], { windowsHide: true, encoding: 'utf8' });
    assert.equal(fixture.status, 0, `Could not create forwarding fixture: ${fixture.stderr}`);

    const env = {
        ...process.env,
        VAULT_EXPLORER_E2E: '1',
        VAULT_EXPLORER_FORCE_SINGLE_INSTANCE: '1',
        VAULT_EXPLORER_E2E_USER_DATA: path.join(fixtureDir, 'userdata'),
    };
    const userDataArg = `--user-data-dir=${env.VAULT_EXPLORER_E2E_USER_DATA}`;
    let primary;
    try {
        primary = await electron.launch({
            cwd: 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer',
            args: ['.', userDataArg], env,
        });
        const page = await primary.context().waitForEvent('page');
        await page.waitForTimeout(1500);

        const secondary = spawn(electronBinary, [userDataArg, '.', '--prioritize-player', fixturePath], {
            cwd: 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer',
            env,
            windowsHide: true,
        });
        try {
            await page.waitForFunction(() => Array.isArray(window.__launchPriorityTrace) && window.__launchPriorityTrace.includes('folder-scan'), null, { timeout: 15000 });
            const trace = await page.evaluate(() => window.__launchPriorityTrace);
            assert.ok(trace.indexOf('playing') < trace.indexOf('folder-scan'), `Forwarded priority order failed: ${trace.join(', ')}`);
            console.log('Forwarded direct priority launch ordering passed.');
        } finally {
            if (!secondary.killed) secondary.kill();
        }
    } finally {
        if (primary) await primary.close();
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
