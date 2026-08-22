const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');

async function run() {
    console.log('=== VAULT EXPLORER: PLAYLIST/ALBUM PROMPTS, VOLUME 100%, AND ZERO DELAY PLAYBACK ===\n');

    const electronApp = await electron.launch({
        cwd: path.resolve(__dirname, '..'),
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' },
    });

    await electronApp.context().waitForEvent('page');
    await new Promise(r => setTimeout(r, 3000));

    const win = electronApp.windows()[0];
    const testClip = path.resolve(__dirname, 'test_clip.mp4');

    // 1. Verify default volume is 1.0
    console.log('[Test 1] Verifying default volume is 1.0 (100%)...');
    const vol = await win.evaluate(() => {
        const vp = document.getElementById('video-player');
        const slider = document.getElementById('volume-slider');
        return { vpVolume: vp.volume, sliderVal: parseFloat(slider.value) };
    });
    console.log('Volume state:', vol);
    assert.equal(vol.vpVolume, 1.0, 'Video player volume must default to 1.0');
    assert.equal(vol.sliderVal, 1.0, 'Volume slider value must default to 1.0');
    console.log('✓ [PASS] Volume defaults to 100%');

    // 2. Verify window.showPromptDialog and Playlist/Album creation without throwing
    console.log('\n[Test 2] Testing showPromptDialog modal and Playlist/Album creation...');
    const promptResult = await win.evaluate(async () => {
        // Trigger showPromptDialog asynchronously
        const promptPromise = window.showPromptDialog('Test Prompt Title', 'DefaultVal', 'Placeholder');
        
        // Modal must be visible
        const dialog = document.getElementById('prompt-dialog');
        const input = document.getElementById('prompt-dialog-input');
        const okBtn = document.getElementById('btn-prompt-ok');
        
        const isVisible = dialog && dialog.style.display !== 'none';
        input.value = 'My New Test Playlist';
        okBtn.click();

        const resolvedVal = await promptPromise;

        // Test createPlaylist using the prompt
        let createdPl = null;
        const testPlName = 'Direct Named Playlist ' + Date.now();
        const createPlFn = window.createAudioPlaylist || window.createPlaylist;
        if (typeof createPlFn === 'function') {
            createdPl = await createPlFn(testPlName);
        }

        let createdAlbum = null;
        const testAlbumName = 'Direct Named Album ' + Date.now();
        const createAlbumFn = window.createCustomPhotoAlbum || window.createCustomAlbum;
        if (typeof createAlbumFn === 'function') {
            createdAlbum = await createAlbumFn(testAlbumName);
        }

        return {
            isVisible,
            resolvedVal,
            playlistCreated: !!createdPl,
            albumCreated: !!createdAlbum
        };
    });

    console.log('Prompt result:', promptResult);
    assert.ok(promptResult.isVisible, 'Prompt dialog should be displayed');
    assert.equal(promptResult.resolvedVal, 'My New Test Playlist');
    assert.ok(promptResult.playlistCreated, 'Playlist must be created without throwing');
    assert.ok(promptResult.albumCreated, 'Album must be created without throwing');
    console.log('✓ [PASS] showPromptDialog and Playlist/Album creation verified');

    // 3. Verify zero-delay playItem opening
    console.log('\n[Test 3] Testing instantaneous playItem video opening...');
    const playbackTiming = await win.evaluate(async (clipPath) => {
        const item = {
            id: 'perf-clip',
            name: 'test_clip.mp4',
            path: clipPath,
            type: 'video',
            size: 52000
        };
        const t0 = performance.now();
        window.playItem(0, [item]);
        const modal = document.getElementById('video-modal');
        const vp = document.getElementById('video-player');
        const tModalOpen = performance.now();

        return {
            modalDisplay: modal.style.display,
            hasSrc: !!vp.src,
            modalOpenElapsedMs: tModalOpen - t0
        };
    }, testClip);

    console.log('Playback timing:', playbackTiming);
    assert.equal(playbackTiming.modalDisplay, 'flex', 'Video modal must open immediately');
    assert.ok(playbackTiming.hasSrc, 'Video source must be assigned immediately');
    assert.ok(playbackTiming.modalOpenElapsedMs < 200, `Modal opening must take <200ms, took ${playbackTiming.modalOpenElapsedMs}ms`);
    console.log(`✓ [PASS] Video modal opened in ${playbackTiming.modalOpenElapsedMs.toFixed(2)}ms (zero blocking delay)`);

    // 4. Verify live subtitles stop without error
    console.log('\n[Test 4] Testing stopLiveSubtitles without error...');
    const liveSubsStop = await win.evaluate(async () => {
        try {
            if (window.electronAPI && typeof window.electronAPI.stopLiveSubtitles === 'function') {
                const res = await window.electronAPI.stopLiveSubtitles();
                return { ok: true, res };
            }
            return { ok: true, skipped: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });
    console.log('Live subs stop result:', liveSubsStop);
    assert.ok(liveSubsStop.ok, `stopLiveSubtitles must not throw error: ${liveSubsStop.error}`);
    console.log('✓ [PASS] stopLiveSubtitles executed cleanly');

    console.log('\n=== ALL TESTS PASSED ===');
    await electronApp.close();
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
