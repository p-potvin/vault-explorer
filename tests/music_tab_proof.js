// Music tab proof (Tue 10 Nov 2026): real songs from G:\Music, tags from vault-raggae, columns menu, sliding titles,
// spectrum, playlist covers. Runs the dev build in E2E mode with a throwaway profile; writes screenshots to
// MUSIC_PROOF_DIR (default: the OS temp folder). Plays a song for a few seconds only (no play is counted: that needs
// half the song). Needs the gateway (127.0.0.1:8750) for tags; without it, file names are shown.
const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.env.MUSIC_PROOF_DIR || path.join(os.tmpdir(), 'music-tab-proof');
const ROOT = process.env.MUSIC_PROOF_ROOT || 'G:\\Music';

function songsUnder(root, max) {
    const out = [];
    const walk = (dir) => {
        let ents = [];
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
        for (const e of ents) {
            if (out.length >= max) return;
            const p = path.join(dir, e.name);
            if (e.isDirectory() && !e.name.startsWith('.')) walk(p);
            else if (/\.(mp3|m4a|flac)$/i.test(e.name)) {
                const st = fs.statSync(p);
                out.push({ id: p, name: e.name, path: p, type: 'audio', size: st.size, mtime: st.mtimeMs,
                    folder: path.basename(path.dirname(path.dirname(p))) });
            }
        }
    };
    walk(root);
    return out;
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-music-proof-'));
    const app = await electron.launch({
        args: ['.'], cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'test', VAULT_EXPLORER_E2E: '1', VAULT_EXPLORER_E2E_USER_DATA: userData },
    });
    const win = await app.firstWindow();
    await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
    await win.waitForFunction(() => typeof window.switchTab === 'function' && typeof window.renderAudio === 'function');
    const songs = songsUnder(ROOT, 400);
    assert.ok(songs.length > 20, `songs under ${ROOT}`);

    await win.evaluate(async (items) => {
        window.allItems = items;
        window.appSettings = window.appSettings || {};
        window.appSettings.virtualFolders = { version: 2, folders: [], items: {} };
        window.appSettings.playlistCovers = {};
        window.appSettings.musicColumns = ['title', 'artist', 'album', 'track', 'year', 'genre', 'duration', 'plays', 'favorite'];
        window.electronAPI.saveSettings = async () => true;           // nothing written, even in the throwaway profile
        const tab = document.getElementById('tab-music');
        if (tab) tab.click(); else window.switchTab('music');
        window.renderAudio();
        if (window.vf) {
            const two = items.slice(0, 3).map(i => i.path);
            const pl = window.vf.create({ name: 'Late night', type: 'playlist' });
            if (pl.ok) window.vf.addItems(pl.folder.id, two);
        }
    }, songs);
    await win.waitForFunction(() => document.querySelectorAll('.audio-track-row').length > 10 &&
        [...document.querySelectorAll('.mt-cell--album .mt-text')].some(e => e.textContent.trim()), null, { timeout: 30000 });
    await win.waitForTimeout(600);

    const facts = await win.evaluate(() => {
        const rows = [...document.querySelectorAll('.audio-track-row')].slice(0, 400);
        const titles = rows.map(r => r.querySelector('.mt-cell--title .mt-text').textContent);
        return {
            rows: rows.length,
            numbered: titles.filter(t => /^\d{1,2}\.? /.test(t)),
            withAlbum: rows.filter(r => (r.querySelector('.mt-cell--album .mt-text') || {}).textContent).length,
            header: [...document.querySelectorAll('.mt-header .mt-cell')].map(e => e.textContent),
            cover: (document.querySelector('#audio-album-art .mt-cover') || {}).className,
            sideCovers: [...document.querySelectorAll('.mt-side__thumb .mt-cover')].map(e => e.className.replace('mt-cover', '').trim() || 'image').slice(0, 12),
        };
    });
    console.log(JSON.stringify(facts, null, 1));
    await win.screenshot({ path: path.join(OUT, '1-tracklist.png') });

    // sliding title
    const longRow = await win.evaluateHandle(() => [...document.querySelectorAll('.mt-cell--title')]
        .find(c => c.firstElementChild.scrollWidth > c.clientWidth + 4));
    if (longRow && (await longRow.evaluate(x => !!x))) {
        await longRow.hover();
        await win.waitForTimeout(1500);
        const slid = await longRow.evaluate(c => ({ cls: c.firstElementChild.className,
            shift: c.firstElementChild.style.getPropertyValue('--mt-shift'), transform: getComputedStyle(c.firstElementChild).transform }));
        console.log('long title on hover:', JSON.stringify(slid));
        await win.screenshot({ path: path.join(OUT, '2-slide.png') });
    }

    // columns menu
    const hdr = await win.$('.mt-header');
    await hdr.click({ button: 'right', position: { x: 200, y: 10 } });
    await win.waitForSelector('#audio-col-menu');
    await win.screenshot({ path: path.join(OUT, '3-columns-menu.png') });
    await win.mouse.click(5, 5);

    // spectrum: play the first song a few seconds
    await win.evaluate(() => { document.querySelector('.audio-track-row').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await win.waitForTimeout(1500);
    await win.click('#audio-btn-visualizer');
    await win.waitForTimeout(2500);
    const energy = await win.evaluate(() => {
        const an = window.getAudioAnalyser();
        const b = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(b);
        return b.reduce((a, v) => a + v, 0);
    });
    console.log('spectrum energy while playing:', energy);
    await win.screenshot({ path: path.join(OUT, '4-visualizer.png') });
    await win.evaluate(() => window.toggleAudioPlay());

    // a user playlist without pictures: abstract cover with its name
    await win.evaluate(() => { [...document.querySelectorAll('.mt-side')].find(d => d.textContent.includes('Late night')).click(); });
    await win.waitForTimeout(500);
    await win.screenshot({ path: path.join(OUT, '5-playlist-cover.png') });

    await app.close();
    assert.ok(energy > 0, 'the analyser hears the song');
    assert.equal(facts.numbered.length, 0, `titles still numbered: ${facts.numbered.slice(0, 5)}`);
    console.log('screenshots in', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
