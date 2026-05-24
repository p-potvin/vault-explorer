// navigation.js - handles scanning directories, rendering cards, sorting, filtering, selection and contextual file options

window.allItems = [];
window.displayedItems = [];
window.selectedIndices = new Set();
window.lastSelectedIndex = -1;
window.PAGE_SIZE = 50;
window.currentlyRendered = 0;
window.scrollPositions = {};
window.currentNavPath = '';
window.currentRealPath = '';
window.folderSizeTimer = null;

window.getTargetFolder = function(navPath) {
    if (!navPath || navPath === 'root') return null;
    const parts = navPath.split('/');
    const leafName = parts.pop();
    const parentPath = parts.join('/');
    return window.appSettings.folders.find(f => f.name === leafName && (f.parent === parentPath || ((!f.parent || f.parent === 'root') && parentPath === 'root')));
};

function displayFolderSize(bytes) {
    if (!bytes) {
        el('status-size').innerText = '';
        return;
    }
    const label = window.translations[window.currentLang].folderSize || 'Folder Size (Everything):';
    const formatted = window.formatBytes(bytes);
    el('status-size').innerText = `${label} ${formatted}`;
}

async function updateStatusBar() {
    el('status-items').innerText = `${window.displayedItems.length} items`;
    if (window.selectedIndices.size > 0) {
        let size = 0;
        window.selectedIndices.forEach(idx => {
            const itm = window.displayedItems[idx];
            if (itm) {
                size += (itm.size || 0);
            }
        });
        el('status-selected').innerText = `${window.selectedIndices.size} selected (${window.formatBytes(size)})`;
    } else {
        el('status-selected').innerText = '';
    }

    if (window.allItems && window.allItems.length > 0) {
        const totalSize = window.allItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);
    } else {
        el('status-size').innerText = '';
    }
}

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
                navigateTo(window.currentNavPath + '/' + item.name, window.currentRealPath);
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
                    applyFilters();
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
        thumbHtml = '<svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
    } else if (item.type === 'encrypted') {
        thumbHtml = '<svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="var(--vault-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: auto;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
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

    card.innerHTML = `
    <input type="checkbox" class="file-checkbox" aria-label="Select ${window.escapeHtml(item.name)}">
    <div class="thumbnail-container" style="position:relative;">
       <button class="favorite-star-btn" style="position: absolute; top: 6px; left: 6px; border: none; background: rgba(0,0,0,0.65); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; padding: 0; margin: 0; outline: none; box-shadow: none; transition: background 0.2s;" title="Add to Favorites" aria-label="Favorite">
          <svg class="star-svg" width="14" height="14" viewBox="0 0 24 24" fill="${starFill}" stroke="${starStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; display: block; margin: 0; padding: 0;">
             <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
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
        updateStatusBar();
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
            if (frames.length === 0) return; // Still empty

            tpImg.style.display = 'block'; mainImg.style.display = 'none'; tpIndex = 0;
            tpImg.src = window.sanitizePath(frames[tpIndex]);
            hoverTimer = setInterval(() => {
                tpIndex = (tpIndex + 1) % frames.length;
                tpImg.src = window.sanitizePath(frames[tpIndex]);
            }, 400); // Sequence iteration speed
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
            if (res.success) {
                window.showToast(`Renamed to "${input.value}"`, 'success');
                const oldPath = item.path;
                const newPath = res.newPath || (item.path.substring(0, item.path.lastIndexOf('\\') + 1) + input.value);
                
                // Get base name details
                const oldDotIdx = item.name.lastIndexOf('.');
                const oldBase = oldDotIdx !== -1 ? item.name.substring(0, oldDotIdx) : item.name;
                const newDotIdx = input.value.lastIndexOf('.');
                const newBase = newDotIdx !== -1 ? input.value.substring(0, newDotIdx) : input.value;
                
                // Update item locally
                item.name = input.value;
                item.path = newPath;
                if (item.thumbnail) item.thumbnail = item.thumbnail.replace(oldBase, newBase);
                if (item.hoverWebm) item.hoverWebm = item.hoverWebm.replace(oldBase, newBase);
                
                // Update DOM elements on card directly
                filename.innerText = input.value;
                card.dataset.path = newPath;
            } else {
                input.value = item.name;
                window.showToast('Rename failed: ' + res.error, 'error');
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
                    item.duration = tmp.duration; // Memory injection for "Sort by Duration"
                }
                tmp.src = ""; tmp.remove();
            };
        });
    }

    card.addEventListener('click', (e) => {
        if (e.target.closest('input')) return; // Ignore input
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
        updateStatusBar();
    });

    card.addEventListener('dblclick', () => {
        if (item.type === 'video') {
            if (typeof window.playItem === 'function') window.playItem(index);
        } else if (item.type === 'fakeFolder') navigateTo(window.currentNavPath + '/' + item.name, window.currentRealPath);
        else if (item.type === 'encrypted') {
            window.selectedIndices.clear();
            window.selectedIndices.add(index);
            document.querySelectorAll('.file-card').forEach(c => {
                const isSel = window.selectedIndices.has(parseInt(c.dataset.index));
                c.classList.toggle('selected', isSel);
                c.querySelector('.file-checkbox').checked = isSel;
            });
            updateStatusBar();
            window.triggerCryptoPrompt('decrypt-prompt');
        } else window.electronAPI.openFile(item.path);
    });

    card.addEventListener('contextmenu', async () => {
        if (!window.selectedIndices.has(index)) {
            window.selectedIndices.clear(); window.selectedIndices.add(index);
            document.querySelectorAll('.file-card').forEach(c => {
                c.classList.toggle('selected', window.selectedIndices.has(parseInt(c.dataset.index)));
                c.querySelector('.file-checkbox').checked = window.selectedIndices.has(parseInt(c.dataset.index));
            });
            updateStatusBar();
        }
        const hasClip = !!(window._clipboard && window._clipboard.paths.length > 0);
        const isStarred = !!(window.appSettings && window.appSettings.favorites && window.appSettings.favorites.includes(item.path));
        const action = await window.electronAPI.showContextMenu({
            ...item,
            _hasClipboard: hasClip,
            isFavorite: isStarred
        });
        console.log('[ctx-menu] action:', action, 'item:', item.name);
        if (action === 'toggle-favorite') {
            window.toggleFavorite(item.path);
        } else if (action === 'generate-webm') {

            const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
            const cardElement = Array.from(document.querySelectorAll('.file-card'))
                .find(c => normPath(c.dataset.path) === normPath(item.path));
            if (cardElement) {
                let overlay = cardElement.querySelector('.webm-loading-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'webm-loading-overlay';
                    overlay.innerHTML = `<div class="spinner-small"></div><div class="webm-percent" style="margin-top:4px; font-size:10px;">0%</div>`;
                    const thumbCont = cardElement.querySelector('.thumbnail-container');
                    if (thumbCont) thumbCont.appendChild(overlay);
                }
            }
            window.electronAPI.generateWebm(item.path, window.currentRealPath).then(res => {
                if (cardElement) {
                    const overlay = cardElement.querySelector('.webm-loading-overlay');
                    if (overlay) overlay.remove();
                }
                if (!res.success) {
                    window.showToast('Preview failed: ' + res.error, 'error');
                }
            });
        } else if (action === 'normalize-audio' || action === 'normalize-audio-transcribe') {
            const transcribe = (action === 'normalize-audio-transcribe');
            window.showToast(transcribe ? 'Vocal isolation, normalization & AI transcription started' : 'Vocal isolation & normalization started in background', 'success');
            const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
            const cardElement = Array.from(document.querySelectorAll('.file-card'))
                .find(c => normPath(c.dataset.path) === normPath(item.path));
            let overlay = null;
            if (cardElement) {
                overlay = cardElement.querySelector('.webm-loading-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'webm-loading-overlay';
                    overlay.innerHTML = `<div class="spinner-small" style="border-top-color:#e056fd;"></div><div class="webm-percent" style="margin-top:4px; font-size:10px; color:#e056fd;">0%</div><div class="normalize-lbl" style="font-size:8px; opacity:0.8; text-align:center; padding:0 4px; margin-top:2px;">Initializing...</div>`;
                    const thumbCont = cardElement.querySelector('.thumbnail-container');
                    if (thumbCont) thumbCont.appendChild(overlay);
                }
            }

            const progressHandler = (eventData) => {
                if (normPath(eventData.videoPath) === normPath(item.path)) {
                    if (overlay) {
                        const pctEl = overlay.querySelector('.webm-percent');
                        if (pctEl) pctEl.innerText = `${eventData.percent}%`;
                        const lblEl = overlay.querySelector('.normalize-lbl');
                        if (lblEl) lblEl.innerText = eventData.label || 'Processing...';
                    }
                }
            };

            window.electronAPI.onNormalizeProgress(progressHandler);

            window.electronAPI.normalizeAudio(item.path, window.currentRealPath, transcribe).then(res => {
                window.electronAPI.offNormalizeProgress();
                if (overlay) overlay.remove();

                if (res.status === 'SUCCESS' || res.status === 'EXISTS') {
                    window.showToast(transcribe ? 'Audio normalization & AI transcription complete!' : 'Audio normalization complete!', 'success');
                } else {
                    window.showToast('Audio processing failed: ' + (res.error || 'Unknown error'), 'error');
                }
            });
        } else if (action === 'upscale-video') {
            window.showToast('AI Video Upscaling started in background', 'success');
            const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
            const cardElement = Array.from(document.querySelectorAll('.file-card'))
                .find(c => normPath(c.dataset.path) === normPath(item.path));
            let overlay = null;
            if (cardElement) {
                overlay = cardElement.querySelector('.webm-loading-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'webm-loading-overlay';
                    overlay.innerHTML = `<div class="spinner-small" style="border-top-color:#e056fd;"></div><div class="webm-percent" style="margin-top:4px; font-size:10px; color:#e056fd;">0%</div><div class="normalize-lbl" style="font-size:8px; opacity:0.8; text-align:center; padding:0 4px; margin-top:2px;">Upscaling...</div>`;
                    const thumbCont = cardElement.querySelector('.thumbnail-container');
                    if (thumbCont) thumbCont.appendChild(overlay);
                }
            }

            const upscaleProgressHandler = (eventData) => {
                if (normPath(eventData.videoPath) === normPath(item.path)) {
                    if (overlay) {
                        const pctEl = overlay.querySelector('.webm-percent');
                        if (pctEl) pctEl.innerText = `${eventData.percent}%`;
                        const lblEl = overlay.querySelector('.normalize-lbl');
                        if (lblEl) lblEl.innerText = eventData.label || 'Upscaling...';
                    }
                }
            };

            window.electronAPI.onUpscaleProgress(upscaleProgressHandler);

            window.electronAPI.upscaleVideo(item.path).then(res => {
                window.electronAPI.offUpscaleProgress();
                if (overlay) overlay.remove();
                if (res.success) {
                    window.showToast('AI Video Upscaling complete!', 'success');
                    loadDirectory(window.currentNavPath, window.currentRealPath, false);
                } else {
                    window.showToast('Upscale failed: ' + (res.error || 'Unknown'), 'error');
                }
            });
        } else if (action === 'revert-enhancements') {
            if (await window.showConfirmDialog(`Are you sure you want to revert all enhancements for "${item.name}"? This will delete the enhanced copy.`, 'Revert Video Enhancements')) {
                const res = await window.electronAPI.revertEnhancements(item.path);
                if (res.success) {
                    window.showToast('Enhancements reverted successfully!', 'success');
                    loadDirectory(window.currentNavPath, window.currentRealPath, true);
                } else {
                    window.showToast('Failed to revert: ' + res.error, 'error');
                }
            }
        } else if (action === 'generate-subtitles-prompt') {
            const langs = await window.showLanguageModal('Generate Subtitles', true, []);
            if (langs && langs.length > 0) {
                window.showToast(`Generating subtitles for: ${langs.join(', ').toUpperCase()}`, 'success');
                const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
                const cardElement = Array.from(document.querySelectorAll('.file-card'))
                    .find(c => normPath(c.dataset.path) === normPath(item.path));
                let overlay = null;
                if (cardElement) {
                    overlay = cardElement.querySelector('.webm-loading-overlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.className = 'webm-loading-overlay';
                        overlay.innerHTML = `<div class="spinner-small" style="border-top-color:#e056fd;"></div><div class="webm-percent" style="margin-top:4px; font-size:10px; color:#e056fd;">0%</div><div class="normalize-lbl" style="font-size:8px; opacity:0.8; text-align:center; padding:0 4px; margin-top:2px;">Subs: Init...</div>`;
                        const thumbCont = cardElement.querySelector('.thumbnail-container');
                        if (thumbCont) thumbCont.appendChild(overlay);
                    }
                }
                const progressHandler = (eventData) => {
                    if (normPath(eventData.videoPath) === normPath(item.path)) {
                        if (overlay) {
                            const pctEl = overlay.querySelector('.webm-percent');
                            if (pctEl) pctEl.innerText = `${eventData.percent}%`;
                            const lblEl = overlay.querySelector('.normalize-lbl');
                            if (lblEl) lblEl.innerText = `Subs: ${eventData.label || 'Processing...'}`;
                        }
                    }
                };
                window.electronAPI.onNormalizeProgress(progressHandler);
                window.electronAPI.normalizeAudio(item.path, window.currentRealPath, true).then(res => {
                    window.electronAPI.offNormalizeProgress();
                    if (overlay) overlay.remove();
                    if (res.success || res.status === 'SUCCESS' || res.status === 'EXISTS') {
                        window.showToast('Subtitles generated successfully!', 'success');
                        loadDirectory(window.currentNavPath, window.currentRealPath, true);
                    } else {
                        window.showToast('Subtitles generation failed: ' + (res.error || 'Unknown'), 'error');
                    }
                });
            }
        } else if (action === 'translate-video-prompt') {
            const lang = await window.showLanguageModal('Translate Video Track', false, []);
            if (lang && lang.length > 0) {
                window.showToast(`Synthesizing translation to ${lang[0].toUpperCase()} in background...`, 'success');
                const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
                const cardElement = Array.from(document.querySelectorAll('.file-card'))
                    .find(c => normPath(c.dataset.path) === normPath(item.path));
                let overlay = null;
                if (cardElement) {
                    overlay = cardElement.querySelector('.webm-loading-overlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.className = 'webm-loading-overlay';
                        overlay.innerHTML = `<div class="spinner-small" style="border-top-color:#e056fd;"></div><div class="webm-percent" style="margin-top:4px; font-size:10px; color:#e056fd;">0%</div><div class="normalize-lbl" style="font-size:8px; opacity:0.8; text-align:center; padding:0 4px; margin-top:2px;">Trans: Init...</div>`;
                        const thumbCont = cardElement.querySelector('.thumbnail-container');
                        if (thumbCont) thumbCont.appendChild(overlay);
                    }
                }
                const progressHandler = (eventData) => {
                    if (normPath(eventData.videoPath) === normPath(item.path)) {
                        if (overlay) {
                            const pctEl = overlay.querySelector('.webm-percent');
                            if (pctEl) pctEl.innerText = `${eventData.percent}%`;
                            const lblEl = overlay.querySelector('.normalize-lbl');
                            if (lblEl) lblEl.innerText = `Trans: ${eventData.label || 'Processing...'}`;
                        }
                    }
                };
                window.electronAPI.onNormalizeProgress(progressHandler);
                window.electronAPI.normalizeAudio(item.path, window.currentRealPath, false, lang[0]).then(res => {
                    window.electronAPI.offNormalizeProgress();
                    if (overlay) overlay.remove();
                    if (res.success || res.status === 'SUCCESS' || res.status === 'EXISTS') {
                        window.showToast('Translation synthesized successfully!', 'success');
                        loadDirectory(window.currentNavPath, window.currentRealPath, true);
                    } else {
                        window.showToast('Translation synthesis failed: ' + (res.error || 'Unknown'), 'error');
                    }
                });
            }
        } else if (action === 'enhance-video-prompt') {
            const config = await window.showVideoEnhancementDialog(item);
            if (config && config.execute) {
                window.showToast('AI Video Optimization Center started pipeline...', 'success');
                const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
                const cardElement = Array.from(document.querySelectorAll('.file-card'))
                    .find(c => normPath(c.dataset.path) === normPath(item.path));
                let overlay = null;
                if (cardElement) {
                    overlay = cardElement.querySelector('.webm-loading-overlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.className = 'webm-loading-overlay';
                        overlay.innerHTML = `<div class="spinner-small" style="border-top-color:#e056fd;"></div><div class="webm-percent" style="margin-top:4px; font-size:10px; color:#e056fd;">0%</div><div class="normalize-lbl" style="font-size:8px; opacity:0.8; text-align:center; padding:0 4px; margin-top:2px;">VSR: Init...</div>`;
                        const thumbCont = cardElement.querySelector('.thumbnail-container');
                        if (thumbCont) thumbCont.appendChild(overlay);
                    }
                }
                const progressHandler = (eventData) => {
                    if (normPath(eventData.videoPath) === normPath(item.path)) {
                        if (overlay) {
                            const pctEl = overlay.querySelector('.webm-percent');
                            if (pctEl) pctEl.innerText = `${eventData.percent}%`;
                            const lblEl = overlay.querySelector('.normalize-lbl');
                            if (lblEl) lblEl.innerText = `VSR: ${eventData.label || 'Processing...'}`;
                        }
                    }
                };
                window.electronAPI.onUpscaleProgress(progressHandler);
                window.electronAPI.upscaleVideo(item.path).then(res => {
                    window.electronAPI.offUpscaleProgress();
                    if (overlay) overlay.remove();
                    if (res.success) {
                        window.showToast('AI Video Upscaling & Super-Resolution complete!', 'success');
                        loadDirectory(window.currentNavPath, window.currentRealPath, true);
                    } else {
                        window.showToast('Upscale pipeline failed: ' + (res.error || 'Unknown'), 'error');
                    }
                });
            }
        } else if (action === 'encrypt-prompt' || action === 'decrypt-prompt') {
            window.triggerCryptoPrompt(action);
        } else if (action === 'open-folder') {
            navigateTo(window.currentNavPath + '/' + item.name, window.currentRealPath);
        } else if (action === 'paste-into-folder') {
            if (!window._clipboard || window._clipboard.paths.length === 0) {
                window.showToast('Nothing to paste', 'error');
                return;
            }
            const targetFolder = window.getTargetFolder(window.currentNavPath + '/' + item.name);
            if (!targetFolder) {
                window.showToast('Virtual folder not found', 'error');
                return;
            }
            const res = await window.electronAPI.pasteFiles({
                paths: window._clipboard.paths,
                mode: window._clipboard.mode,
                destination: window.currentRealPath
            });
            if (res.success) {
                window.showToast(`Pasted ${res.count} file(s) into folder "${item.name}"`, 'success');
                if (Array.isArray(res.pastedPaths)) {
                    res.pastedPaths.forEach(p => {
                        if (!targetFolder.items.includes(p)) targetFolder.items.push(p);
                    });
                }
                if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                window.electronAPI.saveSettings(window.appSettings);
                loadDirectory(window.currentNavPath, window.currentRealPath, true);
            } else {
                window.showToast('Paste failed: ' + res.error, 'error');
            }
        } else if (action === 'remove-folder') {
            if (await window.showConfirmDialog(`Remove folder "${item.name}"?`, 'Confirm Folder Removal')) {
                window.appSettings.folders = window.appSettings.folders.filter(f => !(f.name === item.name && (f.parent === window.currentNavPath || (window.currentNavPath === 'root' && !f.parent))));
                window.electronAPI.saveSettings(window.appSettings);
                window.showToast('Folder removed', 'success');
                loadDirectory(window.currentNavPath, window.currentRealPath, true);
            }
        } else if (action === 'delete-item') {
            if (await window.showConfirmDialog(`Delete "${item.name}"?`, 'Confirm File Deletion')) {
                console.log('[delete] deleting:', item.path);
                const res = await window.electronAPI.deleteItem(item.path);
                if (res.success) {
                    window.showToast('Deleted: ' + item.name, 'success');
                    window.allItems = window.allItems.filter(i => i.path !== item.path);
                    applyFilters();
                } else {
                    window.showToast('Delete failed: ' + res.error, 'error');
                }
            }
        } else if (action === 'rename') {
            const inp = card.querySelector('.rename-input');
            const fn = card.querySelector('.filename');
            if (inp && fn) {
                inp.style.display = 'block'; fn.style.display = 'none';
                inp.focus(); inp.select();
            }
        } else if (action === 'copy') {
            window._clipboard = { paths: [], mode: 'copy' };
            window.selectedIndices.forEach(idx => {
                const si = window.displayedItems[idx];
                if (si && si.path) window._clipboard.paths.push(si.path);
            });
            window.showToast(`Copied ${window._clipboard.paths.length} item(s)`, 'success');
        } else if (action === 'cut') {
            window._clipboard = { paths: [], mode: 'cut' };
            window.selectedIndices.forEach(idx => {
                const si = window.displayedItems[idx];
                if (si && si.path) window._clipboard.paths.push(si.path);
            });
            window.showToast(`Cut ${window._clipboard.paths.length} item(s)`, 'success');
        } else if (action === 'paste') {
            if (!window._clipboard || window._clipboard.paths.length === 0) {
                window.showToast('Nothing to paste', 'error');
            } else {
                const res = await window.electronAPI.pasteFiles({ paths: window._clipboard.paths, mode: window._clipboard.mode, destination: window.currentRealPath });
                if (res.success) {
                    window.showToast(`Pasted ${res.count} file(s)`, 'success');
                    if (window.currentNavPath !== 'root') {
                        const targetFolder = window.getTargetFolder(window.currentNavPath);
                        if (targetFolder && Array.isArray(res.pastedPaths)) {
                            res.pastedPaths.forEach(p => {
                                if (!targetFolder.items.includes(p)) targetFolder.items.push(p);
                            });
                            window.electronAPI.saveSettings(window.appSettings);
                        }
                    }
                    if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                    if (window.currentNavPath !== 'root') {
                        navigateTo(window.currentNavPath, window.currentRealPath);
                    } else {
                        loadDirectory(window.currentNavPath, window.currentRealPath, false);
                    }
                } else {
                    window.showToast('Paste failed: ' + res.error, 'error');
                }
            }
        } else if (action === 'zip-selection') {
            const zipPaths = [];
            window.selectedIndices.forEach(idx => {
                const si = window.displayedItems[idx];
                if (si && si.path) zipPaths.push(si.path);
            });
            if (zipPaths.length === 0) { window.showToast('No files selected for zip', 'error'); return; }
            window.showToast('Preparing zip of ' + zipPaths.length + ' file(s)...', 'success');
            const res = await window.electronAPI.zipSelection({ paths: zipPaths });
            if (res.success) {
                window.showToast('Zip created successfully: ' + res.path.split(/[\\/]/).pop(), 'success');
                loadDirectory(window.currentNavPath, window.currentRealPath, true);
            } else if (!res.canceled) {
                window.showToast('Zip failed: ' + res.error, 'error');
            }
        } else if (action === 'properties') {
            showPropertiesDialog(item);
        } else if (action === 'opened') {
            window.showToast('Opening in default app...', 'success');
        } else if (action === 'open-error') {
            window.showToast('Failed to open — check default app config', 'error');
        } else if (action === 'show') {
            window.showToast('Opened in Windows Explorer', 'success');
        } else if (action === 'copied') {
            window.showToast('Path copied to clipboard', 'success');
        } else if (action === 'open-folder') {
            navigateTo(window.currentNavPath + '/' + item.name, window.currentRealPath);
            window.showToast(`Opened: ${item.name}`, 'success');
        }
    });

    return card;
}

async function showPropertiesDialog(item) {
    const res = await window.electronAPI.getFileProperties(item.path);
    if (!res || !res.success) { window.showToast('Failed to get properties', 'error'); return; }
    const stats = res.properties;

    let modal = document.getElementById('properties-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'properties-modal';
        modal.style.cssText = 'display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10005; align-items:center; justify-content:center; font-family:var(--font-body); backdrop-filter:blur(4px);';
        modal.innerHTML = `
            <div style="background:var(--vt-surface); border:1px solid var(--vault-border); border-radius:6px; width:420px; padding:24px; box-shadow:0 10px 30px rgba(0,0,0,0.3); color:var(--vault-text);">
                <h3 style="font-family:var(--font-display); font-size:12px; font-weight:700; color:var(--vault-gold); text-transform:uppercase; margin:0 0 16px 0; border-bottom:1px solid var(--vault-border); padding-bottom:8px; letter-spacing:0.08em;">File Properties</h3>
                <div id="properties-details" style="font-size:12px; display:flex; flex-direction:column; gap:8px; font-family:var(--font-body);"></div>
                <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                    <button id="close-properties" style="background:var(--vt-surface-alt); border:1px solid var(--vault-border); color:var(--vault-text); padding:6px 12px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer; text-transform:uppercase;">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('close-properties').addEventListener('click', () => { modal.style.display = 'none'; });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    const details = document.getElementById('properties-details');
    let rows = `<div><strong>Name:</strong> ${window.escapeHtml(stats.name)}</div>
        <div><strong>Path:</strong> ${window.escapeHtml(stats.path)}</div>
        <div><strong>Size:</strong> ${window.formatBytes(stats.size)}</div>
        <div><strong>Created:</strong> ${window.escapeHtml(String(stats.created))}</div>
        <div><strong>Modified:</strong> ${window.escapeHtml(String(stats.modified))}</div>`;
    if (stats.width && stats.height) rows += `<div><strong>Resolution:</strong> ${stats.width}x${stats.height}</div>`;
    if (stats.duration) rows += `<div><strong>Duration:</strong> ${window.formatDuration(stats.duration)}</div>`;
    if (stats.codec) rows += `<div><strong>Video Codec:</strong> ${window.escapeHtml(stats.codec)}</div>`;
    if (stats.fps) rows += `<div><strong>Frame Rate:</strong> ${stats.fps} FPS</div>`;
    if (stats.audioCodec) rows += `<div><strong>Audio Codec:</strong> ${window.escapeHtml(stats.audioCodec)}</div>`;
    if (stats.channels) rows += `<div><strong>Audio Channels:</strong> ${stats.channels} ch</div>`;
    if (stats.sampleRate) rows += `<div><strong>Sample Rate:</strong> ${stats.sampleRate} Hz</div>`;
    if (stats.bitrate) rows += `<div><strong>Bitrate:</strong> ${window.formatBytes(stats.bitrate)}/s</div>`;
    details.innerHTML = rows;
    modal.style.display = 'flex';
}

