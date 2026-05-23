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

    card.innerHTML = `
    <input type="checkbox" class="file-checkbox" aria-label="Select ${window.escapeHtml(item.name)}">
    <div class="thumbnail-container">
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
                loadDirectory(window.currentNavPath, window.currentRealPath, false);
            } else {
                input.value = item.name;
                window.showToast('Rename failed: ' + res.error, 'error');
            }
        }
    };
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') { input.value = item.name; input.blur(); } });

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
        else window.electronAPI.openFile(item.path);
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
        const action = await window.electronAPI.showContextMenu({ type: item.type, path: item.path, name: item.name, items: item.items });
        console.log('[ctx-menu] action:', action, 'item:', item.name);
        if (action === 'generate-webm') {

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
            window.showToast('Upscaling video (stub)...', 'success');
            el('loading-text').innerText = 'AI Upscaling Video...';
            el('loading').style.display = 'flex';
            const res = await window.electronAPI.upscaleVideo(item.path);
            el('loading').style.display = 'none';
            el('loading-text').innerText = window.translations[window.currentLang].scanning;
            if (!res.success) window.showToast('Upscale failed: ' + (res.error || 'Unknown'), 'error');
            else window.showToast('Upscale complete (stub — no AI model configured)', 'success');
        } else if (action === 'encrypt-prompt' || action === 'decrypt-prompt') {
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
                    if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                    loadDirectory(window.currentNavPath, window.currentRealPath, false);
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
            const outputPath = window.currentRealPath + '\\selection_' + Date.now() + '.zip';
            window.showToast('Zipping ' + zipPaths.length + ' file(s)...', 'success');
            const res = await window.electronAPI.zipSelection({ paths: zipPaths, outputPath });
            if (res.success) window.showToast('Zip created: ' + outputPath.split('\\').pop(), 'success');
            else window.showToast('Zip failed: ' + res.error, 'error');
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
    if (stats.codec) rows += `<div><strong>Codec:</strong> ${window.escapeHtml(stats.codec)}</div>`;
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
        if (filterAttr === 'video') return v.type === 'video';
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

        const targetFolder = window.appSettings.folders.find(f => f.name === navPath.split('/').pop());
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
                if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                loadDirectory(window.currentNavPath, window.currentRealPath, false);
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

// Bind globals for cross-reference
window.loadDirectory = loadDirectory;
window.navigateTo = navigateTo;
window.applyFilters = applyFilters;
window.updateStatusBar = updateStatusBar;
window.createCardElement = createCardElement;
window.renderMore = renderMore;
window.initNavigationListeners = initNavigationListeners;
