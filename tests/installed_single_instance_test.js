const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');
const { getFFmpegPath } = require('../src/utils');

const root = path.resolve(__dirname, '..');
const executable = path.join(root, 'dist', 'win-unpacked', 'vault-explorer.exe');

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function rootProcesses() {
    const script = `Get-CimInstance Win32_Process -Filter "Name = 'vault-explorer.exe'" | Where-Object { $_.CommandLine -notmatch ' --type=' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
    if (!output) return [];
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
}

async function run() {
    assert.ok(fs.existsSync(executable), 'The rebuilt unpacked Vault Explorer executable is required');
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-installed-'));
    const fixturePath = path.join(fixtureDir, 'installed-launch.mp4');
    const fixture = spawnSync(getFFmpegPath(), [
        '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=3',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', fixturePath,
    ], { windowsHide: true, encoding: 'utf8' });
    assert.equal(fixture.status, 0, `Could not create installed-launch fixture: ${fixture.stderr}`);

    const startedPids = new Set();
    try {
        const first = spawn(executable, ['--prioritize-player', fixturePath], { windowsHide: true });
        startedPids.add(first.pid);
        await wait(2500);
        const afterFirst = rootProcesses();
        assert.equal(afterFirst.length, 1, `Expected one installed app root after first launch, found ${afterFirst.length}`);

        const second = spawn(executable, ['--prioritize-player', fixturePath], { windowsHide: true });
        startedPids.add(second.pid);
        await wait(2500);
        const afterSecond = rootProcesses();
        assert.equal(afterSecond.length, 1, `Second installed launch created another root window: ${JSON.stringify(afterSecond)}`);
        assert.equal(afterSecond[0].ProcessId, afterFirst[0].ProcessId, 'Second launch must retain the original app process');
        assert.match(afterSecond[0].CommandLine, /--prioritize-player/, 'Installed launch must receive the priority flag');
        console.log('Installed single-instance verification passed.');
    } finally {
        for (const process of rootProcesses()) startedPids.add(process.ProcessId);
        for (const pid of startedPids) {
            try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) { }
        }
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