function renderMore() {
    const nextBatch = window.displayedItems.slice(window.currentlyRendered, window.currentlyRendered + window.PAGE_SIZE);
    nextBatch.forEach((item, i) => { el('file-grid').appendChild(createCardElement(item, window.currentlyRendered + i)); });
    window.currentlyRendered += nextBatch.length;
}

function applyFilters() {
    const term = el('search-box').value.toLowerCase();
    const filterAttr = el('filter-type').value;

    const fakeFolders = window.appSettings.folders.filter(f => f.parent === window.currentNavPath).map(f => ({ type: 'fakeFolder', name: f.name }));

    const allHiddenItems = new Set();
    window.appSettings.folders.forEach(f => f.items.forEach(p => allHiddenItems.add(p)));

    const displayableFiles = window.allItems.filter(v => {
        if (window.currentNavPath === 'root' || !window.currentNavPath.includes('/')) {
            if (allHiddenItems.has(v.path)) return false;
        }
        return true;
    });

    const pool = [...fakeFolders, ...displayableFiles];

    let filteredItems = pool.filter(v => {
        if (term && !v.name.toLowerCase().includes(term)) return false;
        if (v.type === 'fakeFolder') return true;
        if (filterAttr === 'video') return v.type === 'video' || v.type === 'encrypted';
        if (filterAttr === 'image') return v.type === 'image';
        return true;
    });

    const sortBy = el('sort-by').value;
    const sortOrder = el('btn-sort-order').dataset.order || 'desc';

    filteredItems.sort((a, b) => {
        if (a.type === 'fakeFolder' && b.type !== 'fakeFolder') return -1;
        if (b.type === 'fakeFolder' && a.type !== 'fakeFolder') return 1;
        let valA = a[sortBy]; let valB = b[sortBy];
        if (sortBy === 'name') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        else if (['size', 'duration', 'mtime'].includes(sortBy)) { valA = valA || 0; valB = valB || 0; }
        let compare = 0;
        if (valA < valB) compare = -1; else if (valA > valB) compare = 1;
        return sortOrder === 'desc' ? compare * -1 : compare;
    });

    window.displayedItems = filteredItems;

    window.killAllHoverVideos();

    if (window.displayedItems.length === 0) {
        const hasActiveFilters = term !== '' || filterAttr !== 'all';
        const ctaButton = hasActiveFilters
            ? `<button style="margin-top:16px;" onclick="document.getElementById('search-box').value=''; document.getElementById('filter-type').value='all'; window.applyFilters();">Clear Filters</button>`
            : `<button style="margin-top:16px;" onclick="document.getElementById('btn-select').click()">Browse Vault</button>`;
        el('file-grid').innerHTML = `
           <div class="empty-state" style="grid-column: 1 / -1;">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                   <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
               </svg>
               <h3>${window.translations[window.currentLang].noItemsFound}</h3>
               <p>${window.translations[window.currentLang].adjustFilters}</p>
               ${ctaButton}
           </div>`;
        window.selectedIndices.clear(); window.lastSelectedIndex = -1; window.currentlyRendered = 0;
        updateStatusBar();
    } else {
        el('file-grid').innerHTML = '';
        window.selectedIndices.clear(); window.lastSelectedIndex = -1; window.currentlyRendered = 0;
        updateStatusBar();
        renderMore();
    }
}

