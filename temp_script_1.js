
if (!window.electronAPI) {
    window.electronAPI = {
        openDirectory: async () => 'C:\\MockVault',
        scanDirectory: async () => [
            { path: 'C:\\MockVault\\Sample Video.mp4', name: 'Sample Video.mp4', type: 'video', thumbnail: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&q=80', hoverWebm: '', duration: 120, size: 104857600, mtime: Date.now(), mtimeFormatted: '2026-05-18 12:00' },
            { path: 'C:\\MockVault\\Stunning View.jpg', name: 'Stunning View.jpg', type: 'image', thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80', hoverWebm: '', size: 2048576, mtime: Date.now() - 3600000, mtimeFormatted: '2026-05-18 11:00' }
        ],
        scanSpecificFiles: async () => [],
        getEverythingSize: async () => 1073741824,
        getTrickplaySprites: async () => [],
        getFileSize: async () => 1073741824,
        openFile: async (filePath) => console.log('Mock Open File:', filePath),
        showInFolder: async (filePath) => console.log('Mock Show In Folder:', filePath),
        copyToClipboard: async (text) => console.log('Mock Copy:', text),
        showContextMenu: async () => 'opened',
        generateWebm: async (p) => ({ success: true, path: p + '.webm' }),
        upscaleVideo: async (p) => ({ success: true, path: p }),
        renameFile: async () => ({ success: true }),
        deleteItem: async () => ({ success: true }),
        getFolderSizeBackground: async () => 1073741824,
        getSettings: async () => ({ folders: [], theme: 'golden-slate', lang: 'en' }),
        saveSettings: async (s) => console.log('Mock Save Settings:', s),
        getTheme: async () => ({ success: true, theme: 'golden-slate' }),
        setTheme: async () => ({ success: true })
    };
}
const el = id => document.getElementById(id);

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let appSettings = { folders: [] };
let currentNavPath = '', currentRealPath = '';
let folderSizeTimer = null;

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '';
    if (type === 'success') {
        icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vt-emerald)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else {
        icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vt-red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }

    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function displayFolderSize(bytes) {
    if (!bytes) {
        el('status-size').innerText = '';
        return;
    }
    const label = translations[currentLang].folderSize || 'Folder Size (Everything):';
    const formatted = formatBytes(bytes);
    el('status-size').innerText = `${label} ${formatted}`;
}
let allItems = [], displayedItems = [];
let selectedIndices = new Set(), lastSelectedIndex = -1;
let PAGE_SIZE = 50, currentlyRendered = 0;
let scrollPositions = {};

// Fix for all file:// breakages (spaces, special chars)
function sanitizePath(p) {
    if (!p) return '';
    // E.g. C:\My Folder\File.jpg -> file:///C:/My%20Folder/File.jpg
    const standardized = p.replace(/\\/g, '/');
    const encoded = standardized.split('/').map(segment => encodeURIComponent(segment).replace(/'/g, "%27")).join('/');
    const decodedDrive = encoded.replace(/^([a-zA-Z])%3A\//, '$1:/');
    return 'file:///' + decodedDrive;
}

async function init() {
    appSettings = await window.electronAPI.getSettings();
    if (!appSettings.folders) appSettings.folders = [];
    if (!appSettings.lastPath) appSettings.lastPath = { navPath: 'root', realPath: '' };
    if (!appSettings.scrollPositions) appSettings.scrollPositions = {};

    scrollPositions = appSettings.scrollPositions;

    // Apply saved theme
    applyTheme(appSettings.theme || 'golden-slate');

    // Apply saved language
    if (appSettings.lang && (appSettings.lang === 'en' || appSettings.lang === 'fr')) {
        setLanguage(appSettings.lang);
    } else {
        setLanguage('en');
    }

    if (appSettings.lastPath.realPath) {
        loadDirectory(appSettings.lastPath.navPath, appSettings.lastPath.realPath, false);
    }
}
init();

function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024, i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`;
}

async function updateStatusBar() {
    el('status-items').innerText = `${displayedItems.length} items`;
    if (selectedIndices.size > 0) {
        let size = 0;
        let needsResolve = [];
        selectedIndices.forEach(idx => {
            const itm = displayedItems[idx];
            if (itm.type === 'video' || itm.type === 'image') {
                if (itm.size !== undefined) {
                    size += itm.size;
                } else {
                    needsResolve.push(itm);
                }
            }
        });

        // Lazy-load sizes for selected items via fast IPC stat resolving
        if (needsResolve.length > 0) {
            for (const item of needsResolve) {
                const s = await window.electronAPI.getFileSize(item.path);
                item.size = s;
                size += s;
            }
        }
        el('status-selected').innerText = `${selectedIndices.size} selected (${formatBytes(size)})`;
    } else el('status-selected').innerText = '';

    if (currentRealPath) {
        el('status-size').innerText = "Querying Everything Index...";
        const bytes = await window.electronAPI.getEverythingSize(currentRealPath);
        el('status-size').innerText = `Folder Size (Everything): ${formatBytes(bytes)}`;
    } else el('status-size').innerText = '';
}

function formatDuration(sec) {
    if (!sec) return '';
    const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function createCardElement(item, index) {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.tabIndex = 0;
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (item.type === 'video') {
                if (typeof playItem === 'function') playItem(index);
            } else if (item.type === 'fakeFolder') {
                navigateTo(currentNavPath + '/' + item.name, currentRealPath);
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
                const targetFolder = appSettings.folders.find(f => f.name === item.name && f.parent === currentNavPath);
                if (targetFolder && !targetFolder.items.includes(pathDropped)) {
                    targetFolder.items.push(pathDropped);
                    window.electronAPI.saveSettings(appSettings);
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
    if (item.hoverWebm) card.dataset.hasWebm = "true";
    if (item.thumbnail) card.dataset.hasThumb = "true";

    let thumbHtml = '';
    if (item.type === 'fakeFolder') {
        thumbHtml = '<svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
    } else {
        const thumbSrc = sanitizePath(item.thumbnail) || 'data:image/svg+xml;utf8,<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="%23333"/><text x="50%" y="50%" fill="%23777" font-family="sans-serif" font-size="14" text-anchor="middle">NO THUMB</text></svg>';
        thumbHtml = `<img class="thumbnail" loading="lazy" src="${thumbSrc}" alt="${escapeHtml(item.name)} thumbnail"><img class="trickplay" alt="">
                      <div class="duration-badge"></div>`;
    }

    let sizeBadgeHtml = '';
    if (item.type !== 'fakeFolder' && item.size) {
        sizeBadgeHtml = `<div class="size-badge">${formatBytes(item.size)}</div>`;
    }

    let metaLineHtml = '';
    if (item.type !== 'fakeFolder') {
        const extLabel = item.ext ? item.ext.toUpperCase().substring(1) : 'FILE';
        const sizeStr = item.size ? formatBytes(item.size) : '';
        metaLineHtml = `<div style="font-size:10px; color:#888; margin-top:2px; display:flex; gap:6px; justify-content:center; align-items:center;">
             <span style="font-weight:600; color:var(--vault-accent);">${extLabel}</span>
             <span>•</span>
             <span>${sizeStr}</span>
          </div>`;
    }

    card.innerHTML = `
        <input type="checkbox" class="file-checkbox" aria-label="Select ${escapeHtml(item.name)}">
        <div class="thumbnail-container">
           ${thumbHtml}
           ${sizeBadgeHtml}
        </div>
        <div class="filename-container" style="padding-top:4px;">
           <div class="filename">${escapeHtml(item.name)}</div>
           ${metaLineHtml}
           ${item.mtimeFormatted ? `<div style="font-size:10px; color:#aaa; margin-top:2px;">${item.mtimeFormatted}</div>` : ''}
           <input type="text" class="rename-input" value="${escapeHtml(item.name)}" aria-label="Rename ${escapeHtml(item.name)}">
        </div>
      `;

    const chk = card.querySelector('.file-checkbox');
    chk.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chk.checked) selectedIndices.add(index);
        else selectedIndices.delete(index);
        card.classList.toggle('selected', chk.checked);
        lastSelectedIndex = index;
        updateStatusBar();
    });

    // WebM Hover Play Logic
    if (item.hoverWebm) {
        let wT;
        const mainImg = card.querySelector('.thumbnail');
        const thumbCont = card.querySelector('.thumbnail-container');
        card.addEventListener('mouseenter', () => {
            clearTimeout(wT);
            wT = setTimeout(() => {
                if (thumbCont.querySelector('video.trickplay')) return;
                let v = document.createElement('video');
                v.src = sanitizePath(item.hoverWebm);
                v.autoplay = true; v.loop = true; v.muted = false; v.volume = 0.5; v.className = 'trickplay';
                v.style.display = 'block'; v.style.objectFit = 'cover';
                thumbCont.appendChild(v);
                mainImg.style.display = 'none';
            }, 300);
        });
        card.addEventListener('mouseleave', () => {
            clearTimeout(wT);
            const v = thumbCont.querySelector('video.trickplay');
            if (v) { v.pause(); v.src = ""; v.remove(); }
            if (mainImg) mainImg.style.display = 'block';
        });
    } else if (item.trickplayFolder) {
        let hoverTimer; let tpIndex = 0; let frames = [];
        const tpImg = card.querySelector('.trickplay');
        const mainImg = card.querySelector('.thumbnail');

        card.addEventListener('mouseenter', async () => {
            if (frames.length === 0) frames = await window.electronAPI.getTrickplaySprites(item.trickplayFolder);
            if (frames.length === 0) return; // Still empty

            tpImg.style.display = 'block'; mainImg.style.display = 'none'; tpIndex = 0;
            tpImg.src = sanitizePath(frames[tpIndex]);
            hoverTimer = setInterval(() => {
                tpIndex = (tpIndex + 1) % frames.length;
                tpImg.src = sanitizePath(frames[tpIndex]);
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
            if (res.success) loadDirectory(currentNavPath, currentRealPath, false);
            else { input.value = item.name; alert("Rename failed: " + res.error); }
        }
    };
    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') { input.value = item.name; input.blur(); } });

    // Async Duration Extract
    if (item.type === 'video') {
        requestAnimationFrame(() => {
            let tmp = document.createElement('video');
            tmp.preload = "metadata";
            tmp.src = sanitizePath(item.path);
            tmp.onloadedmetadata = () => {
                const d = card.querySelector('.duration-badge');
                if (d && tmp.duration) {
                    d.innerText = formatDuration(tmp.duration);
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
            if (selectedIndices.has(index)) selectedIndices.delete(index); else selectedIndices.add(index);
            lastSelectedIndex = index;
        } else if (e.shiftKey && lastSelectedIndex !== -1) {
            const start = Math.min(lastSelectedIndex, index); const end = Math.max(lastSelectedIndex, index);
            selectedIndices.clear(); for (let i = start; i <= end; i++) selectedIndices.add(i);
        } else {
            selectedIndices.clear(); selectedIndices.add(index); lastSelectedIndex = index;
        }
        document.querySelectorAll('.file-card').forEach(c => {
            const isSel = selectedIndices.has(parseInt(c.dataset.index));
            c.classList.toggle('selected', isSel);
            c.querySelector('.file-checkbox').checked = isSel;
        });
        updateStatusBar();
    });

    card.addEventListener('dblclick', () => {
        if (item.type === 'video') {
            if (typeof playItem === 'function') playItem(index);
        } else if (item.type === 'fakeFolder') navigateTo(currentNavPath + '/' + item.name, currentRealPath);
        else window.electronAPI.openFile(item.path);
    });

    card.addEventListener('contextmenu', async () => {
        if (!selectedIndices.has(index)) {
            selectedIndices.clear(); selectedIndices.add(index);
            document.querySelectorAll('.file-card').forEach(c => {
                c.classList.toggle('selected', selectedIndices.has(parseInt(c.dataset.index)));
                c.querySelector('.file-checkbox').checked = selectedIndices.has(parseInt(c.dataset.index));
            });
            updateStatusBar();
        }
        const action = await window.electronAPI.showContextMenu({ type: item.type, path: item.path, name: item.name, items: item.items });
        console.log('[ctx-menu] action:', action, 'item:', item.name);
        if (action === 'generate-webm') {
            showToast('Generating WebM preview...', 'success');
            el('loading-text').innerText = 'Generating WebM preview...';
            el('loading').style.display = 'flex';
            const res = await window.electronAPI.generateWebm(item.path, currentRealPath);
            el('loading').style.display = 'none';
            el('loading-text').innerText = translations[currentLang].scanning;
            if (!res.success) showToast('WebM failed: ' + res.error, 'error');
            else {
                showToast('WebM generated successfully!', 'success');
                loadDirectory(currentNavPath, currentRealPath, false);
            }
        } else if (action === 'upscale-video') {
            showToast('Upscaling video (stub)...', 'success');
            el('loading-text').innerText = 'AI Upscaling Video...';
            el('loading').style.display = 'flex';
            const res = await window.electronAPI.upscaleVideo(item.path);
            el('loading').style.display = 'none';
            el('loading-text').innerText = translations[currentLang].scanning;
            if (!res.success) showToast('Upscale failed: ' + (res.error || 'Unknown'), 'error');
            else showToast('Upscale complete (stub — no AI model configured)', 'success');
        } else if (action === 'remove-folder') {
            if (confirm(`Remove folder "${item.name}"?`)) {
                appSettings.folders = appSettings.folders.filter(f => !(f.name === item.name && f.parent === currentNavPath));
                window.electronAPI.saveSettings(appSettings);
                showToast('Folder removed', 'success');
                loadDirectory(currentNavPath, currentRealPath, true);
            }
        } else if (action === 'delete-item') {
            if (confirm(`Delete "${item.name}"?`)) {
                console.log('[delete] deleting:', item.path);
                const res = await window.electronAPI.deleteItem(item.path);
                if (res.success) {
                    showToast('Deleted: ' + item.name, 'success');
                    allItems = allItems.filter(i => i.path !== item.path);
                    applyFilters();
                } else {
                    showToast('Delete failed: ' + res.error, 'error');
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
            selectedIndices.forEach(idx => {
                const si = displayedItems[idx];
                if (si && si.path) window._clipboard.paths.push(si.path);
            });
            showToast(`Copied ${window._clipboard.paths.length} item(s)`, 'success');
            console.log('[clipboard] copied:', window._clipboard.paths);
        } else if (action === 'cut') {
            window._clipboard = { paths: [], mode: 'cut' };
            selectedIndices.forEach(idx => {
                const si = displayedItems[idx];
                if (si && si.path) window._clipboard.paths.push(si.path);
            });
            showToast(`Cut ${window._clipboard.paths.length} item(s)`, 'success');
            console.log('[clipboard] cut:', window._clipboard.paths);
        } else if (action === 'paste') {
            if (!window._clipboard || window._clipboard.paths.length === 0) {
                showToast('Nothing to paste', 'error');
            } else {
                const res = await window.electronAPI.pasteFiles({ paths: window._clipboard.paths, mode: window._clipboard.mode, destination: currentRealPath });
                if (res.success) {
                    showToast(`Pasted ${res.count} file(s)`, 'success');
                    if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                    loadDirectory(currentNavPath, currentRealPath, false);
                } else {
                    showToast('Paste failed: ' + res.error, 'error');
                }
            }
        } else if (action === 'zip-selection') {
            const zipPaths = [];
            selectedIndices.forEach(idx => {
                const si = displayedItems[idx];
                if (si && si.path) zipPaths.push(si.path);
            });
            if (zipPaths.length === 0) { showToast('No files selected for zip', 'error'); return; }
            const outputPath = currentRealPath + '\\selection_' + Date.now() + '.zip';
            showToast('Zipping ' + zipPaths.length + ' file(s)...', 'success');
            const res = await window.electronAPI.zipSelection({ paths: zipPaths, outputPath });
            if (res.success) showToast('Zip created: ' + outputPath.split('\\').pop(), 'success');
            else showToast('Zip failed: ' + res.error, 'error');
        } else if (action === 'properties') {
            showPropertiesDialog(item);
        } else if (action === 'opened') {
            console.log('[open] opened file:', item.path);
        } else if (action === 'show') {
            console.log('[show] showed in folder:', item.path);
        } else if (action === 'copied') {
            showToast('Path copied to clipboard', 'success');
        } else if (action === 'open-folder') {
            navigateTo(currentNavPath + '/' + item.name, currentRealPath);
        } else if (action === 'closed') {
            // Menu was closed without action
        }
    });

    return card;
}
async function showPropertiesDialog(item) {
    console.log('[properties] Requesting for:', item.path);
    const res = await window.electronAPI.getFileProperties(item.path);
    if (!res || !res.success) { showToast('Failed to get properties', 'error'); return; }
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
    let rows = `<div><strong>Name:</strong> ${escapeHtml(stats.name)}</div>
            <div><strong>Path:</strong> ${escapeHtml(stats.path)}</div>
            <div><strong>Size:</strong> ${formatBytes(stats.size)}</div>
            <div><strong>Created:</strong> ${escapeHtml(String(stats.created))}</div>
            <div><strong>Modified:</strong> ${escapeHtml(String(stats.modified))}</div>`;
    if (stats.width && stats.height) rows += `<div><strong>Resolution:</strong> ${stats.width}x${stats.height}</div>`;
    if (stats.duration) rows += `<div><strong>Duration:</strong> ${formatDuration(stats.duration)}</div>`;
    if (stats.codec) rows += `<div><strong>Codec:</strong> ${escapeHtml(stats.codec)}</div>`;
    if (stats.bitrate) rows += `<div><strong>Bitrate:</strong> ${formatBytes(stats.bitrate)}/s</div>`;
    details.innerHTML = rows;
    modal.style.display = 'flex';
}

function renderMore() {
    const nextBatch = displayedItems.slice(currentlyRendered, currentlyRendered + PAGE_SIZE);
    nextBatch.forEach((item, i) => { el('file-grid').appendChild(createCardElement(item, currentlyRendered + i)); });
    currentlyRendered += nextBatch.length;


}

function applyFilters() {
    const term = el('search-box').value.toLowerCase();
    const filterAttr = el('filter-type').value;

    const fakeFolders = appSettings.folders.filter(f => f.parent === currentNavPath).map(f => ({ type: 'fakeFolder', name: f.name }));

    // Calculate hidden Items
    const allHiddenItems = new Set();
    appSettings.folders.forEach(f => f.items.forEach(p => allHiddenItems.add(p)));

    // If we're inside a logical folder, allItems only contains those nodes we loaded, 
    // but here allItems represents the CURRENT logic pull
    const displayableFiles = allItems.filter(v => {
        // Hide if we're at root BUT it's dragged into a fake folder
        if (currentNavPath === 'root' || !currentNavPath.includes('/')) {
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

    // Sort logic
    const sortBy = el('sort-by').value;
    const sortOrder = el('btn-sort-order').dataset.order || 'desc';

    filteredItems.sort((a, b) => {
        // Always keep fake folders floating at top natively like Windows
        if (a.type === 'fakeFolder' && b.type !== 'fakeFolder') return -1;
        if (b.type === 'fakeFolder' && a.type !== 'fakeFolder') return 1;

        let valA = a[sortBy];
        let valB = b[sortBy];

        if (sortBy === 'name') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        else if (sortBy === 'size') { valA = valA || 0; valB = valB || 0; }
        else if (sortBy === 'duration') { valA = valA || 0; valB = valB || 0; }
        else if (sortBy === 'mtime') { valA = valA || 0; valB = valB || 0; }

        let compare = 0;
        if (valA < valB) compare = -1;
        else if (valA > valB) compare = 1;

        return sortOrder === 'desc' ? compare * -1 : compare;
    });

    displayedItems = filteredItems;

    if (displayedItems.length === 0) {
        const hasActiveFilters = term !== '' || filterAttr !== 'all';
        const ctaButton = hasActiveFilters
            ? `<button style="margin-top:16px;" onclick="document.getElementById('search-box').value=''; document.getElementById('filter-type').value='all'; applyFilters();">Clear Filters</button>`
            : `<button style="margin-top:16px;" onclick="document.getElementById('btn-select').click()">Browse Vault</button>`;

        el('file-grid').innerHTML = `
               <div class="empty-state" style="grid-column: 1 / -1;">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                       <circle cx="11" cy="11" r="8"></circle>
                       <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                   </svg>
                   <h3>No Items Found</h3>
                   <p>Adjust your search, filters, or select a different vault.</p>
                   ${ctaButton}
               </div>
           `;
        selectedIndices.clear(); lastSelectedIndex = -1; currentlyRendered = 0;
        updateStatusBar();
    } else {
        el('file-grid').innerHTML = '';
        selectedIndices.clear(); lastSelectedIndex = -1; currentlyRendered = 0;
        updateStatusBar();
        renderMore();
    }
}

el('main-area').addEventListener('scroll', () => {
    scrollPositions[currentNavPath] = el('main-area').scrollTop;
    appSettings.scrollPositions = scrollPositions;
    window.electronAPI.saveSettings(appSettings);

    if (el('main-area').scrollTop + el('main-area').clientHeight >= el('main-area').scrollHeight - 100) {
        if (currentlyRendered < displayedItems.length) renderMore();
    }
});

el('filter-type').addEventListener('change', applyFilters);
el('sort-by').addEventListener('change', applyFilters);
el('search-box').addEventListener('input', applyFilters);

function updateSortOrderButtonUI() {
    const btn = el('btn-sort-order');
    const order = btn.dataset.order || 'desc';
    const lang = currentLang || 'en';
    if (order === 'asc') {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
        btn.title = translations[lang].ascending;
    } else {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
        btn.title = translations[lang].descending;
    }
}

el('btn-sort-order').addEventListener('click', () => {
    const btn = el('btn-sort-order');
    const currentOrder = btn.dataset.order || 'desc';
    const nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
    btn.dataset.order = nextOrder;
    updateSortOrderButtonUI();
    applyFilters();
});

async function loadDirectory(navPath, realPath, useCache = false) {
    if (!realPath) return;
    currentNavPath = navPath; currentRealPath = realPath;
    el('path-display').innerText = navPath === 'root' ? realPath : navPath;

    // Enable new folder / refresh buttons if we have a real path
    el('btn-new-folder').disabled = false;
    el('btn-new-folder').title = "Create virtual folder";
    el('btn-refresh').disabled = false;
    el('btn-refresh').title = "Refresh directory";
    el('btn-back').disabled = true;
    el('btn-back').title = "Already at root vault level";

    appSettings.lastPath = { navPath, realPath };
    window.electronAPI.saveSettings(appSettings);

    el('loading').style.display = 'flex';
    if (!useCache) allItems = await window.electronAPI.scanDirectory(realPath);
    el('loading').style.display = 'none';

    applyFilters();

    // debounced background folder size calculation
    el('status-size').innerText = translations[currentLang].queryingEverything || 'Querying Everything...';
    clearTimeout(folderSizeTimer);
    folderSizeTimer = setTimeout(async () => {
        const cacheKey = 'dirsize_' + realPath;
        const cached = localStorage.getItem(cacheKey);
        let cachedObj = null;
        try {
            if (cached) cachedObj = JSON.parse(cached);
        } catch (e) { }

        if (cachedObj && cachedObj.fileCount === allItems.length) {
            displayFolderSize(cachedObj.size);
            return;
        }

        const totalSize = await window.electronAPI.getFolderSizeBackground(realPath);
        localStorage.setItem(cacheKey, JSON.stringify({ fileCount: allItems.length, size: totalSize }));
        displayFolderSize(totalSize);
    }, 3000);

    setTimeout(() => {
        if (scrollPositions[currentNavPath]) {
            el('main-area').scrollTop = scrollPositions[currentNavPath];
        }
    }, 50);
}

async function navigateTo(navPath, realPath) {
    if (navPath === 'root') loadDirectory('root', realPath, false);
    else {
        currentNavPath = navPath; el('path-display').innerText = navPath;

        // We are in a virtual folder
        el('btn-back').disabled = false;
        el('btn-back').title = "Go back";
        el('btn-new-folder').disabled = false;
        el('btn-new-folder').title = "Create virtual folder";
        el('btn-refresh').disabled = true;
        el('btn-refresh').title = "Refresh unavailable in virtual folders";

        // Scan only the items physically associated with this folder target!
        const targetFolder = appSettings.folders.find(f => f.name === navPath.split('/').pop());
        if (targetFolder && targetFolder.items.length > 0) {
            el('loading').style.display = 'flex';
            allItems = await window.electronAPI.scanSpecificFiles(targetFolder.items);
            el('loading').style.display = 'none';
        } else {
            allItems = [];
        }
        applyFilters();
    }
}

el('btn-back').addEventListener('click', () => {
    if (currentNavPath && currentNavPath !== 'root') {
        const parts = currentNavPath.split('/'); parts.pop(); navigateTo(parts.join('/'), currentRealPath);
    }
});

el('btn-refresh').addEventListener('click', async () => {
    if (!currentRealPath || currentNavPath !== 'root') return;
    el('loading-text').innerText = 'Refreshing Views...'; el('loading').style.display = 'flex';
    const latest = await window.electronAPI.scanDirectory(currentRealPath);
    el('loading').style.display = 'none'; el('loading-text').innerText = 'Scanning directory... this may take a moment.';

    const existingPaths = new Set(allItems.map(i => i.path));
    let hasUpdates = false;
    latest.forEach(item => {
        if (!existingPaths.has(item.path)) { allItems.push(item); hasUpdates = true; }
        else {
            const exist = allItems.find(i => i.path === item.path);
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
});

el('btn-select').addEventListener('click', async () => {
    const folderPath = await window.electronAPI.openDirectory();
    if (folderPath) loadDirectory('root', folderPath, false);
});

// Path display click opens folder browser
el('path-display').addEventListener('click', async () => {
    const folderPath = await window.electronAPI.openDirectory();
    if (folderPath) loadDirectory('root', folderPath, false);
});

// F5 refresh hotkey
document.addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
        e.preventDefault();
        if (currentRealPath) {
            console.log('[F5] Refreshing directory:', currentRealPath);
            loadDirectory(currentNavPath, currentRealPath, false);
        }
    }
});

// FAKE folders handling
document.getElementById('btn-new-folder').addEventListener('click', () => {
    document.getElementById('fake-folder-dialog').style.display = 'block';
    const input = document.getElementById('fake-folder-name');
    input.value = '';
    document.getElementById('btn-create-folder').disabled = true;
    document.getElementById('btn-create-folder').title = "Folder name cannot be empty";
    input.focus();
});

document.getElementById('fake-folder-name').addEventListener('input', (e) => {
    const createBtn = document.getElementById('btn-create-folder');
    const hasValue = e.target.value.trim().length > 0;
    createBtn.disabled = !hasValue;
    createBtn.title = hasValue ? "" : "Folder name cannot be empty";
});
document.getElementById('btn-cancel-folder').addEventListener('click', () => {
    document.getElementById('fake-folder-dialog').style.display = 'none'; document.getElementById('fake-folder-name').value = '';
    el('btn-new-folder').focus();
});
document.getElementById('btn-create-folder').addEventListener('click', () => {
    const name = document.getElementById('fake-folder-name').value.trim();
    if (name) {
        appSettings.folders.push({ name: name, parent: currentNavPath, items: [] });
        window.electronAPI.saveSettings(appSettings);
        document.getElementById('fake-folder-dialog').style.display = 'none'; document.getElementById('fake-folder-name').value = '';
        loadDirectory(currentNavPath, currentRealPath, true);
        el('btn-new-folder').focus();
    }
});

document.getElementById('fake-folder-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (!document.getElementById('btn-create-folder').disabled) {
            document.getElementById('btn-create-folder').click();
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        document.getElementById('btn-cancel-folder').click();
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const sb = el('search-box');
        sb.focus();
        sb.select();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault(); selectedIndices.clear();
        displayedItems.forEach((_, i) => selectedIndices.add(i));
        document.querySelectorAll('.file-card').forEach(c => {
            c.classList.add('selected'); c.querySelector('.file-checkbox').checked = true;
        });
        updateStatusBar();
    } else if (e.key === 'F2' && selectedIndices.size === 1) {
        e.preventDefault();
        const idx = Array.from(selectedIndices)[0];
        const card = document.querySelector(`.file-card[data-index="${idx}"]`);
        if (card) {
            const inp = card.querySelector('.rename-input'); const fn = card.querySelector('.filename');
            inp.style.display = 'block'; fn.style.display = 'none'; inp.focus(); inp.select();
        }
    }
});

const area = el('main-area'); const sbox = el('selection-box');
let isDragging = false, startX, startY;

area.addEventListener('mousedown', (e) => {
    if (e.target.closest('.file-card') || e.target.closest('.toolbar') || e.target.closest('button') || e.target.closest('input')) return;
    isDragging = true; const rect = area.getBoundingClientRect();
    startX = e.clientX - rect.left + area.scrollLeft; startY = e.clientY - rect.top + area.scrollTop;
    sbox.style.left = startX + 'px'; sbox.style.top = startY + 'px'; sbox.style.width = '0px'; sbox.style.height = '0px'; sbox.style.display = 'block';
    if (!e.ctrlKey && !e.shiftKey) {
        selectedIndices.clear();
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
            selectedIndices.add(idx); card.classList.add('selected'); card.querySelector('.file-checkbox').checked = true;
        }
    });
    updateStatusBar();
});
window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; sbox.style.display = 'none'; } });

el('video-modal').addEventListener('click', (e) => {
    if (e.target === el('video-modal')) el('close-modal').click();
});

el('close-modal').addEventListener('click', () => {
    el('video-modal').style.display = 'none';
    el('video-player').pause(); el('video-player').src = "";
    if (currentPlayingIndex !== -1) {
        const card = document.querySelector(`.file-card[data-index="${currentPlayingIndex}"]`);
        if (card) card.focus();
    }
});

// Custom Video Player Logic
const vp = el('video-player');
const seekArea = el('seek-area');
const seekFill = el('seek-fill');
const seekPreview = el('seek-hover-preview');
const btnPlay = el('btn-playpause');
const btnPrev = el('btn-prev');
const btnNext = el('btn-next');
const volSlider = el('volume-slider');
let trickFrames = [];
let currentPlayingIndex = -1;

function playItem(idx) {
    if (idx < 0 || idx >= displayedItems.length) return;
    const itm = displayedItems[idx];
    if (itm.type !== 'video') return;

    currentPlayingIndex = idx;
    trickFrames = [];
    vp.dataset.trickplay = itm.trickplayFolder || '';
    vp.src = sanitizePath(itm.path);
    btnPlay.innerHTML = '&#10074;&#10074;';
    el('video-modal').style.display = 'flex';
    el('video-modal').focus();
}

// Close on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el('video-modal').style.display === 'flex') {
        vp.pause();
        vp.src = "";
        el('video-modal').style.display = 'none';
        if (currentPlayingIndex !== -1) {
            const card = document.querySelector(`.file-card[data-index="${currentPlayingIndex}"]`);
            if (card) card.focus();
        }
    }
});

// Tooltip for next/prev
const navHoverPreview = document.createElement('div');
navHoverPreview.className = 'nav-hover-preview';
document.body.appendChild(navHoverPreview);

function updateNavHover(idx, btnEl) {
    if (idx < 0 || idx >= displayedItems.length) {
        navHoverPreview.style.display = 'none';
        return;
    }
    let itm = displayedItems[idx];
    const rect = btnEl.getBoundingClientRect();

    let thumbUrl = '';
    if (itm.trickplayFolder) {
        // grab the first frame of trickplay or its thumbnail
        thumbUrl = sanitizePath(itm.thumbnail || '');
    } else {
        thumbUrl = sanitizePath(itm.thumbnail || '');
    }

    if (thumbUrl) {
        navHoverPreview.style.backgroundImage = `url('${thumbUrl}')`;
        navHoverPreview.innerText = itm.name;
        navHoverPreview.style.left = (rect.left + (rect.width / 2)) + 'px';
        navHoverPreview.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
        navHoverPreview.style.display = 'flex';
    } else {
        navHoverPreview.style.display = 'none';
    }
}

btnPrev.addEventListener('mouseenter', () => {
    let prevIdx = currentPlayingIndex - 1;
    while (prevIdx >= 0 && displayedItems[prevIdx].type !== 'video') prevIdx--;
    updateNavHover(prevIdx, btnPrev);
});
btnPrev.addEventListener('mouseleave', () => navHoverPreview.style.display = 'none');

btnNext.addEventListener('mouseenter', () => {
    let nextIdx = currentPlayingIndex + 1;
    while (nextIdx < displayedItems.length && displayedItems[nextIdx].type !== 'video') nextIdx++;
    updateNavHover(nextIdx, btnNext);
});
btnNext.addEventListener('mouseleave', () => navHoverPreview.style.display = 'none');

btnPrev.addEventListener('click', () => {
    let prevIdx = currentPlayingIndex - 1;
    while (prevIdx >= 0 && displayedItems[prevIdx].type !== 'video') prevIdx--;
    if (prevIdx >= 0) playItem(prevIdx);
});

btnNext.addEventListener('click', () => {
    let nextIdx = currentPlayingIndex + 1;
    while (nextIdx < displayedItems.length && displayedItems[nextIdx].type !== 'video') nextIdx++;
    if (nextIdx < displayedItems.length) playItem(nextIdx);
});

// Initialize volume
vp.volume = volSlider.value;
volSlider.addEventListener('input', (e) => {
    vp.volume = parseFloat(e.target.value);
});

vp.addEventListener('timeupdate', () => {
    if (!vp.duration) return;
    seekFill.style.width = (vp.currentTime / vp.duration * 100) + '%';
    el('time-display').innerText = formatDuration(vp.currentTime) + ' / ' + formatDuration(vp.duration);
});

vp.addEventListener('click', () => { if (vp.paused) { vp.play(); btnPlay.innerHTML = '&#10074;&#10074;'; } else { vp.pause(); btnPlay.innerHTML = '&#9654;'; } });

btnPlay.addEventListener('click', () => { if (vp.paused) { vp.play(); btnPlay.innerHTML = '&#10074;&#10074;'; } else { vp.pause(); btnPlay.innerHTML = '&#9654;'; } });
el('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
        vp.parentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

// Video Shortcut Keys
document.addEventListener('keydown', (e) => {
    if (el('video-modal').style.display === 'flex') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                if (vp.paused) { vp.play(); btnPlay.innerHTML = '&#10074;&#10074;'; }
                else { vp.pause(); btnPlay.innerHTML = '&#9654;'; }
                break;
            case 'arrowleft':
                e.preventDefault();
                vp.currentTime = Math.max(0, vp.currentTime - 5);
                break;
            case 'arrowright':
                e.preventDefault();
                vp.currentTime = Math.min(vp.duration, vp.currentTime + 5);
                break;
            case 'arrowup':
                e.preventDefault();
                vp.volume = Math.min(1, vp.volume + 0.05);
                volSlider.value = vp.volume;
                break;
            case 'arrowdown':
                e.preventDefault();
                vp.volume = Math.max(0, vp.volume - 0.05);
                volSlider.value = vp.volume;
                break;
            case 'f':
                e.preventDefault();
                if (!document.fullscreenElement) vp.parentElement.requestFullscreen();
                else document.exitFullscreen();
                break;
        }
    }
});

seekArea.addEventListener('click', (e) => {
    const rect = seekArea.getBoundingClientRect();
    vp.currentTime = ((e.clientX - rect.left) / rect.width) * vp.duration;
});

seekArea.addEventListener('mousemove', async (e) => {
    const rect = seekArea.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    if (percent < 0) percent = 0; if (percent > 1) percent = 1;

    const tpFolder = vp.dataset.trickplay;
    if (tpFolder) {
        seekPreview.style.display = 'block';
        seekPreview.style.left = (percent * 100) + '%';
        if (trickFrames.length === 0) trickFrames = await window.electronAPI.getTrickplaySprites(tpFolder);
        if (trickFrames.length > 0) {
            const idx = Math.floor(percent * trickFrames.length);
            if (trickFrames[idx]) seekPreview.style.backgroundImage = `url('${sanitizePath(trickFrames[idx])}')`;
        }
    }
});

seekArea.addEventListener('mouseleave', () => { seekPreview.style.display = 'none'; });

// Vault Theme & Bilingual System
const translations = {
    en: {
        browseVault: "Browse Vault",
        videos: "Videos",
        images: "Images",
        allFiles: "All Files",
        searchPlaceholder: "Search files... (Ctrl/Cmd+F)",
        addFolder: "+ Folder",
        refresh: "â†º Refresh",
        sortLabel: "Sort:",
        dateModified: "Date Modified",
        name: "Name",
        size: "Size",
        type: "Type",
        duration: "Duration",
        ascending: "Ascending â†‘",
        descending: "Descending â†“",
        scanning: "Scanning directory... this may take a moment.",
        vaultEmpty: "Your Vault is Empty",
        clickBrowse: "Click \"Browse Vault\" above to select a folder and start exploring.",
        zeroItems: "0 items",
        theme: "Theme",
        enterFolderName: "Enter Folder Name:",
        cancel: "Cancel",
        create: "Create",
        folderSize: "Folder Size (Everything):",
        noFolderSelected: "No folder selected...",
        selected: "selected",
        items: "items",
        queryingEverything: "Querying Everything Index...",
        noItemsFound: "No Items Found",
        adjustFilters: "Adjust your search, filters, or select a different vault.",
        clearFilters: "Clear Filters",
        settings: "Settings",
        globExclusionsLabel: "Glob Exclusions (comma-separated):",
        save: "Save"
    },
    fr: {
        browseVault: "Parcourir le coffre",
        videos: "Vid\u00e9os",
        images: "Images",
        allFiles: "Tous les fichiers",
        searchPlaceholder: "Rechercher des fichiers... (Ctrl/Cmd+F)",
        addFolder: "+ Dossier",
        refresh: "\u21ba Actualiser",
        sortLabel: "Trier par :",
        dateModified: "Date de modification",
        name: "Nom",
        size: "Taille",
        type: "Type",
        duration: "Dur\u00e9e",
        ascending: "Croissant \u2191",
        descending: "D\u00e9croissant \u2193",
        scanning: "Analyse du r\u00e9pertoire... cela peut prendre un moment.",
        vaultEmpty: "Votre coffre est vide",
        clickBrowse: "Cliquez sur \u00ab Parcourir le coffre \u00bb ci-dessus pour s\u00e9lectionner un dossier et commencer \u00e0 explorer.",
        zeroItems: "0 \u00e9l\u00e9ment",
        theme: "Th\u00e8me",
        enterFolderName: "Entrez le nom du dossier :",
        cancel: "Annuler",
        create: "Cr\u00e9er",
        folderSize: "Taille du dossier (Everything) :",
        noFolderSelected: "Aucun dossier s\u00e9lectionn\u00e9...",
        selected: "s\u00e9lectionn\u00e9",
        items: "\u00e9l\u00e9ments",
        queryingEverything: "Interrogation de l'index Everything...",
        noItemsFound: "Aucun \u00e9l\u00e9ment trouv\u00e9",
        adjustFilters: "Ajustez vos filtres, votre recherche ou s\u00e9lectionnez un autre coffre.",
        clearFilters: "Effacer les filtres",
        settings: "Param\u00e8tres",
        globExclusionsLabel: "Exclusions Glob (s\u00e9par\u00e9es par des virgules) :",
        save: "Enregistrer"
    }
};

let currentLang = 'en';

function setLanguage(lang) {
    currentLang = lang;
    // Show the OPPOSITE lang as the button label (clicking switches TO that lang)
    el('lang-text').innerText = (lang === 'en') ? 'FR' : 'EN';
    console.log('[i18n] Language set to:', lang);

    // Update text-only DOM elements (NOT icon buttons — those would lose their SVGs)
    el('btn-select').innerText = translations[lang].browseVault;

    // Filter select options
    const filterType = el('filter-type');
    filterType.options[0].text = translations[lang].videos;
    filterType.options[1].text = translations[lang].images;
    filterType.options[2].text = translations[lang].allFiles;

    el('search-box').placeholder = translations[lang].searchPlaceholder;
    // btn-new-folder and btn-refresh are SVG icon buttons — do NOT set innerText
    el('btn-new-folder').title = translations[lang].addFolder;
    el('btn-refresh').title = translations[lang].refresh;
    el('sort-label').innerText = translations[lang].sortLabel;

    const sortBy = el('sort-by');
    sortBy.options[0].text = translations[lang].dateModified;
    sortBy.options[1].text = translations[lang].name;
    sortBy.options[2].text = translations[lang].size;
    sortBy.options[3].text = translations[lang].type;
    sortBy.options[4].text = translations[lang].duration;

    updateSortOrderButtonUI();

    el('loading-text').innerText = translations[lang].scanning;

    // Dialog inputs and labels
    const dialogLabel = document.querySelector('#fake-folder-dialog label');
    if (dialogLabel) dialogLabel.innerText = translations[lang].enterFolderName;
    el('btn-cancel-folder').innerText = translations[lang].cancel;
    el('btn-create-folder').innerText = translations[lang].create;

    el('theme-btn-text').innerText = translations[lang].theme;
    document.querySelector('.theme-panel-header').innerText = translations[lang].theme;

    el('settings-btn-text').innerText = translations[lang].settings;
    document.querySelector('.settings-panel-header').innerText = translations[lang].settings;
    el('glob-exclusions-label').innerText = translations[lang].globExclusionsLabel;
    el('settings-btn-save').innerText = translations[lang].save;

    // Update path display fallback if empty
    if (!currentRealPath) {
        el('path-display').innerText = translations[lang].noFolderSelected;
    }

    // Update empty state if it's currently showing
    const emptyStateH3 = document.querySelector('#file-grid .empty-state h3');
    const emptyStateP = document.querySelector('#file-grid .empty-state p');
    const emptyStateBtn = document.querySelector('#file-grid .empty-state button');
    if (emptyStateH3) emptyStateH3.innerText = translations[lang].vaultEmpty;
    if (emptyStateP) emptyStateP.innerText = translations[lang].clickBrowse;
    if (emptyStateBtn) emptyStateBtn.innerText = translations[lang].browseVault;

    // Re-trigger current state updates
    updateStatusBar();
}

el('lang-trigger').addEventListener('click', () => {
    const nextLang = currentLang === 'en' ? 'fr' : 'en';
    setLanguage(nextLang);
    if (appSettings) {
        appSettings.lang = nextLang;
        window.electronAPI.saveSettings(appSettings);
    }
});

function applyTheme(themeId) {
    if (window.applyVaultTheme) {
        window.applyVaultTheme(themeId);
    } else {
        document.documentElement.setAttribute('data-theme', themeId);
    }
    document.querySelectorAll('.theme-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.theme === themeId);
    });
}

// Build theme swatches dynamically
const themeGridEl = el('theme-grid');
const vaultThemes = window.VAULT_THEMES || [];
vaultThemes.forEach(theme => {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch';
    btn.dataset.theme = theme.id;
    btn.title = theme.name;
    btn.innerHTML = `
        <span class="swatch-colors">
          <span class="swatch-bg" style="background:${theme.primary};"></span>
          <span class="swatch-accent-strip" style="background:${theme.accent};"></span>
        </span>
        <span class="swatch-name">${theme.name}</span>`;
    btn.addEventListener('click', () => {
        applyTheme(theme.id);
        if (appSettings) {
            appSettings.theme = theme.id;
            window.electronAPI.saveSettings(appSettings);
            if (window.electronAPI.setTheme) {
                window.electronAPI.setTheme(theme.id);
            }
        }
        el('theme-panel').style.display = 'none';
        el('theme-trigger').setAttribute('aria-expanded', 'false');
        el('theme-trigger').focus();
    });
    themeGridEl.appendChild(btn);
});

el('theme-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = el('theme-panel');
    const isOpening = panel.style.display === 'none';
    panel.style.display = isOpening ? 'block' : 'none';
    el('theme-trigger').setAttribute('aria-expanded', isOpening ? 'true' : 'false');
    if (isOpening) {
        const cur = document.documentElement.getAttribute('data-theme') || 'golden-slate';
        document.querySelectorAll('.theme-swatch').forEach(sw => {
            const isActive = sw.dataset.theme === cur;
            sw.classList.toggle('active', isActive);
            sw.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        const activeSwatch = document.querySelector('.theme-swatch.active');
        if (activeSwatch) activeSwatch.focus();
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#theme-panel') && !e.target.closest('#theme-trigger')) {
        const panel = el('theme-panel');
        if (panel && panel.style.display === 'block') {
            panel.style.display = 'none';
            el('theme-trigger').setAttribute('aria-expanded', 'false');
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const themePanel = el('theme-panel');
        if (themePanel && themePanel.style.display === 'block') {
            themePanel.style.display = 'none';
            el('theme-trigger').setAttribute('aria-expanded', 'false');
            el('theme-trigger').focus();
        }

        const settingsPanel = el('settings-panel');
        if (settingsPanel && settingsPanel.style.display === 'block') {
            settingsPanel.style.display = 'none';
            el('settings-trigger').focus();
        }
    }
});

el('settings-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = el('settings-panel');
    const isOpening = panel.style.display === 'none';
    panel.style.display = isOpening ? 'block' : 'none';
    if (isOpening) {
        el('settings-glob-exclusions').value = (appSettings.globExclusions || []).join(', ');
        el('settings-glob-exclusions').focus();
    }
});

el('settings-btn-save').addEventListener('click', async () => {
    const value = el('settings-glob-exclusions').value;
    const list = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    appSettings.globExclusions = list;
    await window.electronAPI.saveSettings(appSettings);
    showToast(currentLang === 'fr' ? 'ParamÃ¨tres enregistrÃ©s' : 'Settings saved', 'success');
    el('settings-panel').style.display = 'none';

    // Reload current directory if exists to apply exclusions
    if (currentRealPath) {
        loadDirectory(currentNavPath, currentRealPath, false);
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#settings-panel') && !e.target.closest('#settings-trigger')) {
        el('settings-panel').style.display = 'none';
    }
});
