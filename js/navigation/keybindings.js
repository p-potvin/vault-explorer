/* ==========================================================================
   Vault Explorer — Keyboard Hotkeys & Virtual Folder Dialog
   ========================================================================== */

window.initNavigationListeners = function() {
    console.log('[navigation] Initializing hotkeys and folder dialog setup listeners...');

    // Language switcher trigger click listener
    const langTrigger = el('lang-trigger');
    if (langTrigger) {
        langTrigger.addEventListener('click', () => {
            const nextLang = window.currentLang === 'en' ? 'fr' : 'en';
            window.setLanguage(nextLang);
            if (window.appSettings) {
                window.appSettings.lang = nextLang;
                window.electronAPI.saveSettings(window.appSettings);
            }
        });
    }

    // Refresh directory hotkey (F5)
    document.addEventListener('keydown', async (e) => {
        if (e.key === 'F5') {
            e.preventDefault();
            if (window.currentRealPath) {
                console.log('[F5] Refreshing directory:', window.currentRealPath);
                window.loadDirectory(window.currentNavPath, window.currentRealPath, false);
                window.showToast('Views refreshed successfully', 'success');
            }
        }
    });

    // Create fake virtual folders dialog setup
    const btnNewFolder = el('btn-new-folder');
    const inputFolderName = el('fake-folder-name');
    const folderDialog = el('fake-folder-dialog');
    const btnCancelFolder = el('btn-cancel-folder');
    const btnCreateFolder = el('btn-create-folder');

    if (btnNewFolder && inputFolderName && folderDialog && btnCancelFolder && btnCreateFolder) { 
        btnNewFolder.addEventListener('click', () => {
            folderDialog.style.display = 'block';
            inputFolderName.value = '';
            btnCreateFolder.disabled = true;
            btnCreateFolder.title = "Folder name cannot be empty";
            inputFolderName.focus();
        });

        inputFolderName.addEventListener('input', (e) => {
            const hasValue = e.target.value.trim().length > 0;
            btnCreateFolder.disabled = !hasValue;
            btnCreateFolder.title = hasValue ? "" : "Folder name cannot be empty";
        });

        btnCancelFolder.addEventListener('click', () => {
            folderDialog.style.display = 'none';
            inputFolderName.value = '';
            btnNewFolder.focus();
        });

        btnCreateFolder.addEventListener('click', () => {
            const name = inputFolderName.value.trim();
            if (name) {
                window.appSettings.folders = window.appSettings.folders || [];
                window.appSettings.folders.push({ name: name, parent: window.currentNavPath, items: [] });
                window.electronAPI.saveSettings(window.appSettings);
                folderDialog.style.display = 'none';
                inputFolderName.value = '';
                window.loadDirectory(window.currentNavPath, window.currentRealPath, true);
                btnNewFolder.focus();
            }
        });

        inputFolderName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!btnCreateFolder.disabled) {
                    btnCreateFolder.click();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                btnCancelFolder.click();
            }
        }); 
    }

    // Global shortcut keys (F2 rename, select all, copy, paste, delete, new folder)
    document.addEventListener('keydown', async (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        // Find / Search
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            const sb = el('search-box');
            if (sb) {
                sb.focus();
                sb.select();
            }
        } 
        // Select All
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            if (window.selectedIndices && window.displayedItems) {
                window.selectedIndices.clear();
                window.displayedItems.forEach((_, i) => window.selectedIndices.add(i));
                document.querySelectorAll('.file-card').forEach(c => {
                    c.classList.add('selected');
                    const cb = c.querySelector('.file-checkbox');
                    if (cb) cb.checked = true;
                });
                window.updateStatusBar();
            }
        } 
        // Rename (F2)
        else if (e.key === 'F2') {
            if (window.selectedIndices && window.selectedIndices.size === 1) {
                e.preventDefault();
                const idx = Array.from(window.selectedIndices)[0];
                const card = document.querySelector(`.file-card[data-index="${idx}"]`);
                if (card) {
                    const inp = card.querySelector('.rename-input');
                    const fn = card.querySelector('.filename');
                    if (inp && fn) {
                        inp.style.display = 'block';
                        fn.style.display = 'none';
                        inp.focus();
                        inp.select();
                    }
                }
            }
        } 
        // Copy (Ctrl+C)
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (window.selectedIndices && window.selectedIndices.size > 0) {
                e.preventDefault();
                window._clipboard = { paths: [], mode: 'copy' };
                window.selectedIndices.forEach(idx => {
                    const si = window.displayedItems[idx];
                    if (si && si.path) window._clipboard.paths.push(si.path);
                });
                window.showToast(`Copied ${window._clipboard.paths.length} item(s)`, 'success');
            }
        } 
        // Cut (Ctrl+X)
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            if (window.selectedIndices && window.selectedIndices.size > 0) {
                e.preventDefault();
                window._clipboard = { paths: [], mode: 'cut' };
                window.selectedIndices.forEach(idx => {
                    const si = window.displayedItems[idx];
                    if (si && si.path) window._clipboard.paths.push(si.path);
                });
                window.showToast(`Cut ${window._clipboard.paths.length} item(s)`, 'success');
            }
        } 
        // Paste (Ctrl+V)
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            if (window._clipboard && window._clipboard.paths.length > 0) {
                e.preventDefault();
                (async () => {
                    const res = await window.electronAPI.pasteFiles({
                        paths: window._clipboard.paths,
                        mode: window._clipboard.mode,
                        destination: window.currentRealPath
                    });
                    if (res.success) {
                        window.showToast(`Pasted ${res.count} file(s)`, 'success');
                        if (window._clipboard.mode === 'cut') window._clipboard = { paths: [], mode: 'copy' };
                        window.loadDirectory(window.currentNavPath, window.currentRealPath, false);
                    } else {
                        window.showToast('Paste failed: ' + res.error, 'error');
                    }
                })();
            }
        } 
        // Delete (Delete)
        else if (e.key === 'Delete') {
            if (window.selectedIndices && window.selectedIndices.size > 0) {
                e.preventDefault();
                const itemsToDelete = Array.from(window.selectedIndices).map(idx => window.displayedItems[idx]).filter(Boolean);
                if (itemsToDelete.length > 0) {
                    const names = itemsToDelete.map(i => i.name).join(', ');
                    if (await window.showConfirmDialog(`Delete selected item(s): ${names}?`, 'Confirm Bulk Deletion')) {
                        (async () => {
                            let successCount = 0;
                            for (const item of itemsToDelete) {
                                if (item.type === 'fakeFolder') {
                                    window.appSettings.folders = window.appSettings.folders.filter(f => !(f.name === item.name && (f.parent === window.currentNavPath || (window.currentNavPath === 'root' && !f.parent))));
                                    successCount++;
                                } else {
                                    const res = await window.electronAPI.deleteItem(item.path);
                                    if (res.success) {
                                        window.allItems = window.allItems.filter(i => i.path !== item.path);
                                        successCount++;
                                    }
                                }
                            }
                            if (successCount > 0) {
                                window.showToast(`Deleted ${successCount} item(s)`, 'success');
                                window.electronAPI.saveSettings(window.appSettings);
                                window.loadDirectory(window.currentNavPath, window.currentRealPath, true);
                            }
                        })();
                    }
                }
            }
        } 
        // New Folder (Ctrl+N)
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            const btn = document.getElementById('btn-new-folder');
            if (btn && !btn.disabled) btn.click();
        }
    });
};
