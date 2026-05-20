import re

path = r"c:\Users\Administrator\Desktop\Github Repos\vault-explorer\index.html"

with open(path, "r", encoding="latin-1") as f:
    content = f.read()

# Let's replace the contextmenu logic inside index.html
old_contextmenu = """      card.addEventListener('contextmenu', async () => {
         if (!selectedIndices.has(index)) {
            selectedIndices.clear(); selectedIndices.add(index);
            document.querySelectorAll('.file-card').forEach(c => {
                 c.classList.toggle('selected', selectedIndices.has(parseInt(c.dataset.index)));
                 c.querySelector('.file-checkbox').checked = selectedIndices.has(parseInt(c.dataset.index));
            });
            updateStatusBar();
         }
         const action = await window.electronAPI.showContextMenu({ type: item.type, path: item.path, name: item.name });
         if (action === 'generate-webm') {
             el('loading-text').innerText = 'Generating WebM preview...';
             el('loading').style.display = 'flex';
             const res = await window.electronAPI.generateWebm(item.path);
             el('loading').style.display = 'none';
             el('loading-text').innerText = 'Scanning directory... this may take a moment.';
             if (!res.success) alert("ffmpeg failed: " + res.error);
             else {
                 alert("WebM generated successfully! Reloading directory...");
                 loadDirectory(currentNavPath, currentRealPath, false);
             }
         } else if (action === 'upscale-video') {
             el('loading-text').innerText = 'AI Upscaling Video (This will take a while)...';
             el('loading').style.display = 'flex';
             const res = await window.electronAPI.upscaleVideo(item.path);
             el('loading').style.display = 'none';
             el('loading-text').innerText = 'Scanning directory... this may take a moment.';
             if (!res.success) alert("Upscaler message:\\n" + res.error);
             else {
                 alert("Video upscaled successfully! You may notice frame stutters if the bitrate was too high for NCNN encoding.");
                 loadDirectory(currentNavPath, currentRealPath, false);
             }
         } else if (action === 'remove-folder') {
             if (confirm(`Are you sure you want to remove the folder "${item.name}"?`)) {
                 appSettings.folders = appSettings.folders.filter(f => !(f.name === item.name && f.parent === currentNavPath));
                 window.electronAPI.saveSettings(appSettings);
                 loadDirectory(currentNavPath, currentRealPath, true);
             }
         }
      });"""

