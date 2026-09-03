const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('=================================================================');
    console.log(' VAULT EXPLORER: REAL STREAM PLAYBACK & PREVIEWS VERIFICATION');
    console.log('=================================================================\n');

    const realM3uPath = path.resolve('C:/Users/Administrator/Desktop/Github Repos/python-zipper/playlists/4 in 1 Moonbbytiff, ElfieCutie, Rixia, BubbleBunny.m3u');
    assert.ok(fs.existsSync(realM3uPath), `Real playlist file must exist at ${realM3uPath}`);

    const appDir = path.resolve(__dirname, '..');
    const electronApp = await electron.launch({
        cwd: appDir,
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' }
    });

    try {
        const win = await electronApp.firstWindow();
        assert.ok(win, 'App window must be open');
        console.log('[PASS] 1. Vault Explorer window initialized');

        await win.waitForLoadState('domcontentloaded');
        await win.waitForFunction(() => typeof window.switchTab === 'function' && typeof window.openDebridPlaylist === 'function');

        // Switch to Debrids tab
        await win.evaluate(() => window.switchTab('debrids'));
        await new Promise(r => setTimeout(r, 1000));

        // Open real playlist
        await win.evaluate((mPath) => window.openDebridPlaylist(mPath), realM3uPath);
        await new Promise(r => setTimeout(r, 1500));

        const streams = await win.evaluate(() => window.currentDebridStreams);
        console.log(`Loaded real playlist with ${streams.length} total media items`);
        assert.ok(streams.length > 0, 'Must load items from real playlist');

        const videoStreams = streams.filter(s => s.type === 'video');
        console.log(`Found ${videoStreams.length} video streams`);
        assert.ok(videoStreams.length > 0, 'Must have video streams');

        // Find the first video stream item
        const firstVideo = videoStreams[0];
        console.log(`Testing stream: "${firstVideo.name}" -> ${firstVideo.streamUrl}`);
        assert.ok(firstVideo.streamUrl.startsWith('http'), 'Stream URL must be valid HTTP');

        // Test 2: Start real stream playback
        await win.evaluate((vItm) => {
            const allVids = window.currentDebridStreams.filter(s => s.type === 'video');
            const idx = allVids.indexOf(vItm);
            window.playItem(idx >= 0 ? idx : 0, allVids);
        }, firstVideo);

        // Wait for video playback to start and advance beyond 0:00
        console.log('Waiting for live HTTP stream to buffer and start playback...');
        await win.waitForFunction(() => {
            const vp = document.getElementById('video-player');
            return vp && !isNaN(vp.duration) && vp.duration > 0 && !vp.paused;
        }, { timeout: 25000 });

        // Wait for video time to advance
        await new Promise(r => setTimeout(r, 2500));

        const playbackState = await win.evaluate(() => {
            const vp = document.getElementById('video-player');
            const curTimeEl = document.getElementById('current-time');
            const durTimeEl = document.getElementById('duration');
            const playerTitle = document.getElementById('player-title');
            const modal = document.getElementById('video-modal');
            return {
                duration: vp.duration,
                currentTime: vp.currentTime,
                paused: vp.paused,
                videoWidth: vp.videoWidth,
                videoHeight: vp.videoHeight,
                curTimeText: curTimeEl ? curTimeEl.innerText : '',
                durTimeText: durTimeEl ? durTimeEl.innerText : '',
                titleText: playerTitle ? playerTitle.innerText : '',
                modalVisible: modal ? modal.style.display === 'flex' : false
            };
        });

        console.log('Live Playback State:', playbackState);
        assert.ok(playbackState.duration > 0, `Stream duration must be > 0 (got ${playbackState.duration}s, not 0:00/0:00)`);
        assert.ok(playbackState.currentTime > 0, `Stream currentTime must advance (got ${playbackState.currentTime}s)`);
        assert.ok(!playbackState.paused, 'Stream video player must be actively playing');
        assert.ok(playbackState.modalVisible, 'Video modal must be visible');
        console.log(`[PASS] 2. Live HTTP stream playback verified: ${playbackState.curTimeText} / ${playbackState.durTimeText} (${playbackState.videoWidth}x${playbackState.videoHeight})`);

        // Test 3: Generate preview / thumbnail for the live stream
        console.log('Generating preview / keyframe thumbnail for remote stream...');
        const previewResult = await win.evaluate(async (url) => {
            if (window.electronAPI && typeof window.electronAPI.generateWebm === 'function') {
                return await window.electronAPI.generateWebm(url);
            }
            return { success: false, error: 'generateWebm API missing' };
        }, firstVideo.streamUrl);

        console.log('Preview Generation Result:', previewResult);
        assert.ok(previewResult.success, `Preview generation must succeed: ${previewResult.error || ''}`);
        assert.ok(previewResult.thumbnail && fs.existsSync(previewResult.thumbnail), 'Thumbnail .jpg must exist on disk');
        assert.ok(previewResult.hoverWebm && fs.existsSync(previewResult.hoverWebm), 'Hover WebM clip must exist on disk');
        console.log('[PASS] 3. Remote HTTP stream thumbnail & WebM preview generated successfully on disk');

        // Capture targeted visual proof showing active stream playback with non-zero duration
        const screenshotPath = path.resolve('C:/Users/Administrator/.gemini/antigravity-ide/brain/4f703a18-9b96-4baf-adef-2f01d8f12496/real_stream_playback_proof.png');
        await win.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`[PROOF] Captured targeted visual proof at: ${screenshotPath}`);

        // Test 4: Seekbar scrubbing preview
        const seekHoverTest = await win.evaluate(() => {
            const scrubVid = document.getElementById('seek-scrub-video');
            const seekCanvas = document.getElementById('seek-hover-preview');
            return {
                scrubVideoExists: !!scrubVid,
                scrubVideoSrc: scrubVid ? scrubVid.src : '',
                seekCanvasExists: !!seekCanvas
            };
        });

        assert.ok(seekHoverTest.scrubVideoExists, 'Scrub video element must exist');
        assert.ok(seekHoverTest.seekCanvasExists, 'Seek canvas element must exist');
        console.log('[PASS] 4. In-player seekbar scrubber canvas and video element verified');

        console.log('\n=================================================================');
        console.log(' ALL REAL STREAM PLAYBACK & PREVIEW TESTS PASSED SUCCESSFULLY!');
        console.log('=================================================================\n');

    } finally {
        await electronApp.close();
    }
}

run().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
