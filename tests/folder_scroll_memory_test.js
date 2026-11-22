const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function makeMediaFiles(dir, prefix, count, ext = '.mp4') {
    fs.mkdirSync(dir, { recursive: true });
    const paths = [];
    for (let i = 1; i <= count; i++) {
        const p = path.join(dir, `${prefix}_${String(i).padStart(3, '0')}${ext}`);
        fs.writeFileSync(p, '');
        paths.push(p);
    }
    return paths;
}

async function waitForDirectoryIdle(win) {
    await win.waitForFunction(() => {
        const loading = document.getElementById('loading');
        return (!loading || getComputedStyle(loading).display === 'none') && !window._isRestoringScroll;
    }, null, { timeout: 15000 });
    await win.waitForTimeout(150);
}

async function scrollMainAreaTo(win, targetTop) {
    const actual = await win.evaluate((y) => {
        const area = document.getElementById('main-area');
        area.scrollTop = y;
        area.dispatchEvent(new Event('scroll'));
        return area.scrollTop;
    }, targetTop);
    await win.waitForTimeout(150);
    return actual;
}

async function run() {
    console.log('=== VAULT EXPLORER: FOLDER SCROLL MEMORY (SESSION-ONLY) REGRESSION ===\n');

    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 've-scroll-test-'));
    const dirA = path.join(tmpBase, 'FolderA');
    const dirB = path.join(tmpBase, 'FolderB');
    const photoRoot = path.join(tmpBase, 'PhotosRoot');
    const photoDir1 = path.join(photoRoot, 'Photos1');
    const photoDir2 = path.join(photoRoot, 'Photos2');
    const userDataDir = path.join(tmpBase, 'userData');

    const filesA = makeMediaFiles(dirA, 'clipA', 75, '.mp4');
    const filesB = makeMediaFiles(dirB, 'clipB', 75, '.mp4');
    const photos1 = makeMediaFiles(photoDir1, 'pic1', 60, '.jpg');
    const photos2 = makeMediaFiles(photoDir2, 'pic2', 60, '.jpg');

    let colAId = null;
    let colBId = null;
    let dirAScroll = 0;
    let dirBScroll = 0;
    let colAScroll = 0;
    let colBScroll = 0;

    // ── SESSION 1: Verify per-folder scroll memory during a single session ───
    console.log('[Session 1] Launching Electron and testing cross-folder scroll memory...');
    const app1 = await electron.launch({
        cwd: rootDir,
        args: ['.'],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            VAULT_EXPLORER_E2E: '1',
            VAULT_EXPLORER_E2E_USER_DATA: userDataDir,
        },
    });

    try {
        const win = await app1.firstWindow();
        const pageErrors = [];
        win.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

        await win.setViewportSize({ width: 1280, height: 760 }).catch(() => {});
        await win.waitForLoadState('domcontentloaded');
        await win.waitForFunction(() => typeof window.loadDirectory === 'function' && typeof window.navigateTo === 'function');

        // 1. Load dirA and scroll deep (past first page of 50 cards)
        await win.evaluate((target) => window.loadDirectory('root', target, false), dirA);
        await win.waitForFunction(() => document.querySelectorAll('#file-grid .file-card').length >= 50, null, { timeout: 15000 });
        await waitForDirectoryIdle(win);

        // Trigger renderMore if needed so scrollTop=900 is achievable
        await win.evaluate(() => {
            const area = document.getElementById('main-area');
            area.scrollTop = area.scrollHeight;
            area.dispatchEvent(new Event('scroll'));
        });
        await win.waitForTimeout(150);
        dirAScroll = await scrollMainAreaTo(win, 900);
        assert.ok(dirAScroll >= 600, `dirA should scroll deeply (got ${dirAScroll})`);
        const dirARenderedBefore = await win.evaluate(() => window.currentlyRendered);
        console.log(`  -> dirA scrolled to ${dirAScroll}px (rendered=${dirARenderedBefore}) [PASS]`);

        // 2. Create Col Alpha & Col Beta virtual folders
        const created = await win.evaluate(({ aFiles, bFiles }) => {
            const c1 = window.vf.create({ name: 'Col Alpha', type: 'collection' });
            const c2 = window.vf.create({ name: 'Col Beta', type: 'collection' });
            window.vf.addItems(c1.folder.id, aFiles.slice(0, 70));
            window.vf.addItems(c2.folder.id, bFiles.slice(0, 70));
            return { colAId: c1.folder.id, colBId: c2.folder.id };
        }, { aFiles: filesA, bFiles: filesB });
        colAId = created.colAId;
        colBId = created.colBId;

        // 3. Switch to Collections subtab (short list -> scroll 0), then into Col Alpha
        await win.evaluate(() => window.switchFilesSubtab('collections'));
        await waitForDirectoryIdle(win);
        assert.equal(await win.evaluate(() => document.getElementById('main-area').scrollTop), 0, 'Collections subtab starts at top');

        await win.evaluate(({ id, real }) => window.navigateTo(id, real), { id: colAId, real: dirA });
        await win.waitForFunction(() => document.querySelectorAll('#file-grid .file-card').length >= 50, null, { timeout: 15000 });
        await waitForDirectoryIdle(win);
        assert.equal(await win.evaluate(() => document.getElementById('main-area').scrollTop), 0, 'Col Alpha starts at top');

        colAScroll = await scrollMainAreaTo(win, 550);
        assert.ok(colAScroll >= 400, `Col Alpha should scroll cleanly (got ${colAScroll})`);
        console.log(`  -> Col Alpha scrolled to ${colAScroll}px [PASS]`);

        // 4. Switch to Col Beta -> starts at 0, scroll to 300
        await win.evaluate(({ id, real }) => window.navigateTo(id, real), { id: colBId, real: dirA });
        await win.waitForFunction(() => document.querySelectorAll('#file-grid .file-card').length >= 50, null, { timeout: 15000 });
        await waitForDirectoryIdle(win);
        assert.equal(await win.evaluate(() => document.getElementById('main-area').scrollTop), 0, 'Col Beta starts at top');

        colBScroll = await scrollMainAreaTo(win, 300);
        assert.ok(colBScroll >= 200, `Col Beta should scroll cleanly (got ${colBScroll})`);
        console.log(`  -> Col Beta scrolled to ${colBScroll}px [PASS]`);

        // 5. Switch back to Col Alpha -> restores colAScroll
        await win.evaluate(({ id, real }) => window.navigateTo(id, real), { id: colAId, real: dirA });
        await waitForDirectoryIdle(win);
        const restoredColA = await win.evaluate(() => document.getElementById('main-area').scrollTop);
        assert.ok(
            Math.abs(restoredColA - colAScroll) <= 5,
            `Expected Col Alpha scroll ~${colAScroll}, got ${restoredColA}`
        );
        console.log(`  -> Switched back to Col Alpha -> restored ${restoredColA}px [PASS]`);

        // 6. Switch to All Files subtab -> restores dirA deep scroll & rendered count (not wiped by Collections)
        await win.evaluate(() => window.switchFilesSubtab('all'));
        await waitForDirectoryIdle(win);
        const restoredDirAFromCol = await win.evaluate(() => ({
            scrollTop: document.getElementById('main-area').scrollTop,
            rendered: window.currentlyRendered,
        }));
        assert.ok(
            Math.abs(restoredDirAFromCol.scrollTop - dirAScroll) <= 5,
            `Expected All Files (dirA) scroll ~${dirAScroll}, got ${restoredDirAFromCol.scrollTop}`
        );
        assert.ok(
            restoredDirAFromCol.rendered >= dirARenderedBefore,
            `Expected rendered count >= ${dirARenderedBefore}, got ${restoredDirAFromCol.rendered}`
        );
        console.log(`  -> Switched back to All Files (dirA) -> restored ${restoredDirAFromCol.scrollTop}px (rendered=${restoredDirAFromCol.rendered}) [PASS]`);

        // 7. Load dirB (a completely different real folder) -> starts at 0, scroll to 450
        await win.evaluate((target) => window.loadDirectory('root', target, false), dirB);
        await win.waitForFunction((expectedPrefix) => {
            const first = document.querySelector('#file-grid .file-card');
            return first && (first.title || '').startsWith(expectedPrefix);
        }, 'clipB', { timeout: 15000 });
        await waitForDirectoryIdle(win);
        assert.equal(await win.evaluate(() => document.getElementById('main-area').scrollTop), 0, 'dirB must start at 0');

        dirBScroll = await scrollMainAreaTo(win, 450);
        assert.ok(dirBScroll >= 300, `dirB should scroll cleanly (got ${dirBScroll})`);
        console.log(`  -> dirB scrolled to ${dirBScroll}px [PASS]`);

        // 8. Switch back to dirA via loadDirectory('root', dirA) -> restores dirAScroll
        await win.evaluate((target) => window.loadDirectory('root', target, false), dirA);
        await win.waitForFunction((expectedPrefix) => {
            const first = document.querySelector('#file-grid .file-card');
            return first && (first.title || '').startsWith(expectedPrefix);
        }, 'clipA', { timeout: 15000 });
        await waitForDirectoryIdle(win);
        const restoredDirA = await win.evaluate(() => document.getElementById('main-area').scrollTop);
        assert.ok(
            Math.abs(restoredDirA - dirAScroll) <= 5,
            `Expected dirA scroll ~${dirAScroll}, got ${restoredDirA}`
        );
        console.log(`  -> Switched back to dirA -> restored ${restoredDirA}px [PASS]`);

        // 9. Switch back to dirB -> restores dirBScroll
        await win.evaluate((target) => window.loadDirectory('root', target, false), dirB);
        await win.waitForFunction((expectedPrefix) => {
            const first = document.querySelector('#file-grid .file-card');
            return first && (first.title || '').startsWith(expectedPrefix);
        }, 'clipB', { timeout: 15000 });
        await waitForDirectoryIdle(win);
        const restoredDirB = await win.evaluate(() => document.getElementById('main-area').scrollTop);
        assert.ok(
            Math.abs(restoredDirB - dirBScroll) <= 5,
            `Expected dirB scroll ~${dirBScroll}, got ${restoredDirB}`
        );
        console.log(`  -> Switched back to dirB -> restored ${restoredDirB}px [PASS]`);

        // 10. Photos tab sidebar folders session scroll memory
        await app1.evaluate(({ ipcMain }, { pDir2, p1List, p2List }) => {
            ipcMain.removeHandler('photos-get');
            ipcMain.handle('photos-get', (_e, route, params) => {
                if (route === '/v1/photos/library') {
                    const r = (params && params.roots) || '';
                    const src = r.toLowerCase() === pDir2.toLowerCase() ? p2List : p1List;
                    return {
                        items: src.map((p, idx) => ({
                            path: p,
                            taken: `2026-10-${String((idx % 28) + 1).padStart(2, '0')}T12:00:00`,
                            width: 800,
                            height: 600,
                        })),
                        next: null,
                    };
                }
                return null;
            });
        }, { pDir2: photoDir2, p1List: photos1, p2List: photos2 });

        await win.evaluate((pRoot) => {
            window.appSettings.photoRoots = [pRoot];
            window.photosLibraryState.folders = null;
            window.switchTab('photoalbums');
        }, photoRoot);

        const photo1Item = win.locator('.pl-side__item').filter({ hasText: 'Photos1' });
        const photo2Item = win.locator('.pl-side__item').filter({ hasText: 'Photos2' });
        await photo1Item.waitFor({ state: 'visible', timeout: 10000 });

        await photo1Item.click();
        await win.waitForFunction(() => document.querySelectorAll('#pl-content .pl-tile').length === 60, null, { timeout: 10000 });
        const photo1Scroll = await win.evaluate(() => {
            const s = document.getElementById('pl-scroll');
            s.scrollTop = 320;
            s.dispatchEvent(new Event('scroll'));
            return s.scrollTop;
        });
        assert.ok(photo1Scroll >= 200, `Photos folder 1 should scroll (got ${photo1Scroll})`);

        await photo2Item.click();
        await win.waitForFunction((dir2) => (window.photosLibraryState.folder || '').toLowerCase() === dir2.toLowerCase() && document.querySelectorAll('#pl-content .pl-tile').length === 60, photoDir2, { timeout: 10000 });
        await win.waitForTimeout(100);
        assert.equal(await win.evaluate(() => document.getElementById('pl-scroll').scrollTop), 0, 'Photos folder 2 starts at 0');

        const photo2Scroll = await win.evaluate(() => {
            const s = document.getElementById('pl-scroll');
            s.scrollTop = 180;
            s.dispatchEvent(new Event('scroll'));
            return s.scrollTop;
        });
        assert.ok(photo2Scroll >= 120, `Photos folder 2 should scroll (got ${photo2Scroll})`);

        await photo1Item.click();
        await win.waitForFunction((dir1) => (window.photosLibraryState.folder || '').toLowerCase() === dir1.toLowerCase() && document.querySelectorAll('#pl-content .pl-tile').length === 60, photoDir1, { timeout: 10000 });
        await win.waitForTimeout(150);
        const restoredPhoto1 = await win.evaluate(() => document.getElementById('pl-scroll').scrollTop);
        assert.ok(
            Math.abs(restoredPhoto1 - photo1Scroll) <= 5,
            `Expected Photos folder 1 scroll ~${photo1Scroll}, got ${restoredPhoto1}`
        );

        await photo2Item.click();
        await win.waitForFunction((dir2) => (window.photosLibraryState.folder || '').toLowerCase() === dir2.toLowerCase() && document.querySelectorAll('#pl-content .pl-tile').length === 60, photoDir2, { timeout: 10000 });
        await win.waitForTimeout(150);
        const restoredPhoto2 = await win.evaluate(() => document.getElementById('pl-scroll').scrollTop);
        assert.ok(
            Math.abs(restoredPhoto2 - photo2Scroll) <= 5,
            `Expected Photos folder 2 scroll ~${photo2Scroll}, got ${restoredPhoto2}`
        );
        console.log(`  -> Photos sidebar folders restored (${restoredPhoto1}px / ${restoredPhoto2}px) [PASS]`);

        // 11. Verify vault-settings.json never persisted scrollPositions
        const settingsPath = path.join(userDataDir, 'vault-settings.json');
        if (fs.existsSync(settingsPath)) {
            const diskSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            assert.equal(diskSettings.scrollPositions, undefined, 'vault-settings.json must NOT persist scrollPositions');
        }
        assert.deepEqual(pageErrors, [], `Unexpected page errors in Session 1: ${pageErrors.join(' | ')}`);
        console.log('✓ [PASS] Session 1 cross-folder scroll memory & no-persistence verified.\n');
    } finally {
        await app1.close();
    }

    // ── SESSION 2: Reopen app and assert ALL saved scroll positions are forgotten ──
    console.log('[Session 2] Reopening app with same userData and verifying all scroll positions are forgotten...');
    const settingsPath = path.join(userDataDir, 'vault-settings.json');
    const existingSettings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
    existingSettings.scrollPositions = {
        root: 999,
        [`dir:${dirA.replace(/\\/g, '/').toLowerCase()}`]: 888,
        [`vf:${colAId}`]: 777,
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf8');

    const app2 = await electron.launch({
        cwd: rootDir,
        args: ['.'],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            VAULT_EXPLORER_E2E: '1',
            VAULT_EXPLORER_E2E_USER_DATA: userDataDir,
        },
    });

    try {
        const win = await app2.firstWindow();
        const pageErrors = [];
        win.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

        await win.setViewportSize({ width: 1280, height: 760 }).catch(() => {});
        await win.waitForLoadState('domcontentloaded');
        await win.waitForFunction(() => typeof window.loadDirectory === 'function' && typeof window.navigateTo === 'function');
        await win.waitForTimeout(300);

        const startupState = await win.evaluate(() => ({
            scrollPositions: window.scrollPositions,
            settingsScrollPositions: window.appSettings && window.appSettings.scrollPositions,
        }));
        assert.deepEqual(startupState.scrollPositions, {}, 'window.scrollPositions must start empty on reopen');
        assert.equal(startupState.settingsScrollPositions, undefined, 'Legacy appSettings.scrollPositions must be discarded');

        for (const [label, fn, arg] of [
            ['dirA', (target) => window.loadDirectory('root', target, false), dirA],
            ['dirB', (target) => window.loadDirectory('root', target, false), dirB],
            ['Col Alpha', ({ id, real }) => window.navigateTo(id, real), { id: colAId, real: dirA }],
            ['Col Beta', ({ id, real }) => window.navigateTo(id, real), { id: colBId, real: dirA }],
        ]) {
            await win.evaluate(fn, arg);
            await win.waitForFunction(() => document.querySelectorAll('#file-grid .file-card').length >= 50, null, { timeout: 15000 });
            await waitForDirectoryIdle(win);
            const top = await win.evaluate(() => document.getElementById('main-area').scrollTop);
            assert.equal(top, 0, `${label} must open at scrollTop=0 after app reopen (got ${top})`);
            console.log(`  -> ${label} after reopen: scrollTop=${top} [PASS]`);
        }

        assert.deepEqual(pageErrors, [], `Unexpected page errors in Session 2: ${pageErrors.join(' | ')}`);
        console.log('✓ [PASS] Session 2 forgot all previous scroll positions cleanly.\n');
    } finally {
        await app2.close();
        fs.rmSync(tmpBase, { recursive: true, force: true });
    }

    console.log('ALL FOLDER SCROLL MEMORY REGRESSION TESTS PASSED.');
}

run().catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