new_contextmenu = """      card.addEventListener('contextmenu', async () => {
         if (!selectedIndices.has(index)) {
            selectedIndices.clear(); selectedIndices.add(index);
            document.querySelectorAll('.file-card').forEach(c => {
                 c.classList.toggle('selected', selectedIndices.has(parseInt(c.dataset.index)));
                 c.querySelector('.file-checkbox').checked = selectedIndices.has(parseInt(c.dataset.index));
            });
            updateStatusBar();
         }
         const action = await window.electronAPI.showContextMenu({ type: item.type, path: item.path, name: item.name });
         if (action === 'generate-webm') {
             showToast(currentLang === 'fr' ? 'G\xE9n\xE9ration de l\\'aper\xE7u WebM en cours...' : 'Generating WebM preview...', 'success');
             const res = await window.electronAPI.generateWebm(item.path);
             if (!res.success) alert("ffmpeg failed: " + res.error);
             else {
                 showToast(currentLang === 'fr' ? 'Aper\xE7u WebM g\xE9n\xE9r\xE9 ! \\u2713' : 'WebM generated! \\u2713', 'success');
                 loadDirectory(currentNavPath, currentRealPath, false);
             }
         } else if (action === 'upscale-video') {
             showToast(currentLang === 'fr' ? 'Am\xE9lioration IA lanc\xE9e (processus long)...' : 'AI Enhancing Video (long background task)...', 'success');
             const res = await window.electronAPI.upscaleVideo(item.path);
             if (!res.success) alert("Upscaler message:\\n" + res.error);
             else {
                 showToast(currentLang === 'fr' ? 'Vid\xE9o am\xE9lior\xE9e avec succ\xE8s ! \\u2713' : 'Video upscaled successfully! \\u2713', 'success');
                 loadDirectory(currentNavPath, currentRealPath, false);
             }
         } else if (action === 'remove-folder') {
             const confirmMsg = currentLang === 'fr' 
                 ? `\xCAtes-vous s\xFBr de vouloir supprimer le dossier "${item.name}" ?` 
                 : `Are you sure you want to remove the folder "${item.name}"?`;
             if (confirm(confirmMsg)) {
                 appSettings.folders = appSettings.folders.filter(f => !(f.name === item.name && f.parent === currentNavPath));
                 window.electronAPI.saveSettings(appSettings);
                 loadDirectory(currentNavPath, currentRealPath, true);
             }
         } else if (action === 'open-folder') {
             navigateTo(currentNavPath + '/' + item.name, currentRealPath);
         } else if (action === 'copy' || action === 'cut') {
             showClipboardToast();
         } else if (action === 'paste') {
             el('loading-text').innerText = 'Pasting...';
             el('loading').style.display = 'flex';
             const res = await window.electronAPI.pasteFiles(currentRealPath);
             el('loading').style.display = 'none';
             if (res && res.success) {
                 showToast(currentLang === 'fr' ? 'Fichiers coll\xE9s avec succ\xE8s \\u2713' : 'Files pasted successfully \\u2713', 'success');
                 loadDirectory(currentNavPath, currentRealPath, false);
             } else {
                 alert("Paste failed: " + (res ? res.error : "Unknown error"));
             }
         } else if (action === 'delete-item') {
             const confirmMsg = currentLang === 'fr' 
                 ? `\xCAtes-vous s\xFBr de vouloir supprimer d\xE9fitivement "${item.name}" ? Cette action est irr\xE9versible.` 
                 : `Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`;
             if (confirm(confirmMsg)) {
                 el('loading-text').innerText = 'Deleting...';
                 el('loading').style.display = 'flex';
                 const res = await window.electronAPI.deleteItem(item.path);
                 el('loading').style.display = 'none';
                 if (res && res.success) {
                     showToast(currentLang === 'fr' ? 'Supprim\xE9 avec succ\xE8s \\u2713' : 'Deleted successfully \\u2713', 'success');
                     loadDirectory(currentNavPath, currentRealPath, false);
                 } else {
                     alert("Delete failed: " + (res ? res.error : "Unknown error"));
                 }
             }
         } else if (action === 'zip-selection') {
             const selectedPaths = Array.from(selectedIndices).map(idx => displayedItems[idx].path);
             if (selectedPaths.length === 0) return;
             el('loading-text').innerText = 'Creating ZIP archive...';
             el('loading').style.display = 'flex';
             const res = await window.electronAPI.zipSelection(selectedPaths, currentRealPath);
             el('loading').style.display = 'none';
             if (res && res.success) {
                 showToast(currentLang === 'fr' ? 'Archive ZIP cr\xE9\xE9e \\u2713' : 'ZIP archive created \\u2713', 'success');
                 loadDirectory(currentNavPath, currentRealPath, false);
             } else {
                 alert("Compression failed: " + (res ? res.error : "Unknown error"));
             }
         } else if (action === 'properties') {
             showPropertiesDialog(item);
         }
      });"""

# Normalize spacing and replace old context menu
content = content.replace(old_contextmenu, new_contextmenu)

# Let's check for standard "Create virtual folder" tooltips and replace them with "Create folder"
content = content.replace('Create virtual folder', 'Create folder')
content = content.replace('Refresh unavailable in virtual folders', 'Refresh unavailable in folders')

