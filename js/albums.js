/* ==========================================================================
   Vault Explorer — Photo Albums & Galleries Section
   Features:
     • Split Section View: Custom Galleries (window.vf type 'album') + Folder Albums
     • Sub-nav filter pills: All Albums, My Galleries, Folders
     • Album CRUD: Create, Rename, Delete, Set/Remove Custom Cover
     • Photo River: Multi-column grid with incremental chunk virtual rendering
       (handles 10,000+ photos without DOM lag)
     • Photo Actions: Open in Lightbox Viewer, Edit in Photo Editor, AI Upscale,
       Add to Album, Favorite Star, Remove from Album
     • Drag and drop images into custom albums
   ========================================================================== */

(function () {
    const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'tiff', 'tif']);
    const CHUNK_SIZE = 80;

    let currentAlbum = null;
    let currentAlbumPhotos = [];
    let activeFilterSubtab = 'all'; // 'all' | 'custom' | 'folders'
    let renderedPhotoCount = 0;
    let isRiverScrollBound = false;

    function isPhoto(item) {
        if (!item) return false;
        if (item.type === 'image') return true;
        const ext = (item.ext || '').replace(/^\./, '').toLowerCase();
        if (PHOTO_EXTS.has(ext)) return true;
        const nameExt = (item.name || '').split('.').pop().toLowerCase();
        return PHOTO_EXTS.has(nameExt);
    }

    function getAllPhotos() {
        const source = window.allItems || window.displayedItems || [];
        return source.filter(isPhoto);
    }

    function groupFolderAlbums(photos) {
        const groups = new Map();
        photos.forEach(item => {
            const folder = item.folder || 'Uncategorized';
            if (!groups.has(folder)) {
                groups.set(folder, { name: folder, items: [], cover: null, user: false, key: 'folder:' + folder });
            }
            const g = groups.get(folder);
            g.items.push(item);
            if (!g.cover && (item.thumbnail || item.path)) g.cover = item.thumbnail || item.path;
        });
        return Array.from(groups.values());
    }

    function getCustomAlbums(photos) {
        if (!window.vf) return [];
        const byPath = new Map(photos.map(p => [p.path.toLowerCase().replace(/\\/g, '/'), p]));
        const covers = (window.appSettings && window.appSettings.albumCovers) || {};

        return window.vf.list({ type: 'album', parentId: null }).map(f => {
            const memberPaths = window.vf.itemsOf(f.id);
            const members = memberPaths.map(p => {
                const norm = p.toLowerCase().replace(/\\/g, '/');
                return byPath.get(norm) || {
                    path: p,
                    name: p.split(/[\\/]/).pop(),
                    type: 'image',
                    folder: f.name,
                };
            });

            let cover = covers[f.id] || null;
            if (!cover && members.length > 0) {
                cover = members[0].thumbnail || members[0].path;
            }

            return {
                id: f.id,
                name: f.name,
                items: members,
                cover,
                user: true,
                key: 'vf:' + f.id,
                vfId: f.id,
            };
        });
    }

    // ── Album CRUD ──────────────────────────────────────────────────────────
    async function createCustomAlbum(initialName, initialItems = []) {
        const name = (typeof initialName === 'string' && initialName.trim())
            ? initialName.trim()
            : (window.showPromptDialog ? await window.showPromptDialog('New album / gallery name:', '', 'Enter album name') : null);
        if (!name || !name.trim()) return null;

        const res = window.vf
            ? window.vf.create({ name: name.trim(), type: 'album' })
            : { ok: false, error: 'Virtual folders unavailable' };

        if (res.ok) {
            if (initialItems.length > 0) {
                window.vf.addItems(res.folder.id, initialItems);
            }
            if (window.showToast) window.showToast(`Album "${name.trim()}" created`, 'success');
            renderAlbumGrid();
            return res.folder;
        } else {
            if (window.showToast) window.showToast(res.error || 'Could not create album', 'error');
            return null;
        }
    }

    async function renameCustomAlbum(vfId, oldName) {
        const newName = window.showPromptDialog
            ? await window.showPromptDialog('Rename album:', oldName, 'Enter new album name')
            : null;
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        if (window.vf && typeof window.vf.rename === 'function') {
            const res = window.vf.rename(vfId, newName.trim());
            if (res.ok) {
                if (window.showToast) window.showToast(`Album renamed to "${newName.trim()}"`, 'success');
                if (currentAlbum && currentAlbum.vfId === vfId) {
                    currentAlbum.name = newName.trim();
                    const title = el('album-photos-title');
                    if (title) title.innerText = newName.trim();
                }
                renderAlbumGrid();
            } else {
                if (window.showToast) window.showToast(res.error || 'Rename failed', 'error');
            }
        }
    }

    async function deleteCustomAlbum(vfId, name) {
        const confirmed = window.showConfirmDialog
            ? await window.showConfirmDialog(`Are you sure you want to delete the album "${name}"? Photos will not be deleted from disk.`, 'Delete Album')
            : confirm(`Are you sure you want to delete the album "${name}"? Photos will not be deleted from disk.`);
        if (!confirmed) return;
        if (window.vf && typeof window.vf.remove === 'function') {
            window.vf.remove(vfId);
            if (window.showToast) window.showToast(`Album "${name}" deleted`, 'info');
            showAlbumGrid();
            renderAlbumGrid();
        }
    }

    function assignAlbumCover(albumId) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', () => {
            const f = input.files && input.files[0];
            if (!f || !f.path) return;
            window.appSettings.albumCovers = window.appSettings.albumCovers || {};
            window.appSettings.albumCovers[albumId] = f.path;
            if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
                window.electronAPI.saveSettings(window.appSettings);
            }
            if (window.showToast) window.showToast('Album cover updated', 'success');
            renderAlbumGrid();
        });
        input.click();
    }

    function removeAlbumCover(albumId) {
        if (window.appSettings && window.appSettings.albumCovers && window.appSettings.albumCovers[albumId]) {
            delete window.appSettings.albumCovers[albumId];
            if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
                window.electronAPI.saveSettings(window.appSettings);
            }
            if (window.showToast) window.showToast('Album cover reset', 'info');
            renderAlbumGrid();
        }
    }

    // ── Add to Album Popup ──────────────────────────────────────────────────
    function showAddToAlbumMenu(item, anchorEv) {
        const old = el('photo-album-menu');
        if (old) old.remove();
        const menu = document.createElement('div');
        menu.id = 'photo-album-menu';
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

        const albums = window.vf ? window.vf.list({ type: 'album', parentId: null }) : [];
        if (albums.length === 0) {
            const none = document.createElement('div');
            none.textContent = 'No custom albums yet';
            none.style.cssText = 'padding: 7px 12px; color: var(--vault-slate); font-size: 11px;';
            menu.appendChild(none);
        }
        albums.forEach(f => mkRow(f.name, () => {
            window.vf.addItems(f.id, [item.path]);
            if (window.showToast) window.showToast(`Added to "${f.name}"`, 'success');
            if (currentAlbum && currentAlbum.vfId === f.id) {
                showAlbumPhotos(currentAlbum);
            }
        }));

        mkRow('+ New album…', () => {
            createCustomAlbum(null, [item.path]);
        }, true);

        document.body.appendChild(menu);
        setTimeout(() => {
            const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
            document.addEventListener('mousedown', close);
        }, 0);
    }

    // ── Album Context Menu ──────────────────────────────────────────────────
    function showAlbumContextMenu(album, ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const old = el('album-ctx-menu');
        if (old) old.remove();

        const menu = document.createElement('div');
        menu.id = 'album-ctx-menu';
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

        if (album.user) {
            mkItem('Rename Album', () => renameCustomAlbum(album.vfId, album.name));
            mkItem('Change Cover Image', () => assignAlbumCover(album.vfId));
            if (window.appSettings?.albumCovers?.[album.vfId]) {
                mkItem('Reset Cover to Default', () => removeAlbumCover(album.vfId));
            }
            mkItem('Delete Album', () => deleteCustomAlbum(album.vfId, album.name), true);
        } else {
            mkItem('Open Folder Album', () => showAlbumPhotos(album));
        }

        document.body.appendChild(menu);
        setTimeout(() => {
            const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
            document.addEventListener('mousedown', close);
        }, 0);
    }

    // ── Album Card ──────────────────────────────────────────────────────────
    function createAlbumCard(album) {
        const card = document.createElement('div');
        card.className = 'file-card album-card';
        card.style.cssText = 'cursor: pointer; position: relative; border-radius: 12px; overflow: hidden; background: var(--vault-card-bg, #1a1728); border: 1px solid var(--vault-border); transition: transform 0.2s, box-shadow 0.2s;';

        const coverSrc = album.cover
            ? window.sanitizePath(album.cover)
            : 'data:image/svg+xml;utf8,<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="%231a1728"/><circle cx="50%" cy="50%" r="30" fill="%232A2340"/><text x="50%" y="54%" fill="%23a394cc" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">NO PHOTO</text></svg>';

        card.innerHTML = `
            <div class="thumbnail-container" style="position:relative; width: 100%; aspect-ratio: 4/3; overflow: hidden; background: #0b0813;">
                <img class="thumbnail" src="${coverSrc}" alt="${window.escapeHtml(album.name)}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;">
                ${album.user ? '<span style="position:absolute; top:8px; left:8px; background:var(--vault-accent); color:var(--vt-primary,#0b0813); font-size:9px; font-weight:800; text-transform:uppercase; padding:2px 6px; border-radius:4px; font-family:var(--font-mono); letter-spacing:0.05em;">Gallery</span>' : ''}
            </div>
            <div class="filename-container" style="padding: 10px 12px;">
                <div class="filename" style="font-weight: 700; font-size: 13px; color: var(--vault-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${window.escapeHtml(album.name)}</div>
                <div style="font-size:10.5px; color:var(--vault-slate); margin-top:3px; font-family:var(--font-mono);">${album.items.length} photo${album.items.length !== 1 ? 's' : ''}</div>
            </div>
        `;

        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-3px)';
            card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
            const img = card.querySelector('img');
            if (img) img.style.transform = 'scale(1.04)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'none';
            card.style.boxShadow = 'none';
            const img = card.querySelector('img');
            if (img) img.style.transform = 'none';
        });

        // Drag and drop onto album card
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            card.style.outline = '2px dashed var(--vault-accent)';
        });
        card.addEventListener('dragleave', () => { card.style.outline = 'none'; });
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.style.outline = 'none';
            if (album.user && album.vfId && window.vf) {
                const paths = [];
                if (e.dataTransfer.files && e.dataTransfer.files.length) {
                    for (let i = 0; i < e.dataTransfer.files.length; i++) {
                        paths.push(e.dataTransfer.files[i].path);
                    }
                }
                if (paths.length) {
                    window.vf.addItems(album.vfId, paths);
                    if (window.showToast) window.showToast(`Added ${paths.length} photo(s) to "${album.name}"`, 'success');
                    renderAlbumGrid();
                }
            }
        });

        card.addEventListener('contextmenu', (e) => showAlbumContextMenu(album, e));
        card.addEventListener('click', () => showAlbumPhotos(album));
        return card;
    }

    // ── Photo River Inside Album ────────────────────────────────────────────
    function showAlbumPhotos(album) {
        currentAlbum = album;
        currentAlbumPhotos = album.items || [];
        renderAlbumPhotoView();
    }

    function renderPhotoRiverChunk(startIndex, count) {
        const river = el('album-photos-river');
        if (!river) return;

        const endIndex = Math.min(startIndex + count, currentAlbumPhotos.length);
        const fragment = document.createDocumentFragment();
        const isUserAlbum = currentAlbum && currentAlbum.user && currentAlbum.vfId;

        for (let idx = startIndex; idx < endIndex; idx++) {
            const item = currentAlbumPhotos[idx];
            const thumbSrc = item.thumbnail ? window.sanitizePath(item.thumbnail) : window.sanitizePath(item.path);

            const div = document.createElement('div');
            div.className = 'photo-item';
            div.style.cssText = 'position: relative; margin-bottom: 16px; border-radius: 8px; overflow: hidden; background: var(--vault-card-bg, #1a1728); border: 1px solid var(--vault-border); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; break-inside: avoid;';
            div.dataset.index = idx;
            div.dataset.path = item.path;

            const img = document.createElement('img');
            img.src = thumbSrc;
            img.alt = item.name;
            img.loading = 'lazy';
            img.style.cssText = 'width: 100%; display: block; object-fit: cover; border-radius: 7px; transition: transform 0.3s ease;';
            img.onerror = () => {
                img.style.display = 'none';
                div.style.padding = '40px 10px';
                div.style.textAlign = 'center';
                div.innerHTML = `<span style="font-size:10px; color:var(--vault-slate); font-family:var(--font-mono);">${window.escapeHtml(item.name)}</span>`;
            };

            div.appendChild(img);

            // Action overlay bar on hover
            const overlay = document.createElement('div');
            overlay.className = 'photo-overlay-actions';
            overlay.style.cssText = 'position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 10px; background: linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0)); display: flex; align-items: center; justify-content: space-between; opacity: 0; transition: opacity 0.2s ease;';

            const leftActions = document.createElement('div');
            leftActions.style.cssText = 'display: flex; gap: 6px; align-items: center;';

            // Favorite star
            const isFav = (typeof window.isFavorite === 'function')
                ? window.isFavorite(item.path)
                : !!(window.appSettings?.favorites && window.appSettings.favorites.some(p => (p || '').replace(/\\/g, '/').toLowerCase() === (item.path || '').replace(/\\/g, '/').toLowerCase()));
            const favBtn = document.createElement('button');
            favBtn.title = isFav ? 'Remove from Favorites' : 'Add to Favorites';
            favBtn.textContent = '★';
            favBtn.style.cssText = `background: transparent; border: none; color: ${isFav ? 'var(--vault-gold, #F0B94B)' : '#ffffff'}; cursor: pointer; font-size: 14px; padding: 0 2px; text-shadow: 0 1px 4px rgba(0,0,0,0.8);`;
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.toggleFavorite === 'function') {
                    window.toggleFavorite(item.path, favBtn);
                    const nowFav = (typeof window.isFavorite === 'function') ? window.isFavorite(item.path) : !isFav;
                    favBtn.style.color = nowFav ? 'var(--vault-gold, #F0B94B)' : '#ffffff';
                }
            });
            leftActions.appendChild(favBtn);

            // Add to Album button
            const addBtn = document.createElement('button');
            addBtn.title = 'Add to Album';
            addBtn.textContent = '+';
            addBtn.style.cssText = 'background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: #ffffff; cursor: pointer; font-size: 12px; width: 20px; height: 20px; border-radius: 4px; display: flex; align-items: center; justify-content: center;';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAddToAlbumMenu(item, e);
            });
            leftActions.appendChild(addBtn);

            overlay.appendChild(leftActions);

            const rightActions = document.createElement('div');
            rightActions.style.cssText = 'display: flex; gap: 6px; align-items: center;';

            // Edit photo button
            const editBtn = document.createElement('button');
            editBtn.title = 'Edit in Photo Editor';
            editBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
            editBtn.style.cssText = 'background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: #ffffff; cursor: pointer; padding: 3px 6px; border-radius: 4px; display: flex; align-items: center; justify-content: center;';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.openPhotoEditor === 'function') {
                    window.openPhotoEditor(item, currentAlbumPhotos);
                }
            });
            rightActions.appendChild(editBtn);

            // Remove from album if user custom album
            if (isUserAlbum) {
                const rmBtn = document.createElement('button');
                rmBtn.title = 'Remove from Album';
                rmBtn.textContent = '✕';
                rmBtn.style.cssText = 'background: rgba(255,77,79,0.3); border: 1px solid rgba(255,77,79,0.5); color: #ffffff; cursor: pointer; font-size: 11px; width: 20px; height: 20px; border-radius: 4px; display: flex; align-items: center; justify-content: center;';
                rmBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (window.vf && typeof window.vf.removeItems === 'function') {
                        window.vf.removeItems(currentAlbum.vfId, [item.path]);
                        if (window.showToast) window.showToast(`Removed "${item.name}" from album`, 'info');
                        currentAlbumPhotos.splice(idx, 1);
                        renderAlbumPhotoView();
                    }
                });
                rightActions.appendChild(rmBtn);
            }

            overlay.appendChild(rightActions);
            div.appendChild(overlay);

            div.addEventListener('mouseenter', () => {
                div.style.transform = 'translateY(-2px)';
                div.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)';
                overlay.style.opacity = '1';
            });
            div.addEventListener('mouseleave', () => {
                div.style.transform = 'none';
                div.style.boxShadow = 'none';
                overlay.style.opacity = '0';
            });

            // Click opens maximized Lightbox Viewer
            div.addEventListener('click', () => {
                if (typeof window.openImageViewer === 'function') {
                    window.openImageViewer(idx, currentAlbumPhotos);
                }
            });

            fragment.appendChild(div);
        }

        river.appendChild(fragment);
        renderedPhotoCount = endIndex;
    }

    function renderAlbumPhotoView() {
        const grid = el('albums-grid');
        const view = el('album-photos-view');
        const river = el('album-photos-river');
        const title = el('album-photos-title');
        const container = el('albums-container');
        if (!grid || !view || !river) return;

        grid.style.display = 'none';
        view.style.display = 'block';

        const albumName = currentAlbum ? currentAlbum.name : 'Album';
        if (title) {
            title.innerHTML = `
                <span>${window.escapeHtml(albumName)}</span>
                <span style="font-size:11px; color:var(--vault-slate); font-family:var(--font-mono); font-weight:400; margin-left:8px;">${currentAlbumPhotos.length} photo${currentAlbumPhotos.length !== 1 ? 's' : ''}</span>
            `;
        }

        river.innerHTML = '';
        renderedPhotoCount = 0;

        if (currentAlbumPhotos.length === 0) {
            river.innerHTML = `
                <div class="empty-state" style="column-span: all; text-align: center; padding: 60px 20px;">
                    <p style="color: var(--vault-slate); font-family: var(--font-mono); font-size: 13px;">No photos in this album yet.</p>
                </div>
            `;
            return;
        }

        renderPhotoRiverChunk(0, CHUNK_SIZE);

        if (container && !isRiverScrollBound) {
            isRiverScrollBound = true;
            container.addEventListener('scroll', () => {
                if (view.style.display !== 'none') {
                    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 300) {
                        if (renderedPhotoCount < currentAlbumPhotos.length) {
                            renderPhotoRiverChunk(renderedPhotoCount, CHUNK_SIZE);
                        }
                    }
                }
            });
        }
    }

    function showAlbumGrid() {
        const grid = el('albums-grid');
        const view = el('album-photos-view');
        if (grid) grid.style.display = 'block';
        if (view) view.style.display = 'none';
        currentAlbum = null;
        currentAlbumPhotos = [];
    }

    // ── Master Album Grid (Split View + Filter Pills) ───────────────────────
    function renderAlbumGrid() {
        const container = el('albums-grid');
        if (!container) return;
        showAlbumGrid();
        container.innerHTML = '';

        const photos = getAllPhotos();
        const customAlbums = getCustomAlbums(photos);
        const folderAlbums = groupFolderAlbums(photos);

        if (customAlbums.length === 0 && folderAlbums.length === 0) {
            const empty = window.createFolderChooserEmptyState(
                { title: 'No Albums Yet', body: 'Load a folder containing images to view and organize them into galleries.' },
                () => window.browseTabFolder('photoalbums')
            );
            container.appendChild(empty);
            return;
        }

        // Sub-nav pill bar for Albums
        const pillBar = document.createElement('div');
        pillBar.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--vault-border);';

        const pills = [
            { id: 'all', label: 'All Albums' },
            { id: 'custom', label: `My Galleries (${customAlbums.length})` },
            { id: 'folders', label: `Folders (${folderAlbums.length})` },
        ];

        pills.forEach(p => {
            const btn = document.createElement('button');
            const isActive = activeFilterSubtab === p.id;
            btn.textContent = p.label;
            btn.style.cssText = `font-size: 10.5px; font-weight: 700; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; padding: 5px 12px; border-radius: 20px; cursor: pointer; transition: all 0.2s; ${isActive ? 'background: var(--vault-accent); color: var(--vt-primary, #0b0813); border: none;' : 'background: transparent; color: var(--vault-text); border: 1px solid var(--vault-border); opacity: 0.8;'}`;
            btn.addEventListener('click', () => {
                activeFilterSubtab = p.id;
                renderAlbumGrid();
            });
            pillBar.appendChild(btn);
        });

        // "+ New Album" button on right of pill bar
        const newAlbumBtn = document.createElement('button');
        newAlbumBtn.innerHTML = `+ New Album`;
        newAlbumBtn.style.cssText = 'margin-left: auto; background: transparent; border: 1px dashed var(--vault-accent); color: var(--vault-accent); font-family: var(--font-mono); font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 5px 14px; border-radius: 20px; cursor: pointer; transition: all 0.2s;';
        newAlbumBtn.addEventListener('mouseenter', () => { newAlbumBtn.style.background = 'rgba(176, 124, 255, 0.12)'; });
        newAlbumBtn.addEventListener('mouseleave', () => { newAlbumBtn.style.background = 'transparent'; });
        newAlbumBtn.addEventListener('click', () => createCustomAlbum());
        pillBar.appendChild(newAlbumBtn);

        container.appendChild(pillBar);

        // Section 1: Custom Galleries
        if (activeFilterSubtab === 'all' || activeFilterSubtab === 'custom') {
            const section1 = document.createElement('div');
            section1.style.marginBottom = '32px';

            const h1 = document.createElement('h3');
            h1.innerHTML = `<span style="color:var(--vault-accent);">My Galleries</span> <span style="font-size:11px; color:var(--vault-slate); font-weight:400; font-family:var(--font-mono);">(${customAlbums.length})</span>`;
            h1.style.cssText = 'font-size: 14px; font-weight: 700; text-transform: uppercase; font-family: var(--font-mono); letter-spacing: 0.05em; margin: 0 0 16px 0; color: var(--vault-text);';
            section1.appendChild(h1);

            const grid1 = document.createElement('div');
            grid1.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px;';

            if (customAlbums.length === 0) {
                const emptyGal = document.createElement('div');
                emptyGal.style.cssText = 'grid-column: 1 / -1; padding: 30px; border: 1px dashed var(--vault-border); border-radius: 8px; text-align: center; color: var(--vault-slate); font-family: var(--font-mono); font-size: 11.5px;';
                emptyGal.innerHTML = `No custom galleries created yet. Click <strong>+ New Album</strong> above to organize photos.`;
                grid1.appendChild(emptyGal);
            } else {
                customAlbums.forEach(album => grid1.appendChild(createAlbumCard(album)));
            }

            section1.appendChild(grid1);
            container.appendChild(section1);
        }

        // Section 2: Folder Albums
        if (activeFilterSubtab === 'all' || activeFilterSubtab === 'folders') {
            const section2 = document.createElement('div');

            const h2 = document.createElement('h3');
            h2.innerHTML = `<span>Folder Albums</span> <span style="font-size:11px; color:var(--vault-slate); font-weight:400; font-family:var(--font-mono);">(${folderAlbums.length})</span>`;
            h2.style.cssText = 'font-size: 14px; font-weight: 700; text-transform: uppercase; font-family: var(--font-mono); letter-spacing: 0.05em; margin: 0 0 16px 0; color: var(--vault-text);';
            section2.appendChild(h2);

            const grid2 = document.createElement('div');
            grid2.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px;';

            if (folderAlbums.length === 0) {
                const emptyFld = document.createElement('div');
                emptyFld.style.cssText = 'grid-column: 1 / -1; padding: 30px; border: 1px dashed var(--vault-border); border-radius: 8px; text-align: center; color: var(--vault-slate); font-family: var(--font-mono); font-size: 11.5px;';
                emptyFld.textContent = 'No photos found in scanned directories.';
                grid2.appendChild(emptyFld);
            } else {
                folderAlbums.forEach(album => grid2.appendChild(createAlbumCard(album)));
            }

            section2.appendChild(grid2);
            container.appendChild(section2);
        }
    }

    // ── Bind Header Back Button ─────────────────────────────────────────────
    function setupAlbumListeners() {
        const backBtn = el('btn-back-to-albums');
        if (backBtn) {
            backBtn.addEventListener('click', showAlbumGrid);
        }
    }

    // ── Export ──────────────────────────────────────────────────────────────
    window.renderAlbums = renderAlbumGrid;
    window.createCustomPhotoAlbum = createCustomAlbum;
    window.renameCustomPhotoAlbum = renameCustomAlbum;
    window.deleteCustomPhotoAlbum = deleteCustomAlbum;
    window.createCustomAlbum = createCustomAlbum;
    window.renameCustomAlbum = renameCustomAlbum;
    window.deleteCustomAlbum = deleteCustomAlbum;

    setupAlbumListeners();
})();
