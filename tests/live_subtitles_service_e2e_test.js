const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const http = require('http');

async function checkHttp(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: data });
                }
            });
        }).on('error', reject);
    });
}

async function runE2E() {
    console.log('=== VAULT-EXPLORER / AUDIO.CPP LIVE SUBTITLES SERVICE E2E TEST ===\n');

    // 1. Verify /health
    console.log('[Step 1] Querying http://127.0.0.1:8099/health...');
    const health = await checkHttp('http://127.0.0.1:8099/health');
    console.log('Health response:', health.body);
    assert.equal(health.statusCode, 200, 'Health check must return 200 OK');
    assert.equal(health.body.status, 'ok', 'Status must be ok');
    assert.equal(health.body.backend, 'cuda', 'Backend must be cuda');

    // 2. Verify /v1/models
    console.log('\n[Step 2] Querying http://127.0.0.1:8099/v1/models...');
    const models = await checkHttp('http://127.0.0.1:8099/v1/models');
    console.log('Models response:', models.body);
    assert.equal(models.statusCode, 200, 'Models endpoint must return 200 OK');
    const parakeet = models.body.data.find(m => m.id === 'parakeet');
    assert.ok(parakeet, 'Model parakeet must be listed');
    assert.equal(parakeet.loaded, true, 'Model parakeet must be loaded');

    // 3. Direct Task Execution via REST API
    console.log('\n[Step 3] Executing direct ASR task on sample audio via POST /v1/tasks/run...');
    const sampleWav = path.resolve(__dirname, '..', '..', 'vault-cacophony', 'samples', 'ItJustDoesntMatter9s.wav');
    assert.ok(fs.existsSync(sampleWav), `Sample audio must exist at ${sampleWav}`);

    const taskPayload = JSON.stringify({
        model: 'parakeet',
        audio: sampleWav.replace(/\\/g, '/'),
        options: { return_timestamps: 'true' }
    });

    const taskResult = await new Promise((resolve, reject) => {
        const req = http.request('http://127.0.0.1:8099/v1/tasks/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(taskPayload)
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        req.write(taskPayload);
        req.end();
    });

    assert.equal(taskResult.statusCode, 200, 'Task execution must return 200 OK');
    assert.ok(Array.isArray(taskResult.body.words), 'Task result must contain words array');
    assert.ok(taskResult.body.words.length > 5, 'Must recognize multiple words');
    console.log(`Recognized ${taskResult.body.words.length} words. First 3 words:`, taskResult.body.words.slice(0, 3));

    // 4. Live Subtitles Engine & Sidecar Generation
    console.log('\n[Step 4] Testing live-subtitles.js cue extraction and sidecar output...');
    const testClip = path.resolve(__dirname, '..', '..', 'vault-cacophony', 'samples', 'ItJustDoesntMatter.wav');
    const expectedSrt = path.resolve(__dirname, '..', '..', 'vault-cacophony', 'samples', 'ItJustDoesntMatter.srt');
    const expectedVtt = path.resolve(__dirname, '..', '..', 'vault-cacophony', 'samples', '.subtitles', 'ItJustDoesntMatter.vtt');

    // Remove any previous artifacts to verify fresh creation
    try { if (fs.existsSync(expectedSrt)) fs.unlinkSync(expectedSrt); } catch (_) {}
    try { if (fs.existsSync(expectedVtt)) fs.unlinkSync(expectedVtt); } catch (_) {}

    const { spawn } = require('child_process');
    const liveProc = spawn('node', ['src/live-subtitles.js', testClip], {
        cwd: path.resolve(__dirname, '..')
    });

    let liveOutput = '';
    liveProc.stdout.on('data', (d) => { liveOutput += d.toString(); });
    liveProc.stderr.on('data', (d) => { liveOutput += d.toString(); });

    const exitCode = await new Promise((resolve) => liveProc.on('close', resolve));
    console.log('Live Subtitle run output:\n' + liveOutput);
    assert.equal(exitCode, 0, 'live-subtitles.js must exit 0');
    assert.match(liveOutput, /SUCCESS: \d+ cues/, 'Output must report SUCCESS with cue count');

    // Read back and verify sidecars on disk
    assert.ok(fs.existsSync(expectedSrt), 'Generated .srt sidecar must exist on disk');
    const srtContent = fs.readFileSync(expectedSrt, 'utf8');
    assert.match(srtContent, /00:00:\d{2},\d{3} --> 00:00:\d{2},\d{3}/, 'SRT must contain valid timestamp ranges');
    assert.match(srtContent, /masseuse/i, 'SRT must contain transcribed words');

    assert.ok(fs.existsSync(expectedVtt), 'Generated .vtt sidecar must exist in .subtitles directory');
    const vttContent = fs.readFileSync(expectedVtt, 'utf8');
    assert.ok(vttContent.startsWith('WEBVTT'), 'VTT must begin with WEBVTT header');

    console.log('\n===============================================================');
    console.log(' ALL LIVE SUBTITLES SERVICE E2E VERIFICATIONS PASSED (4/4)!     ');
    console.log('===============================================================');
}

runE2E().catch((err) => {
    console.error('E2E Verification Failed:', err);
    process.exit(1);
});
