// card.js — createCardElement: builds a single file-card DOM node with thumbnail, star, checkbox, rename, drag, hover preview

function createCardElement(item, index) {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.tabIndex = 0;
    card.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (item.type === 'video') {
                if (typeof window.playItem === 'function') window.playItem(index);
            } else if (item.type === 'fakeFolder') {
                window.navigateTo(window.currentNavPath + '/' + item.name, window.currentRealPath);
            } else {
                window.electronAPI.openFile(item.path);
            }
        }
    });
    if (item.type === 'fakeFolder') {
        card.classList.add('fake-folder');
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.style.borderColor = "var(--vault-accent)"; });
        card.addEventListener('dragleave', () => { card.style.borderColor = ""; });
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.style.borderColor = "";
            const pathDropped = e.dataTransfer.getData('text/plain');
            if (pathDropped) {
                const targetFolder = window.appSettings.folders.find(f => f.name === item.name && f.parent === window.currentNavPath);
                if (targetFolder && !targetFolder.items.includes(pathDropped)) {
                    targetFolder.items.push(pathDropped);
                    window.electronAPI.saveSettings(window.appSettings);
                    window.applyFilters();
                }
            }
        });
    } else {
        card.draggable = true;
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.path);
            e.dataTransfer.effectAllowed = 'move';
        });
    }

    card.dataset.index = index; card.title = item.name;
    card.dataset.path = item.path || '';
    if (item.hoverWebm) card.dataset.hasWebm = "true";
    if (item.thumbnail) card.dataset.hasThumb = "true";

    let thumbHtml = '';
    if (item.type === 'fakeFolder') {
        thumbHtml = window.icons ? window.icons.folder('', 'width:50px; height:50px; stroke:#fff; stroke-width:2;') : '';
    } else if (item.type === 'encrypted') {
        thumbHtml = window.icons ? window.icons.lock('', 'width:50px; height:50px; stroke:var(--vault-accent); stroke-width:2; margin: auto;') : '';
    } else {
        const thumbSrc = window.sanitizePath(item.thumbnail) || 'data:image/svg+xml;utf8,<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="%23333"/><text x="50%" y="50%" fill="%23777" font-family="sans-serif" font-size="14" text-anchor="middle">NO THUMB</text></svg>';
        thumbHtml = `<img class="thumbnail" loading="lazy" src='${thumbSrc}' alt="${window.escapeHtml(item.name)} thumbnail"><img class="trickplay" alt="">
                  <div class="duration-badge"></div>`;
    }

    let sizeBadgeHtml = '';
    if (item.type !== 'fakeFolder' && item.size) {
        sizeBadgeHtml = `<div class="size-badge">${window.formatBytes(item.size)}</div>`;
    }

    let metaLineHtml = '';
    if (item.type !== 'fakeFolder') {
        const extLabel = item.ext ? item.ext.toUpperCase().substring(1) : 'FILE';
        const sizeStr = item.size ? window.formatBytes(item.size) : '';
        metaLineHtml = `<div style="font-size:10px; color:#888; margin-top:2px; display:flex; gap:6px; justify-content:center; align-items:center;">
         <span style="font-weight:600; color:var(--vault-accent);">${extLabel}</span>
         <span>•</span>
         <span>${sizeStr}</span>
      </div>`;
    }

    const isStarred = !!(window.appSettings && window.appSettings.favorites && window.appSettings.favorites.includes(item.path));
    const starFill = isStarred ? '#E5A93B' : 'none';
    const starStroke = isStarred ? '#E5A93B' : '#ffffff';
    const starSvg = window.icons ? window.icons.star('star-svg', 'transition: transform 0.2s; display: block; margin: 0; padding: 0; pointer-events: none; width: 14px; height: 14px;', starFill, starStroke) : '';
    const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};

    card.innerHTML = `
    <input type="checkbox" class="file-checkbox" aria-label="Select ${window.escapeHtml(item.name)}">
    <div class="thumbnail-container" style="position:relative;">
       <button class="favorite-star-btn" style="position: absolute; top: 6px; left: 6px; border: none; background: rgba(0,0,0,0.65); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 9999 !important; pointer-events: auto !important; padding: 0; margin: 0; outline: none; box-shadow: none; transition: background 0.2s;" title="${t.addToFavorites || 'Add to Favorites'}" aria-label="Favorite">
          ${starSvg}
       </button>
       ${thumbHtml}
       ${sizeBadgeHtml}
    </div>
    <div class="filename-container" style="padding-top:4px;">
       <div class="filename">${window.escapeHtml(item.name)}</div>
       ${metaLineHtml}
       ${item.mtimeFormatted ? `<div style="font-size:10px; color:#aaa; margin-top:2px;">${item.mtimeFormatted}</div>` : ''}
       <input type="text" class="rename-input" value="${window.escapeHtml(item.name)}" aria-label="Rename ${window.escapeHtml(item.name)}">
    </div>
  `;

    const starBtn = card.querySelector('.favorite-star-btn');
    if (starBtn) {
        starBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.toggleFavorite(item.path, starBtn);
        });
    }

    const chk = card.querySelector('.file-checkbox');
    chk.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chk.checked) window.selectedIndices.add(index);
        else window.selectedIndices.delete(index);
        card.classList.toggle('selected', chk.checked);
        window.lastSelectedIndex = index;
        window.updateStatusBar();
    });

    // WebM Hover Play Logic
    if (item.hoverWebm) {
        window.attachHoverWebmToCard(card, item.hoverWebm);
    } else if (item.trickplayFolder) {
        let hoverTimer; let tpIndex = 0; let frames = [];
        const tpImg = card.querySelector('.trickplay');
        const mainImg = card.querySelector('.thumbnail');

        card.addEventListener('mouseenter', async () => {
            if (frames.length === 0) frames = await window.electronAPI.getTrickplaySprites(item.trickplayFolder);
            if (frames.length === 0) return;
            tpImg.style.display = 'block'; mainImg.style.display = 'none'; tpIndex = 0;
            tpImg.src = window.sanitizePath(frames[tpIndex]);
            hoverTimer = setInterval(() => {
                tpIndex = (tpIndex + 1) % frames.length;
                tpImg.src = window.sanitizePath(frames[tpIndex]);
            }, 400);
        });
        card.addEventListener('mouseleave', () => {
            clearInterval(hoverTimer); tpImg.style.display = 'none'; mainImg.style.display = 'block';
        });
    }

    // Rename Feature (F2)
    const input = card.querySelector('.rename-input');
    const filename = card.querySelector('.filename');
    const commitRename = async () => {
        input.style.display = 'none'; filename.style.display = 'block';
        if (input.value && input.value !== item.name) {
            const res = await window.electronAPI.renameFile(item.path, input.value);
            const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
            if (res.success) {
                window.showToast((t.renamedTo || 'Renamed to ') + `"${input.value}"`, 'success');
                const oldPath = item.path;
                const newPath = res.newPath || (item.path.substring(0, item.path.lastIndexOf('\\') + 1) + input.value);
                const oldDotIdx = item.name.lastIndexOf('.');
                const oldBase = oldDotIdx !== -1 ? item.name.substring(0, oldDotIdx) : item.name;
                const newDotIdx = input.value.lastIndexOf('.');
                const newBase = newDotIdx !== -1 ? input.value.substring(0, newDotIdx) : input.value;
                item.name = input.value;
                item.path = newPath;
                if (item.thumbnail) item.thumbnail = item.thumbnail.replace(oldBase, newBase);
                if (item.hoverWebm) item.hoverWebm = item.hoverWebm.replace(oldBase, newBase);
                filename.innerText = input.value;
                card.dataset.path = newPath;
            } else {
                input.value = item.name;
                window.showToast((t.renameFailed || 'Rename failed: ') + res.error, 'error');
            }
        }
    };
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commitRename();
        else if (e.key === 'Escape') { input.value = item.name; input.blur(); }
    });

    // Async Duration Extract
    if (item.type === 'video') {
        requestAnimationFrame(() => {
            let tmp = document.createElement('video');
            tmp.preload = "metadata";
            tmp.src = window.sanitizePath(item.path);
            tmp.onloadedmetadata = () => {
                const d = card.querySelector('.duration-badge');
                if (d && tmp.duration) {
                    d.innerText = window.formatDuration(tmp.duration);
                    d.style.display = 'block';
                    item.duration = tmp.duration;
                }
                tmp.src = ""; tmp.remove();
            };
        });
    }

    // Click selection
    card.addEventListener('click', (e) => {
        if (e.target.closest('input')) return;
        if (e.ctrlKey) {
            if (window.selectedIndices.has(index)) window.selectedIndices.delete(index); else window.selectedIndices.add(index);
            window.lastSelectedIndex = index;
        } else if (e.shiftKey && window.lastSelectedIndex !== -1) {
            const start = Math.min(window.lastSelectedIndex, index); const end = Math.max(window.lastSelectedIndex, index);
            window.selectedIndices.clear(); for (let i = start; i <= end; i++) window.selectedIndices.add(i);
        } else {
            window.selectedIndices.clear(); window.selectedIndices.add(index); window.lastSelectedIndex = index;
        }
        document.querySelectorAll('.file-card').forEach(c => {
            const isSel = window.selectedIndices.has(parseInt(c.dataset.index));
            c.classList.toggle('selected', isSel);
            c.querySelector('.file-checkbox').checked = isSel;
        });
        window.updateStatusBar();
    });

    card.addEventListener('dblclick', () => {
        if (item.type === 'video') {
            if (typeof window.playItem === 'function') window.playItem(index);
        } else if (item.type === 'fakeFolder') window.navigateTo(window.currentNavPath + '/' + item.name, window.currentRealPath);
        else if (item.type === 'encrypted') {
            window.selectedIndices.clear();
            window.selectedIndices.add(index);
            document.querySelectorAll('.file-card').forEach(c => {
                const isSel = window.selectedIndices.has(parseInt(c.dataset.index));
                c.classList.toggle('selected', isSel);
                c.querySelector('.file-checkbox').checked = isSel;
            });
            window.updateStatusBar();
            window.triggerCryptoPrompt('decrypt-prompt');
        } else window.electronAPI.openFile(item.path);
    });

    // Context menu — delegated to card-events.js
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.handleCardContextMenu(card, item, index);
    });

    return card;
}

window.createCardElement = createCardElement;
