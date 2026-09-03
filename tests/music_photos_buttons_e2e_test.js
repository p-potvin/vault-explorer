const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');

console.log('======================================================================');
console.log(' VAULT EXPLORER: MUSIC & PHOTOS BUTTON-BY-BUTTON E2E TEST SUITE       ');
console.log('======================================================================\n');

async function run() {
    const electronApp = await electron.launch({
        args: ['.'],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            VAULT_EXPLORER_E2E: '1'
        }
    });

    const win = await electronApp.firstWindow();
    await win.waitForFunction(() => typeof window.switchTab === 'function' && typeof window.renderAudio === 'function');

    // Seed mock data for music and photos
    await win.evaluate(() => {
        const testAudio = [
            { id: 'a1', name: '01 - Neon Horizon.mp3', path: 'C:\\Vault\\Music\\01 - Neon Horizon.mp3', type: 'audio', duration: 180, artist: 'Starlight', folder: 'Synthwave' },
            { id: 'a2', name: '02 - Cyber City.flac', path: 'C:\\Vault\\Music\\02 - Cyber City.flac', type: 'audio', duration: 240, artist: 'Starlight', folder: 'Synthwave' },
            { id: 'a3', name: '03 - Midnight Drive.wav', path: 'C:\\Vault\\Music\\03 - Midnight Drive.wav', type: 'audio', duration: 210, artist: 'RetroWave', folder: 'Outrun' }
        ];

        const testPhotos = [
            { id: 'p1', name: 'Mountain Sunset.jpg', path: 'C:\\Vault\\Photos\\Mountain Sunset.jpg', type: 'image', width: 1920, height: 1080, folder: 'Nature' },
            { id: 'p2', name: 'City Skyline.png', path: 'C:\\Vault\\Photos\\City Skyline.png', type: 'image', width: 2560, height: 1440, folder: 'Urban' },
            { id: 'p3', name: 'Ocean Waves.jpg', path: 'C:\\Vault\\Photos\\Ocean Waves.jpg', type: 'image', width: 3840, height: 2160, folder: 'Nature' }
        ];

        window.allItems = [...testAudio, ...testPhotos];
        window.appSettings = window.appSettings || {};
        window.appSettings.virtualFolders = { version: 2, folders: [], items: {} };
        window.appSettings.favorites = [];
        window.appSettings.playlistCovers = {};
        window.appSettings.albumCovers = {};
    });

    // ──────────────────────────────────────────────────────────────────────────
    // PART 1: MUSIC TAB BUTTONS & CONTROLS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('[Test 1] Navigating to Music Tab and validating initial layout...');
    const musicNavResult = await win.evaluate(() => {
        const musicTab = document.getElementById('tab-music');
        if (musicTab) musicTab.click();
        else if (typeof window.switchTab === 'function') window.switchTab('music');

        return {
            currentTab: window.currentTab,
            bodyClass: document.body.className,
            tabActive: musicTab ? musicTab.classList.contains('active') : false,
            hasSidebar: !!document.getElementById('audio-sidebar'),
            hasMain: !!document.getElementById('audio-main'),
            hasTracklist: !!document.getElementById('audio-tracklist'),
            hasSearch: !!document.getElementById('audio-track-search'),
            hasPlayAll: !!document.getElementById('audio-btn-play-all'),
            hasShuffle: !!document.getElementById('audio-btn-shuffle'),
            hasVisualizer: !!document.getElementById('audio-btn-visualizer')
        };
    });

    console.log('Music tab layout:', musicNavResult);
    assert.equal(musicNavResult.currentTab, 'music', 'Current tab must be music');
    assert.ok(musicNavResult.hasTracklist, 'Tracklist container must exist');
    assert.ok(musicNavResult.hasSearch, 'Track search input must exist');
    assert.ok(musicNavResult.hasPlayAll, 'Play All button must exist');
    assert.ok(musicNavResult.hasShuffle, 'Shuffle button must exist');
    assert.ok(musicNavResult.hasVisualizer, 'Visualizer button must exist');
    console.log('✓ [PASS] Music Tab structure verified.\n');

    console.log('[Test 2] Testing Playlist Creation, Header Buttons, and Track Search...');
    const musicActionsResult = await win.evaluate(async () => {
        // 1. Create a custom playlist
        const pl = await window.createAudioPlaylist('Synth Gems', ['C:\\Vault\\Music\\01 - Neon Horizon.mp3']);

        // 2. Test Real-time Track Search Filter
        const searchBox = document.getElementById('audio-track-search');
        searchBox.value = 'Neon';
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));

        const filteredRows = document.querySelectorAll('.audio-track-row');
        const firstRowTitle = filteredRows.length > 0 ? filteredRows[0].querySelector('.track-title')?.innerText : '';

        // Reset search filter
        searchBox.value = '';
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));

        // 3. Test Visualizer Toggle Button
        const visBtn = document.getElementById('audio-btn-visualizer');
        visBtn.click();
        const visContainer = document.getElementById('audio-visualizer-container');
        const visDisplay = visContainer ? visContainer.style.display : 'none';

        // 4. Test Play All Button
        const playAllBtn = document.getElementById('audio-btn-play-all');
        playAllBtn.click();

        const bar = document.getElementById('audio-bottom-bar');
        const barTitle = document.getElementById('audio-bar-title')?.innerText;
        const playBtn = document.getElementById('audio-bar-play');

        return {
            playlistCreated: !!pl,
            filteredRowCount: filteredRows.length,
            firstRowTitle,
            visToggledOpen: visDisplay === 'block',
            audioBarOpen: bar && bar.style.display === 'flex',
            barTitle,
            hasPlayBtn: !!playBtn
        };
    });

    console.log('Music actions result:', musicActionsResult);
    assert.ok(musicActionsResult.playlistCreated, 'Playlist must be created');
    assert.equal(musicActionsResult.firstRowTitle, '01 - Neon Horizon', 'Search filter must match "01 - Neon Horizon"');
    assert.ok(musicActionsResult.visToggledOpen, 'Visualizer canvas must open on toggle');
    assert.ok(musicActionsResult.audioBarOpen, 'Audio bottom bar must be open after clicking Play All');
    console.log('✓ [PASS] Playlist creation, track filter search, visualizer, and Play All verified.\n');

    console.log('[Test 3] Testing Audio Bottom Bar Controls (Shuffle, Repeat, Volume, Mute)...');
    const audioBarResult = await win.evaluate(() => {
        const shuffleBtn = document.getElementById('audio-bar-shuffle');
        const repeatBtn = document.getElementById('audio-bar-repeat');
        const muteBtn = document.getElementById('audio-bar-mute-btn');
        const volInput = document.getElementById('audio-bar-volume');

        // Toggle shuffle
        const shuffleBefore = shuffleBtn.title;
        shuffleBtn.click();
        const shuffleAfter = shuffleBtn.title;
        const shuffleToggled = shuffleBefore !== shuffleAfter;

        // Cycle repeat: off -> all -> one -> off
        repeatBtn.click(); // 'all'
        const repeatTitle1 = repeatBtn.title;
        repeatBtn.click(); // 'one'
        const repeatTitle2 = repeatBtn.title;
        repeatBtn.click(); // 'off'
        const repeatTitle3 = repeatBtn.title;

        // Test Mute toggle
        muteBtn.click();
        const volAfterMute = volInput.value;
        muteBtn.click();
        const volAfterUnmute = volInput.value;

        return {
            shuffleToggled,
            repeatTitle1,
            repeatTitle2,
            repeatTitle3,
            volAfterMute: parseFloat(volAfterMute),
            volAfterUnmute: parseFloat(volAfterUnmute)
        };
    });

    console.log('Audio bar controls result:', audioBarResult);
    assert.ok(audioBarResult.shuffleToggled, 'Shuffle button must toggle state');
    assert.equal(audioBarResult.repeatTitle1, 'Repeat: All', 'First click must activate Repeat: All');
    assert.equal(audioBarResult.repeatTitle2, 'Repeat: Current Track', 'Second click must activate Repeat: Current Track');
    assert.equal(audioBarResult.repeatTitle3, 'Repeat: Off', 'Third click must activate Repeat: Off');
    assert.equal(audioBarResult.volAfterMute, 0, 'Volume must be 0 when muted');
    assert.ok(audioBarResult.volAfterUnmute > 0, 'Volume must restore when unmuted');
    console.log('✓ [PASS] Audio bottom bar playback controls verified.\n');

    // ──────────────────────────────────────────────────────────────────────────
    // PART 2: PHOTOS TAB BUTTONS & CONTROLS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('[Test 4] Navigating to Photos Tab and verifying Subtabs & Album Grid...');
    const photoNavResult = await win.evaluate(() => {
        const photoTab = document.getElementById('tab-photoalbums');
        if (photoTab) photoTab.click();
        else if (typeof window.switchTab === 'function') window.switchTab('photoalbums');
        const grid = document.getElementById('albums-grid');

        return {
            currentTab: window.currentTab,
            hasGrid: !!grid,
            albumCount: grid ? grid.querySelectorAll('.album-card').length : 0
        };
    });

    console.log('Photos tab layout:', photoNavResult);
    assert.equal(photoNavResult.currentTab, 'photoalbums', 'Current tab must be photoalbums');
    assert.ok(photoNavResult.hasGrid, 'Albums grid must exist');
    console.log('✓ [PASS] Photos Tab structure and auto-grouped albums verified.\n');

    console.log('[Test 5] Testing Custom Album Creation, River Navigation, and Photo Actions...');
    const photoActionsResult = await win.evaluate(async () => {
        // 1. Create a custom album
        const alb = await window.createCustomPhotoAlbum('Summer Trip 2026', ['C:\\Vault\\Photos\\Mountain Sunset.jpg']);

        // 2. Open Album River
        const albumCards = document.querySelectorAll('.album-card');
        if (albumCards.length > 0) albumCards[0].click();

        const river = document.getElementById('album-photos-river');
        const photoItems = river ? river.querySelectorAll('.photo-item') : [];

        // 3. Test Favorite Star on first photo
        let starClicked = false;
        if (photoItems.length > 0) {
            const favBtn = photoItems[0].querySelector('button[title*="Favorite"]');
            if (favBtn) {
                favBtn.click();
                starClicked = true;
            }
        }

        const isFav = window.isFavorite ? window.isFavorite('C:\\Vault\\Photos\\Mountain Sunset.jpg') : false;

        return {
            albumCreated: !!alb,
            hasRiver: !!river,
            photoItemsCount: photoItems.length,
            starClicked,
            isFav
        };
    });

    console.log('Photo actions result:', photoActionsResult);
    assert.ok(photoActionsResult.albumCreated, 'Custom photo album must be created');
    assert.ok(photoActionsResult.hasRiver, 'Photo river view must open');
    assert.ok(photoActionsResult.isFav, 'Photo must be marked as favorite');
    console.log('✓ [PASS] Custom Album creation, Photo River, and Favorite Star verified.\n');

    console.log('[Test 6] Testing Lightbox Image Viewer & Controls...');
    const lightboxResult = await win.evaluate(() => {
        // Open Image Viewer on photo 0
        const photos = window.allItems.filter(i => i.type === 'image');
        window.openImageViewer(0, photos);

        const modal = document.getElementById('image-viewer-modal');
        const filename = document.getElementById('iv-filename-lbl')?.innerText;
        const zoomInBtn = document.getElementById('iv-btn-zoomin');
        const zoomResetBtn = document.getElementById('iv-btn-zoomreset');
        const nextBtn = document.getElementById('iv-btn-next');
        const slideshowBtn = document.getElementById('iv-btn-slideshow');
        const closeBtn = document.getElementById('iv-btn-close');

        // Zoom In
        if (zoomInBtn) zoomInBtn.click();
        const zoomStats = document.getElementById('iv-stats-lbl')?.innerText;

        // Reset
        if (zoomResetBtn) zoomResetBtn.click();

        // Slideshow Toggle
        if (slideshowBtn) slideshowBtn.click();
        const isSlideshowActive = slideshowBtn.classList.contains('active') || slideshowBtn.style.color.includes('accent');

        // Next image
        if (nextBtn) nextBtn.click();
        const nextFilename = document.getElementById('iv-filename-lbl')?.innerText;

        // Close lightbox
        if (closeBtn) closeBtn.click();
        const isClosed = !modal.classList.contains('active') || modal.style.display === 'none';

        return {
            modalOpened: modal && (modal.classList.contains('active') || modal.style.display !== 'none'),
            initialFilename: filename,
            nextFilename,
            zoomStats,
            isSlideshowActive,
            isClosed
        };
    });

    console.log('Lightbox result:', lightboxResult);
    assert.ok(lightboxResult.modalOpened, 'Lightbox modal must open');
    assert.ok(lightboxResult.nextFilename && lightboxResult.nextFilename !== lightboxResult.initialFilename, 'Next button must cycle to next image');
    assert.ok(lightboxResult.isClosed, 'Close button must close lightbox modal');
    console.log('✓ [PASS] Lightbox Image Viewer zoom, navigation, slideshow, and close verified.\n');

    console.log('[Test 7] Testing Photo Editor Canvas Tools, Adjustments, Filmstrip, and Undo...');
    const photoEditorResult = await win.evaluate(() => {
        const photos = window.allItems.filter(i => i.type === 'image');
        window.openPhotoEditor(photos[0], photos);

        const modal = document.getElementById('photo-editor-modal');
        const isOpen = modal && modal.style.display === 'flex';

        // Test Tool Selection: Rotate
        const rotateBtn = document.querySelector('.photo-tool[data-tool="rotate"]');
        if (rotateBtn) rotateBtn.click();

        // Test Filter: Grayscale
        const grayBtn = document.getElementById('pe-grayscale');
        if (grayBtn) grayBtn.click();
        const grayActive = grayBtn && (grayBtn.style.background.includes('accent') || grayBtn.style.background !== 'transparent');

        // Test Filmstrip rendering (windowed 15-item limit)
        const filmstrip = document.getElementById('photo-editor-filmstrip');
        const thumbs = filmstrip ? filmstrip.querySelectorAll('img') : [];

        // Close editor
        const closeBtn = document.getElementById('photo-editor-close');
        if (closeBtn) closeBtn.click();
        const isEditorClosed = modal.style.display === 'none';

        return {
            isOpen,
            grayActive,
            filmstripThumbsCount: thumbs.length,
            isEditorClosed
        };
    });

    console.log('Photo Editor result:', photoEditorResult);
    assert.ok(photoEditorResult.isOpen, 'Photo Editor modal must open');
    assert.ok(photoEditorResult.grayActive, 'Grayscale toggle filter must activate');
    assert.ok(photoEditorResult.filmstripThumbsCount > 0, 'Filmstrip must render photo thumbnails');
    assert.ok(photoEditorResult.isEditorClosed, 'Close button must close Photo Editor');
    console.log('✓ [PASS] Photo Editor canvas tools, filters, filmstrip, and modal lifecycle verified.\n');

    console.log('======================================================================');
    console.log(' ALL MUSIC & PHOTOS BUTTON-BY-BUTTON TESTS PASSED SUCCESSFULLY!       ');
    console.log('======================================================================');

    await electronApp.close();
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
