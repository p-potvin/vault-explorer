const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

function checkPort(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => {
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        }).on('error', reject);
    });
}

async function runTest() {
    console.log('=== REAL CONDITIONS E2E PROOF: ON-DEMAND LIVE SUBTITLES ===\n');

    const testClip = path.resolve(__dirname, '..', '..', 'vault-cacophony', 'samples', 'ItJustDoesntMatter.wav');
    const srtPath = path.resolve(__dirname, '..', '..', 'vault-cacophony', 'samples', 'ItJustDoesntMatter.srt');
    const vttPath = path.resolve(__dirname, '..', '..', 'vault-cacophony', 'samples', '.subtitles', 'ItJustDoesntMatter.vtt');

    // Clean prior artifacts
    try { if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath); } catch (_) {}
    try { if (fs.existsSync(vttPath)) fs.unlinkSync(vttPath); } catch (_) {}

    // 1. Run live subtitles pipeline on-demand
    console.log('[Step 1] Triggering on-demand live subtitle generation...');
    const t0 = Date.now();
    const liveProc = spawn('node', ['src/live-subtitles.js', testClip], {
        cwd: path.resolve(__dirname, '..')
    });

    let output = '';
    liveProc.stdout.on('data', d => { output += d.toString(); });
    liveProc.stderr.on('data', d => { output += d.toString(); });

    const code = await new Promise(resolve => liveProc.on('close', resolve));
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`Pipeline finished in ${elapsed}s (exit code: ${code})`);
    console.log('Log output summary:\n' + output);

    assert.equal(code, 0, 'live-subtitles.js must exit with code 0');
    assert.match(output, /SUCCESS:\s+\d+\s+cues/i, 'Pipeline must report SUCCESS with cues');

    // 2. Query live server health and models state while active
    console.log('\n[Step 2] Verifying server health & model state on http://127.0.0.1:8099...');
    const health = await httpGet('http://127.0.0.1:8099/health');
    console.log('Health response:', health);
    assert.equal(health.status, 200, 'Health endpoint must return 200');
    assert.equal(health.body.status, 'ok', 'Engine status must be ok');
    assert.equal(health.body.backend, 'cuda', 'Engine backend must be cuda');

    const models = await httpGet('http://127.0.0.1:8099/v1/models');
    console.log('Models response:', models);
    assert.equal(models.status, 200, 'Models endpoint must return 200');
    const nemotron = models.body.data.find(m => m.id === 'nemotron');
    assert.ok(nemotron, 'Nemotron model must be present');
    assert.equal(nemotron.loaded, true, 'Nemotron model must be loaded');

    // 3. Verify on-disk persistence of generated sidecars
    console.log('\n[Step 3] Verifying generated sidecar files on disk...');
    assert.ok(fs.existsSync(srtPath), 'SRT file must exist on disk');
    const srtContent = fs.readFileSync(srtPath, 'utf8');
    assert.match(srtContent, /00:00:\d{2},\d{3} --> 00:00:\d{2},\d{3}/, 'SRT must contain valid timestamp');
    assert.match(srtContent, /equipment/i, 'SRT must contain recognized text');
    console.log('✓ SRT sidecar verified on disk (' + srtContent.length + ' bytes)');

    assert.ok(fs.existsSync(vttPath), 'VTT file must exist on disk');
    const vttContent = fs.readFileSync(vttPath, 'utf8');
    assert.ok(vttContent.startsWith('WEBVTT'), 'VTT must have valid WEBVTT header');
    console.log('✓ VTT sidecar verified on disk (' + vttContent.length + ' bytes)');

    // 4. Shutdown on-demand server and verify port is closed
    console.log('\n[Step 4] Stopping inference server...');
    const stopProc = spawn('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/pwsh/Start-AudioCppServer.ps1', '-Stop'], {
        cwd: path.resolve(__dirname, '..')
    });
    await new Promise(resolve => stopProc.on('close', resolve));
    
    // Wait brief moment for socket closure
    await new Promise(r => setTimeout(r, 1000));
    const portOpen = await checkPort(8099);
    console.log('Port 8099 listening state:', portOpen);
    assert.equal(portOpen, false, 'Port 8099 must be closed after stop');

    console.log('\n===============================================================');
    console.log(' ALL E2E REAL-CONDITION PROOFS PASSED SUCCESSFULLY!          ');
    console.log('===============================================================');
}

runTest().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
