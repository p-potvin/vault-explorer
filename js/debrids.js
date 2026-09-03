/* ==========================================================================
   Vault Explorer — Debrids M3U Playlist Browser & HTTP Streaming Engine
   Features:
     • M3U / M3U8 Playlist Folder Homepage with rich metadata cards
     • Companion JSON sidecar integration (smart titles, sizes, hashes)
     • Video & Image stream grid matching the Videos tab file-card design system
     • Automatic non-media link filtering (.txt, .exe, .nfo, .pdf discarded)
     • Sub-type filtering pills: Videos (default) and Images
     • Seamless HTTP streaming inside the custom HTML5 video player
     • Local stream downloader with real-time progress feedback
   ========================================================================== */

(function () {
    window.debridPlaylists = [];
    window.currentDebridPlaylist = null;
    window.currentDebridStreams = [];
    window.currentDebridFilter = 'video';

    const ALLOWED_VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.m4v', '.flv', '.wmv'];
    const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

    // Helper to get DOM element
    function el(id) {
        return document.getElementById(id);
    }

    // Parse M3U playlist text with companion JSON manifest merging and non-media filtering
    function parseM3U(m3uText, companionManifest = null) {
        if (!m3uText || typeof m3uText !== 'string') return [];
        const lines = m3uText.split(/\r?\n/);
        const items = [];
        let currentExtInf = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('#EXTINF:')) {
                // Example: #EXTINF:-1 tvg-name="Video 1 (1).mp4" group-title="Group",Video 1 (1).mp4 (100.0 MB)
                const rest = line.substring(8);
                const commaIdx = rest.indexOf(',');
                let header = commaIdx >= 0 ? rest.substring(0, commaIdx) : rest;
                let title = commaIdx >= 0 ? rest.substring(commaIdx + 1).trim() : '';

                let tvgName = '';
                const tvgMatch = header.match(/tvg-name="([^"]+)"/i);
                if (tvgMatch) tvgName = tvgMatch[1];

                let groupTitle = '';
                const groupMatch = header.match(/group-title="([^"]+)"/i);
                if (groupMatch) groupTitle = groupMatch[1];

                const durMatch = header.match(/^([-\d]+)/);
                const duration = durMatch ? parseInt(durMatch[1], 10) : -1;

                currentExtInf = {
                    title: title || tvgName || 'Stream Item',
                    tvgName,
                    groupTitle,
                    duration: duration > 0 ? duration : 0
                };
            } else if (!line.startsWith('#')) {
                // Stream URL line
                const streamUrl = line;
                const extInf = currentExtInf || { title: 'Stream Video', tvgName: '', groupTitle: '', duration: 0 };
                currentExtInf = null;

                // Strip trailing size labels like " (100.0 MB)" from display name
                let cleanName = extInf.title.replace(/\s*\(\d+(\.\d+)?\s*(MB|GB|KB|bytes)\)\s*$/i, '').trim();
                if (!cleanName) cleanName = extInf.tvgName || 'Stream Video.mp4';

                // Detect extension
                const extMatch = cleanName.match(/\.([a-z0-9]+)$/i) || streamUrl.match(/\.([a-z0-9]+)(\?|$)/i);
                const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.mp4';

                // Classify media type
                let fileType = 'video';
                if (ALLOWED_IMAGE_EXTS.includes(ext)) {
                    fileType = 'image';
                } else if (ALLOWED_VIDEO_EXTS.includes(ext)) {
                    fileType = 'video';
                } else {
                    // Skip non-media files (.txt, .exe, .nfo, .pdf, .zip, etc.)
                    continue;
                }

                items.push({
                    name: cleanName,
                    filename: cleanName,
                    path: streamUrl,
                    link: streamUrl,
                    streamUrl: streamUrl,
                    type: fileType,
                    ext: ext,
                    isStreaming: true,
                    isDebrid: true,
                    duration: extInf.duration,
                    group: extInf.groupTitle,
                    size: 0,
                    thumbnail: null
                });
            }
        }

        // Merge rich metadata from companion JSON manifest if available
        if (companionManifest && Array.isArray(companionManifest.items)) {
            companionManifest.items.forEach((mItem) => {
                const targetUrl = mItem.link || mItem.url || mItem.streamUrl;
                const match = items.find(it => it.streamUrl === targetUrl || it.path === targetUrl);
                if (match) {
                    if (mItem.filesize) match.size = mItem.filesize;
                    if (mItem.smart_filename) {
                        match.name = mItem.smart_filename;
                        match.filename = mItem.smart_filename;
                    }
                    if (mItem.original_filename) match.originalFilename = mItem.original_filename;
                    if (mItem.thumbnail) match.thumbnail = mItem.thumbnail;
                    if (mItem.qualities) match.qualities = mItem.qualities;
                }
            });
        }

        return items;
    }

    // Scan the configured Debrids folder for M3U playlists
    async function loadDebridsFolder() {
        let folder = typeof window.getTabDefaultFolder === 'function' ? window.getTabDefaultFolder('debrids') : null;
        
        // Sensible default to python-zipper/playlists if empty
        if (!folder) {
            folder = (window.appSettings && window.appSettings.defaultFolder) || 'playlists';
        }

        const container = el('debrids-grid');
        if (!container) return;

        if (!folder) {
            renderEmptyFolderState(container, 'No Debrids Folder Selected', 'Choose a folder containing .m3u playlist files to browse and stream.');
            return;
        }

        container.innerHTML = `<div class="empty-state"><div class="spinner-small" style="margin-bottom:12px;"></div><p>Scanning playlists in ${window.escapeHtml(folder)}...</p></div>`;

        try {
            let files = [];
            if (window.electronAPI && typeof window.electronAPI.scanDirectory === 'function') {
                files = await window.electronAPI.scanDirectory(folder);
            }

            // Find all .m3u and .m3u8 files
            const m3uFiles = (files || []).filter(f => {
                const name = (f.name || f.path || '').toLowerCase();
                return name.endsWith('.m3u') || name.endsWith('.m3u8');
            });

            if (m3uFiles.length === 0) {
                renderEmptyFolderState(container, 'No M3U Playlists Found', `No .m3u or .m3u8 files were found in "${window.escapeHtml(folder)}". Generated playlists from python-zipper will appear here.`);
                return;
            }

            // Load companion JSON manifests where available
            const playlistsWithMeta = await Promise.all(m3uFiles.map(async (mFile) => {
                const baseName = mFile.name.replace(/\.(m3u8?)$/i, '');
                const jsonPath = mFile.path.replace(/\.(m3u8?)$/i, '.json');
                let manifest = null;
                if (window.electronAPI && typeof window.electronAPI.readTextFile === 'function') {
                    try {
                        const jsonStr = await window.electronAPI.readTextFile(jsonPath);
                        if (jsonStr) manifest = JSON.parse(jsonStr);
                    } catch (_) { }
                }

                return {
                    name: baseName,
                    title: (manifest && manifest.title) || baseName,
                    path: mFile.path,
                    jsonPath: jsonPath,
                    manifest: manifest,
                    itemCount: (manifest && manifest.total_items) || 0,
                    createdAt: (manifest && manifest.created_at) || ''
                };
            }));

            window.debridPlaylists = playlistsWithMeta;
            renderPlaylistsGrid(playlistsWithMeta);

        } catch (err) {
            console.error('[debrids] Failed to scan folder:', err);
            renderEmptyFolderState(container, 'Folder Scan Error', err.message || 'Could not load directory.');
        }
    }

    // Render empty state with folder chooser button
    function renderEmptyFolderState(container, heading, message) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 48px 24px; text-align:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 52px; height: 52px; margin-bottom: 16px; color: var(--vault-accent, #E5A93B); opacity: 0.85;">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    <polygon points="12 11 12 17 17 14 12 11" fill="currentColor" opacity="0.3"></polygon>
                </svg>
                <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: var(--vault-text); font-family: var(--font-sans);">${window.escapeHtml(heading)}</h3>
                <p style="margin: 0 0 20px; font-size: 13px; color: var(--vault-slate); max-width: 440px; line-height: 1.5;">${window.escapeHtml(message)}</p>
                <button id="debrids-btn-browse-folder" style="background: var(--vault-accent); color: var(--vt-primary, #0b0813); font-weight: 700; border: none; padding: 8px 20px; border-radius: 4px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-body); transition: all 0.2s;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    Choose Debrids Folder
                </button>
            </div>
        `;

        const btnBrowse = el('debrids-btn-browse-folder');
        if (btnBrowse) {
            btnBrowse.addEventListener('click', async () => {
                if (window.electronAPI && typeof window.electronAPI.openDirectory === 'function') {
                    const chosen = await window.electronAPI.openDirectory();
                    if (chosen) {
                        window.appSettings = window.appSettings || {};
                        window.appSettings.defaultFolderDebrids = chosen;
                        if (typeof window.electronAPI.saveSettings === 'function') {
                            window.electronAPI.saveSettings(window.appSettings);
                        }
                        loadDebridsFolder();
                    }
                }
            });
        }
    }

    // Render the grid of M3U playlist cards
    function renderPlaylistsGrid(playlists) {
        const grid = el('debrids-grid');
        if (!grid) return;
        grid.innerHTML = '';
        grid.style.display = 'grid';

        const pView = el('debrids-playlist-view');
        if (pView) pView.style.display = 'none';

        playlists.forEach((playlist, index) => {
            const card = document.createElement('div');
            card.className = 'file-card debrid-playlist-card';
            card.tabIndex = 0;
            card.style.cursor = 'pointer';

            const countBadge = playlist.itemCount > 0 ? `${playlist.itemCount} STREAMS` : 'M3U PLAYLIST';

            card.innerHTML = `
                <div class="thumbnail-container" style="position:relative; width:100%; aspect-ratio:16/9; background:linear-gradient(135deg, rgba(229,169,59,0.12), rgba(168,85,247,0.15)); display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:4px; border:1px solid var(--vault-border); overflow:hidden;">
                    <div style="width:48px; height:48px; border-radius:50%; background:rgba(0,0,0,0.4); border:1px solid var(--vault-accent); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 15px rgba(0,0,0,0.3); transition:all 0.2s ease;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px; height:22px; color:var(--vault-accent); margin-left:2px;">
                            <polygon points="5 3 19 12 5 21 5 3" fill="var(--vault-accent)"></polygon>
                        </svg>
                    </div>
                    <div class="duration-badge" style="display:block; position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.85); border:1px solid var(--vault-border); color:var(--vault-accent); font-family:var(--font-mono); font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:3px; letter-spacing:0.04em;">
                        ${window.escapeHtml(countBadge)}
                    </div>
                </div>
                <div class="filename-container" style="width:100%; text-align:center;">
                    <div class="filename" title="${window.escapeHtml(playlist.title)}">
                        ${window.escapeHtml(playlist.title)}
                    </div>
                </div>
            `;

            card.addEventListener('click', () => openDebridPlaylist(playlist));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDebridPlaylist(playlist);
                }
            });

            grid.appendChild(card);
       });
    }

    function getCleanPreviewBase(input) {
        if (!input) return 'stream';
        let str = String(input);
        if (str.includes('/') || str.includes('\\')) {
            str = str.split('?')[0].split(/[/\\]/).pop();
        }
        try {
            let prev;
            let count = 0;
            do {
                prev = str;
                str = decodeURIComponent(str);
                count++;
            } while (str !== prev && str.includes('%') && count < 5);
        } catch (_) {}

        str = str.replace(/\.[^.]+$/, '');
        str = str.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        return str || 'stream';
    }

    // Open an M3U playlist (accepts playlist object OR file path string from CLI/context menu)
    async function openDebridPlaylist(playlistInput) {
        let playlist = playlistInput;
        if (typeof playlistInput === 'string') {
            const m3uPath = playlistInput;
            const baseName = m3uPath.split(/[/\\]/).pop().replace(/\.(m3u8?)$/i, '');
            const jsonPath = m3uPath.replace(/\.(m3u8?)$/i, '.json');
            let manifest = null;
            if (window.electronAPI && typeof window.electronAPI.readTextFile === 'function') {
                try {
                    const jsonStr = await window.electronAPI.readTextFile(jsonPath);
                    if (jsonStr) manifest = JSON.parse(jsonStr);
                } catch (_) { }
            }
            playlist = {
                name: baseName,
                title: (manifest && manifest.title) || baseName,
                path: m3uPath,
                jsonPath,
                manifest,
                itemCount: (manifest && manifest.total_items) || 0
            };
        }

        if (!playlist || !playlist.path) return;
        window.currentDebridPlaylist = playlist;

        const grid = el('debrids-grid');
        const pView = el('debrids-playlist-view');
        const titleEl = el('debrids-playlist-title');
        const countEl = el('debrids-playlist-count');
        const sGrid = el('debrids-streams-grid');

        if (grid) grid.style.display = 'none';
        if (pView) pView.style.display = 'block';
        if (titleEl) titleEl.textContent = playlist.title || playlist.name;
        if (sGrid) sGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="spinner-small" style="margin-bottom:12px;"></div><p>Parsing playlist streams...</p></div>';

        try {
            let m3uContent = '';
            if (window.electronAPI && typeof window.electronAPI.readTextFile === 'function') {
                m3uContent = await window.electronAPI.readTextFile(playlist.path);
            }

            const streams = parseM3U(m3uContent, playlist.manifest);
            window.currentDebridStreams = streams;

            const playlistDir = playlist.path ? playlist.path.substring(0, Math.max(playlist.path.lastIndexOf('\\'), playlist.path.lastIndexOf('/'))) : '';

            // Derive and link cached thumbnails and WebM previews
            streams.forEach(s => {
                if (s.type === 'video') {
                    const cleanBase = getCleanPreviewBase(s.filename || s.name || s.streamUrl || s.path);
                    const thumbPath = `${playlistDir}\\.thumbs\\${cleanBase}.jpg`;
                    const webmPath = `${playlistDir}\\.thumbs\\${cleanBase}.webm`;
                    if (!s.thumbnail) s.thumbnail = thumbPath;
                    if (!s.hoverWebm) s.hoverWebm = webmPath;
                }
            });

            // Trigger background preview generation for video streams
            if (window.electronAPI && typeof window.electronAPI.generateWebm === 'function') {
                const videoStreams = streams.filter(s => s.type === 'video');
                videoStreams.slice(0, 5).forEach(v => {
                    const customFn = v.filename || v.name;
                    window.electronAPI.generateWebm(v.streamUrl || v.path, playlistDir, customFn).catch(() => {});
                });
            }

            const videoCount = streams.filter(s => s.type === 'video').length;
            const imageCount = streams.filter(s => s.type === 'image').length;

            if (countEl) {
                countEl.textContent = `${videoCount} Video${videoCount === 1 ? '' : 's'}${imageCount > 0 ? ` · ${imageCount} Image${imageCount === 1 ? '' : 's'}` : ''} · Direct HTTP Streams`;
            }

            // Default filter to videos if any exist, else images
            window.currentDebridFilter = videoCount > 0 ? 'video' : (imageCount > 0 ? 'image' : 'all');

            renderTypeFilterPills(videoCount, imageCount, streams.length);
            renderFilteredStreams();

        } catch (err) {
            console.error('[debrids] Failed to open playlist:', err);
            sGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>Failed to parse playlist: ${window.escapeHtml(err.message)}</p></div>`;
        }
    }

    // Render filter pills for sub-type filtering (Videos / Images / All)
    function renderTypeFilterPills(videoCount, imageCount, totalCount) {
        const filterContainer = el('debrids-type-filters');
        if (!filterContainer) return;
        filterContainer.innerHTML = '';

        const filters = [];
        if (videoCount > 0) filters.push({ id: 'video', label: `🎬 Videos (${videoCount})` });
        if (imageCount > 0) filters.push({ id: 'image', label: `🖼️ Images (${imageCount})` });
        if (videoCount > 0 && imageCount > 0) filters.push({ id: 'all', label: `All (${totalCount})` });

        // If only 1 type exists, no need for filter pills
        if (filters.length <= 1) return;

        filters.forEach(f => {
            const btn = document.createElement('button');
            const isActive = window.currentDebridFilter === f.id;
            btn.className = `debrid-filter-pill ${isActive ? 'active' : ''}`;
            btn.style.cssText = `
                background: ${isActive ? 'var(--vault-accent)' : 'rgba(255,255,255,0.06)'};
                color: ${isActive ? 'var(--vt-primary, #0b0813)' : 'var(--vault-text)'};
                font-weight: 700;
                font-family: var(--font-mono);
                font-size: 10px;
                border: 1px solid ${isActive ? 'transparent' : 'var(--vault-border)'};
                padding: 4px 10px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
                letter-spacing: 0.03em;
            `;
            btn.textContent = f.label;
            btn.addEventListener('click', () => {
                window.currentDebridFilter = f.id;
                renderTypeFilterPills(videoCount, imageCount, totalCount);
                renderFilteredStreams();
            });
            filterContainer.appendChild(btn);
        });
    }

    // Render currently filtered stream items into the grid
    function renderFilteredStreams() {
        const streams = window.currentDebridStreams || [];
        const filter = window.currentDebridFilter || 'video';

        let itemsToRender = streams;
        if (filter === 'video') {
            itemsToRender = streams.filter(s => s.type === 'video');
        } else if (filter === 'image') {
            itemsToRender = streams.filter(s => s.type === 'image');
        }

        renderStreamsGrid(itemsToRender);
    }

    // Render stream items as file-cards matching the Videos tab exact DOM structure
    function renderStreamsGrid(itemsToRender) {
        const sGrid = el('debrids-streams-grid');
        if (!sGrid) return;
        sGrid.innerHTML = '';

        if (!itemsToRender || itemsToRender.length === 0) {
            sGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><p>No items found for the selected filter.</p></div>';
            return;
        }

        const allVideos = (window.currentDebridStreams || []).filter(s => s.type === 'video');
        const playlistDir = window.currentDebridPlaylist && window.currentDebridPlaylist.path
            ? window.currentDebridPlaylist.path.substring(0, Math.max(window.currentDebridPlaylist.path.lastIndexOf('\\'), window.currentDebridPlaylist.path.lastIndexOf('/')))
            : '';

        itemsToRender.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'file-card debrid-stream-card';
            card.tabIndex = 0;
            card.dataset.index = index;
            card.dataset.streamUrl = item.streamUrl;
            card.dataset.path = item.path;
            card.title = item.name;

            const sizeStr = item.size > 0 && typeof window.formatBytes === 'function'
                ? window.formatBytes(item.size)
                : '';

            const durationStr = item.duration > 0 && typeof window.formatDuration === 'function'
                ? window.formatDuration(item.duration)
                : '';

            const isImage = item.type === 'image';

            card.innerHTML = `
                <div class="thumbnail-container">
                    ${item.thumbnail ? `<img class="thumbnail" src="${window.sanitizePath(item.thumbnail)}" alt="${window.escapeHtml(item.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">` : ''}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:40px; height:40px; color:var(--vault-accent); opacity:0.75; display:${item.thumbnail ? 'none' : 'block'};">
                        ${isImage ? '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>' : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'}
                    </svg>
                    <div class="stream-badge" style="position:absolute; top:8px; left:8px; background:rgba(168,85,247,0.85); color:#fff; font-family:var(--font-mono); font-size:9px; font-weight:700; padding:2px 6px; border-radius:3px; letter-spacing:0.04em;">
                        ${isImage ? 'IMAGE' : 'STREAM'}
                    </div>
                    ${durationStr ? `<div class="duration-badge" style="display:block;">${durationStr}</div>` : ''}
                    ${sizeStr ? `<div class="size-badge" style="position:absolute; bottom:8px; left:8px; background:rgba(0,0,0,0.75); color:#fff; font-family:var(--font-mono); font-size:9.5px; padding:2px 6px; border-radius:3px; border:1px solid var(--vault-border);">${sizeStr}</div>` : ''}
                </div>
                <div class="filename-container">
                    <div class="filename" title="${window.escapeHtml(item.name)}">
                        ${window.escapeHtml(item.name)}
                    </div>
                </div>
            `;

            // Attach WebM Hover Preview
            if (item.hoverWebm && typeof window.attachHoverWebmToCard === 'function') {
                window.attachHoverWebmToCard(card, item.hoverWebm);
            }

            const triggerAction = () => {
                if (item.type === 'video') {
                    if (typeof window.playItem === 'function') {
                        const vIdx = allVideos.indexOf(item);
                        window.playItem(vIdx >= 0 ? vIdx : index, allVideos);
                    }
                } else if (item.type === 'image') {
                    if (window.electronAPI && typeof window.electronAPI.openFile === 'function') {
                        window.electronAPI.openFile(item.streamUrl || item.path);
                    }
                }
            };

            card.addEventListener('dblclick', triggerAction);

            const thumb = card.querySelector('.thumbnail-container');
            if (thumb) {
                // Single-click preview opening
                thumb.addEventListener('click', (e) => {
                    e.stopPropagation();
                    triggerAction();
                });
            }

            card.addEventListener('click', () => {
                document.querySelectorAll('.debrid-stream-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });

            // Context Menu Listener
            card.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.electronAPI && typeof window.electronAPI.showContextMenu === 'function') {
                    const action = await window.electronAPI.showContextMenu({
                        path: item.streamUrl || item.path,
                        name: item.name,
                        type: 'stream',
                        isStream: true,
                        mediaType: item.type
                    });
                    if (action === 'play-stream') {
                        triggerAction();
                    } else if (action === 'generate-webm') {
                        if (window.electronAPI && typeof window.electronAPI.generateWebm === 'function') {
                            window.electronAPI.generateWebm(item.streamUrl || item.path, playlistDir, item.filename || item.name);
                        }
                    } else if (action === 'download-stream') {
                        window.downloadDebridStream(item);
                    }
                }
            });

            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerAction();
                }
            });

            sGrid.appendChild(card);
        });
    }

    // Helper to download a debrid stream locally
    window.downloadDebridStream = async function (item) {
        if (!item) return;
        const streamUrl = item.streamUrl || item.path;
        const filename = item.filename || item.name || 'stream_video.mp4';
        if (!streamUrl) return;

        if (typeof window.showToast === 'function') {
            window.showToast(`[Download] Saving "${filename}" to Downloads...`, 'info');
        }
        try {
            if (window.electronAPI && typeof window.electronAPI.downloadStream === 'function') {
                const res = await window.electronAPI.downloadStream({
                    url: streamUrl,
                    filename: filename
                });
                if (res && res.success) {
                    if (typeof window.showToast === 'function') {
                        window.showToast(`[Download] ✓ Saved to Downloads: ${filename}`, 'success');
                    }
                } else {
                    if (typeof window.showToast === 'function') {
                        window.showToast(`[Download] Failed: ${(res && res.error) || 'Download failed'}`, 'error');
                    }
                }
            }
        } catch (err) {
            if (typeof window.showToast === 'function') {
                window.showToast(`[Download] Error: ${err.message}`, 'error');
            }
        }
    };

    // Return from playlist streams grid back to playlists folder overview
    function backToDebrids() {
        const grid = el('debrids-grid');
        const pView = el('debrids-playlist-view');
        if (pView) pView.style.display = 'none';
        if (grid) grid.style.display = 'grid';
        window.currentDebridPlaylist = null;
    }

    // Initialize listeners
    function initDebridsListeners() {
        const btnBack = el('btn-back-to-debrids');
        if (btnBack) {
            btnBack.addEventListener('click', backToDebrids);
        }

        const btnChangeFolder = el('btn-debrids-change-folder');
        if (btnChangeFolder) {
            btnChangeFolder.addEventListener('click', async () => {
                if (window.electronAPI && typeof window.electronAPI.openDirectory === 'function') {
                    const chosen = await window.electronAPI.openDirectory();
                    if (chosen) {
                        window.appSettings = window.appSettings || {};
                        window.appSettings.defaultFolderDebrids = chosen;
                        if (typeof window.electronAPI.saveSettings === 'function') {
                            window.electronAPI.saveSettings(window.appSettings);
                        }
                        loadDebridsFolder();
                    }
                }
            });
        }
    }

    // Exported global renderer called by Navigation Tabs
    window.renderDebrids = function () {
        if (!window.currentDebridPlaylist) {
            loadDebridsFolder();
        }
    };

    window.openDebridPlaylist = openDebridPlaylist;
    window.backToDebrids = backToDebrids;
    window.initDebridsListeners = initDebridsListeners;

    // Boot on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDebridsListeners);
    } else {
        initDebridsListeners();
    }
})();
