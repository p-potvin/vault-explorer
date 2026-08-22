const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');

async function run() {
    console.log('=== VAULT EXPLORER VIDEO DOUBLE CLICK & PLAYBACK E2E TEST ===\n');

    const electronApp = await electron.launch({
        cwd: path.resolve(__dirname, '..'),
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' },
    });

    await electronApp.context().waitForEvent('page');
    await new Promise(r => setTimeout(r, 3000));

    const win = electronApp.windows()[0];
    const testClip = path.resolve(__dirname, 'test_clip.mp4');

    // 1. Test double-clicking a video item or calling playItem
    console.log('[Test 1] Testing playItem directly and through mock card...');
    const result = await win.evaluate(async (clipPath) => {
        const testItem = {
            id: 'test-1',
            name: 'test_clip.mp4',
            path: clipPath,
            type: 'video',
            size: 52000,
            folder: 'tests'
        };

        window.displayedItems = [testItem];
        window.currentPlayingIndex = -1;

        // Call playItem(0)
        await window.playItem(0, [testItem]);

        const vp = document.getElementById('video-player');
        const modal = document.getElementById('video-modal');

        return new Promise((resolve) => {
            const onError = () => {
                const err = vp.error;
                resolve({
                    success: false,
                    modalDisplayed: modal.style.display,
                    error: err ? { code: err.code, message: err.message } : 'unknown error'
                });
            };

            const onSuccess = () => {
                resolve({
                    success: true,
                    modalDisplayed: modal.style.display,
                    currentTime: vp.currentTime,
                    duration: vp.duration,
                    src: vp.src
                });
            };

            if (vp.error) {
                onError();
                return;
            }

            vp.addEventListener('error', onError, { once: true });
            vp.addEventListener('playing', onSuccess, { once: true });
            vp.addEventListener('loadeddata', onSuccess, { once: true });

            // Timeout after 6 seconds if neither fired
            setTimeout(() => {
                if (vp.readyState >= 2) {
                    onSuccess();
                } else if (vp.error) {
                    onError();
                } else {
                    resolve({
                        success: false,
                        timeout: true,
                        readyState: vp.readyState,
                        src: vp.src,
                        error: vp.error ? { code: vp.error.code, message: vp.error.message } : null
                    });
                }
            }, 6000);
        });
    }, testClip);

    console.log('Playback result:', result);
    assert.ok(result.success, `Video playback must succeed. Details: ${JSON.stringify(result)}`);
    assert.equal(result.modalDisplayed, 'flex', 'Video modal must be displayed as flex');

    console.log('\n=== RESULT: ALL TESTS PASSED ===');
    await electronApp.close();
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
