/* ==========================================================================
   Vault Explorer — Misc Tab (Uncategorized / Non-Media Files)
   ========================================================================== */

(function () {
    const MEDIA_EXTS = new Set([
        // Video
        'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts', 'm2ts',
        // Audio
        'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'aiff', 'ape',
        // Image
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'tiff', 'tif', 'svg', 'ico'
    ]);

    function isMedia(item) {
        if (!item) return true; // err on side of exclusion
        if (item.type === 'video' || item.type === 'audio' || item.type === 'image') return true;
        const ext = (item.ext || '').replace(/^\./, '').toLowerCase();
        return MEDIA_EXTS.has(ext);
    }

    function createFileCard(item, index) {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.tabIndex = 0;
        card.dataset.index = index;

        const extLabel = item.ext ? item.ext.toUpperCase().replace(/^\./, '') : 'FILE';
        const sizeStr = item.size ? window.formatBytes(item.size) : '';

        card.innerHTML = `
            <div class="thumbnail-container" style="display:flex; align-items:center; justify-content:center; background:var(--vault-console-raised);">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--vault-slate);">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
            </div>
            <div class="filename-container" style="padding-top: 8px;">
                <div class="filename">${window.escapeHtml(item.name)}</div>
                <div style="font-size:10px; color:var(--vault-slate); margin-top:4px; display:flex; gap:8px; justify-content:center; font-family:var(--font-mono);">
                    <span>${extLabel}</span>
                    ${sizeStr ? `<span>${sizeStr}</span>` : ''}
                </div>
            </div>
        `;

        card.addEventListener('dblclick', () => {
            window.electronAPI.openFile(item.path);
        });

        return card;
    }

    window.renderMisc = function () {
        const container = el('misc-grid');
        if (!container) return;

        const source = window.allItems || window.displayedItems || [];
        const misc = source.filter(item => !isMedia(item));

        container.innerHTML = '';

        if (misc.length === 0) {
            const empty = window.createFolderChooserEmptyState(
                { title: 'Nothing Here', body: 'No uncategorized files found. Load a folder to browse non-media files.' },
                () => window.browseTabFolder('misc')
            );
            container.appendChild(empty);
            return;
        }

        misc.forEach((item, idx) => {
            container.appendChild(createFileCard(item, idx));
        });
    };
})();
