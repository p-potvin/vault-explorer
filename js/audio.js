/* ==========================================================================
   Vault Explorer — Music Tab (Sidebar + Tracklist)

   Features:
     • Full Playlist CRUD (create, rename, delete, set/remove custom cover)
     • Folder Playlists + User Virtual Playlists (window.vf with type 'playlist')
     • Tracklist: Sortable columns (Title/Artist/Duration/Date/Plays), favorite,
       add-to-playlist, remove-from-playlist, AI Audio Normalization.
     • High-Performance Incremental Chunk Rendering (handles 10,000+ tracks)
     • Drag and drop audio files onto playlists
     • Custom Cover Assignment (persisted in appSettings.playlistCovers)
   ========================================================================== */

(function () {
    const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'aiff', 'ape']);
    const COVER_NAMES = ['cover', 'folder', 'front', 'albumart', 'album'];
    const PLAYCOUNT_KEY = 'vault-play-counts';
    const CHUNK_SIZE = 100;

    let selectedPlaylist = 'all';
    let sortBy = 'title';
    let sortDir = 1; // 1 asc, -1 desc
    let activeSortedTracks = [];
    let renderedCount = 0;
    let isScrollBound = false;

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
        if (pl && pl.items && pl.items.length) {
            const firstFolder = pl.items[0].folder || 'Uncategorized';
            return coverForFolder(firstFolder);
        }
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
    function createPlaylist(initialName, initialItems = []) {
        const name = (typeof initialName === 'string' && initialName.trim())
            ? initialName.trim()
            : prompt('New playlist name:');
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

    function renamePlaylist(vfId, oldName) {
        const newName = prompt('Rename playlist:', oldName);
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

    function deletePlaylist(vfId, name) {
        if (!confirm(`Are you sure you want to delete the playlist "${name}"? Tracks will not be deleted from disk.`)) return;
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

    // ── Track Sorting & Stats ───────────────────────────────────────────────
    const COLUMNS = [
        { key: 'index', label: '#', width: '36px', sortable: false },
        { key: 'title', label: 'Title', width: 'minmax(0, 1fr)', sortable: true },
        { key: 'artist', label: 'Artist', width: '150px', sortable: true },
        { key: 'duration', label: 'Time', width: '60px', sortable: true },
        { key: 'mtime', label: 'Date', width: '90px', sortable: true },
        { key: 'plays', label: 'Plays', width: '48px', sortable: true },
        { key: 'actions', label: '', width: '80px', sortable: false },
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

    // ── Chunked Virtual Rendering for High Performance ─────────────────────
    function renderTrackRowsChunk(startIndex, count) {
        const tracklist = el('audio-tracklist');
        if (!tracklist) return;

        const counts = playCounts();
        const endIndex = Math.min(startIndex + count, activeSortedTracks.length);
        const fragment = document.createDocumentFragment();
        const isUserPlaylist = selectedPlaylist.startsWith('vf:');
        const vfId = isUserPlaylist ? selectedPlaylist.slice(3) : null;

        for (let idx = startIndex; idx < endIndex; idx++) {
            const item = activeSortedTracks[idx];
            const row = document.createElement('div');
            row.className = 'audio-track-row';
            row.style.cssText = `display: grid; grid-template-columns: ${GRID}; gap: 8px; align-items: center; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; transition: background 0.15s; border-bottom: 1px solid rgba(255,255,255,0.03);`;

            row.innerHTML = `
                <span class="track-num" style="font-family: var(--font-mono); font-size: 10px; color: var(--vault-slate);">${idx + 1}</span>
                <span class="track-title" style="font-weight: 500; color: var(--vault-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(item.name.replace(/\.[^.]+$/, ''))}</span>
                <span class="track-artist" style="color: var(--vault-slate); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(item.artist || item.folder || 'Unknown')}</span>
                <span class="track-duration" style="font-family: var(--font-mono); font-size: 11px; color: var(--vault-slate);">${item.duration ? window.formatDuration(item.duration) : '--:--'}</span>
                <span style="font-size:10px; color:var(--vault-slate); font-family:var(--font-mono);">${item.mtimeFormatted ? item.mtimeFormatted.split(' ')[0] : '—'}</span>
                <span style="font-size:10px; color:var(--vault-slate); font-family:var(--font-mono); text-align:center;">${counts[item.path] || 0}</span>
            `;

            // Actions cell
            const actions = document.createElement('span');
            actions.style.cssText = 'display: flex; gap: 6px; justify-content: flex-end; align-items: center;';

            // Favorite star
            const isFav = (typeof window.isFavorite === 'function')
                ? window.isFavorite(item.path)
                : !!(window.appSettings?.favorites && window.appSettings.favorites.some(p => (p || '').replace(/\\/g, '/').toLowerCase() === (item.path || '').replace(/\\/g, '/').toLowerCase()));
            const favBtn = document.createElement('button');
            favBtn.title = isFav ? 'Remove from Favorites' : 'Add to Favorites';
            favBtn.textContent = '★';
            favBtn.style.cssText = `background: transparent; border: none; color: ${isFav ? 'var(--vault-gold, #F0B94B)' : 'var(--vault-slate)'}; cursor: pointer; font-size: 13px; padding: 0 2px; line-height: 1;`;
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.toggleFavorite === 'function') {
                    window.toggleFavorite(item.path, favBtn);
                    const nowFav = (typeof window.isFavorite === 'function') ? window.isFavorite(item.path) : !isFav;
                    favBtn.style.color = nowFav ? 'var(--vault-gold, #F0B94B)' : 'var(--vault-slate)';
                }
            });
            actions.appendChild(favBtn);

            // Add to playlist button
            const addBtn = document.createElement('button');
            addBtn.title = 'Add to Playlist';
            addBtn.textContent = '+';
            addBtn.style.cssText = 'background: transparent; border: 1px solid var(--vault-border); color: var(--vault-text); cursor: pointer; font-size: 12px; width: 18px; height: 18px; line-height: 1; border-radius: 3px; padding: 0; display: flex; align-items: center; justify-content: center;';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAddToPlaylistMenu(item, e);
            });
            actions.appendChild(addBtn);

            // If in user playlist, show Remove from playlist button
            if (isUserPlaylist && vfId) {
                const rmBtn = document.createElement('button');
                rmBtn.title = 'Remove from this Playlist';
                rmBtn.textContent = '✕';
                rmBtn.style.cssText = 'background: transparent; border: none; color: var(--vault-slate); cursor: pointer; font-size: 11px; padding: 0 3px; line-height: 1;';
                rmBtn.addEventListener('mouseenter', () => { rmBtn.style.color = 'var(--vault-danger, #ff4d4f)'; });
                rmBtn.addEventListener('mouseleave', () => { rmBtn.style.color = 'var(--vault-slate)'; });
                rmBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeTrackFromPlaylist(vfId, item.path, item.name);
                });
                actions.appendChild(rmBtn);
            }

            row.appendChild(actions);

            row.addEventListener('mouseenter', () => { row.style.background = 'var(--vault-hover, rgba(255,255,255,0.04))'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

            row.addEventListener('dblclick', () => {
                bumpPlayCount(item.path);
                if (typeof window.playAudio === 'function') {
                    window.playAudio(item, activeSortedTracks, idx);
                }
            });

            fragment.appendChild(row);
        }

        tracklist.appendChild(fragment);
        renderedCount = endIndex;
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

    function renderTrack(items, playlistName, playlistKey) {
        const tracklist = el('audio-tracklist');
        const titleEl = el('audio-playlist-title');
        const metaEl = el('audio-playlist-meta');
        const albumArt = el('audio-album-art');

        // Total duration calculation
        const totalSecs = items.reduce((acc, it) => acc + (it.duration || 0), 0);
        const durStr = totalSecs > 0 ? ` • ${window.formatDuration(totalSecs)}` : '';

        if (titleEl) titleEl.innerText = playlistName;
        if (metaEl) metaEl.innerText = `${items.length} track${items.length !== 1 ? 's' : ''}${durStr}`;

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

        activeSortedTracks = sortItems(items);
        renderedCount = 0;

        // Header (clickable sort)
        const header = document.createElement('div');
        header.style.cssText = `display: grid; grid-template-columns: ${GRID}; gap: 8px; padding: 8px 12px; font-size: 10px; color: var(--vault-slate); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--vault-border); user-select: none; position: sticky; top: 0; background: var(--vault-console-surface, #13101c); z-index: 5;`;
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

        // Render initial chunk
        renderTrackRowsChunk(0, CHUNK_SIZE);

        // Bind infinite scroll on audio-main container once
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

        // "+ New Playlist" button
        const newBtn = document.createElement('button');
        newBtn.textContent = '+ New Playlist';
        newBtn.style.cssText = 'margin: 0 0 10px 0; width: 100%; background: transparent; border: 1px dashed var(--vault-accent); color: var(--vault-accent); padding: 7px 10px; border-radius: 4px; cursor: pointer; font-family: var(--font-mono); font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s;';
        newBtn.addEventListener('mouseenter', () => { newBtn.style.background = 'rgba(176, 124, 255, 0.1)'; });
        newBtn.addEventListener('mouseleave', () => { newBtn.style.background = 'transparent'; });
        newBtn.addEventListener('click', () => createPlaylist());
        sidebarList.appendChild(newBtn);

        const addEntry = (key, pl) => {
            const div = document.createElement('div');
            div.className = 'audio-sidebar-item' + (key === selectedPlaylist ? ' active' : '');
            div.style.cssText = `display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.15s; user-select: none; ${key === selectedPlaylist ? 'background: var(--vault-accent); color: var(--vt-primary, #0b0813); font-weight: 600;' : 'color: var(--vault-text);'}`;

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

            const badge = document.createElement('span');
            badge.textContent = pl.items.length;
            badge.style.cssText = `font-size: 10px; color: ${key === selectedPlaylist ? 'inherit' : 'var(--vault-slate)'}; font-family: var(--font-mono);`;
            div.appendChild(badge);

            // Drag and drop onto playlist
            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                div.style.outline = '2px dashed var(--vault-accent)';
            });
            div.addEventListener('dragleave', () => { div.style.outline = 'none'; });
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.style.outline = 'none';
                if (pl.user && pl.vfId && window.vf) {
                    const paths = [];
                    if (e.dataTransfer.files && e.dataTransfer.files.length) {
                        for (let i = 0; i < e.dataTransfer.files.length; i++) {
                            paths.push(e.dataTransfer.files[i].path);
                        }
                    }
                    if (paths.length) {
                        window.vf.addItems(pl.vfId, paths);
                        if (window.showToast) window.showToast(`Added ${paths.length} track(s) to "${pl.name}"`, 'success');
                        renderAudio();
                    }
                }
            });

            div.addEventListener('contextmenu', (e) => showPlaylistContextMenu(key, pl, e));

            div.addEventListener('click', () => {
                selectedPlaylist = key;
                renderAudio();
            });
            sidebarList.appendChild(div);
        };

        // User playlists section
        const userKeys = [...playlists.keys()].filter(k => k.startsWith('vf:'));
        if (userKeys.length) {
            const h = document.createElement('div');
            h.textContent = 'Custom Playlists';
            h.style.cssText = 'font-size: 9.5px; text-transform: uppercase; color: var(--vault-slate); font-family: var(--font-mono); margin: 6px 0 2px 0; letter-spacing: 0.05em; font-weight: 700;';
            sidebarList.appendChild(h);
            userKeys.forEach(k => addEntry(k, playlists.get(k)));
        }

        // Folder playlists section
        const h2 = document.createElement('div');
        h2.textContent = 'Library Folders';
        h2.style.cssText = 'font-size: 9.5px; text-transform: uppercase; color: var(--vault-slate); font-family: var(--font-mono); margin: 10px 0 2px 0; letter-spacing: 0.05em; font-weight: 700;';
        sidebarList.appendChild(h2);
        addEntry('all', playlists.get('all'));
        [...playlists.keys()].filter(k => k.startsWith('folder:')).forEach(k => addEntry(k, playlists.get(k)));
    }

    // ── Master Render ───────────────────────────────────────────────────────
    function renderAudio() {
        const items = getAudioItems();
        const playlists = getPlaylists(items);
        renderSidebar(playlists);
        const pl = playlists.get(selectedPlaylist) || playlists.get('all');
        const key = playlists.has(selectedPlaylist) ? selectedPlaylist : 'all';
        renderTrack(pl.items, pl.name, key);
    }

    window.renderAudio = renderAudio;
    window.createAudioPlaylist = createPlaylist;
    window.renameAudioPlaylist = renamePlaylist;
    window.deleteAudioPlaylist = deletePlaylist;
})();