# Let's replace getFolderSizeBackground call with getFolderSizeSmart
content = content.replace('window.electronAPI.getFolderSizeBackground(realPath)', 'window.electronAPI.getFolderSizeSmart(realPath, allItems.length)')

# Now, inject dynamic style sheet and new appends right before the closing script tag
new_appends = """
    // Programmatic style injection for clipboard notification
    const style = document.createElement('style');
    style.textContent = `
        .clipboard-notification {
          position: fixed; bottom: 32px; left: 50%; transform: translate(-50%, 20px);
          background: rgba(16, 185, 129, 0.95) !important; border: 1px solid #10b981 !important;
          color: #fff; padding: 8px 16px; border-radius: 20px; font-size: 11px; font-weight: 600;
          letter-spacing: 0.05em; text-transform: uppercase;
          z-index: 10000; box-shadow: 0 4px 15px rgba(0,0,0,0.2); pointer-events: none;
          opacity: 0; transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .clipboard-notification.show {
          transform: translate(-50%, 0); opacity: 1;
        }
    `;
    document.head.appendChild(style);

    function showClipboardToast() {
        let el = document.getElementById('clipboard-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'clipboard-toast';
            el.className = 'clipboard-notification';
            document.body.appendChild(el);
        }
        el.innerText = currentLang === 'fr' ? 'Copi\\xE9 dans le presse-papiers \\u2713' : 'Copied to clipboard \\u2713';
        requestAnimationFrame(() => {
            el.classList.add('show');
        });
        setTimeout(() => {
            el.classList.remove('show');
        }, 1500);
    }

    async function showPropertiesDialog(item) {
        const stats = await window.electronAPI.getFileProperties(item.path);
        if (!stats) return;
        
        let modal = document.getElementById('properties-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'properties-modal';
            modal.style.cssText = `
                display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.6); z-index: 10005; align-items: center; justify-content: center;
                font-family: var(--font-body); backdrop-filter: blur(4px);
            `;
            modal.innerHTML = `
                <div style="background: var(--vt-surface); border: 1px solid var(--vault-border); border-radius: 6px; width: 420px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); color: var(--vault-text);">
                    <h3 style="font-family: var(--font-display); font-size: 12px; font-weight: 700; color: var(--vault-gold); text-transform: uppercase; margin: 0 0 16px 0; border-bottom: 1px solid var(--vault-border); padding-bottom: 8px; letter-spacing:0.08em;">File Properties / Propri\\xE9t\\xE9s</h3>
                    <div id="properties-details" style="font-size: 12px; display: flex; flex-direction: column; gap: 8px; font-family:var(--font-body);"></div>
                    <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                        <button id="close-properties" style="background: var(--vt-surface-alt); border: 1px solid var(--vault-border); color: var(--vault-text); padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; text-transform: uppercase;">Close / Fermer</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('close-properties').addEventListener('click', () => {
                modal.style.display = 'none';
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }
        
        const details = document.getElementById('properties-details');
        let rows = `
            <div><strong>Name / Nom:</strong> \\\\\${escapeHtml(stats.name)}</div>
            <div><strong>Path / Chemin:</strong> \\\\\${escapeHtml(stats.path)}</div>
            <div><strong>Size / Taille:</strong> \\\\\${formatBytes(stats.size)}</div>
            <div><strong>Created / Cr\\xE9\\xE9:</strong> \\\\\${escapeHtml(stats.created)}</div>
            <div><strong>Modified / Modifi\\xE9:</strong> \\\\\${escapeHtml(stats.modified)}</div>
        `;
        if (stats.width && stats.height) {
            rows += `<div><strong>Resolution / R\\xE9solution:</strong> \\\\\${stats.width}x\\\\\${stats.height}</div>`;
        }
        if (stats.duration) {
            rows += `<div><strong>Duration / Dur\\xE9e:</strong> \\\\\${formatDuration(stats.duration)}</div>`;
        }
        if (stats.codec) {
            rows += `<div><strong>Codec:</strong> \\\\\${escapeHtml(stats.codec)}</div>`;
        }
        if (stats.bitrate) {
            rows += `<div><strong>Bitrate / D\\xE9bit:</strong> \\\\\${escapeHtml(stats.bitrate)}</div>`;
        }
        details.innerHTML = rows;
        modal.style.display = 'flex';
    }

    // Alt+Enter properties, ESC and Refresh overrides, Arrow Key card focus navigations
    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'Enter') {
            const activeCard = document.activeElement.closest('.file-card');
            if (activeCard) {
                const idx = parseInt(activeCard.dataset.index);
                if (!isNaN(idx) && displayedItems[idx]) {
                    e.preventDefault();
                    showPropertiesDialog(displayedItems[idx]);
                }
            }
        }
        // ESC and Refresh
        else if (e.key === 'Escape') {
            if (document.activeElement.classList.contains('rename-input')) return;
            const btnBack = document.getElementById('btn-back');
            if (btnBack && !btnBack.disabled) {
                btnBack.click();
                e.preventDefault();
            }
        }
        else if (e.key === 'F5') {
            const btnRefresh = document.getElementById('btn-refresh');
            if (btnRefresh && !btnRefresh.disabled) {
                btnRefresh.click();
                e.preventDefault();
            }
        }
        // Arrow Keys card navigation
        const activeCard = document.activeElement.closest('.file-card');
        if (activeCard) {
            const cards = Array.from(document.querySelectorAll('.file-grid .file-card'));
            if (cards.length === 0) return;
            
            const currentIndex = cards.indexOf(activeCard);
            if (currentIndex === -1) return;
            
            const grid = document.getElementById('file-grid');
            const gridStyles = window.getComputedStyle(grid);
            const columns = gridStyles.getPropertyValue('grid-template-columns').split(' ').length;
            
            let nextIndex = currentIndex;
            if (e.key === 'ArrowLeft') {
                nextIndex = currentIndex - 1;
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                nextIndex = currentIndex + 1;
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                nextIndex = currentIndex - columns;
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                nextIndex = currentIndex + columns;
                e.preventDefault();
            } else {
                return;
            }
            
            if (nextIndex >= 0 && nextIndex < cards.length) {
                cards[nextIndex].focus();
                cards[nextIndex].click(); // Visual select
            }
        }
    });

    // 5-minute background preview generation sequential queue schedule on user idle
    let idleTimer;
    function resetIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(triggerBackgroundPreviewsGeneration, 300000); // 5 minutes
    }
    async function triggerBackgroundPreviewsGeneration() {
        if (!currentRealPath || currentNavPath !== 'root') return;
        const missing = displayedItems.filter(i => i.type === 'video' && !i.hoverWebm);
        if (missing.length === 0) return;
        
        showToast(currentLang === 'fr' ? 'D\\xE9marrage de la g\\xE9n\\xE9ration de pr\\xE9visualisation en arri\\xE8re-plan...' : 'Starting background preview generation...', 'success');
        
        const payload = missing.map(i => {
            const thumbsDir = \`\${currentRealPath}/.thumbs\`;
            const baseName = i.name.substring(0, i.name.lastIndexOf('.')) || i.name;
            return {
                path: i.path,
                thumbPath: \`\${thumbsDir}/\${baseName}.jpg\`,
                hoverWebmPath: \`\${thumbsDir}/\${baseName}.webm\`
            };
        });
        
        const res = await window.electronAPI.scheduleIdlePreviews(payload);
        if (res && res.success) {
            console.log(\`Scheduled \${res.scheduledCount} background idle previews.\`);
        }
    }
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('scroll', resetIdleTimer, true);
    resetIdleTimer();
"""

content = content.replace("  </script>", new_appends + "\n  </script>")

with open(path, "w", encoding="latin-1") as f:
    f.write(content)

print("SUCCESS: index.html fully updated!")