async function loadDirectory(navPath, realPath, useCache = false) {
    if (!realPath) return;
    window.currentNavPath = navPath; window.currentRealPath = realPath;
    el('path-display').innerText = navPath === 'root' ? realPath : navPath;

    if (el('btn-new-folder')) el('btn-new-folder').disabled = false;
    if (el('btn-new-folder')) el('btn-new-folder').title = "Create virtual folder";
    el('btn-refresh').disabled = false;
    el('btn-refresh').title = "Refresh directory";
    el('btn-back').disabled = true;
    el('btn-back').title = "Already at root vault level";

    window.appSettings.lastPath = { navPath, realPath };
    window.electronAPI.saveSettings(window.appSettings);

    el('loading').style.display = 'flex';
    if (!useCache) window.allItems = await window.electronAPI.scanDirectory(realPath);
    el('loading').style.display = 'none';

    applyFilters();

    if (window.allItems && window.allItems.length > 0) {
        const totalSize = window.allItems.reduce((sum, item) => sum + (item.size || 0), 0);
        displayFolderSize(totalSize);

        // Staggered background probing for missing video properties to build .meta.json sidecars
        const videosToProbe = window.allItems.filter(item => item.type === 'video' && !item.duration);
        if (videosToProbe.length > 0) {
            (async () => {
                for (const item of videosToProbe) {
                    try {
                        const res = await window.electronAPI.getFileProperties(item.path);
                        if (res && res.success && res.properties) {
                            item.duration = res.properties.duration || 0;
                            item.width = res.properties.width || null;
                            item.height = res.properties.height || null;
                            item.codec = res.properties.codec || null;
                            item.fps = res.properties.fps || null;
                            item.audioCodec = res.properties.audioCodec || null;
                            item.channels = res.properties.channels || null;
                            item.sampleRate = res.properties.sampleRate || null;
                            item.bitrate = res.properties.bitrate || null;
                            item.hasAudio = res.properties.hasAudio || null;
                            item.hasVideo = res.properties.hasVideo || null;
                            item.enhancements = res.properties.enhancements || null;
                            item.enhancedPath = res.properties.enhancedPath || null;
                            
                            const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
                            const cardElement = Array.from(document.querySelectorAll('.file-card'))
                                .find(c => normPath(c.dataset.path) === normPath(item.path));
                            if (cardElement) {
                                const d = cardElement.querySelector('.duration-badge');
                                if (d && item.duration) {
                                    d.innerText = window.formatDuration(item.duration);
                                    d.style.display = 'block';
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[loadDirectory] Background probe failed:', e);
                    }
                    await new Promise(r => setTimeout(r, 150));
                }
            })();
        }
    } else {
        el('status-size').innerText = '';
    }

    setTimeout(() => {
        if (window.scrollPositions[window.currentNavPath]) {
            el('main-area').scrollTop = window.scrollPositions[window.currentNavPath];
        }
    }, 50);
}

async function navigateTo(navPath, realPath) {
    if (navPath === 'root') loadDirectory('root', realPath, false);
    else {
        window.currentNavPath = navPath; el('path-display').innerText = navPath;

        el('btn-back').disabled = false;
        el('btn-back').title = "Go back";
        if (el('btn-new-folder')) el('btn-new-folder').disabled = false;
        if (el('btn-new-folder')) el('btn-new-folder').title = "Create virtual folder";
        el('btn-refresh').disabled = true;
        el('btn-refresh').title = "Refresh unavailable in virtual folders";

        const targetFolder = window.getTargetFolder(navPath);
        if (targetFolder && targetFolder.items.length > 0) {
            el('loading').style.display = 'flex';
            window.allItems = await window.electronAPI.scanSpecificFiles(targetFolder.items);
            el('loading').style.display = 'none';
        } else {
            window.allItems = [];
        }
        applyFilters();
    }
}

function initNavigationListeners() {
    el('main-area').addEventListener('scroll', () => {
        window.scrollPositions[window.currentNavPath] = el('main-area').scrollTop;
        window.appSettings.scrollPositions = window.scrollPositions;
        window.electronAPI.saveSettings(window.appSettings);

        if (el('main-area').scrollTop + el('main-area').clientHeight >= el('main-area').scrollHeight - 100) {
            if (window.currentlyRendered < window.displayedItems.length) renderMore();
        }
    });

    el('filter-type').addEventListener('change', applyFilters);
    el('sort-by').addEventListener('change', applyFilters);
    el('search-box').addEventListener('input', applyFilters);

    el('btn-sort-order').addEventListener('click', () => {
        const btn = el('btn-sort-order');
        const currentOrder = btn.dataset.order || 'desc';
        const nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
        btn.dataset.order = nextOrder;
        window.updateSortOrderButtonUI();
        applyFilters();
    });

    el('btn-back').addEventListener('click', () => {
        if (window.currentNavPath && window.currentNavPath !== 'root') {
            const parts = window.currentNavPath.split('/'); parts.pop(); navigateTo(parts.join('/'), window.currentRealPath);
        }
    });

    el('btn-refresh').addEventListener('click', async () => {
        if (!window.currentRealPath) return;
        el('loading-text').innerText = 'Refreshing Views...'; el('loading').style.display = 'flex';
        const latest = await window.electronAPI.scanDirectory(window.currentRealPath);
        el('loading').style.display = 'none'; el('loading-text').innerText = 'Scanning directory... this may take a moment.';

        const existingPaths = new Set(window.allItems.map(i => i.path));
        let hasUpdates = false;
        latest.forEach(item => {
            if (!existingPaths.has(item.path)) { window.allItems.push(item); hasUpdates = true; }
            else {
                const exist = window.allItems.find(i => i.path === item.path);
                if (exist) {
                    if (exist.thumbnail !== item.thumbnail || exist.hoverWebm !== item.hoverWebm || exist.trickplayFolder !== item.trickplayFolder) {
                        exist.thumbnail = item.thumbnail;
                        exist.hoverWebm = item.hoverWebm;
                        exist.trickplayFolder = item.trickplayFolder;
                        hasUpdates = true;
                    }
                }
            }
        });

        if (hasUpdates) applyFilters();
        window.showToast('Views refreshed successfully', 'success');
    });

    el('btn-select').addEventListener('click', async () => {
        const folderPath = await window.electronAPI.openDirectory();
        if (folderPath) { loadDirectory('root', folderPath, false); window.showToast('Vault loaded: ' + folderPath, 'success'); }
    });

    el('path-display').addEventListener('click', async () => {
        const folderPath = await window.electronAPI.openDirectory();
        if (folderPath) { loadDirectory('root', folderPath, false); window.showToast('Vault loaded: ' + folderPath, 'success'); }
    });

    // drag selection box logic
    const area = el('main-area');
    const sbox = el('selection-box');
    let isDragging = false, startX, startY;

    area.addEventListener('mousedown', (e) => {
        if (e.target.closest('.file-card') || e.target.closest('.toolbar') || e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true; const rect = area.getBoundingClientRect();
        startX = e.clientX - rect.left + area.scrollLeft; startY = e.clientY - rect.top + area.scrollTop;
        sbox.style.left = startX + 'px'; sbox.style.top = startY + 'px'; sbox.style.width = '0px'; sbox.style.height = '0px'; sbox.style.display = 'block';
        if (!e.ctrlKey && !e.shiftKey) {
            window.selectedIndices.clear();
            document.querySelectorAll('.file-card').forEach(c => { c.classList.remove('selected'); c.querySelector('.file-checkbox').checked = false; });
            updateStatusBar();
        }
    });
    area.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = area.getBoundingClientRect();
        const curX = e.clientX - rect.left + area.scrollLeft; const curY = e.clientY - rect.top + area.scrollTop;
        const x = Math.min(startX, curX), y = Math.min(startY, curY), w = Math.abs(curX - startX), h = Math.abs(curY - startY);
        sbox.style.left = x + 'px'; sbox.style.top = y + 'px'; sbox.style.width = w + 'px'; sbox.style.height = h + 'px';

        document.querySelectorAll('.file-card').forEach(card => {
            const cr = card.getBoundingClientRect();
            const cardX = cr.left - rect.left + area.scrollLeft; const cardY = cr.top - rect.top + area.scrollTop;
            const intersects = !(cardX > x + w || cardX + cr.width < x || cardY > y + h || cardY + cr.height < y);
            const idx = parseInt(card.dataset.index);
            if (intersects) {
                window.selectedIndices.add(idx); card.classList.add('selected'); card.querySelector('.file-checkbox').checked = true;
            }
        });
        updateStatusBar();
    });
    window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; sbox.style.display = 'none'; } });

    // Background context menu
    area.addEventListener('contextmenu', async (e) => {
        if (e.target.closest('.file-card')) return;
        if (!window.currentRealPath) return;
        const hasClip = !!(window._clipboard && window._clipboard.paths.length > 0);
        const action = await window.electronAPI.showContextMenu({
            type: 'background', _hasClipboard: hasClip
        });
        if (action === 'paste') {
            if (!window._clipboard || window._clipboard.paths.length === 0) { window.showToast('Nothing to paste', 'error'); return; }
            const res = await window.electronAPI.pasteFiles({ paths: window._clipboard.paths, mode: window._clipboard.mode, destination: window.currentRealPath });
            if (res.success) {
                window.showToast(`Pasted ${res.count} file(s)`, 'success');
                if (window.currentNavPath !== 'root') {
                    const targetFolder = window.getTargetFolder(window.currentNavPath);
                    if (targetFolder && Array.isArray(res.pastedPaths)) {
                        res.pastedPaths.forEach(p => {
                            if (!targetFolder.items.includes(p)) targetFolder.items.push(p);
                        });
                        window.electronAPI.saveSettings(window.appSettings);
                    }
                }
                if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                if (window.currentNavPath !== 'root') {
                    navigateTo(window.currentNavPath, window.currentRealPath);
                } else {
                    loadDirectory(window.currentNavPath, window.currentRealPath, false);
                }
            } else { window.showToast('Paste failed: ' + res.error, 'error'); }
        } else if (action === 'bg-refresh') {
            loadDirectory(window.currentNavPath, window.currentRealPath, false);
        } else if (action === 'bg-select-all') {
            window.selectedIndices.clear();
            window.displayedItems.forEach((_, i) => window.selectedIndices.add(i));
            document.querySelectorAll('.file-card').forEach(c => { c.classList.add('selected'); c.querySelector('.file-checkbox').checked = true; });
            updateStatusBar();
            window.showToast(`Selected ${window.displayedItems.length} item(s)`, 'success');
        } else if (action === 'bg-new-folder') {
            const btn = document.getElementById('btn-new-folder');
            if (btn && !btn.disabled) btn.click();
        }
    });
}

