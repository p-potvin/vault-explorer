const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const path = require('path');
const os = require('os');
const fs = require('fs');

async function runE2E() {
    console.log('================================================================');
    console.log(' E2E REAL REBOOT PERSISTENCE TEST: FAVORITES & VIRTUAL FOLDERS  ');
    console.log('================================================================\n');

    const appPath = 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer';
    const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 've-persist-userdata-'));
    const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 've-persist-vault-'));

    // Create real test files in the vault folder
    const sampleVideo1 = path.join(tempVaultDir, 'Interstellar_2014.mp4');
    const sampleVideo2 = path.join(tempVaultDir, 'The_Matrix_1999.mp4');
    const sampleVideo3 = path.join(tempVaultDir, 'Blade_Runner_2049.mp4');
    const samplePhoto = path.join(tempVaultDir, 'Mountain_View.jpg');
    const sampleAudio = path.join(tempVaultDir, 'Cyberpunk_Theme.mp3');
    fs.writeFileSync(sampleVideo1, 'dummy video payload 1');
    fs.writeFileSync(sampleVideo2, 'dummy video payload 2');
    fs.writeFileSync(sampleVideo3, 'dummy video payload 3');
    fs.writeFileSync(samplePhoto, 'dummy photo payload');
    fs.writeFileSync(sampleAudio, 'dummy audio payload');
    const sampleVideo = sampleVideo1;

    const screenshotPath = 'C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain\\d3cb581c-f3e8-4e5f-84e9-db64ecb69195\\favorites_reboot_verification.png';

    console.log('[SESSION 1] Launching Vault Explorer with clean user data...');
    let electronApp = await electron.launch({
        cwd: appPath,
        args: ['.', `--user-data-dir=${tempUserData}`],
        env: {
            ...process.env,
            VAULT_EXPLORER_E2E: '1',
            VAULT_EXPLORER_E2E_USER_DATA: tempUserData
        }
    });

    let win = await electronApp.firstWindow();
    await win.waitForTimeout(3000);
    for (const w of electronApp.windows()) {
        const title = await w.title();
        if (title.includes('Vault Explorer')) { win = w; break; }
    }

    console.log('[SESSION 1] Loading test vault directory in UI...');
    await win.evaluate((dir) => window.loadDirectory('root', dir), tempVaultDir);
    await win.waitForTimeout(1500);

    // Verify cards are loaded
    const cardCount = await win.locator('.file-card').count();
    console.log(`[SESSION 1] Rendered ${cardCount} file cards.`);
    assert.ok(cardCount >= 3, 'Expected at least 3 cards in directory');

    // 1. Star sampleVideo as favorite
    console.log('[SESSION 1] Toggling gold star on video item...');
    await win.evaluate((vPath) => window.toggleFavorite(vPath), sampleVideo);
    await win.waitForTimeout(500);

    const isFavInMem = await win.evaluate((vPath) => window.isFavorite(vPath), sampleVideo);
    assert.equal(isFavInMem, true, 'Video item should be marked as favorite in session 1');

    // 2. Create Virtual Folder and add item
    console.log('[SESSION 1] Creating collection "SciFi Best" and adding items...');
    const vfResult = await win.evaluate(({ folderName, filePath }) => {
        const res = window.vf.create({ name: folderName, type: 'collection' });
        if (!res.ok) return res;
        const addRes = window.vf.addItems(res.folder.id, [filePath]);
        return { ok: true, folderId: res.folder.id, addRes };
    }, { folderName: 'SciFi Best', filePath: sampleVideo });

    assert.ok(vfResult.ok, 'Failed to create virtual folder in session 1');
    assert.equal(vfResult.addRes.added, 1, 'Expected 1 item added to collection');

    // 3. Switch to Favorites Subtab
    console.log('[SESSION 1] Switching to Favorites subtab...');
    await win.evaluate(() => window.switchFilesSubtab('favorites'));
    await win.waitForTimeout(1000);

    const favCards = await win.locator('#favorites-grid .file-card').count();
    console.log(`[SESSION 1] Favorites grid cards count: ${favCards}`);
    assert.ok(favCards >= 1, 'Expected favorited card in favorites grid');

    // 4. Close Session 1 completely
    console.log('[SESSION 1] Closing application to test persistence through full reboot...');
    await electronApp.close();
    await new Promise(r => setTimeout(r, 2000));

    // Verify settings file on disk
    const settingsFile = path.join(tempUserData, 'vault-settings.json');
    assert.ok(fs.existsSync(settingsFile), 'vault-settings.json must exist on disk');
    const diskSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    console.log('[DISK AUDIT] Stored favorites:', diskSettings.favorites);
    console.log('[DISK AUDIT] Stored virtual folders count:', diskSettings.virtualFolders?.folders?.length);
    assert.ok(diskSettings.favorites && diskSettings.favorites.includes(sampleVideo), 'Settings on disk must contain the favorited video');
    assert.ok(diskSettings.virtualFolders && diskSettings.virtualFolders.folders.some(f => f.name === 'SciFi Best'), 'Settings on disk must contain the collection');

    // ── SESSION 2: REBOOT ───────────────────────────────────────────────────
    console.log('\n[SESSION 2 (REBOOT)] Launching application with existing user data...');
    electronApp = await electron.launch({
        cwd: appPath,
        args: ['.', `--user-data-dir=${tempUserData}`],
        env: {
            ...process.env,
            VAULT_EXPLORER_E2E: '1',
            VAULT_EXPLORER_E2E_USER_DATA: tempUserData
        }
    });

    win = await electronApp.firstWindow();
    await win.waitForTimeout(3000);
    for (const w of electronApp.windows()) {
        const title = await w.title();
        if (title.includes('Vault Explorer')) { win = w; break; }
    }

    console.log('[SESSION 2 (REBOOT)] Verifying state after app reload...');
    await win.evaluate((dir) => window.loadDirectory('root', dir), tempVaultDir);
    await win.waitForTimeout(1500);

    // Verify favorite status on reboot
    const isFavOnReboot = await win.evaluate((vPath) => window.isFavorite(vPath), sampleVideo);
    console.log(`[SESSION 2] window.isFavorite('${path.basename(sampleVideo)}') = ${isFavOnReboot}`);
    assert.equal(isFavOnReboot, true, 'Favorite state MUST persist across reboots');

    // Verify star UI on card
    const starFill = await win.evaluate((vPath) => {
        const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
        const card = Array.from(document.querySelectorAll('.file-card')).find(c => norm(c.dataset.path) === norm(vPath));
        if (!card) return null;
        const svg = card.querySelector('.star-svg');
        return svg ? svg.getAttribute('fill') : null;
    }, sampleVideo);
    console.log(`[SESSION 2] Gold star SVG fill attribute: "${starFill}"`);
    assert.equal(starFill, '#E5A93B', 'Card star SVG must have gold fill (#E5A93B) on reboot');

    // Verify virtual folder exists on reboot
    const vfList = await win.evaluate(() => window.vf.list({ type: 'collection' }));
    console.log(`[SESSION 2] Collections on reboot:`, vfList.map(f => f.name));
    assert.ok(vfList.some(f => f.name === 'SciFi Best'), 'Virtual folder must persist across reboots');

    const folderId = vfList.find(f => f.name === 'SciFi Best').id;
    const itemsInFolder = await win.evaluate((fid) => window.vf.itemsOf(fid), folderId);
    console.log(`[SESSION 2] Items inside collection on reboot:`, itemsInFolder);
    assert.equal(itemsInFolder.length, 1, 'Collection items must persist across reboots');
    assert.equal(itemsInFolder[0], sampleVideo);

    // Switch to Favorites tab on reboot and capture visual proof
    console.log('[SESSION 2] Navigating to Favorites tab...');
    await win.evaluate(() => window.switchFilesSubtab('favorites'));
    await win.waitForTimeout(1000);

    const rebootFavCards = await win.locator('#favorites-grid .file-card').count();
    console.log(`[SESSION 2] Favorites grid cards count on reboot: ${rebootFavCards}`);
    assert.ok(rebootFavCards >= 1, 'Favorites grid must render the favorited item after reboot');

    // Capture visual screenshot proof
    await win.screenshot({ path: screenshotPath });
    console.log(`[SESSION 2] Visual proof screenshot saved to ${screenshotPath}`);

    // Clean up
    await electronApp.close();
    try {
        fs.rmSync(tempUserData, { recursive: true, force: true });
        fs.rmSync(tempVaultDir, { recursive: true, force: true });
    } catch (_) {}

    console.log('\n================================================================');
    console.log(' ALL E2E REAL REBOOT PERSISTENCE TESTS PASSED SUCCESSFULLY!     ');
    console.log('================================================================\n');
}

runE2E().catch(err => {
    console.error('E2E Reboot Test Failed:', err);
    process.exit(1);
});
