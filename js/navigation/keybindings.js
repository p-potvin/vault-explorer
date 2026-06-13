/* ==========================================================================
   Vault Explorer — Keyboard Hotkeys & Virtual Folder Dialog
   ========================================================================== */

window.initKeybindingsAndFolderListeners = function() {
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
            // Pre-select folder type based on the active subtab
            const typeEl = el('fake-folder-type');
            if (typeEl) {
                const sub = window.currentVaultSubtab || 'all';
                if (sub === 'albums') typeEl.value = 'album';
                else if (sub === 'playlists') typeEl.value = 'playlist';
                else typeEl.value = 'collection';
            }
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
                const exists = window.appSettings.folders.some(f => f.name.toLowerCase() === name.toLowerCase() && f.parent === window.currentNavPath);
                if (exists) {
                    window.showToast('A virtual folder with this name already exists in this location', 'error');
                    return;
                }
                const typeEl = el('fake-folder-type');
                const type = typeEl ? typeEl.value : 'collection';
                window.appSettings.folders.push({ name: name, parent: window.currentNavPath, items: [], type: type });
                window.electronAPI.saveSettings(window.appSettings);
                folderDialog.style.display = 'none';
                inputFolderName.value = '';
                window.applyFilters();
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

    // Setup add-to-folder dialog cancel/confirm buttons
    const btnCancelAddToFolder = el('btn-cancel-add-to-folder');
    const btnConfirmAddToFolder = el('btn-confirm-add-to-folder');
    const addToFolderDialog = el('add-to-folder-dialog');
    const selectAddToFolder = el('add-to-folder-select');

    if (btnCancelAddToFolder && btnConfirmAddToFolder && addToFolderDialog && selectAddToFolder) {
        btnCancelAddToFolder.addEventListener('click', () => {
            addToFolderDialog.style.display = 'none';
        });
        
        btnConfirmAddToFolder.addEventListener('click', () => {
            const folderName = selectAddToFolder.value;
            if (!folderName || !window.itemToAssign) return;
            
            // Determine the expected type based on the item being assigned
            let expectedType = 'collection';
            if (window.itemToAssign.type === 'video' || window.itemToAssign.type === 'encrypted') expectedType = 'collection';
            else if (window.itemToAssign.type === 'image') expectedType = 'album';
            else if (window.itemToAssign.type === 'audio') expectedType = 'playlist';
            
            // Find folder by name, but prefer folders in the current navigation path
            // This helps with duplicate folder names
            let targetFolder = null;
            
            // First, try to find folder in current nav path with correct type
            if (window.currentNavPath && window.currentNavPath !== 'root') {
                targetFolder = window.appSettings.folders.find(f => 
                    f.name === folderName && f.parent === window.currentNavPath && (f.type || 'collection') === expectedType
                );
            }
            
            // If not found, try root level with correct type
            if (!targetFolder) {
                targetFolder = window.appSettings.folders.find(f => 
                    f.name === folderName && (f.parent === 'root' || !f.parent || f.parent === '') && (f.type || 'collection') === expectedType
                );
            }
            
            // If still not found, try any folder with matching name and correct type
            if (!targetFolder) {
                targetFolder = window.appSettings.folders.find(f => f.name === folderName && (f.type || 'collection') === expectedType);
            }
            
            // If still not found, try any folder with matching name (fallback)
            if (!targetFolder) {
                targetFolder = window.appSettings.folders.find(f => f.name === folderName);
            }
            
            if (targetFolder) {
                // Build the folder path for folderContents
                const folderPath = targetFolder.parent === 'root' || !targetFolder.parent ? `root/${targetFolder.name}` : `${targetFolder.parent}/${targetFolder.name}`;
                
                // Initialize folderContents entry if it doesn't exist
                if (!window.appSettings.folderContents) {
                    window.appSettings.folderContents = {};
                }
                if (!window.appSettings.folderContents[folderPath]) {
                    window.appSettings.folderContents[folderPath] = [];
                }
                
                // Add the file to this folder (multi-folder tagging allowed)
                const folderFiles = window.appSettings.folderContents[folderPath];
                if (!folderFiles.includes(window.itemToAssign.path)) {
                    folderFiles.push(window.itemToAssign.path);
                    window.electronAPI.saveSettings(window.appSettings);
                    const addedMsg = window.currentLang === 'fr' ? 'Ajouté avec succès' : 'Successfully added to virtual folder';
                    window.showToast(addedMsg, 'success');
                } else {
                    const alreadyMsg = window.currentLang === 'fr' ? 'Ce fichier est déjà dans ce dossier' : 'This file is already in this folder';
                    window.showToast(alreadyMsg, 'info');
                }
                
                addToFolderDialog.style.display = 'none';
                window.applyFilters();
            }
        });
    }

    window.showAddToFolderDialog = function(item) {
        const dialog = el('add-to-folder-dialog');
        const filenameEl = el('add-to-folder-dialog-filename');
        const selectEl = el('add-to-folder-select');
        
        if (!dialog || !selectEl || !filenameEl) return;
        
        window.itemToAssign = item;
        filenameEl.innerText = item.name;
        
        // Determine the expected type based on the file type
        let expectedType = 'collection';
        if (item.type === 'video' || item.type === 'encrypted') expectedType = 'collection';
        else if (item.type === 'image') expectedType = 'album';
        else if (item.type === 'audio') expectedType = 'playlist';
        
        // Filter folders by expected type
        const matchingFolders = (window.appSettings.folders || []).filter(f => (f.type || 'collection') === expectedType);
        
        selectEl.innerHTML = '';
        if (matchingFolders.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            const defaultLabel = expectedType === 'collection' ? 'Create a Collection first' : expectedType === 'album' ? 'Create an Album first' : 'Create a Playlist first';
            option.innerText = `(${defaultLabel})`;
            selectEl.appendChild(option);
            btnConfirmAddToFolder.disabled = true;
        } else {
            matchingFolders.forEach(f => {
                const option = document.createElement('option');
                option.value = f.name;
                // Include parent path for folders not at root to help distinguish duplicates
                const parentLabel = (f.parent && f.parent !== 'root' && f.parent !== '') ? `${f.parent}/` : '';
                option.innerText = `${parentLabel}${f.name} (${f.type || 'collection'})`;
                selectEl.appendChild(option);
            });
            btnConfirmAddToFolder.disabled = false;
        }
        
        dialog.style.display = 'block';
    };

    // Global shortcut keys (F2 rename, select all, copy, paste, delete, new folder)
    document.addEventListener('keydown', async (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Escape Key Back Navigation
        if (e.key === 'Escape') {
            const playerOpen = el('video-modal') && el('video-modal').style.display === 'flex';
            const dialogsOpen = Array.from(document.querySelectorAll('[role="dialog"], .modal')).some(d => d.style.display === 'flex' || d.style.display === 'block');
            if (!playerOpen && !dialogsOpen) {
                e.preventDefault();
                const backBtn = el('btn-back');
                if (backBtn && !backBtn.disabled) {
                    backBtn.click();
                }
            }
        }

        // Arrow Keys Grid Navigation
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            const activeGrid = document.querySelector('.file-grid:not([style*="display: none"])') || document.querySelector('#file-grid');
            if (activeGrid) {
                const cards = Array.from(activeGrid.querySelectorAll('.file-card'));
                if (cards.length > 0) {
                    let nextIdx = -1;
                    const currentIdx = cards.indexOf(document.activeElement);
                    
                    if (currentIdx === -1) {
                        nextIdx = 0;
                    } else {
                        let cols = 0;
                        const firstCardTop = cards[0].getBoundingClientRect().top;
                        for (let i = 0; i < cards.length; i++) {
                            if (Math.abs(cards[i].getBoundingClientRect().top - firstCardTop) > 5) {
                                cols = i;
                                break;
                            }
                        }
                        if (cols === 0) cols = cards.length;
                        
                        if (e.key === 'ArrowLeft') {
                            nextIdx = currentIdx - 1;
                        } else if (e.key === 'ArrowRight') {
                            nextIdx = currentIdx + 1;
                        } else if (e.key === 'ArrowUp') {
                            nextIdx = currentIdx - cols;
                        } else if (e.key === 'ArrowDown') {
                            nextIdx = currentIdx + cols;
                        }
                    }
                    
                    if (nextIdx >= 0 && nextIdx < cards.length) {
                        e.preventDefault();
                        cards[nextIdx].focus();
                        
                        if (window.selectedIndices) {
                            window.selectedIndices.clear();
                            window.selectedIndices.add(nextIdx);
                            window.lastSelectedIndex = nextIdx;
                            document.querySelectorAll('.file-card').forEach(c => {
                                const isSel = window.selectedIndices.has(parseInt(c.dataset.index));
                                c.classList.toggle('selected', isSel);
                                const cb = c.querySelector('.file-checkbox');
                                if (cb) cb.checked = isSel;
                            });
                            window.updateStatusBar();
                        }
                    }
                }
            }
        }
        
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
                    const isVirtual = window.currentNavPath !== 'root';
                    const confirmTitle = isVirtual 
                        ? (window.currentLang === 'fr' ? 'Confirmer le retrait' : 'Confirm Bulk Removal')
                        : (window.currentLang === 'fr' ? 'Confirmer la suppression' : 'Confirm Bulk Deletion');
                    const confirmMsg = isVirtual
                        ? (window.currentLang === 'fr' ? `Retirer les éléments sélectionnés de ce dossier : ${names} ?` : `Remove selected item(s) from this folder: ${names}?`)
                        : `Delete selected item(s): ${names}?`;
                        
                    if (await window.showConfirmDialog(confirmMsg, confirmTitle)) {
                        (async () => {
                            let successCount = 0;
                            if (isVirtual) {
                                const targetFolder = window.getTargetFolder(window.currentNavPath);
                                if (targetFolder) {
                                    const folderPath = targetFolder.parent === 'root' || !targetFolder.parent ? `root/${targetFolder.name}` : `${targetFolder.parent}/${targetFolder.name}`;
                                    const folderFiles = window.appSettings.folderContents[folderPath] || [];
                                    for (const item of itemsToDelete) {
                                        if (item.type === 'fakeFolder') {
                                            window.appSettings.folders = window.appSettings.folders.filter(f => !(f.name === item.name && (f.parent === window.currentNavPath || (window.currentNavPath === 'root' && !f.parent))));
                                            successCount++;
                                        } else {
                                            const idx = folderFiles.indexOf(item.path);
                                            if (idx > -1) folderFiles.splice(idx, 1);
                                            successCount++;
                                        }
                                    }
                                }
                            } else {
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
                            }
                            if (successCount > 0) {
                                window.showToast(isVirtual ? `Removed ${successCount} item(s)` : `Deleted ${successCount} item(s)`, 'success');
                                window.electronAPI.saveSettings(window.appSettings);
                                if (!isVirtual && typeof window.invalidateRootCache === 'function') {
                                    window.invalidateRootCache();
                                }
                                window.applyFilters();
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