async function triggerCryptoPrompt(action) {
    const pathsToProcess = [];
    window.selectedIndices.forEach(idx => {
        const si = window.displayedItems[idx];
        if (si && si.path && si.type !== 'fakeFolder') pathsToProcess.push(si.path);
    });

    if (pathsToProcess.length === 0) {
        window.showToast('No valid files selected', 'error');
        return;
    }

    const dialogEl = el('crypto-dialog');
    const passwordInput = el('crypto-password');
    const labelEl = el('crypto-dialog-label');

    labelEl.innerText = action === 'encrypt-prompt'
        ? `Encrypt ${pathsToProcess.length} file(s) with AES-256:`
        : `Decrypt ${pathsToProcess.length} file(s) with AES-256:`;
    passwordInput.value = '';
    dialogEl.style.display = 'block';
    passwordInput.focus();

    const onCancel = () => {
        dialogEl.style.display = 'none';
        cleanup();
    };

    const onConfirm = async () => {
        const password = passwordInput.value;
        if (!password) {
            window.showToast('Password cannot be empty', 'error');
            return;
        }
        dialogEl.style.display = 'none';
        cleanup();

        el('loading-text').innerText = action === 'encrypt-prompt' ? 'Encrypting files...' : 'Decrypting files...';
        el('loading').style.display = 'flex';

        if (action === 'encrypt-prompt') {
            const res = await window.electronAPI.encryptFiles({ paths: pathsToProcess, password });
            el('loading').style.display = 'none';
            el('loading-text').innerText = window.translations[window.currentLang].scanning;
            if (res.success) {
                window.showToast('Files encrypted successfully', 'success');
                loadDirectory(window.currentNavPath, window.currentRealPath, true);
            } else {
                window.showToast('Encryption failed: ' + res.error, 'error');
            }
        } else {
            const res = await window.electronAPI.decryptFiles({ paths: pathsToProcess, password });
            el('loading').style.display = 'none';
            el('loading-text').innerText = window.translations[window.currentLang].scanning;
            if (res.success) {
                window.showToast('Files decrypted successfully', 'success');
                loadDirectory(window.currentNavPath, window.currentRealPath, true);
            } else {
                window.showToast(`Decrypted ${res.count || 0}/${pathsToProcess.length} files successfully. Some passwords may be incorrect.`, 'error');
                loadDirectory(window.currentNavPath, window.currentRealPath, true);
            }
        }
    };

    const onKeydown = (e) => {
        if (e.key === 'Enter') onConfirm();
        else if (e.key === 'Escape') onCancel();
    };

    const cleanup = () => {
        el('btn-cancel-crypto').removeEventListener('click', onCancel);
        el('btn-confirm-crypto').removeEventListener('click', onConfirm);
        passwordInput.removeEventListener('keydown', onKeydown);
    };

    el('btn-cancel-crypto').addEventListener('click', onCancel);
    el('btn-confirm-crypto').addEventListener('click', onConfirm);
    passwordInput.addEventListener('keydown', onKeydown);
}

