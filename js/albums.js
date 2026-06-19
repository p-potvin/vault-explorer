/* ==========================================================================
   Vault Explorer — Albums/Photos Section (Unified Album Grid + Photo River)
   ========================================================================== */

(function () {
    const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'tiff', 'tif']);

    let currentAlbum = null;
    let currentAlbumPhotos = [];

    function isPhoto(item) {
        if (!item) return false;
        if (item.type === 'image') return true;
        const ext = (item.ext || '').replace(/^\./, '').toLowerCase();
        return PHOTO_EXTS.has(ext);
    }

    function groupByFolder(items) {
        const groups = new Map();
        items.forEach(item => {
            const folder = item.folder || 'Uncategorized';
            if (!groups.has(folder)) {
                groups.set(folder, { name: folder, items: [], cover: null });
            }
            const g = groups.get(folder);
            g.items.push(item);
            if (!g.cover && item.thumbnail) g.cover = item.thumbnail;
        });
        return Array.from(groups.values());
    }

    function createAlbumCard(album, index) {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.style.cursor = 'pointer';
        card.dataset.albumIndex = index;

        const coverSrc = album.cover
            ? window.sanitizePath(album.cover)
            : 'data:image/svg+xml;utf8,<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="%232a2340"/><text x="50%" y="50%" fill="%23777" font-family="sans-serif" font-size="14" text-anchor="middle">NO COVER</text></svg>';

        card.innerHTML = `
            <div class="thumbnail-container" style="position:relative;">
                <img class="thumbnail" src="${coverSrc}" alt="${window.escapeHtml(album.name)}" loading="lazy" style="border-radius: 28px;">
            </div>
            <div class="filename-container" style="padding-top: 8px;">
                <div class="filename">${window.escapeHtml(album.name)}</div>
                <div style="font-size:10px; color:var(--vault-slate); margin-top:4px; font-family:var(--font-mono);">${album.items.length} photo${album.items.length !== 1 ? 's' : ''}</div>
            </div>
        `;

        card.addEventListener('click', () => showAlbumPhotos(album));
        return card;
    }

    function showAlbumPhotos(album) {
        currentAlbum = album;
        const source = window.allItems || window.displayedItems || [];
        currentAlbumPhotos = source.filter(item => (item.folder || 'Uncategorized') === album.name && isPhoto(item));
        renderAlbumPhotoView();
    }

    function renderAlbumPhotoView() {
        const grid = el('albums-grid');
        const view = el('album-photos-view');
        const river = el('album-photos-river');
        const title = el('album-photos-title');
        if (!grid || !view || !river) return;

        grid.style.display = 'none';
        view.style.display = 'block';
        if (title) title.innerText = currentAlbum ? currentAlbum.name : 'Album';
        river.innerHTML = '';

        if (currentAlbumPhotos.length === 0) {
            river.innerHTML = `
                <div class="empty-state" style="column-span: all; text-align: center; padding: 40px;">
                    <p style="color: var(--vault-slate); font-family: var(--font-mono);">No photos in this album.</p>
                </div>
            `;
            return;
        }

        currentAlbumPhotos.forEach((item, idx) => {
            const thumbSrc = item.thumbnail ? window.sanitizePath(item.thumbnail) : window.sanitizePath(item.path);
            const div = document.createElement('div');
            div.className = 'photo-item';
            div.dataset.index = idx;
            div.dataset.path = item.path;

            const img = document.createElement('img');
            img.src = thumbSrc;
            img.alt = item.name;
            img.loading = 'lazy';
            img.onerror = () => { img.style.display = 'none'; div.style.background = 'var(--vt-surface-alt)'; };

            div.appendChild(img);
            div.addEventListener('dblclick', () => {
                if (typeof window.openPhotoEditor === 'function') {
                    window.openPhotoEditor(item, currentAlbumPhotos);
                }
            });

            river.appendChild(div);
        });
    }

    function showAlbumGrid() {
        const grid = el('albums-grid');
        const view = el('album-photos-view');
        if (grid) grid.style.display = 'grid';
        if (view) view.style.display = 'none';
        currentAlbum = null;
        currentAlbumPhotos = [];
    }

    function renderAlbumGrid() {
        const container = el('albums-grid');
        if (!container) return;
        showAlbumGrid();
        container.innerHTML = '';

        const source = window.allItems || window.displayedItems || [];
        const photos = source.filter(isPhoto);
        const albums = groupByFolder(photos);

        if (albums.length === 0) {
            const empty = window.createFolderChooserEmptyState(
                { title: 'No Albums Yet', body: 'Load a folder containing images to see them grouped by album.' },
                () => window.browseTabFolder('photoalbums')
            );
            container.appendChild(empty);
            return;
        }

        albums.forEach((album, idx) => {
            container.appendChild(createAlbumCard(album, idx));
        });
    }

    window.renderAlbums = function () {
        renderAlbumGrid();
    };

    window.showAlbumPhotos = showAlbumPhotos;
    window.showAlbumGrid = showAlbumGrid;

    // Back button listener
    const backBtn = el('btn-back-to-albums');
    if (backBtn) backBtn.addEventListener('click', showAlbumGrid);
})();
