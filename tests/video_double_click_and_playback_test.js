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
    const testClipH264 = path.resolve(__dirname, 'test_clip.mp4');
    const testClipHEVC = path.resolve(__dirname, 'test_clip_hevc.mp4');

    // 1. Test H.264 playback
    console.log('[Test 1] Testing H.264 video playItem & playback...');
    const resultH264 = await win.evaluate(async (clipPath) => {
        const testItem = {
            id: 'test-h264',
            name: 'test_clip.mp4',
            path: clipPath,
            type: 'video',
            size: 52000,
            folder: 'tests'
        };

        window.displayedItems = [testItem];
        window.currentPlayingIndex = -1;

        const vp = document.getElementById('video-player');
        const modal = document.getElementById('video-modal');

        return new Promise((resolve) => {
            let modalOpened = false;

            const onError = () => {
                const err = vp.error;
                resolve({
                    success: false,
                    modalDisplayed: modalOpened ? 'flex' : modal.style.display,
                    error: err ? { code: err.code, message: err.message } : 'unknown error'
                });
            };

            const onSuccess = () => {
                resolve({
                    success: true,
                    modalDisplayed: modalOpened ? 'flex' : modal.style.display,
                    currentTime: vp.currentTime,
                    duration: vp.duration,
                    src: vp.src
                });
            };

            vp.addEventListener('error', onError, { once: true });
            vp.addEventListener('playing', onSuccess, { once: true });
            vp.addEventListener('loadeddata', onSuccess, { once: true });

            window.playItem(0, [testItem]).then(() => {
                modalOpened = (modal.style.display === 'flex');
            });

            setTimeout(() => {
                if (vp.readyState >= 2 || vp.currentTime > 0) {
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
    }, testClipH264);

    console.log('H.264 Playback result:', resultH264);
    assert.ok(resultH264.success, `H.264 video playback must succeed. Details: ${JSON.stringify(resultH264)}`);
    assert.equal(resultH264.modalDisplayed, 'flex', 'Video modal must be displayed as flex');

    // 2. Test HEVC / H.265 playback
    console.log('\n[Test 2] Testing HEVC/H.265 video playItem & hardware decode...');
    const resultHEVC = await win.evaluate(async (clipPath) => {
        const testItem = {
            id: 'test-hevc',
            name: 'test_clip_hevc.mp4',
            path: clipPath,
            type: 'video',
            size: 18000,
            folder: 'tests'
        };

        window.displayedItems = [testItem];
        window.currentPlayingIndex = -1;

        const vp = document.getElementById('video-player');
        const modal = document.getElementById('video-modal');

        return new Promise((resolve) => {
            let modalOpened = false;

            const onError = () => {
                const err = vp.error;
                resolve({
                    success: false,
                    modalDisplayed: modalOpened ? 'flex' : modal.style.display,
                    error: err ? { code: err.code, message: err.message } : 'unknown error'
                });
            };

            const onSuccess = () => {
                resolve({
                    success: true,
                    modalDisplayed: modalOpened ? 'flex' : modal.style.display,
                    currentTime: vp.currentTime,
                    duration: vp.duration,
                    src: vp.src
                });
            };

            vp.addEventListener('error', onError, { once: true });
            vp.addEventListener('playing', onSuccess, { once: true });
            vp.addEventListener('loadeddata', onSuccess, { once: true });

            window.playItem(0, [testItem]).then(() => {
                modalOpened = (modal.style.display === 'flex');
            });

            setTimeout(() => {
                if (vp.readyState >= 2 || vp.currentTime > 0) {
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
    }, testClipHEVC);

    console.log('HEVC Playback result:', resultHEVC);
    assert.ok(resultHEVC.success, `HEVC video playback must succeed. Details: ${JSON.stringify(resultHEVC)}`);
    assert.equal(resultHEVC.modalDisplayed, 'flex', 'Video modal must be displayed as flex');

    console.log('\n=== RESULT: ALL TESTS PASSED ===');
    await electronApp.close();
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