window.showLanguageModal = function(title, allowMultiple = true, selectedLanguages = []) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'vw-dynamic-modal-backdrop';
        backdrop.style = `
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(7, 8, 10, 0.85);
            backdrop-filter: blur(4px);
            z-index: 5000;
            display: flex; align-items: center; justify-content: center;
            font-family: var(--font-sans), system-ui;
        `;
        
        const modal = document.createElement('div');
        modal.className = 'vw-warm-card';
        modal.style = `
            width: 380px;
            padding: 24px;
            border: 1px solid var(--vault-border);
            box-shadow: 0 20px 50px rgba(0,0,0,0.3);
            border-radius: 8px;
            color: var(--vault-text);
            background: var(--vault-warm-raised);
        `;
        
        const header = document.createElement('h3');
        header.style = `
            margin: 0 0 16px 0;
            font-size: 15px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--vault-gold);
            border-bottom: 1px solid var(--vault-warm-border-subtle);
            padding-bottom: 10px;
        `;
        header.innerText = title;
        modal.appendChild(header);
        
        const desc = document.createElement('p');
        desc.style = 'font-size:12px; opacity:0.8; margin-bottom:16px; line-height:1.4;';
        desc.innerText = allowMultiple 
            ? 'Select target subtitle languages to extract and write (.srt):'
            : 'Select the target spoken translation audio synthesis track language:';
        modal.appendChild(desc);
        
        const listContainer = document.createElement('div');
        listContainer.style = 'display:flex; flex-direction:column; gap:10px; margin-bottom:20px;';
        
        const languages = [
            { code: 'en', name: 'English (EN)' },
            { code: 'fr', name: 'Québécois / French (FR)' },
            { code: 'es', name: 'Spanish (ES)' }
        ];
        
        const selections = new Set(selectedLanguages);
        
        languages.forEach(lang => {
            const row = document.createElement('label');
            row.style = `
                display: flex; align-items: center; gap: 10px;
                padding: 10px 12px;
                background: rgba(255,255,255,0.03);
                border: 1px solid var(--vault-border);
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s ease;
            `;
            
            const input = document.createElement('input');
            input.type = allowMultiple ? 'checkbox' : 'radio';
            input.name = 'lang-select-group';
            input.value = lang.code;
            input.checked = selections.has(lang.code) || (!allowMultiple && selections.size === 0 && lang.code === 'en');
            input.style = `
                accent-color: var(--vault-accent);
                width: 16px; height: 16px;
            `;
            
            row.appendChild(input);
            const textSpan = document.createElement('span');
            textSpan.innerText = lang.name;
            row.appendChild(textSpan);
            
            row.addEventListener('mouseenter', () => {
                row.style.background = 'rgba(255,255,255,0.06)';
            });
            row.addEventListener('mouseleave', () => {
                row.style.background = 'rgba(255,255,255,0.03)';
            });
            
            listContainer.appendChild(row);
        });
        modal.appendChild(listContainer);
        
        const btnRow = document.createElement('div');
        btnRow.style = 'display:flex; justify-content:flex-end; gap:10px;';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.style = `
            background: transparent;
            border: 1px solid var(--vault-border);
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            color: var(--vault-text);
            cursor: pointer;
            transition: all 0.2s;
        `;
        cancelBtn.innerText = 'Cancel';
        
        const confirmBtn = document.createElement('button');
        confirmBtn.style = `
            background: var(--vault-accent);
            color: var(--vt-primary);
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
        `;
        confirmBtn.innerText = 'Apply';
        
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        modal.appendChild(btnRow);
        
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        
        cancelBtn.addEventListener('click', () => {
            backdrop.remove();
            resolve(null);
        });
        
        confirmBtn.addEventListener('click', () => {
            const chosen = [];
            modal.querySelectorAll('input').forEach(inp => {
                if (inp.checked) chosen.push(inp.value);
            });
            backdrop.remove();
            resolve(chosen);
        });
    });
};

