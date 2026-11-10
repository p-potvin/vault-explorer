/* ==========================================================================
   Vault Explorer — Music Tab (Sidebar + Tracklist)

   Features:
     • Tags from vault-raggae (GET /v1/music/tracks): title without its track number, artist, album, track, year,
       genre, bitrate, picture; a song it does not know shows its cleaned file name
     • Plays / skips in each song's sidecar (`listening`), counted by the player (js/audio-bar.js)
     • Columns chosen with a right-click on the header (appSettings.musicColumns); long text slides on hover
     • Playlist covers: the user's picture, else the songs' pictures (one, or a 2x2 collage of four albums), else an
       abstract cover in their colours with the playlist's name
     • Visualizer: the playing song's spectrum (Web Audio analyser on the player)
     • Full Playlist CRUD; folder playlists + user virtual playlists (window.vf, type 'playlist'); drag and drop
     • Incremental chunk rendering (10,000+ tracks)
   ========================================================================== */

(function () {
    const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'aiff', 'ape']);
    const OLD_PLAYCOUNT_KEY = 'vault-play-counts';          // localStorage, until Tue 10 Nov 2026: moved to sidecars
    const CHUNK_SIZE = 100;
    const TRACK_PREFIX = /^(\d{1,2})\.? (.*)$/;
    const KEEP_NUMBER = new Set(['24 songs ft. vory']);       // vault-raggae's RAGGAE_MUSIC_TITLE_KEEP_NUMBER

    let selectedPlaylist = 'all';
    let sortBy = 'title';
    let sortDir = 1; // 1 asc, -1 desc
    let activeSortedTracks = [];
    let renderedCount = 0;
    let isScrollBound = false;
    let trackFilterTerm = '';
    let isVisualizerActive = false;
    let visualizerAnimId = null;

    function isAudioItem(item) {
        if (!item) return false;
        if (item.type === 'audio') return true;
        const ext = (item.ext || '').replace(/^\./, '').toLowerCase();
        if (AUDIO_EXTS.has(ext)) return true;
        const nameExt = (item.name || '').split('.').pop().toLowerCase();
        return AUDIO_EXTS.has(nameExt);
    }

    function getAudioItems() {
        const source = window.allItems || window.displayedItems || [];
        return source.filter(isAudioItem);
    }

    const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();

    // ── What each song says about itself (vault-raggae: GET /v1/music/tracks) ──
    // Title without its track number, artist, album, track, year, genre, bitrate, picture. Read once per folder;
    // a song the gateway does not know shows its file name, cleaned the same way (cleanTitle).
    const metaByPath = new Map();
    const metaLoaded = new Set();
    let metaLoading = null;

    /** Same rule as vault-raggae's app/music/meta.py clean_title, for a file name: "05 05 X", "07. X", "19 X". */
    function cleanTitle(stem) {
        let t = (stem || '').trim();
        let n = null;
        let m;
        while ((m = TRACK_PREFIX.exec(t)) && !KEEP_NUMBER.has(t.toLowerCase())) {
            const k = parseInt(m[1], 10);
            const prefix = t.slice(0, t.length - m[2].length).trim();
            const doubled = (() => { const d = TRACK_PREFIX.exec(m[2]); return !!d && parseInt(d[1], 10) === k; })();
            if (n !== null) { if (k !== n) break; }
            else if (!(prefix.startsWith('0') || prefix.endsWith('.') || prefix.length === 2 || doubled)) break;
            n = k;
            t = m[2].trim();
        }
        return { title: t || stem, track: n };
    }

    function musicTitleOf(item) {
        if (!item) return '';
        if (item.title) return item.title;
        return cleanTitle((item.name || '').replace(/\.[^.]+$/, '')).title;
    }
    window.musicTitleOf = musicTitleOf;
    window.musicCleanTitle = cleanTitle;

    function applyMeta(item) {
        const m = metaByPath.get(norm(item.path));
        if (m) {
            for (const k of ['title', 'artist', 'album', 'album_artist', 'track', 'track_total', 'disc', 'year', 'genre',
                'composer', 'bitrate', 'codec', 'sample_rate', 'channels', 'artFile', 'colors', 'vw_id']) {
                if (m[k] !== undefined && m[k] !== null) item[k] = m[k];
            }
            if (m.duration && !item.duration) item.duration = m.duration;
        } else if (item.track === undefined) {
            const c = cleanTitle((item.name || '').replace(/\.[^.]+$/, ''));
            if (c.track !== null) item.track = c.track;
        }
        const l = listening.get(norm(item.path));
        item.plays = (l && l.plays) || 0;
        item.skips = (l && l.skips) || 0;
        item.last_played = (l && l.last_played) || null;
    }

    function commonFolder(items) {
        const dirs = items.map(i => (i.path || '').replace(/\//g, '\\').replace(/\\[^\\]*$/, ''));
        if (!dirs.length) return '';
        let pre = dirs[0];
        for (const d of dirs) {
            while (pre && !(d.toLowerCase() + '\\').startsWith(pre.toLowerCase() + '\\')) pre = pre.replace(/\\?[^\\]*$/, '');
        }
        return pre;
    }

    async function loadMeta(items) {
        const api = window.electronAPI || {};
        const folder = commonFolder(items);
        const key = folder.toLowerCase() + '|' + items.length;
        if (!items.length || metaLoaded.has(key) || metaLoading) return false;
        metaLoaded.add(key);
        metaLoading = (async () => {
            await importOldPlayCounts();
            if (typeof api.musicTracks === 'function') {
                const res = await api.musicTracks(folder);
                ((res && res.items) || []).forEach(m => metaByPath.set(norm(m.path), m));
            }
            if (typeof api.musicListening === 'function') {
                const paths = items.map(i => i.path);
                for (let i = 0; i < paths.length; i += 500) {
                    const got = await api.musicListening(paths.slice(i, i + 500));
                    Object.entries(got || {}).forEach(([p, l]) => listening.set(norm(p), l));
                }
            }
        })().catch(e => console.warn('[music] tags / plays unavailable:', e.message)).finally(() => { metaLoading = null; });
        await metaLoading;
        return true;
    }

    // ── Plays (the song's sidecar, `listening`; counted by the player, js/audio-bar.js) ──
    const listening = new Map();
    window.addEventListener('vault-music-listening', (e) => {
        const { path, listening: l } = e.detail || {};
        if (!path || !l) return;
        listening.set(norm(path), l);
        const item = activeSortedTracks.find(t => norm(t.path) === norm(path));
        if (item) applyMeta(item);
        const row = document.querySelector(`.audio-track-row[data-path="${CSS.escape(norm(path))}"]`);
        if (row && item) {
            for (const key of ['plays', 'skips', 'last_played']) {
                const cell = row.querySelector(`[data-col="${key}"] .mt-text`);
                if (cell) cell.textContent = cellText(key, item, 0);
            }
        }
    });

    async function importOldPlayCounts() {
        let old = null;
        try { old = JSON.parse(localStorage.getItem(OLD_PLAYCOUNT_KEY) || 'null'); } catch (_) { old = null; }
        const api = window.electronAPI || {};
        if (!old || !Object.keys(old).length || typeof api.musicImportPlays !== 'function') return;
        const res = await api.musicImportPlays(old);
        try { localStorage.removeItem(OLD_PLAYCOUNT_KEY); } catch (_) {}
        console.info(`[music] ${res && res.written} songs' play counts moved into their sidecars`);
    }

    // ── Covers ──────────────────────────────────────────────────────────────
    // A picture the user chose; else the songs' own pictures: one, or four different albums as a 2x2 collage; else
    // an abstract cover in the songs' picture colours (a hue from the name when none has one) with the name on it.
    function hashOf(text) {
        let h = 2166136261;
        for (const ch of text || '') { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    function coverParts(key, items) {
        const assigned = (window.appSettings && window.appSettings.playlistCovers) || {};
        if (assigned[key]) return { kind: 'image', srcs: [assigned[key]] };
        const byAlbum = new Map();
        for (const it of items || []) {
            if (!it.artFile) continue;
            const album = (it.album || it.artFile).toLowerCase();
            if (!byAlbum.has(album)) byAlbum.set(album, it.artFile);
            if (byAlbum.size >= 4) break;
        }
        const arts = [...byAlbum.values()];
        if (arts.length >= 4) return { kind: 'collage', srcs: arts.slice(0, 4) };
        if (arts.length) return { kind: 'image', srcs: [arts[0]] };
        const withColors = (items || []).find(it => Array.isArray(it.colors) && it.colors.length);
        return { kind: 'abstract', colors: withColors ? withColors.colors : null };
    }

    function abstractStyle(name, colors) {
        const h = hashOf(name);
        const hue = h % 360;
        const c = (colors && colors.length >= 2) ? colors
            : [`hsl(${hue}, 45%, 22%)`, `hsl(${(hue + 25) % 360}, 55%, 62%)`, `hsl(${(hue + 50) % 360}, 60%, 86%)`];
        const top = c[0], mid = c[1] || c[0], low = c[2] || mid;
        // vertical bars of different heights fading into the lower colours
        const bars = [];
        for (let i = 0; i < 8; i++) {
            const stop = 25 + (((h >>> (i * 3)) & 31) * 1.5);
            bars.push(`linear-gradient(180deg, transparent ${stop}%, ${mid} ${Math.min(stop + 22, 96)}%, ${low} 100%) ${(i * 100 / 7).toFixed(1)}% 0 / 12.5% 100% no-repeat`);
        }
        return `background: ${bars.join(', ')}, linear-gradient(180deg, ${top} 0%, ${top} 35%, ${mid} 80%, ${low} 100%);`;
    }

    /** The cover as HTML for a box of any size; `withName` writes the playlist's name in the top-left corner. */
    function coverHtml(key, items, name, withName) {
        const c = coverParts(key, items);
        const img = (src) => `<img src="${window.sanitizePath(src)}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`;
        if (c.kind === 'collage') return `<div class="mt-cover mt-cover--collage">${c.srcs.map(img).join('')}</div>`;
        if (c.kind === 'image') return `<div class="mt-cover">${img(c.srcs[0])}</div>`;
        return `<div class="mt-cover mt-cover--abstract" style="${abstractStyle(name, c.colors)}">${withName
            ? `<span class="mt-cover__name">${window.escapeHtml(name)}</span>` : ''}</div>`;
    }

    function assignCover(key) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', () => {
            const f = input.files && input.files[0];
            if (!f || !f.path) return;
            window.appSettings.playlistCovers = window.appSettings.playlistCovers || {};
            window.appSettings.playlistCovers[key] = f.path;
            if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
                window.electronAPI.saveSettings(window.appSettings);
            }
            if (window.showToast) window.showToast('Playlist cover updated', 'success');
            renderAudio();
        });
        input.click();
    }

    function removeCover(key) {
        if (window.appSettings && window.appSettings.playlistCovers && window.appSettings.playlistCovers[key]) {
            delete window.appSettings.playlistCovers[key];
            if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
                window.electronAPI.saveSettings(window.appSettings);
            }
            if (window.showToast) window.showToast('Playlist cover reset to default', 'info');
            renderAudio();
        }
    }

    // ── Playlist model ──────────────────────────────────────────────────────
    function getPlaylists(items) {
        const lists = new Map();
        lists.set('all', { name: 'All Music', items: [...items], user: false, key: 'all' });

        items.forEach(item => {
            const folder = item.folder || 'Uncategorized';
            const key = 'folder:' + folder;
            if (!lists.has(key)) lists.set(key, { name: folder, items: [], user: false, key });
            lists.get(key).items.push(item);
        });

        // User virtual playlists (window.vf)
        if (window.vf) {
            const byPath = new Map(items.map(i => [i.path.toLowerCase().replace(/\\/g, '/'), i]));
            window.vf.list({ type: 'playlist', parentId: null }).forEach(f => {
                const members = window.vf.itemsOf(f.id).map(p => {
                    const norm = p.toLowerCase().replace(/\\/g, '/');
                    return byPath.get(norm) || {
                        path: p,
                        name: p.split(/[\\/]/).pop(),
                        type: 'audio',
                        folder: 'Custom Playlist',
                    };
                });
                lists.set('vf:' + f.id, { name: f.name, items: members, user: true, vfId: f.id, key: 'vf:' + f.id });
            });
        }
        return lists;
    }

    // ── Playlist CRUD Operations ────────────────────────────────────────────
    async function createPlaylist(initialName, initialItems = []) {
        const name = (typeof initialName === 'string' && initialName.trim())
            ? initialName.trim()
            : (window.showPromptDialog ? await window.showPromptDialog('New playlist name:', '', 'Enter playlist title') : null);
        if (!name || !name.trim()) return null;

        const res = window.vf
            ? window.vf.create({ name: name.trim(), type: 'playlist' })
            : { ok: false, error: 'Playlists unavailable' };

        if (res.ok) {
            if (initialItems.length > 0) {
                window.vf.addItems(res.folder.id, initialItems);
            }
            selectedPlaylist = 'vf:' + res.folder.id;
            if (window.showToast) window.showToast(`Playlist "${name.trim()}" created`, 'success');
            renderAudio();
            return res.folder;
        } else {
            if (window.showToast) window.showToast(res.error || 'Could not create playlist', 'error');
            return null;
        }
    }

    async function renamePlaylist(vfId, oldName) {
        const newName = window.showPromptDialog
            ? await window.showPromptDialog('Rename playlist:', oldName, 'Enter new name')
            : null;
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        if (window.vf && typeof window.vf.rename === 'function') {
            const res = window.vf.rename(vfId, newName.trim());
            if (res.ok) {
                if (window.showToast) window.showToast(`Playlist renamed to "${newName.trim()}"`, 'success');
                renderAudio();
            } else {
                if (window.showToast) window.showToast(res.error || 'Rename failed', 'error');
            }
        }
    }

    async function deletePlaylist(vfId, name) {
        const confirmed = window.showConfirmDialog
            ? await window.showConfirmDialog(`Are you sure you want to delete the playlist "${name}"? Tracks will not be deleted from disk.`, 'Delete Playlist')
            : confirm(`Are you sure you want to delete the playlist "${name}"? Tracks will not be deleted from disk.`);
        if (!confirmed) return;
        if (window.vf && typeof window.vf.remove === 'function') {
            window.vf.remove(vfId);
            if (selectedPlaylist === 'vf:' + vfId) {
                selectedPlaylist = 'all';
            }
            if (window.showToast) window.showToast(`Playlist "${name}" deleted`, 'info');
            renderAudio();
        }
    }

    function removeTrackFromPlaylist(vfId, trackPath, trackName) {
        if (window.vf && typeof window.vf.removeItems === 'function') {
            window.vf.removeItems(vfId, [trackPath]);
            if (window.showToast) window.showToast(`Removed "${trackName}" from playlist`, 'info');
            renderAudio();
        }
    }

    // ── Add To Playlist Popup Menu ──────────────────────────────────────────
    function showAddToPlaylistMenu(item, anchorEv) {
        const old = el('audio-pl-menu');
        if (old) old.remove();
        const menu = document.createElement('div');
        menu.id = 'audio-pl-menu';
        menu.style.cssText = `position: fixed; left: ${Math.min(anchorEv.clientX, window.innerWidth - 240)}px; top: ${Math.min(anchorEv.clientY, window.innerHeight - 240)}px; z-index: 5000; background: var(--vault-warm-bg, #1a1a24); border: 1px solid var(--vault-border); border-radius: 6px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); min-width: 210px; padding: 6px; font-family: var(--font-body); font-size: 12px;`;

        const mkRow = (label, cb, accent) => {
            const row = document.createElement('div');
            row.textContent = label;
            row.style.cssText = `padding: 7px 12px; cursor: pointer; border-radius: 4px; color: ${accent ? 'var(--vault-accent)' : 'var(--vault-text)'}; ${accent ? 'font-weight: 600;' : ''}`;
            row.addEventListener('mouseenter', () => { row.style.background = 'var(--vault-hover, rgba(255,255,255,0.06))'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
            row.addEventListener('click', () => { menu.remove(); cb(); });
            menu.appendChild(row);
        };

        const pls = window.vf ? window.vf.list({ type: 'playlist', parentId: null }) : [];
        if (pls.length === 0) {
            const none = document.createElement('div');
            none.textContent = 'No playlists yet';
            none.style.cssText = 'padding: 7px 12px; color: var(--vault-slate); font-size: 11px;';
            menu.appendChild(none);
        }
        pls.forEach(f => mkRow(f.name, () => {
            window.vf.addItems(f.id, [item.path]);
            if (window.showToast) window.showToast(`Added to "${f.name}"`, 'success');
            if (selectedPlaylist === 'vf:' + f.id) renderAudio();
        }));

        mkRow('+ New playlist…', () => {
            createPlaylist(null, [item.path]);
        }, true);

        document.body.appendChild(menu);
        setTimeout(() => {
            const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
            document.addEventListener('mousedown', close);
        }, 0);
    }

    // ── Playlist Context Menu ───────────────────────────────────────────────
    function showPlaylistContextMenu(key, pl, ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const old = el('playlist-ctx-menu');
        if (old) old.remove();

        const menu = document.createElement('div');
        menu.id = 'playlist-ctx-menu';
        menu.style.cssText = `position: fixed; left: ${Math.min(ev.clientX, window.innerWidth - 220)}px; top: ${Math.min(ev.clientY, window.innerHeight - 200)}px; z-index: 5000; background: var(--vault-warm-bg, #1a1a24); border: 1px solid var(--vault-border); border-radius: 6px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); min-width: 180px; padding: 4px; font-family: var(--font-body); font-size: 12px;`;

        const mkItem = (label, cb, danger) => {
            const row = document.createElement('div');
            row.textContent = label;
            row.style.cssText = `padding: 7px 12px; cursor: pointer; border-radius: 4px; color: ${danger ? 'var(--vault-danger, #ff4d4f)' : 'var(--vault-text)'};`;
            row.addEventListener('mouseenter', () => { row.style.background = 'var(--vault-hover, rgba(255,255,255,0.06))'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
            row.addEventListener('click', () => { menu.remove(); cb(); });
            menu.appendChild(row);
        };

        if (pl.user) {
            mkItem('Rename Playlist', () => renamePlaylist(pl.vfId, pl.name));
            mkItem('Change Cover Image', () => assignCover(key));
            if (window.appSettings?.playlistCovers?.[key]) {
                mkItem('Reset Cover to Default', () => removeCover(key));
            }
            mkItem('Delete Playlist', () => deletePlaylist(pl.vfId, pl.name), true);
        } else {
            mkItem('Change Cover Image', () => assignCover(key));
            if (window.appSettings?.playlistCovers?.[key]) {
                mkItem('Reset Cover to Default', () => removeCover(key));
            }
        }

        document.body.appendChild(menu);
        setTimeout(() => {
            const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
            document.addEventListener('mousedown', close);
        }, 0);
    }

    // ── Columns (right-click the header to choose; saved in appSettings.musicColumns) ──
    const COLUMN_DEFS = [
        { key: 'index', label: '#', width: '36px', fixed: true },
        { key: 'title', label: 'Title', width: 'minmax(180px, 2.2fr)', sortable: true, text: true },
        { key: 'artist', label: 'Artist', width: 'minmax(110px, 1fr)', sortable: true, text: true },
        { key: 'album', label: 'Album', width: 'minmax(110px, 1fr)', sortable: true, text: true },
        { key: 'album_artist', label: 'Album Artist', width: 'minmax(100px, 0.9fr)', sortable: true, text: true },
        { key: 'track', label: 'Track', width: '50px', sortable: true, num: true },
        { key: 'disc', label: 'Disc', width: '44px', sortable: true, num: true },
        { key: 'year', label: 'Year', width: '52px', sortable: true, num: true },
        { key: 'genre', label: 'Genre', width: 'minmax(80px, 0.6fr)', sortable: true, text: true },
        { key: 'composer', label: 'Composer', width: 'minmax(100px, 0.8fr)', sortable: true, text: true },
        { key: 'duration', label: 'Time', width: '56px', sortable: true, num: true },
        { key: 'plays', label: 'Plays', width: '50px', sortable: true, num: true },
        { key: 'skips', label: 'Skips', width: '50px', sortable: true, num: true },
        { key: 'last_played', label: 'Last Played', width: '96px', sortable: true },
        { key: 'mtime', label: 'Date Modified', width: '96px', sortable: true },
        { key: 'size', label: 'Size', width: '70px', sortable: true, num: true },
        { key: 'bitrate', label: 'Bit Rate', width: '76px', sortable: true, num: true },
        { key: 'codec', label: 'Kind', width: '56px', sortable: true, text: true },
        { key: 'sample_rate', label: 'Sample Rate', width: '84px', sortable: true, num: true },
        { key: 'favorite', label: '★', width: '28px', sortable: false },
        { key: 'actions', label: '', width: '52px', fixed: true },
    ];
    const DEFAULT_COLUMNS = ['index', 'title', 'artist', 'album', 'duration', 'plays', 'mtime', 'favorite', 'actions'];

    function visibleColumns() {
        const saved = window.appSettings && Array.isArray(window.appSettings.musicColumns) ? window.appSettings.musicColumns : null;
        const want = new Set(saved && saved.length ? saved : DEFAULT_COLUMNS);
        return COLUMN_DEFS.filter(c => c.fixed || want.has(c.key));
    }

    function saveColumns(keys) {
        window.appSettings = window.appSettings || {};
        window.appSettings.musicColumns = keys;
        if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
            window.electronAPI.saveSettings(window.appSettings);
        }
        renderAudio();
    }

    function showColumnMenu(ev) {
        ev.preventDefault();
        const old = el('audio-col-menu');
        if (old) old.remove();
        const shown = new Set(visibleColumns().map(c => c.key));
        const menu = document.createElement('div');
        menu.id = 'audio-col-menu';
        menu.className = 'mt-menu';
        menu.style.left = `${Math.min(ev.clientX, window.innerWidth - 220)}px`;
        menu.style.top = `${Math.max(8, Math.min(ev.clientY, window.innerHeight - 520))}px`;
        const row = (label, checked, cb) => {
            const r = document.createElement('div');
            r.className = 'mt-menu__item';
            r.innerHTML = `<span class="mt-menu__check">${checked ? '✓' : ''}</span><span>${window.escapeHtml(label)}</span>`;
            r.addEventListener('click', (e) => { e.stopPropagation(); cb(r); });
            menu.appendChild(r);
            return r;
        };
        COLUMN_DEFS.filter(c => !c.fixed).forEach(c => row(c.key === 'favorite' ? 'Favorite' : c.label, shown.has(c.key), (r) => {
            if (shown.has(c.key)) shown.delete(c.key); else shown.add(c.key);
            r.querySelector('.mt-menu__check').textContent = shown.has(c.key) ? '✓' : '';
            saveColumns(COLUMN_DEFS.filter(d => !d.fixed && shown.has(d.key)).map(d => d.key));
        }));
        const sep = document.createElement('div');
        sep.className = 'mt-menu__sep';
        menu.appendChild(sep);
        row('Reset to default columns', false, () => { menu.remove(); saveColumns([...DEFAULT_COLUMNS]); });
        document.body.appendChild(menu);
        setTimeout(() => {
            const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
            document.addEventListener('mousedown', close);
        }, 0);
    }

    // ── Cells ───────────────────────────────────────────────────────────────
    function shortDate(v) {
        if (!v) return '—';
        const d = typeof v === 'number' ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    }

    function cellText(key, item, idx) {
        switch (key) {
            case 'index': return String(idx + 1);
            case 'title': return musicTitleOf(item);
            case 'artist': return item.artist || item.folder || 'Unknown';
            case 'duration': return item.duration ? window.formatDuration(item.duration) : '--:--';
            case 'plays': return String(item.plays || 0);
            case 'skips': return String(item.skips || 0);
            case 'last_played': return item.last_played ? shortDate(item.last_played) : '—';
            case 'mtime': return item.mtimeFormatted ? item.mtimeFormatted.split(' ')[0] : shortDate(item.mtime);
            case 'size': return item.size ? window.formatBytes(item.size) : '—';
            case 'bitrate': return item.bitrate ? `${Math.round(item.bitrate / 1000)} kbps` : '—';
            case 'sample_rate': return item.sample_rate ? `${(item.sample_rate / 1000).toFixed(1)} kHz` : '—';
            case 'codec': return (item.codec || (item.name || '').split('.').pop() || '').toUpperCase();
            case 'track': return item.track ? (item.track_total ? `${item.track}/${item.track_total}` : String(item.track)) : '';
            default: return item[key] !== undefined && item[key] !== null ? String(item[key]) : '';
        }
    }

    function sortValue(key, it) {
        switch (key) {
            case 'title': return musicTitleOf(it).toLowerCase();
            case 'artist': return (it.artist || it.folder || '').toLowerCase();
            case 'last_played': return it.last_played || '';
            case 'mtime': return it.mtime || 0;
            default: {
                const v = it[key];
                if (v === undefined || v === null) return (COLUMN_DEFS.find(c => c.key === key) || {}).num ? -1 : '';
                return typeof v === 'string' ? v.toLowerCase() : v;
            }
        }
    }

    function sortItems(items) {
        return [...items].sort((a, b) => {
            let va = sortValue(sortBy, a), vb = sortValue(sortBy, b);
            if (va < vb) return -1 * sortDir;
            if (va > vb) return 1 * sortDir;
            // inside one album: disc then track
            const da = (a.disc || 0) - (b.disc || 0);
            if (da) return da;
            return (a.track || 0) - (b.track || 0);
        });
    }

    /** A cell whose text is wider than the column slides on hover instead of being cut. */
    function bindSlide(cell) {
        const text = cell.firstElementChild;
        cell.addEventListener('mouseenter', () => {
            const over = text.scrollWidth - cell.clientWidth;
            if (over > 2) {
                text.style.setProperty('--mt-shift', `-${over + 6}px`);
                text.style.setProperty('--mt-time', `${Math.max(2, over / 40).toFixed(1)}s`);
                text.classList.add('mt-slide');      // runs while the cell is hovered (CSS :hover)
            }
        });
    }

    // ── Chunked rendering (10,000+ tracks) ─────────────────────────────────
    function renderTrackRowsChunk(startIndex, count) {
        const tracklist = el('audio-tracklist');
        if (!tracklist) return;

        const cols = visibleColumns();
        const grid = cols.map(c => c.width).join(' ');
        const endIndex = Math.min(startIndex + count, activeSortedTracks.length);
        const fragment = document.createDocumentFragment();
        const isUserPlaylist = selectedPlaylist.startsWith('vf:');
        const vfId = isUserPlaylist ? selectedPlaylist.slice(3) : null;
        const current = window.getCurrentAudioItem ? window.getCurrentAudioItem() : null;

        for (let idx = startIndex; idx < endIndex; idx++) {
            const item = activeSortedTracks[idx];
            const row = document.createElement('div');
            row.className = 'audio-track-row' + (current && norm(current.path) === norm(item.path) ? ' is-current' : '');
            row.dataset.path = norm(item.path);
            row.style.gridTemplateColumns = grid;

            for (const col of cols) {
                if (col.key === 'actions' || col.key === 'favorite') {
                    row.appendChild(col.key === 'favorite' ? favoriteCell(item) : actionsCell(item, isUserPlaylist, vfId));
                    continue;
                }
                const cell = document.createElement('span');
                cell.className = `mt-cell mt-cell--${col.key}${col.num ? ' mt-cell--num' : ''}`;
                cell.dataset.col = col.key;
                const text = document.createElement('span');
                text.className = 'mt-text';
                text.textContent = cellText(col.key, item, idx);
                cell.appendChild(text);
                if (col.text) bindSlide(cell);
                row.appendChild(cell);
            }

            row.addEventListener('dblclick', () => {
                if (typeof window.playAudio === 'function') window.playAudio(item, activeSortedTracks, idx);
                document.querySelectorAll('.audio-track-row.is-current').forEach(r => r.classList.remove('is-current'));
                row.classList.add('is-current');
            });
            fragment.appendChild(row);
        }

        tracklist.appendChild(fragment);
        renderedCount = endIndex;
    }

    function favoriteCell(item) {
        const isFav = (typeof window.isFavorite === 'function')
            ? window.isFavorite(item.path)
            : !!(window.appSettings?.favorites && window.appSettings.favorites.some(p => norm(p) === norm(item.path)));
        const wrap = document.createElement('span');
        wrap.className = 'mt-cell mt-cell--favorite';
        const favBtn = document.createElement('button');
        favBtn.className = 'mt-icon-btn' + (isFav ? ' is-on' : '');
        favBtn.title = isFav ? 'Remove from Favorites' : 'Add to Favorites';
        favBtn.textContent = '★';
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.toggleFavorite === 'function') {
                window.toggleFavorite(item.path, favBtn);
                const nowFav = (typeof window.isFavorite === 'function') ? window.isFavorite(item.path) : !isFav;
                favBtn.classList.toggle('is-on', nowFav);
            }
        });
        wrap.appendChild(favBtn);
        return wrap;
    }

    function actionsCell(item, isUserPlaylist, vfId) {
        const actions = document.createElement('span');
        actions.className = 'mt-cell mt-cell--actions';
        const addBtn = document.createElement('button');
        addBtn.className = 'mt-icon-btn mt-icon-btn--boxed';
        addBtn.title = 'Add to Playlist';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); showAddToPlaylistMenu(item, e); });
        actions.appendChild(addBtn);
        if (isUserPlaylist && vfId) {
            const rmBtn = document.createElement('button');
            rmBtn.className = 'mt-icon-btn mt-icon-btn--danger';
            rmBtn.title = 'Remove from this Playlist';
            rmBtn.textContent = '✕';
            rmBtn.addEventListener('click', (e) => { e.stopPropagation(); removeTrackFromPlaylist(vfId, item.path, musicTitleOf(item)); });
            actions.appendChild(rmBtn);
        }
        return actions;
    }

    function renderEmptyTracklist() {
        const tracklist = el('audio-tracklist');
        if (!tracklist) return;
        tracklist.innerHTML = '';
        const empty = window.createFolderChooserEmptyState(
            { title: 'No Audio Found', body: 'Load a folder containing audio files or add tracks to playlists.' },
            () => window.browseTabFolder('music')
        );
        empty.style.padding = '40px 0';
        tracklist.appendChild(empty);
    }

    /** "9 hours, 25 minutes", as a playlist's length reads best. */
    function longDuration(secs) {
        const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
        const part = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
        if (h >= 1) return m ? `${part(h, 'hour')}, ${part(m, 'minute')}` : part(h, 'hour');
        return part(Math.max(1, m), 'minute');
    }

    function renderTrack(items, playlistName, playlistKey) {
        const tracklist = el('audio-tracklist');
        const titleEl = el('audio-playlist-title');
        const metaEl = el('audio-playlist-meta');
        const albumArt = el('audio-album-art');

        items.forEach(applyMeta);
        const totalSecs = items.reduce((acc, it) => acc + (it.duration || 0), 0);
        const durStr = totalSecs > 0 ? ` • ${longDuration(totalSecs)}` : '';

        if (titleEl) titleEl.innerText = playlistName;
        if (metaEl) metaEl.innerText = `${items.length} track${items.length !== 1 ? 's' : ''}${durStr}`;

        if (albumArt) {
            albumArt.innerHTML = coverHtml(playlistKey, items, playlistName, true);
            albumArt.title = 'Click to choose a picture for this playlist (right-click a playlist to reset it)';
            albumArt.style.cursor = 'pointer';
            albumArt.onclick = () => assignCover(playlistKey);
        }

        if (!tracklist) return;
        tracklist.innerHTML = '';

        if (items.length === 0) {
            renderEmptyTracklist();
            return;
        }

        let filteredItems = items;
        if (trackFilterTerm) {
            const term = trackFilterTerm.toLowerCase().trim();
            filteredItems = items.filter(it => [musicTitleOf(it), it.artist, it.album, it.genre, it.folder]
                .some(v => (v || '').toString().toLowerCase().includes(term)));
        }

        activeSortedTracks = sortItems(filteredItems);
        renderedCount = 0;

        const cols = visibleColumns();
        const header = document.createElement('div');
        header.className = 'mt-header';
        header.style.gridTemplateColumns = cols.map(c => c.width).join(' ');
        header.title = 'Right-click to choose the columns';
        cols.forEach(col => {
            const span = document.createElement('span');
            span.className = `mt-cell${col.num ? ' mt-cell--num' : ''}`;
            const arrow = (sortBy === col.key) ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
            span.textContent = col.label + arrow;
            if (col.sortable) {
                span.style.cursor = 'pointer';
                span.addEventListener('click', () => {
                    if (sortBy === col.key) sortDir *= -1;
                    else { sortBy = col.key; sortDir = col.num ? -1 : 1; }
                    renderAudio();
                });
            }
            header.appendChild(span);
        });
        header.addEventListener('contextmenu', showColumnMenu);
        tracklist.appendChild(header);

        renderTrackRowsChunk(0, CHUNK_SIZE);

        const mainScroll = el('audio-main');
        if (mainScroll && !isScrollBound) {
            isScrollBound = true;
            mainScroll.addEventListener('scroll', () => {
                if (mainScroll.scrollTop + mainScroll.clientHeight >= mainScroll.scrollHeight - 300) {
                    if (renderedCount < activeSortedTracks.length) {
                        renderTrackRowsChunk(renderedCount, CHUNK_SIZE);
                    }
                }
            });
        }
    }

    // ── Sidebar ─────────────────────────────────────────────────────────────
    function renderSidebar(playlists) {
        const sidebarList = el('audio-playlist-list');
        if (!sidebarList) return;
        sidebarList.innerHTML = '';

        const newBtn = document.createElement('button');
        newBtn.textContent = '+ New Playlist';
        newBtn.className = 'mt-new-playlist';
        newBtn.addEventListener('click', () => createPlaylist());
        sidebarList.appendChild(newBtn);

        const addEntry = (key, pl) => {
            const div = document.createElement('div');
            div.className = 'audio-sidebar-item mt-side' + (key === selectedPlaylist ? ' active' : '');

            pl.items.forEach(applyMeta);
            const thumb = document.createElement('span');
            thumb.className = 'mt-side__thumb';
            thumb.innerHTML = coverHtml(key, pl.items, pl.name, false);
            div.appendChild(thumb);

            const label = document.createElement('span');
            label.className = 'mt-side__name';
            label.textContent = pl.name;
            div.appendChild(label);

            const badge = document.createElement('span');
            badge.className = 'mt-side__count';
            badge.textContent = pl.items.length;
            div.appendChild(badge);

            div.addEventListener('dragover', (e) => { e.preventDefault(); div.classList.add('is-drop'); });
            div.addEventListener('dragleave', () => div.classList.remove('is-drop'));
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.classList.remove('is-drop');
                if (pl.user && pl.vfId && window.vf) {
                    const paths = [];
                    if (e.dataTransfer.files && e.dataTransfer.files.length) {
                        for (let i = 0; i < e.dataTransfer.files.length; i++) paths.push(e.dataTransfer.files[i].path);
                    }
                    if (paths.length) {
                        window.vf.addItems(pl.vfId, paths);
                        if (window.showToast) window.showToast(`Added ${paths.length} track(s) to "${pl.name}"`, 'success');
                        renderAudio();
                    }
                }
            });
            div.addEventListener('contextmenu', (e) => showPlaylistContextMenu(key, pl, e));
            div.addEventListener('click', () => { selectedPlaylist = key; renderAudio(); });
            sidebarList.appendChild(div);
        };

        const userKeys = [...playlists.keys()].filter(k => k.startsWith('vf:'));
        if (userKeys.length) {
            const h = document.createElement('div');
            h.textContent = 'Custom Playlists';
            h.className = 'mt-side__heading';
            sidebarList.appendChild(h);
            userKeys.forEach(k => addEntry(k, playlists.get(k)));
        }

        const h2 = document.createElement('div');
        h2.textContent = 'Library Folders';
        h2.className = 'mt-side__heading';
        sidebarList.appendChild(h2);
        addEntry('all', playlists.get('all'));
        [...playlists.keys()].filter(k => k.startsWith('folder:')).forEach(k => addEntry(k, playlists.get(k)));
    }

    // ── Visualizer: the playing song's spectrum (an analyser on the player, js/audio-bar.js) ──
    function startVisualizer() {
        const container = el('audio-visualizer-container');
        const canvas = el('audio-visualizer-canvas');
        if (!container || !canvas) return;
        container.style.display = 'block';
        isVisualizerActive = true;
        const btn = el('audio-btn-visualizer');
        if (btn) btn.classList.add('is-on');

        const analyser = window.getAudioAnalyser ? window.getAudioAnalyser() : null;
        const ctx = canvas.getContext('2d');
        const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
        const numBars = 64;
        const peaks = new Float32Array(numBars);
        const css = getComputedStyle(document.documentElement);
        const accent = (css.getPropertyValue('--vault-accent') || '#B07CFF').trim() || '#B07CFF';

        function draw() {
            if (!isVisualizerActive) return;
            const dpr = window.devicePixelRatio || 1;
            const w = Math.max(1, Math.floor((canvas.clientWidth || 300) * dpr));
            const h = Math.max(1, Math.floor((canvas.clientHeight || 60) * dpr));
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            ctx.clearRect(0, 0, w, h);

            const state = window.getAudioPlaylist ? window.getAudioPlaylist() : { isPlaying: false };
            if (analyser && state.isPlaying) analyser.getByteFrequencyData(bins);
            const gap = 2 * dpr;
            const barW = Math.max(1, (w - gap * (numBars - 1)) / numBars);
            // log-spaced bins: the low end gets more bars, as the ear hears it
            const usable = bins ? Math.floor(bins.length * 0.75) : 0;
            for (let i = 0; i < numBars; i++) {
                let v = 0;
                if (bins && state.isPlaying) {
                    const a = Math.floor(Math.pow(i / numBars, 1.6) * usable);
                    const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / numBars, 1.6) * usable));
                    for (let k = a; k < b; k++) v = Math.max(v, bins[k]);
                    v = Math.pow(Math.max(0, (v - 70) / 185), 1.4);      // the analyser's floor sits around 70
                }
                peaks[i] = Math.max(v, peaks[i] - 0.015);
                const barH = Math.max(2 * dpr, v * (h - 4 * dpr));
                const x = i * (barW + gap);
                const grad = ctx.createLinearGradient(0, h - barH, 0, h);
                grad.addColorStop(0, accent);
                grad.addColorStop(1, 'rgba(77, 238, 234, 0.55)');
                ctx.fillStyle = state.isPlaying ? grad : 'rgba(255,255,255,0.12)';
                ctx.fillRect(x, h - barH, barW, barH);
                if (state.isPlaying) {
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.fillRect(x, h - Math.max(2 * dpr, peaks[i] * (h - 4 * dpr)) - 2 * dpr, barW, 1.5 * dpr);
                }
            }
            if (!state.isPlaying) {
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.font = `${11 * dpr}px var(--font-mono, monospace)`;
                ctx.textBaseline = 'middle';
                ctx.fillText(analyser ? 'Play a song to see its spectrum' : 'Spectrum unavailable on this system', 10 * dpr, h / 2);
            }
            visualizerAnimId = requestAnimationFrame(draw);
        }
        if (visualizerAnimId) cancelAnimationFrame(visualizerAnimId);
        visualizerAnimId = requestAnimationFrame(draw);
    }

    function stopVisualizer() {
        const container = el('audio-visualizer-container');
        if (container) container.style.display = 'none';
        isVisualizerActive = false;
        if (visualizerAnimId) {
            cancelAnimationFrame(visualizerAnimId);
            visualizerAnimId = null;
        }
        const btn = el('audio-btn-visualizer');
        if (btn) btn.classList.remove('is-on');
    }

    function toggleVisualizer() {
        if (isVisualizerActive) stopVisualizer();
        else startVisualizer();
    }

    function setupHeaderControls() {
        const playAllBtn = el('audio-btn-play-all');
        const shuffleBtn = el('audio-btn-shuffle');
        const visBtn = el('audio-btn-visualizer');
        const searchInput = el('audio-track-search');

        if (playAllBtn && !playAllBtn._bound) {
            playAllBtn._bound = true;
            playAllBtn.addEventListener('click', () => {
                if (activeSortedTracks.length > 0 && typeof window.playAudio === 'function') {
                    window.playAudio(activeSortedTracks[0], activeSortedTracks, 0);
                }
            });
        }

        if (shuffleBtn && !shuffleBtn._bound) {
            shuffleBtn._bound = true;
            shuffleBtn.addEventListener('click', () => {
                if (activeSortedTracks.length > 0 && typeof window.playAudio === 'function') {
                    const rnd = Math.floor(Math.random() * activeSortedTracks.length);
                    window.playAudio(activeSortedTracks[rnd], activeSortedTracks, rnd);
                }
            });
        }

        if (visBtn && !visBtn._bound) {
            visBtn._bound = true;
            visBtn.addEventListener('click', toggleVisualizer);
        }

        if (searchInput && !searchInput._bound) {
            searchInput._bound = true;
            searchInput.addEventListener('input', (e) => {
                trackFilterTerm = e.target.value;
                const items = getAudioItems();
                const playlists = getPlaylists(items);
                const pl = playlists.get(selectedPlaylist) || playlists.get('all');
                const key = playlists.has(selectedPlaylist) ? selectedPlaylist : 'all';
                renderTrack(pl.items, pl.name, key);
            });
        }
    }

    // ── Master Render ───────────────────────────────────────────────────────
    function renderAudio() {
        setupHeaderControls();
        const items = getAudioItems();
        const playlists = getPlaylists(items);
        renderSidebar(playlists);
        const pl = playlists.get(selectedPlaylist) || playlists.get('all');
        const key = playlists.has(selectedPlaylist) ? selectedPlaylist : 'all';
        renderTrack(pl.items, pl.name, key);
        // tags and plays arrive after the first paint; render again once they are in
        loadMeta(items).then((loaded) => { if (loaded) renderAudio(); });
    }

    // ── Styles ──────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('mt-styles')) return;
        const st = document.createElement('style');
        st.id = 'mt-styles';
        st.textContent = `
        .mt-header, .audio-track-row { display: grid; gap: 10px; align-items: center; }
        .mt-header { padding: 8px 12px; font-size: 10px; color: var(--vault-slate); font-family: var(--font-mono);
            text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--vault-border); user-select: none;
            position: sticky; top: 0; background: var(--vault-console-surface, #13101c); z-index: 5; }
        .audio-track-row { padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: default;
            border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.15s; }
        .audio-track-row:hover { background: var(--vault-hover, rgba(255,255,255,0.04)); }
        .audio-track-row.is-current .mt-cell--title { color: var(--vault-accent); }
        .mt-cell { min-width: 0; overflow: hidden; white-space: nowrap; color: var(--vault-slate); }
        .mt-cell--title { color: var(--vault-text); font-weight: 500; }
        .mt-cell--index, .mt-cell--num, .mt-cell--duration, .mt-cell--mtime, .mt-cell--last_played, .mt-cell--codec {
            font-family: var(--font-mono); font-size: 11px; }
        .mt-cell--num { text-align: right; }
        .mt-text { display: inline-block; white-space: nowrap; }
        .mt-cell:hover > .mt-text.mt-slide { animation: mt-slide var(--mt-time, 3s) ease-in-out 0.35s infinite alternate; }
        @keyframes mt-slide { from { transform: translateX(0); } to { transform: translateX(var(--mt-shift, 0)); } }
        .mt-cell--favorite, .mt-cell--actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; overflow: visible; }
        .mt-icon-btn { background: transparent; border: none; color: var(--vault-slate); cursor: pointer; font-size: 13px; padding: 0 2px; line-height: 1; }
        .mt-icon-btn.is-on { color: var(--vault-gold, #F0B94B); }
        .mt-icon-btn--boxed { border: 1px solid var(--vault-border); color: var(--vault-text); font-size: 12px; width: 18px; height: 18px; border-radius: 3px; padding: 0; }
        .mt-icon-btn--danger:hover { color: var(--vault-danger, #ff4d4f); }
        .mt-menu { position: fixed; z-index: 5000; background: var(--vault-console-surface, #13101c); border: 1px solid var(--vault-border);
            border-radius: 6px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); min-width: 200px; max-height: 80vh; overflow-y: auto;
            padding: 4px; font-family: var(--font-body); font-size: 12px; }
        .mt-menu__item { display: flex; gap: 8px; padding: 6px 10px; border-radius: 4px; cursor: pointer; color: var(--vault-text); }
        .mt-menu__item:hover { background: var(--vault-hover, rgba(255,255,255,0.06)); }
        .mt-menu__check { width: 14px; color: var(--vault-accent); }
        .mt-menu__sep { height: 1px; background: var(--vault-border); margin: 4px 0; }
        .mt-cover { width: 100%; height: 100%; position: relative; overflow: hidden; border-radius: inherit; background: var(--vault-console-raised); }
        .mt-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .mt-cover--collage { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        .mt-cover--abstract { filter: saturate(1.1); }
        .mt-cover__name { position: absolute; top: 8%; left: 8%; right: 8%; font-family: var(--font-sans); font-weight: 700;
            font-size: 18px; line-height: 1.15; color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,0.25); overflow-wrap: anywhere; }
        #audio-album-art { overflow: hidden; }
        .mt-new-playlist { margin: 0 0 10px 0; width: 100%; background: transparent; border: 1px dashed var(--vault-accent);
            color: var(--vault-accent); padding: 7px 10px; border-radius: 4px; cursor: pointer; font-family: var(--font-mono);
            font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .mt-new-playlist:hover { background: rgba(176, 124, 255, 0.1); }
        .mt-side { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 4px; cursor: pointer;
            font-size: 12px; user-select: none; color: var(--vault-text); }
        .mt-side.active { background: var(--vault-accent); color: var(--vt-primary, #0b0813); font-weight: 600; }
        .mt-side.is-drop { outline: 2px dashed var(--vault-accent); }
        .mt-side__thumb { width: 26px; height: 26px; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
        .mt-side__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .mt-side__count { font-size: 10px; font-family: var(--font-mono); opacity: 0.7; }
        .mt-side__heading { font-size: 9.5px; text-transform: uppercase; color: var(--vault-slate); font-family: var(--font-mono);
            margin: 10px 0 2px 0; letter-spacing: 0.05em; font-weight: 700; }
        #audio-btn-visualizer.is-on { background: rgba(176, 124, 255, 0.2) !important; color: var(--vault-accent) !important;
            border-color: var(--vault-accent) !important; }
        /* in #audio-main's flex column it shrank to a 6 px strip (the "empty" visualizer): keep its height */
        #audio-visualizer-container { height: 84px !important; flex: 0 0 84px; }
        #audio-tracklist { flex: 0 0 auto; }
        `;
        document.head.appendChild(st);
    }
    injectStyles();

    window.renderAudio = renderAudio;
    window.createAudioPlaylist = createPlaylist;
    window.renameAudioPlaylist = renamePlaylist;
    window.deleteAudioPlaylist = deletePlaylist;
    window.createPlaylist = createPlaylist;
    window.renamePlaylist = renamePlaylist;
    window.deletePlaylist = deletePlaylist;
})();
