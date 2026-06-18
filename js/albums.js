/* ==========================================================================
   Vault Explorer — Albums Tab (Photo Album Grid)
   ========================================================================== */

(function () {
    const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'tiff', 'tif']);

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

    function renderEmpty(container) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 60px 24px; text-align: center; color: var(--vault-slate);">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; opacity: 0.6;">
                    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 8px; color: var(--vault-text); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em;">No Albums Yet</h3>
                <p style="font-size: 12px; opacity: 0.7; font-family: var(--font-mono);">Load a folder containing images to see them grouped by album.</p>
            </div>
        `;
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

        card.addEventListener('click', () => {
            window.switchTab('photos');
            // Filter displayedItems to this album's folder
            const source = window.allItems || [];
            window.displayedItems = source.filter(item => (item.folder || 'Uncategorized') === album.name && isPhoto(item));
            if (typeof window.renderPhotos === 'function') window.renderPhotos();
        });

        return card;
    }

    window.renderAlbums = function () {
        const container = el('albums-grid');
        if (!container) return;

        const source = window.allItems || window.displayedItems || [];
        const photos = source.filter(isPhoto);
        const albums = groupByFolder(photos);

        container.innerHTML = '';

        if (albums.length === 0) {
            renderEmpty(container);
            return;
        }

        albums.forEach((album, idx) => {
            container.appendChild(createAlbumCard(album, idx));
        });
    };
})();