window.showVideoEnhancementDialog = function(item) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'vw-dynamic-modal-backdrop';
        backdrop.style = `
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(7, 8, 10, 0.85);
            backdrop-filter: blur(4px);
            z-index: 5000;
            display: flex; align-items: center; justify-content: center;
            font-family: var(--font-sans), system-ui;
        `;
        
        const modal = document.createElement('div');
        modal.className = 'vw-warm-card';
        modal.style = `
            width: 440px;
            padding: 24px;
            border: 1px solid var(--vault-border);
            box-shadow: 0 25px 60px rgba(0,0,0,0.35);
            border-radius: 8px;
            color: var(--vault-text);
            background: var(--vault-warm-raised);
        `;
        
        const header = document.createElement('h3');
        header.style = `
            margin: 0 0 16px 0;
            font-size: 15px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--vault-gold);
            display: flex; align-items: center; gap: 8px;
            border-bottom: 1px solid var(--vault-warm-border-subtle);
            padding-bottom: 10px;
        `;
        header.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--vault-gold); margin-right:4px;">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <span>AI Video Optimization Center 🪄</span>
        `;
        modal.appendChild(header);
        
        const desc = document.createElement('p');
        desc.style = 'font-size:12px; opacity:0.8; margin-bottom:16px; line-height:1.4;';
        desc.innerText = 'Deploy high-performance ML models for super-resolution, denosing, and temporal reconstruction:';
        modal.appendChild(desc);
        
        const optionsContainer = document.createElement('div');
        optionsContainer.style = 'display:flex; flex-direction:column; gap:12px; margin-bottom:20px;';
        
        const options = [
            {
                id: 'cuda_tile',
                name: 'CUDA Tiling splits Super-Resolution (x4)',
                desc: 'Ultimate quality using localized tiles on Nvidia GPUs. Maximizes temporal detail.',
                badge: 'NVIDIA ONLY'
            },
            {
                id: 'realesrgan',
                name: 'Real-ESRGAN Vulkan (x2)',
                desc: 'Balanced upscaling using Vulkan APIs. Multi-platform hardware accelerated.',
                badge: 'BALANCED',
                checked: true
            },
            {
                id: 'denoise',
                name: 'Original Size Restoration & Denoise',
                desc: 'No upscale. Removes grain, compression artifacts, and fixes lighting issues.',
                badge: 'STABILIZE'
            }
        ];
        
        options.forEach(opt => {
            const card = document.createElement('label');
            card.style = `
                display: flex; flex-direction: column; gap: 4px;
                padding: 12px 14px;
                background: rgba(255,255,255,0.02);
                border: 1px solid var(--vault-border);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            const firstRow = document.createElement('div');
            firstRow.style = 'display:flex; align-items:center; justify-content:space-between; width:100%;';
            
            const leftPart = document.createElement('div');
            leftPart.style = 'display:flex; align-items:center; gap:8px;';
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'vsr-option-group';
            radio.value = opt.id;
            radio.checked = !!opt.checked;
            radio.style = 'accent-color: var(--vault-accent); width:16px; height:16px;';
            leftPart.appendChild(radio);
            
            const nameText = document.createElement('span');
            nameText.style = 'font-size:13px; font-weight:600;';
            nameText.innerText = opt.name;
            leftPart.appendChild(nameText);
            
            firstRow.appendChild(leftPart);
            
            const badge = document.createElement('span');
            badge.style = `
                font-size: 8.5px; font-weight: 700;
                padding: 2px 6px; border-radius: 4px;
                background: rgba(245,185,41,0.1);
                color: var(--vault-gold);
                border: 1px solid rgba(245,185,41,0.2);
            `;
            badge.innerText = opt.badge;
            firstRow.appendChild(badge);
            
            card.appendChild(firstRow);
            
            const detail = document.createElement('span');
            detail.style = 'font-size:11px; opacity:0.65; margin-left:24px; line-height:1.3;';
            detail.innerText = opt.desc;
            card.appendChild(detail);
            
            card.addEventListener('mouseenter', () => {
                card.style.background = 'rgba(255,255,255,0.05)';
                card.style.borderColor = 'var(--vault-accent)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.background = 'rgba(255,255,255,0.02)';
                card.style.borderColor = 'var(--vault-border)';
            });
            
            optionsContainer.appendChild(card);
        });
        modal.appendChild(optionsContainer);
        
        const btnRow = document.createElement('div');
        btnRow.style = 'display:flex; justify-content:flex-end; gap:10px;';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.style = `
            background: transparent;
            border: 1px solid var(--vault-border);
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            color: var(--vault-text);
            cursor: pointer;
            transition: all 0.2s;
        `;
        cancelBtn.innerText = 'Abort';
        
        const confirmBtn = document.createElement('button');
        confirmBtn.style = `
            background: var(--vault-accent);
            color: var(--vt-primary);
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
        `;
        confirmBtn.innerText = 'Execute Enhancement 🪄';
        
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        modal.appendChild(btnRow);
        
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        
        cancelBtn.addEventListener('click', () => {
            backdrop.remove();
            resolve(null);
        });
        
        confirmBtn.addEventListener('click', () => {
            let selectedId = 'realesrgan';
            modal.querySelectorAll('input').forEach(inp => {
                if (inp.checked) selectedId = inp.value;
            });
            backdrop.remove();
            resolve({ execute: true, method: selectedId });
        });
    });
};

// Bind globals for cross-reference
window.loadDirectory = loadDirectory;
window.navigateTo = navigateTo;
window.applyFilters = applyFilters;
window.updateStatusBar = updateStatusBar;
window.createCardElement = createCardElement;
window.renderMore = renderMore;
window.initNavigationListeners = initNavigationListeners;
window.triggerCryptoPrompt = triggerCryptoPrompt;
