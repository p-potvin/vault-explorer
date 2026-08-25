const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');

async function run() {
    console.log('=== VAULT EXPLORER SEEK PREVIEW E2E TEST ===\n');

    const electronApp = await electron.launch({
        cwd: path.resolve(__dirname, '..'),
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' },
    });

    await electronApp.context().waitForEvent('page');
    await new Promise(r => setTimeout(r, 2000));

    const win = electronApp.windows()[0];
    const testClipH264 = path.resolve(__dirname, 'test_clip.mp4');

    try {
        console.log('[Test 1] Testing playItem & seek preview initialization...');
        const initResult = await win.evaluate(async (clipPath) => {
            const testItem = {
                id: 'test-seek-1',
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

            await window.playItem(0, [testItem]);

            // Wait for metadata / loadeddata
            await new Promise((resolve) => {
                if (vp.readyState >= 2) return resolve();
                vp.addEventListener('loadeddata', resolve, { once: true });
                setTimeout(resolve, 2000);
            });

            const scrubVideo = document.getElementById('seek-scrub-video');
            return {
                modalDisplayed: modal.style.display === 'flex',
                hasVpSrc: !!vp.src,
                vpSrc: vp.src,
                hasScrubVideo: !!scrubVideo,
                scrubVideoSrc: scrubVideo ? scrubVideo.src : null,
                duration: vp.duration
            };
        }, testClipH264);

        console.log('Init Result:', initResult);
        assert.equal(initResult.modalDisplayed, true, 'Video modal should be open');
        assert.ok(initResult.hasVpSrc, 'Video player should have src');
        assert.ok(initResult.hasScrubVideo, 'seek-scrub-video element should exist in DOM');
        assert.ok(initResult.scrubVideoSrc && initResult.scrubVideoSrc.length > 0, 'seek-scrub-video should have src set');
        console.log('✓ [PASS] Scrubber video element and source verified.\n');

        console.log('[Test 2] Simulating seek-area hover & validating canvas preview rendering...');
        // Hover at 50% across the seek bar
        const seekResult = await win.evaluate(async () => {
            const seekArea = document.getElementById('seek-area');
            const seekPreview = document.getElementById('seek-hover-preview');
            const tooltip = document.getElementById('seek-time-tooltip');
            const vp = document.getElementById('video-player');

            const rect = seekArea.getBoundingClientRect();
            const clientX = rect.left + (rect.width * 0.5);
            const clientY = rect.top + (rect.height * 0.5);

            // Dispatch mousemove event
            const moveEvent = new MouseEvent('mousemove', {
                clientX,
                clientY,
                bubbles: true,
                cancelable: true
            });
            seekArea.dispatchEvent(moveEvent);

            // Wait for seek and render
            await new Promise(r => setTimeout(r, 200));

            // Check if canvas has non-black pixel content
            let hasPixels = false;
            let pixelSample = [];
            try {
                const ctx = seekPreview.getContext('2d');
                const imgData = ctx.getImageData(0, 0, seekPreview.width, seekPreview.height);
                for (let i = 0; i < imgData.data.length; i += 4) {
                    const r = imgData.data[i];
                    const g = imgData.data[i + 1];
                    const b = imgData.data[i + 2];
                    const a = imgData.data[i + 3];
                    if (a > 0 && (r > 0 || g > 0 || b > 0)) {
                        hasPixels = true;
                        pixelSample = [r, g, b, a];
                        break;
                    }
                }
            } catch (err) {
                console.error('Canvas error:', err);
            }

            return {
                previewDisplay: seekPreview.style.display,
                tooltipDisplay: tooltip ? tooltip.style.display : null,
                tooltipText: tooltip ? tooltip.innerText : null,
                hasNonBlackPixels: hasPixels,
                pixelSample
            };
        });

        console.log('Seek Result:', seekResult);
        assert.equal(seekResult.previewDisplay, 'block', 'Seek preview canvas should be visible on hover');
        assert.equal(seekResult.tooltipDisplay, 'block', 'Seek time tooltip should be visible on hover');
        assert.ok(seekResult.hasNonBlackPixels, 'Seek preview canvas must contain rendered video frame pixels (not black square)');
        console.log('✓ [PASS] Seek hover canvas successfully rendered video frame with valid non-black pixels!\n');

        console.log('[Test 3] Testing mouseleave hides preview...');
        const leaveResult = await win.evaluate(() => {
            const seekArea = document.getElementById('seek-area');
            const seekPreview = document.getElementById('seek-hover-preview');
            const tooltip = document.getElementById('seek-time-tooltip');

            seekArea.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

            return {
                previewDisplay: seekPreview.style.display,
                tooltipDisplay: tooltip ? tooltip.style.display : null
            };
        });

        assert.equal(leaveResult.previewDisplay, 'none', 'Preview canvas should hide on mouseleave');
        assert.equal(leaveResult.tooltipDisplay, 'none', 'Tooltip should hide on mouseleave');
        console.log('✓ [PASS] Seek preview cleanly hides on mouseleave.\n');

        console.log('=== ALL SEEK PREVIEW TESTS PASSED ===');
    } finally {
        await electronApp.close();
    }
}

run().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
