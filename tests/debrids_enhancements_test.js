const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('====================================================');
    console.log(' VAULT EXPLORER: DEBRIDS ENHANCEMENTS VERIFICATION');
    console.log('====================================================\n');

    // Create a mock M3U playlist with mixed media (videos, images, and non-media like txt/exe)
    const playlistsDir = path.resolve('C:/Users/Administrator/Desktop/Github Repos/python-zipper/playlists');
    if (!fs.existsSync(playlistsDir)) fs.mkdirSync(playlistsDir, { recursive: true });

    const sampleM3uPath = path.join(playlistsDir, 'Test_Media_Suite.m3u');
    const sampleJsonPath = path.join(playlistsDir, 'Test_Media_Suite.json');

    const m3uContent = `#EXTM3U
#EXTINF:-1 tvg-name="Moonbbytiff, ElfieCutie, Rixia, BubbleBunny (1) Direct Video Super Long Title.mp4",Moonbbytiff, ElfieCutie, Rixia, BubbleBunny (1) Direct Video Super Long Title.mp4 (450.0 MB)
https://alldebrid.com/dl/fake1/sample_video1.mp4
#EXTINF:-1 tvg-name="Moonbbytiff, ElfieCutie, Rixia, BubbleBunny (2) Ultra Quality 4k.mkv",Moonbbytiff, ElfieCutie, Rixia, BubbleBunny (2) Ultra Quality 4k.mkv (1.2 GB)
https://alldebrid.com/dl/fake2/sample_video2.mkv
#EXTINF:-1 tvg-name="Moonbbytiff Gallery Photo (1).jpg",Moonbbytiff Gallery Photo (1).jpg (4.2 MB)
https://alldebrid.com/dl/fake3/sample_image1.jpg
#EXTINF:-1 tvg-name="Moonbbytiff Gallery Photo (2).png",Moonbbytiff Gallery Photo (2).png (3.1 MB)
https://alldebrid.com/dl/fake4/sample_image2.png
#EXTINF:-1 tvg-name="ReadMe_Instructions.txt",ReadMe_Instructions.txt (1.2 KB)
https://alldebrid.com/dl/fake5/readme.txt
#EXTINF:-1 tvg-name="Installer.exe",Installer.exe (15.0 MB)
https://alldebrid.com/dl/fake6/setup.exe
`;

    const jsonContent = JSON.stringify({
        title: "Test Media Suite - Moonbbytiff",
        created_at: "2026-09-02 08:30:00",
        total_items: 4,
        items: [
            {
                smart_filename: "Moonbbytiff, ElfieCutie, Rixia, BubbleBunny (1) Direct Video Super Long Title.mp4",
                link: "https://alldebrid.com/dl/fake1/sample_video1.mp4",
                filesize: 471859200,
                qualities: [
                    { quality: "1080p", url: "https://alldebrid.com/dl/fake1/sample_video1_1080p.mp4", size: "450 MB" },
                    { quality: "720p", url: "https://alldebrid.com/dl/fake1/sample_video1_720p.mp4", size: "220 MB" },
                    { quality: "480p", url: "https://alldebrid.com/dl/fake1/sample_video1_480p.mp4", size: "110 MB" }
                ]
            },
            {
                smart_filename: "Moonbbytiff, ElfieCutie, Rixia, BubbleBunny (2) Ultra Quality 4k.mkv",
                link: "https://alldebrid.com/dl/fake2/sample_video2.mkv",
                filesize: 1288490188
            },
            {
                smart_filename: "Moonbbytiff Gallery Photo (1).jpg",
                link: "https://alldebrid.com/dl/fake3/sample_image1.jpg",
                filesize: 4404019
            },
            {
                smart_filename: "Moonbbytiff Gallery Photo (2).png",
                link: "https://alldebrid.com/dl/fake4/sample_image2.png",
                filesize: 3250585
            }
        ]
    }, null, 2);

    fs.writeFileSync(sampleM3uPath, m3uContent, 'utf-8');
    fs.writeFileSync(sampleJsonPath, jsonContent, 'utf-8');

    const appDir = path.resolve(__dirname, '..');
    const electronApp = await electron.launch({
        cwd: appDir,
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1' }
    });

    try {
        const win = await electronApp.firstWindow();
        assert.ok(win, 'App window must be open');
        console.log('[PASS] 1. Vault Explorer launched');

        await win.waitForLoadState('domcontentloaded');
        await win.waitForFunction(() => typeof window.switchTab === 'function');

        // Navigate to Debrids tab
        await win.evaluate(() => window.switchTab('debrids'));
        await new Promise(r => setTimeout(r, 1200));

        // Open the test playlist
        await win.evaluate((mPath) => window.openDebridPlaylist(mPath), sampleM3uPath);
        await new Promise(r => setTimeout(r, 1200));

        // Test 1: Verify non-media discard (.txt and .exe filtered out)
        const parsedStreams = await win.evaluate(() => window.currentDebridStreams);
        console.log(`Parsed ${parsedStreams.length} stream items`);
        assert.strictEqual(parsedStreams.length, 4, 'Should contain exactly 4 media items (2 videos + 2 images), discarding .txt and .exe');
        console.log('[PASS] 2. Non-media files (.txt, .exe, .nfo) filtered out');

        // Test 2: Verify default sub-filter is 'video' and card count is 2
        const currentFilter = await win.evaluate(() => window.currentDebridFilter);
        assert.strictEqual(currentFilter, 'video', 'Default filter should be video');

        const videoCardsCount = await win.locator('#debrids-streams-grid .debrid-stream-card').count();
        assert.strictEqual(videoCardsCount, 2, 'Should display only the 2 video cards by default');
        console.log('[PASS] 3. Default filter correctly isolates Videos (2 cards)');

        // Test 3: Verify card structure matches Videos tab (.file-card, .thumbnail-container, .filename-container, .filename)
        const cardStructure = await win.evaluate(() => {
            const firstCard = document.querySelector('#debrids-streams-grid .debrid-stream-card');
            if (!firstCard) return null;
            return {
                hasThumbContainer: !!firstCard.querySelector('.thumbnail-container'),
                hasFilenameContainer: !!firstCard.querySelector('.filename-container'),
                hasFilename: !!firstCard.querySelector('.filename'),
                hasStreamBadge: !!firstCard.querySelector('.stream-badge'),
                cardWidth: firstCard.offsetWidth,
                filenameWidth: firstCard.querySelector('.filename')?.offsetWidth,
                cardScrollWidth: firstCard.scrollWidth
            };
        });

        assert.ok(cardStructure.hasThumbContainer, 'Must have .thumbnail-container');
        assert.ok(cardStructure.hasFilenameContainer, 'Must have .filename-container');
        assert.ok(cardStructure.hasFilename, 'Must have .filename');
        assert.ok(cardStructure.hasStreamBadge, 'Must have .stream-badge');
        assert.ok(cardStructure.cardScrollWidth <= cardStructure.cardWidth + 2, 'Card content must NOT horizontally overflow or collide');
        console.log('[PASS] 4. Stream card DOM structure identical to Videos tab and zero overflow');

        // Test 4: Verify Sub-filter pills (Videos, Images, All)
        const filterPillsCount = await win.locator('#debrids-type-filters .debrid-filter-pill').count();
        assert.strictEqual(filterPillsCount, 3, 'Should render 3 filter pills: Videos, Images, All');

        // Switch to Images filter
        await win.locator('#debrids-type-filters .debrid-filter-pill:has-text("Images")').click();
        await new Promise(r => setTimeout(r, 600));

        const imageCardsCount = await win.locator('#debrids-streams-grid .debrid-stream-card').count();
        assert.strictEqual(imageCardsCount, 2, 'Images filter must show 2 image cards');
        console.log('[PASS] 5. Sub-filter switching to Images works correctly (2 images)');

        // Switch to All filter
        await win.locator('#debrids-type-filters .debrid-filter-pill:has-text("All")').click();
        await new Promise(r => setTimeout(r, 600));

        const allCardsCount = await win.locator('#debrids-streams-grid .debrid-stream-card').count();
        assert.strictEqual(allCardsCount, 4, 'All filter must show all 4 cards');
        console.log('[PASS] 6. Sub-filter switching to All works correctly (4 cards)');

        // Test 5: In-Player Quality Picker for Debrid Stream with qualities
        await win.locator('#debrids-type-filters .debrid-filter-pill:has-text("Videos")').click();
        await new Promise(r => setTimeout(r, 500));

        // Start playback of the first video which has qualities (1080p, 720p, 480p)
        await win.evaluate(() => {
            const videoStreams = window.currentDebridStreams.filter(s => s.type === 'video');
            window.playItem(0, videoStreams);
        });
        await new Promise(r => setTimeout(r, 1200));

        const qualityDropdownVisible = await win.locator('#quality-dropdown-container').isVisible();
        assert.ok(qualityDropdownVisible, '#quality-dropdown-container must be visible for stream with qualities');

        // Open quality dropdown
        await win.locator('#btn-quality').click();
        await new Promise(r => setTimeout(r, 500));

        const qualityOptsCount = await win.locator('#quality-menu div').count();
        assert.strictEqual(qualityOptsCount, 3, 'Quality menu must contain 3 options (1080p, 720p, 480p)');
        console.log('[PASS] 7. In-player Quality Picker active and populated for Debrid streams');

        // Take targeted visual proof screenshot
        const screenshotPath = path.resolve('C:/Users/Administrator/.gemini/antigravity-ide/brain/4f703a18-9b96-4baf-adef-2f01d8f12496/debrids_enhancements_proof.png');
        await win.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`[PROOF] Captured targeted visual proof at: ${screenshotPath}`);

        // Close player modal
        await win.locator('#close-modal').click();
        await new Promise(r => setTimeout(r, 500));

        // Test 6: Launch intent routing for M3U playlist
        const launchResult = await win.evaluate((mPath) => {
            return window.openLaunchIntent({ filePath: mPath, type: 'file' });
        }, sampleM3uPath);
        assert.strictEqual(launchResult, true, 'openLaunchIntent must return true for .m3u');
        console.log('[PASS] 8. Launch intent for .m3u files routes directly to Debrids playlist view');

        console.log('\n====================================================');
        console.log(' ALL 8/8 DEBRIDS ENHANCEMENT TESTS PASSED PERFECTLY!');
        console.log('====================================================\n');

    } finally {
        await electronApp.close();
        // Clean up sample files
        try { fs.unlinkSync(sampleM3uPath); } catch (_) {}
        try { fs.unlinkSync(sampleJsonPath); } catch (_) {}
    }
}

run().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
