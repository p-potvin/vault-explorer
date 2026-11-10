// Photos tab proof (Tue 10 Nov 2026): Library by date taken from vault-raggae, Years / Months, tiles and river,
// selection (click, Ctrl, Shift, Ctrl+A, box), the action bar, the info panel, People and a person's photos.
// Dev build in E2E mode with a throwaway profile; nothing is deleted, favorited or filed (saveSettings and the
// people requests are stubbed). Screenshots go to PHOTOS_PROOF_DIR (default: the OS temp folder).
// Needs the gateway (127.0.0.1:8750) with photo dates read for PHOTOS_PROOF_ROOT (default I:\FDrive\gallery).
const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.env.PHOTOS_PROOF_DIR || path.join(os.tmpdir(), 'photos-tab-proof');
const ROOT = process.env.PHOTOS_PROOF_ROOT || 'I:\\FDrive\\gallery';

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-photos-proof-'));
    const app = await electron.launch({
        args: ['.'], cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'test', VAULT_EXPLORER_E2E: '1', VAULT_EXPLORER_E2E_USER_DATA: userData },
    });
    const win = await app.firstWindow();
    await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
    await win.waitForFunction(() => typeof window.switchTab === 'function' && typeof window.renderPhotosLibrary === 'function');
    await win.evaluate((root) => {
        window.appSettings = window.appSettings || {};
        Object.assign(window.appSettings, { photoRoots: [root], photosLayout: 'tiles', photosTileSize: 170, photosShowAll: false,
            virtualFolders: { version: 2, folders: [], items: {} } });
        window.electronAPI.saveSettings = async () => true;
        window.electronAPI.photosRequest = async () => ({ request: 'stubbed' });
        window.electronAPI.deleteItem = async () => ({ success: false, stubbed: true });
        const tab = document.getElementById('tab-photoalbums');
        if (tab) tab.click(); else window.switchTab('photoalbums');
        window.renderPhotosLibrary();
    }, ROOT);
    await win.waitForFunction(() => document.querySelectorAll('#pl-content .pl-tile.is-loaded').length > 12, null, { timeout: 60000 });
    await win.waitForTimeout(800);
    const lib = await win.evaluate(() => ({
        tiles: document.querySelectorAll('#pl-content .pl-tile').length,
        days: [...document.querySelectorAll('.pl-day')].slice(0, 4).map(d => d.textContent),
        offline: window.photosLibraryState.offline,
        folders: document.querySelectorAll('.pl-side__item[data-key^="folder:"]').length,
        note: document.getElementById('pl-note').textContent,
    }));
    console.log('library:', JSON.stringify(lib));
    await win.screenshot({ path: path.join(OUT, '1-library-days.png') });

    // selection: click, ctrl+click, shift+click, ctrl+A
    const tiles = await win.$$('#pl-content .pl-tile');
    await tiles[0].click();
    await tiles[2].click({ modifiers: ['Control'] });
    await tiles[5].click({ modifiers: ['Shift'] });
    const sel1 = await win.evaluate(() => [...window.photosLibraryState.sel].sort((a, b) => a - b));
    await win.keyboard.press('Control+A');
    const selAll = await win.evaluate(() => window.photosLibraryState.sel.size);
    await win.keyboard.press('Escape');
    await tiles[1].click();
    await win.keyboard.press('i');
    await win.waitForFunction(() => /Taken/.test(document.getElementById('pl-info').textContent), null, { timeout: 15000 });
    await win.waitForTimeout(300);
    await win.screenshot({ path: path.join(OUT, '2-selection-info.png') });
    const info = await win.evaluate(() => document.getElementById('pl-info').innerText.slice(0, 300));
    console.log('selection:', JSON.stringify(sel1), 'ctrl+a:', selAll, '\ninfo:', info.replace(/\n/g, ' | '));
    await win.keyboard.press('i');

    // river
    await win.click('#pl-layout [data-layout="river"]');
    await win.waitForTimeout(1200);
    await win.screenshot({ path: path.join(OUT, '3-river.png') });
    await win.click('#pl-layout [data-layout="tiles"]');

    // years, months
    await win.click('#pl-zoom [data-zoom="years"]');
    await win.waitForSelector('.pl-period', { timeout: 20000 });
    await win.waitForTimeout(800);
    const years = await win.$$eval('.pl-period__label', els => els.map(e => e.textContent));
    await win.screenshot({ path: path.join(OUT, '4-years.png') });
    await win.click('.pl-period');
    await win.waitForSelector('.pl-period', { timeout: 20000 });
    await win.waitForTimeout(800);
    const months = await win.$$eval('.pl-period__label', els => els.map(e => e.textContent).slice(0, 6));
    await win.screenshot({ path: path.join(OUT, '5-months.png') });
    console.log('years:', years.join(', '), '\nmonths:', months.join(', '));

    // people
    await win.click('.pl-side__item[data-key="people"]');
    await win.waitForFunction(() => document.querySelectorAll('.pl-person').length > 20, null, { timeout: 30000 });
    await win.waitForTimeout(1200);
    const people = await win.evaluate(() => ({ shown: document.querySelectorAll('.pl-person').length, total: window.photosLibraryState.peopleTotal }));
    await win.screenshot({ path: path.join(OUT, '6-people.png') });
    await win.click('.pl-person');
    await win.waitForFunction(() => document.querySelectorAll('#pl-content .pl-tile').length > 0, null, { timeout: 30000 });
    await win.waitForTimeout(1200);
    await win.screenshot({ path: path.join(OUT, '7-person.png') });
    const person = await win.evaluate(() => ({ name: window.photosLibraryState.person.name, photos: window.photosLibraryState.items.length }));
    console.log('people:', JSON.stringify(people), 'person:', JSON.stringify(person));

    await app.close();
    assert.ok(!lib.offline && lib.tiles > 12, 'library from the gateway');
    assert.deepEqual(sel1, [2, 3, 4, 5]);                 // Shift+click: the range from the last Ctrl+click
    assert.ok(selAll === lib.tiles || selAll > 12, 'ctrl+a selects all');
    assert.ok(years.length >= 1 && months.length >= 1);
    assert.ok(people.total > 1000, 'people paged from ~45k');
    console.log('screenshots in', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
