const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');

async function run() {
    console.log('====================================================');
    console.log(' VAULT EXPLORER: DEBRIDS TAB & STREAMING VERIFICATION');
    console.log('====================================================\n');

    const appDir = path.resolve(__dirname, '..');
    const electronApp = await electron.launch({
        cwd: appDir,
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' }
    });

    electronApp.on('window', (page) => {
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER ERROR:', err));
    });

    try {
        const win = await electronApp.firstWindow();
        assert.ok(win, 'App window must be open');
        console.log('[PASS] 1. App window launched successfully');

        win.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        win.on('pageerror', err => console.error('BROWSER ERROR:', err));

        await win.waitForLoadState('domcontentloaded');
        await win.waitForFunction(() => typeof window.renderDebrids === 'function');

        // Test 1: DOM Elements exist
        const requiredElements = [
            'tab-debrids',
            'debrids-container',
            'debrids-grid',
            'debrids-playlist-view',
            'debrids-streams-grid',
            'btn-back-to-debrids',
            'btn-save-stream',
            'settings-default-folder-debrids'
        ];

        for (const elId of requiredElements) {
            const exists = await win.locator('body').evaluate((el, id) => !!document.getElementById(id), elId);
            assert.ok(exists, `Element #${elId} should exist in DOM`);
        }
        console.log('[PASS] 2. All Debrids DOM elements present in UI');

        // Test 2: Global API exports
        const globalFunctions = ['renderDebrids', 'openDebridPlaylist', 'backToDebrids'];
        for (const fn of globalFunctions) {
            const isFn = await win.locator('body').evaluate((el, f) => typeof window[f] === 'function', fn);
            assert.ok(isFn, `Global function window.${fn} must be defined`);
        }
        console.log('[PASS] 3. Debrids module exports verified');

        // Test 3: Tab Switching to Debrids
        const beforeState = await win.evaluate(() => ({
            currentTab: window.currentTab,
            tabEl: !!document.getElementById('tab-debrids')
        }));
        console.log('Before switchTab:', beforeState);

        await win.evaluate(() => window.switchTab('debrids'));
        await new Promise(r => setTimeout(r, 1200));

        const afterState = await win.evaluate(() => ({
            currentTab: window.currentTab,
            classList: document.getElementById('tab-debrids').className,
            bodyClass: document.body.className,
            containerDisplay: document.getElementById('debrids-container').style.display
        }));
        console.log('After switchTab:', afterState);

        const isTabActive = await win.locator('#tab-debrids').evaluate(el => el.classList.contains('active'));
        const isBodyClass = await win.locator('body').evaluate(el => el.classList.contains('tab-debrids-active'));
        const isContainerVisible = await win.locator('#debrids-container').isVisible();

        assert.ok(isTabActive, 'tab-debrids must have .active class');
        assert.ok(isBodyClass, 'body must have .tab-debrids-active class');
        assert.ok(isContainerVisible, '#debrids-container must be visible');
        console.log('[PASS] 4. Switched to Debrids tab successfully');

        // Test 4: M3U Playlists rendering
        await new Promise(r => setTimeout(r, 1500));
        const playlistCardsCount = await win.locator('#debrids-grid .debrid-playlist-card').count();
        console.log(`Found ${playlistCardsCount} M3U playlist card(s) in Debrids grid`);
        assert.ok(playlistCardsCount > 0, 'Should display at least 1 M3U playlist card from playlists folder');

        const firstPlaylistTitle = await win.locator('#debrids-grid .debrid-playlist-card .filename').first().innerText();
        console.log(`First M3U Playlist: "${firstPlaylistTitle}"`);
        console.log('[PASS] 5. M3U playlist folder homepage cards rendered');

        // Test 5: Open M3U Playlist into Video Streams Grid
        await win.locator('#debrids-grid .debrid-playlist-card').first().click();
        await new Promise(r => setTimeout(r, 1200));

        const isPlaylistViewVisible = await win.locator('#debrids-playlist-view').isVisible();
        assert.ok(isPlaylistViewVisible, '#debrids-playlist-view must be visible after opening M3U');

        const streamCardsCount = await win.locator('#debrids-streams-grid .debrid-stream-card').count();
        console.log(`Streams inside playlist: ${streamCardsCount} video(s)`);
        assert.ok(streamCardsCount >= 3, 'Alex Adams playlist should contain at least 3 video stream cards');

        const firstStreamTitle = await win.locator('#debrids-streams-grid .debrid-stream-card .filename').first().innerText();
        console.log(`Stream #1 title: "${firstStreamTitle}"`);
        assert.match(firstStreamTitle, /\(\d+\)\.(mp4|mkv|avi|mov|webm)/i, 'First stream title should have smart numbering in parentheses');
        // Test 6: HTTP Streaming Playback in HTML5 Player
        const playResult = await win.evaluate(async () => {
            try {
                const stream0 = window.currentDebridStreams && window.currentDebridStreams[0];
                await window.playItem(0, window.currentDebridStreams);
                const modal = document.getElementById('video-modal');
                return {
                    stream0,
                    modalDisplay: modal ? modal.style.display : 'no-modal',
                    modalClasses: modal ? modal.className : '',
                    videoSrc: document.getElementById('video-player') ? document.getElementById('video-player').src : ''
                };
            } catch (err) {
                return { error: err.message, stack: err.stack };
            }
        });
        console.log('Play Result:', playResult);

        const isModalOpen = await win.locator('#video-modal').evaluate(el => el.style.display === 'flex');
        assert.ok(isModalOpen, 'Video modal should open on double click / Enter');

        const streamSrc = await win.locator('#video-player').evaluate(el => el.src);
        console.log(`Active Video Player src: ${streamSrc}`);
        assert.match(streamSrc, /^https?:\/\//i, 'Player src must be direct HTTP/HTTPS streaming URL');

        // Test 7: Enhancement Gating & Save Stream Button
        const isSaveStreamVisible = await win.locator('#btn-save-stream').evaluate(el => el.style.display !== 'none');
        assert.ok(isSaveStreamVisible, '#btn-save-stream must be visible for HTTP streams');

        const isUpscaleDisabled = await win.locator('#btn-upscale').evaluate(el => el.disabled);
        const isClipDisabled = await win.locator('#btn-clip').evaluate(el => el.disabled);
        assert.ok(isUpscaleDisabled, 'AI Upscale button must be disabled for remote streams');
        assert.ok(isClipDisabled, 'Clip button must be disabled for remote streams');

        const isSubtitlesEnabled = await win.locator('#btn-subtitles').evaluate(el => !el.disabled);
        assert.ok(isSubtitlesEnabled, 'AI Subtitles button must remain enabled for streams');
        console.log('[PASS] 7. HTTP streaming started, enhancements gated, AI subtitles preserved');

        // Test 8: Double click UI event on second stream card
        await win.locator('#close-modal').click();
        await new Promise(r => setTimeout(r, 600));

        await win.locator('#debrids-streams-grid .debrid-stream-card').nth(1).dblclick();
        await new Promise(r => setTimeout(r, 1000));

        const isModalReopened = await win.locator('#video-modal').evaluate(el => el.style.display === 'flex');
        assert.ok(isModalReopened, 'Double clicking stream card in UI must reopen video modal');

        const stream2Title = await win.locator('#player-title').innerText();
        console.log(`Now playing in player: "${stream2Title}"`);
        assert.ok(stream2Title && stream2Title.trim().length > 0, 'Stream #2 title should be populated in player');
        console.log('[PASS] 8. UI double-click interaction verified on stream cards');

        // Test 9: Close video player and test Back to Playlists button
        await win.locator('#close-modal').click();
        await new Promise(r => setTimeout(r, 500));

        await win.locator('#btn-back-to-debrids').click();
        await new Promise(r => setTimeout(r, 800));

        const isGridVisibleAgain = await win.locator('#debrids-grid').isVisible();
        assert.ok(isGridVisibleAgain, '#debrids-grid must be visible after clicking Back to Playlists');
        console.log('[PASS] 9. Back navigation to Debrids folder homepage verified');

        // Test 10: Settings Library section wiring
        await win.locator('#settings-trigger').click();
        await win.locator('.settings-section-tab[data-settings-section="library"]').click();
        await new Promise(r => setTimeout(r, 600));

        const isDebridsSettingVisible = await win.locator('#settings-default-folder-debrids').isVisible();
        assert.ok(isDebridsSettingVisible, 'settings-default-folder-debrids must be visible in Library settings');
        console.log('[PASS] 10. Debrids settings entry verified in Library section');

        await win.locator('#settings-close').click();
        await new Promise(r => setTimeout(r, 400));

        console.log('\n====================================================');
        console.log(' ALL 10 DEBRIDS VERIFICATION TESTS PASSED (100% OK)');
        console.log('====================================================');

    } finally {
        await electronApp.close();
    }
}

run().catch((err) => {
    console.error('\n[TEST FAILURE]', err);
    process.exit(1);
});
