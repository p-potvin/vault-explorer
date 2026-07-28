/* ==========================================================================
   Vault Explorer — Music Tab (Sidebar + Tracklist)

   Playlists come from two sources:
     • folder playlists — derived from the folder each track lives in
     • user playlists  — virtual folders of type 'playlist' (window.vf)
   Tracklist: sortable columns (Title/Artist/Time/Date/Plays), per-row
   favorite + add-to-playlist actions. Play counts persist in localStorage.
   Covers: auto-detected from an image in the folder (cover/folder/front…),
   or user-assigned per playlist (stored in appSettings.playlistCovers).
   ========================================================================== */

(function () {
    const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'aiff', 'ape']);
    const COVER_NAMES = ['cover', 'folder', 'front', 'albumart', 'album'];
    const PLAYCOUNT_KEY = 'vault-play-counts';

    let selectedPlaylist = 'all';
    let sortBy = 'title';
    let sortDir = 1; // 1 asc, -1 desc

    function isAudioItem(item) {
        if (!item) return false;
        if (item.type === 'audio') return true;
        const ext = (item.ext || '').replace(/^\./, '').toLowerCase();
        return AUDIO_EXTS.has(ext);
    }

    function getAudioItems() {
        // Full folder scan, not the filtered Files view (matches albums.js).
        const source = window.allItems || window.displayedItems || [];
        return source.filter(isAudioItem);
    }

    // ── Play counts ─────────────────────────────────────────────────────────
    function playCounts() {
        try { return JSON.parse(localStorage.getItem(PLAYCOUNT_KEY)) || {}; } catch (_) { return {}; }
    }
    function bumpPlayCount(path) {
        const c = playCounts();
        c[path] = (c[path] || 0) + 1;
        try { localStorage.setItem(PLAYCOUNT_KEY, JSON.stringify(c)); } catch (_) {}
    }

    // ── Covers ──────────────────────────────────────────────────────────────
    function coverForFolder(folderName) {
        const source = window.allItems || [];
        const imgs = source.filter(i => i && i.type === 'image' && (i.folder || 'Uncategorized') === folderName);
        if (!imgs.length) return null;
        const preferred = imgs.find(i => COVER_NAMES.some(n => i.name.toLowerCase().startsWith(n)));
        return (preferred || imgs[0]).thumbnail || (preferred || imgs[0]).path;
    }

    function coverForPlaylist(key, pl) {
        const assigned = (window.appSettings && window.appSettings.playlistCovers) || {};
        if (assigned[key]) return assigned[key];
        if (key.startsWith('folder:')) return coverForFolder(key.slice(7));
        // User playlist: use the first track's folder cover
        if (pl && pl.items && pl.items.length) return coverForFolder(pl.items[0].folder || 'Uncategorized');
        return null;
    }

    function assignCover(key) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', () => {
            const f = input.files && input.files[0];
            input.remove();
            if (!f || !f.path) return;
            window.appSettings.playlistCovers = window.appSettings.playlistCovers || {};
            window.appSettings.playlistCovers[key] = f.path;
            window.electronAPI.saveSettings(window.appSettings);
            window.showToast('Playlist cover updated', 'success');
            renderAudio();
        });
        input.click();
    }

    // ── Playlist model ──────────────────────────────────────────────────────
    function getPlaylists(items) {
        const lists = new Map();
        lists.set('all', { name: 'All Music', items: [...items], user: false });

        items.forEach(item => {
            const folder = item.folder || 'Uncategorized';
            const key = 'folder:' + folder;
            if (!lists.has(key)) lists.set(key, { name: folder, items: [], user: false });
            lists.get(key).items.push(item);
        });

        // User playlists (virtual folders)
        if (window.vf) {
            const byPath = new Map(items.map(i => [i.path, i]));
            window.vf.list({ type: 'playlist', parentId: null }).forEach(f => {
                const members = window.vf.itemsOf(f.id).map(p => byPath.get(p)).filter(Boolean);
                lists.set('vf:' + f.id, { name: f.name, items: members, user: true, vfId: f.id });
            });
        }
        return lists;
    }

    function createPlaylist() {
        const name = prompt('New playlist name:');
        if (!name || !name.trim()) return;
        const res = window.vf ? window.vf.create({ name: name.trim(), type: 'playlist' }) : { ok: false, error: 'Playlists unavailable' };
        if (res.ok) {
            selectedPlaylist = 'vf:' + res.folder.id;
            window.showToast(`Playlist "${name.trim()}" created`, 'success');
            renderAudio();
        } else {
            window.showToast(res.error || 'Could not create playlist', 'error');
        }
    }

    // Small popup listing user playlists to add a track to.
    function showAddToPlaylistMenu(item, anchorEv) {
        const old = el('audio-pl-menu');
        if (old) old.remove();
        const menu = document.createElement('div');
        menu.id = 'audio-pl-menu';
        menu.style.cssText = `position: fixed; left: ${Math.min(anchorEv.clientX, window.innerWidth - 220)}px; top: ${Math.min(anchorEv.clientY, window.innerHeight - 220)}px; z-index: 5000; background: var(--vault-warm-bg, #1a1a24); border: 1px solid var(--vault-border); border-radius: 6px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); min-width: 200px; padding: 4px; font-family: var(--font-body); font-size: 12px;`;

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
            none.style.cssText = 'padding: 7px 12px; color: var(--vault-slate);';
            menu.appendChild(none);
        }
        pls.forEach(f => mkRow(f.name, () => {
            window.vf.addItems(f.id, [item.path]);
            window.showToast(`Added to "${f.name}"`, 'success');
            if (selectedPlaylist === 'vf:' + f.id) renderAudio();
        }));
        mkRow('+ New playlist…', () => {
            const name = prompt('New playlist name:');
            if (!name || !name.trim()) return;
            const res = window.vf.create({ name: name.trim(), type: 'playlist' });
            if (res.ok) {
                window.vf.addItems(res.folder.id, [item.path]);
                window.showToast(`Added to new playlist "${name.trim()}"`, 'success');
                renderAudio();
            } else {
                window.showToast(res.error || 'Failed', 'error');
            }
        }, true);

        document.body.appendChild(menu);
        setTimeout(() => {
            const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
            document.addEventListener('mousedown', close);
        }, 0);
    }

    // ── Empty state ─────────────────────────────────────────────────────────
    function renderEmptyTracklist() {
        const tracklist = el('audio-tracklist');
        if (!tracklist) return;
        tracklist.innerHTML = '';
        const empty = window.createFolderChooserEmptyState(
            { title: 'No Audio Found', body: 'Load a folder containing audio files to see playlists and tracks.' },
            () => window.browseTabFolder('music')
        );
        empty.style.padding = '40px 0';
        tracklist.appendChild(empty);
    }

    // ── Tracklist ───────────────────────────────────────────────────────────
    const COLUMNS = [
        { key: 'index', label: '#', width: '36px', sortable: false },
        { key: 'title', label: 'Title', width: 'minmax(0, 1fr)', sortable: true },
        { key: 'artist', label: 'Artist', width: '140px', sortable: true },
        { key: 'duration', label: 'Time', width: '58px', sortable: true },
        { key: 'mtime', label: 'Date', width: '92px', sortable: true },
        { key: 'plays', label: 'Plays', width: '48px', sortable: true },
        { key: 'actions', label: '', width: '64px', sortable: false },
    ];
    const GRID = COLUMNS.map(c => c.width).join(' ');

    function sortItems(items) {
        const counts = playCounts();
        const val = (it) => {
            switch (sortBy) {
                case 'title': return (it.name || '').toLowerCase();
                case 'artist': return (it.artist || it.folder || '').toLowerCase();
                case 'duration': return it.duration || 0;
                case 'mtime': return it.mtime || 0;
                case 'plays': return counts[it.path] || 0;
                default: return 0;
            }
        };
        return [...items].sort((a, b) => {
            const va = val(a), vb = val(b);
            if (va < vb) return -1 * sortDir;
            if (va > vb) return 1 * sortDir;
            return 0;
        });
    }

    function renderTrack(items, playlistName, playlistKey) {
        const tracklist = el('audio-tracklist');
        const titleEl = el('audio-playlist-title');
        const metaEl = el('audio-playlist-meta');
        const albumArt = el('audio-album-art');

        if (titleEl) titleEl.innerText = playlistName;
        if (metaEl) metaEl.innerText = `${items.length} track${items.length !== 1 ? 's' : ''}`;

        if (albumArt) {
            const cover = coverForPlaylist(playlistKey, { items });
            if (cover) {
                albumArt.innerHTML = `<img src="${window.sanitizePath(cover)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
            } else {
                albumArt.innerHTML = `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--vault-slate);"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
            }
            albumArt.title = 'Click to set a custom cover for this playlist';
            albumArt.style.cursor = 'pointer';
            albumArt.onclick = () => assignCover(playlistKey);
        }

        if (!tracklist) return;
        tracklist.innerHTML = '';

        if (items.length === 0) {
            renderEmptyTracklist();
            return;
        }

        const counts = playCounts();
        const sorted = sortItems(items);

        // Header (clickable sort)
        const header = document.createElement('div');
        header.style.cssText = `display: grid; grid-template-columns: ${GRID}; gap: 8px; padding: 8px 12px; font-size: 10px; color: var(--vault-slate); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--vault-border); user-select: none;`;
        COLUMNS.forEach(col => {
            const span = document.createElement('span');
            const arrow = (sortBy === col.key) ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
            span.textContent = col.label + arrow;
            if (col.sortable) {
                span.style.cursor = 'pointer';
                span.addEventListener('click', () => {
                    if (sortBy === col.key) sortDir *= -1;
                    else { sortBy = col.key; sortDir = 1; }
                    renderAudio();
                });
            }
            header.appendChild(span);
        });
        tracklist.appendChild(header);

        sorted.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'audio-track-row';
            row.style.display = 'grid';
            row.style.gridTemplateColumns = GRID;
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            row.innerHTML = `
                <span class="track-num">${idx + 1}</span>
                <span class="track-title" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(item.name.replace(/\.[^.]+$/, ''))}</span>
                <span class="track-artist" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(item.artist || item.folder || 'Unknown')}</span>
                <span class="track-duration">${item.duration ? window.formatDuration(item.duration) : '--:--'}</span>
                <span style="font-size:10px; color:var(--vault-slate); font-family:var(--font-mono);">${item.mtimeFormatted ? item.mtimeFormatted.split(' ')[0] : '—'}</span>
                <span style="font-size:10px; color:var(--vault-slate); font-family:var(--font-mono); text-align:center;">${counts[item.path] || 0}</span>
            `;

            // Actions cell: favorite + add-to-playlist
            const actions = document.createElement('span');
            actions.style.cssText = 'display: flex; gap: 6px; justify-content: flex-end; opacity: 0.85;';
            const favBtn = document.createElement('button');
            favBtn.title = 'Add to Favorites';
            favBtn.textContent = '★';
            favBtn.style.cssText = 'background: transparent; border: none; color: var(--vault-slate); cursor: pointer; font-size: 14px; padding: 0 2px;';
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.toggleFavorite === 'function') {
                    window.toggleFavorite(item.path, favBtn);
                    favBtn.style.color = 'var(--vault-gold)';
                }
            });
            const addBtn = document.createElement('button');
            addBtn.title = 'Add to playlist';
            addBtn.textContent = '+';
            addBtn.style.cssText = 'background: transparent; border: 1px solid var(--vault-border); color: var(--vault-text); cursor: pointer; font-size: 12px; width: 18px; height: 18px; line-height: 1; border-radius: 3px; padding: 0;';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAddToPlaylistMenu(item, e);
            });
            actions.appendChild(favBtn);
            actions.appendChild(addBtn);
            row.appendChild(actions);

            row.addEventListener('dblclick', () => {
                bumpPlayCount(item.path);
                if (typeof window.playAudio === 'function') {
                    window.playAudio(item, sorted, idx);
                }
            });
            tracklist.appendChild(row);
        });
    }

    // ── Sidebar + render ────────────────────────────────────────────────────
    function renderSidebar(playlists) {
        const sidebarList = el('audio-playlist-list');
        if (!sidebarList) return;
        sidebarList.innerHTML = '';

        // "New playlist" button on top
        const newBtn = document.createElement('button');
        newBtn.textContent = '+ New Playlist';
        newBtn.style.cssText = 'margin: 0 0 8px 0; width: 100%; background: transparent; border: 1px dashed var(--vault-accent); color: var(--vault-accent); padding: 6px 10px; border-radius: 4px; cursor: pointer; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;';
        newBtn.addEventListener('click', createPlaylist);
        sidebarList.appendChild(newBtn);

        const addEntry = (key, pl) => {
            const div = document.createElement('div');
            div.className = 'audio-sidebar-item' + (key === selectedPlaylist ? ' active' : '');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '8px';
            const cover = coverForPlaylist(key, pl);
            if (cover) {
                const im = document.createElement('img');
                im.src = window.sanitizePath(cover);
                im.style.cssText = 'width: 22px; height: 22px; object-fit: cover; border-radius: 3px; flex-shrink: 0;';
                im.onerror = () => im.remove();
                div.appendChild(im);
            }
            const label = document.createElement('span');
            label.textContent = pl.name;
            label.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;';
            div.appendChild(label);
            if (pl.user) {
                const badge = document.createElement('span');
                badge.textContent = pl.items.length;
                badge.style.cssText = 'font-size: 9px; color: var(--vault-slate); font-family: var(--font-mono);';
                div.appendChild(badge);
            }
            div.addEventListener('click', () => {
                selectedPlaylist = key;
                renderAudio();
            });
            sidebarList.appendChild(div);
        };

        // User playlists first, then All Music, then folder playlists
        const userKeys = [...playlists.keys()].filter(k => k.startsWith('vf:'));
        if (userKeys.length) {
            const h = document.createElement('div');
            h.textContent = 'Playlists';
            h.style.cssText = 'font-size: 9px; text-transform: uppercase; color: var(--vault-slate); font-family: var(--font-mono); margin: 4px 0;';
            sidebarList.appendChild(h);
            userKeys.forEach(k => addEntry(k, playlists.get(k)));
        }
        const h2 = document.createElement('div');
        h2.textContent = 'Folders';
        h2.style.cssText = 'font-size: 9px; text-transform: uppercase; color: var(--vault-slate); font-family: var(--font-mono); margin: 8px 0 4px 0;';
        sidebarList.appendChild(h2);
        addEntry('all', playlists.get('all'));
        [...playlists.keys()].filter(k => k.startsWith('folder:')).forEach(k => addEntry(k, playlists.get(k)));
    }

    function renderAudio() {
        const items = getAudioItems();
        const playlists = getPlaylists(items);
        renderSidebar(playlists);
        const pl = playlists.get(selectedPlaylist) || playlists.get('all');
        const key = playlists.has(selectedPlaylist) ? selectedPlaylist : 'all';
        renderTrack(pl.items, pl.name, key);
    }

    window.renderAudio = renderAudio;
})();
