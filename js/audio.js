/* ==========================================================================
   Vault Explorer — Audio Tab (Sidebar + Tracklist)
   ========================================================================== */

(function () {
    const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'aiff', 'ape']);
    let selectedPlaylist = 'all';
    let audioItems = [];

    function isAudioItem(item) {
        if (!item) return false;
        if (item.type === 'audio') return true;
        const ext = (item.ext || '').replace(/^\./, '').toLowerCase();
        return AUDIO_EXTS.has(ext);
    }

    function getAudioItems() {
        const source = window.displayedItems || window.allItems || [];
        return source.filter(isAudioItem);
    }

    function getPlaylists(items) {
        const folders = new Map();
        folders.set('all', { name: 'All Music', items: [] });
        items.forEach(item => {
            folders.get('all').items.push(item);
            const folder = item.folder || 'Uncategorized';
            if (!folders.has(folder)) folders.set(folder, { name: folder, items: [] });
            folders.get(folder).items.push(item);
        });
        return folders;
    }

    function renderEmptyTracklist() {
        const tracklist = el('audio-tracklist');
        if (!tracklist) return;
        tracklist.innerHTML = '';
        const empty = window.createFolderChooserEmptyState(
            { title: 'No Audio Found', body: 'Load a folder containing audio files to see playlists and tracks.' },
            () => window.browseTabFolder('audio')
        );
        empty.style.padding = '40px 0';
        tracklist.appendChild(empty);
    }

    function renderTrack(items, playlistName) {
        const tracklist = el('audio-tracklist');
        const titleEl = el('audio-playlist-title');
        const metaEl = el('audio-playlist-meta');
        const albumArt = el('audio-album-art');

        if (titleEl) titleEl.innerText = playlistName;
        if (metaEl) metaEl.innerText = `${items.length} track${items.length !== 1 ? 's' : ''}`;

        if (albumArt) {
            // Use first item thumbnail if available
            const first = items[0];
            if (first && first.thumbnail) {
                albumArt.innerHTML = `<img src="${window.sanitizePath(first.thumbnail)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
            } else {
                albumArt.innerHTML = `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--vault-slate);"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
            }
        }

        if (!tracklist) return;
        tracklist.innerHTML = '';

        if (items.length === 0) {
            renderEmptyTracklist();
            return;
        }

        // Header row
        const header = document.createElement('div');
        header.style.cssText = 'display: grid; grid-template-columns: 40px 1fr 120px 60px; padding: 8px 12px; font-size: 10px; color: var(--vault-slate); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--vault-border);';
        header.innerHTML = '<span>#</span><span>Title</span><span>Artist</span><span>Time</span>';
        tracklist.appendChild(header);

        items.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'audio-track-row';
            row.innerHTML = `
                <span class="track-num">${idx + 1}</span>
                <span class="track-title">${window.escapeHtml(item.name.replace(/\.[^.]+$/, ''))}</span>
                <span class="track-artist">${window.escapeHtml(item.artist || item.folder || 'Unknown')}</span>
                <span class="track-duration">${item.duration ? window.formatDuration(item.duration) : '--:--'}</span>
            `;
            row.addEventListener('dblclick', () => {
                if (typeof window.playAudio === 'function') {
                    window.playAudio(item, items, idx);
                }
            });
            tracklist.appendChild(row);
        });
    }

    window.renderAudio = function () {
        audioItems = getAudioItems();
        const playlists = getPlaylists(audioItems);
        const sidebarList = el('audio-playlist-list');
        if (sidebarList) {
            sidebarList.innerHTML = '';
            playlists.forEach((pl, key) => {
                const div = document.createElement('div');
                div.className = 'audio-sidebar-item' + (key === selectedPlaylist ? ' active' : '');
                div.innerText = pl.name;
                div.addEventListener('click', () => {
                    selectedPlaylist = key;
                    renderAudio();
                });
                sidebarList.appendChild(div);
            });
        }
        const pl = playlists.get(selectedPlaylist) || playlists.get('all');
        renderTrack(pl.items, pl.name);
    };
})();
