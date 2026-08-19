// js/settings/core.js - settings panel wiring (open/save/dismiss) + sub-module bootstrapping
window.initSettingsListeners = function initSettingsListeners() {

    const grid = document.querySelector('.settings-panel-grid');
    const sectionForControl = {
        general: ['pill-tag-input-glob', 'settings-default-folder', 'settings-default-theme', 'settings-default-lang', 'settings-minimize-to-tray', 'settings-single-instance', 'settings-dev-mode'],
        playback: ['settings-default-sub-lang', 'settings-sub-font-size', 'settings-playback-sort', 'settings-remember-position', 'settings-mute-previews'],
        library: ['settings-default-home-tab', 'settings-default-folder-photoalbums', 'settings-default-folder-music', 'settings-default-folder-misc'],
        ai: ['settings-vsr-quality', 'settings-vsr-scale', 'settings-vsr-bitrate', 'settings-vsr-chroma'],
    };
    let activeSettingsSection = 'general';
    const closeSettings = () => {
        el('settings-panel').style.display = 'none';
        const backdrop = el('settings-backdrop');
        if (backdrop) backdrop.style.display = 'none';
    };

    function findSettingsCell(controlId) {
        let node = el(controlId);
        while (node && node.parentElement !== grid) node = node.parentElement;
        return node;
    }

    function showSettingsSection(section) {
        activeSettingsSection = section;
        if (grid) {
            grid.querySelectorAll('[data-settings-section]').forEach((cell) => {
                cell.hidden = cell.dataset.settingsSection !== section;
            });
        }
        document.querySelectorAll('.settings-section-tab').forEach((tab) => {
            const active = tab.dataset.settingsSection === section;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        });
    }

    if (grid) {
        Object.entries(sectionForControl).forEach(([section, controlIds]) => {
            controlIds.forEach((controlId, order) => {
                const cell = findSettingsCell(controlId);
                if (cell) {
                    cell.dataset.settingsSection = section;
                    cell.style.setProperty('--settings-order', String(order));
                }
            });
        });
        document.querySelectorAll('.settings-section-tab').forEach((tab) => {
            tab.addEventListener('click', () => showSettingsSection(tab.dataset.settingsSection));
        });
        showSettingsSection(activeSettingsSection);
    }


    const inputGlob = document.getElementById('pill-tag-input-glob');
    if (inputGlob) {
        inputGlob.addEventListener('keydown', (e) => {
            const input = e.target;
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault();
                pillTagAdd(input.value);
                input.value = '';
            } else if (e.key === 'Backspace' && input.value === '') {
                const pills = document.querySelectorAll('#pill-tag-container-glob .pill-tag');
                if (pills.length > 0) pills[pills.length - 1].remove();
            }
        });
        inputGlob.addEventListener('blur', (e) => {
            if (e.target.value.trim()) { pillTagAdd(e.target.value); e.target.value = ''; }
        });
    }

    const trigger = el('settings-trigger');
    if (trigger) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = el('settings-panel');
            const isOpening = getComputedStyle(panel).display === 'none';
            panel.style.display = isOpening ? 'flex' : 'none';
            const backdrop = el('settings-backdrop');
            if (backdrop) backdrop.style.display = isOpening ? 'block' : 'none';
            if (isOpening) {
                showSettingsSection(activeSettingsSection);
                pillTagLoad(window.appSettings.globExclusions || []);
                el('settings-default-folder').value = window.appSettings.defaultFolder || '';
                el('settings-default-theme').value = window.appSettings.defaultTheme || 'vaultwares-revisited-console';
                el('settings-default-lang').value = window.appSettings.defaultLang || 'en';
                el('settings-default-sub-lang').value = window.appSettings.defaultSubLang || 'original';
                el('settings-sub-font-size').value = window.appSettings.subFontSize || '20px';
                el('settings-playback-sort').value = window.appSettings.playbackSort || 'mtime-desc';
                el('settings-remember-position').checked = window.appSettings.rememberPosition !== false;
                el('settings-mute-previews').checked = window.appSettings.mutePreviews === true;
                el('settings-minimize-to-tray').checked = window.appSettings.minimizeToTray === true;
                el('settings-single-instance').checked = window.appSettings.singleInstance === true;
                if (el('settings-dev-mode')) el('settings-dev-mode').checked = window.appSettings.devMode === true;
                if (el('settings-default-home-tab')) {
                    el('settings-default-home-tab').value = window.appSettings.defaultHomeTab || 'files';
                }
                if (el('settings-default-folder-photoalbums')) {
                    el('settings-default-folder-photoalbums').value = window.appSettings.defaultFolderAlbums || '';
                }
                if (el('settings-default-folder-music')) {
                    el('settings-default-folder-music').value = window.appSettings.defaultFolderAudio || '';
                }
                if (el('settings-vsr-quality')) el('settings-vsr-quality').value = window.appSettings.vsrQuality || 'HIGH';
                if (el('settings-vsr-scale')) el('settings-vsr-scale').value = window.appSettings.vsrScale || '2';
                if (el('settings-vsr-bitrate')) el('settings-vsr-bitrate').value = window.appSettings.vsrBitrate || '12M';
                if (el('settings-vsr-chroma')) el('settings-vsr-chroma').value = window.appSettings.vsrChroma || 'yuv420p';
                document.getElementById('pill-tag-input-glob').focus();
            }
        });

        // Close on backdrop or outside click without saving
        const backdrop = el('settings-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', closeSettings);
        }
        const closeButton = el('settings-close');
        if (closeButton) closeButton.addEventListener('click', closeSettings);

        document.addEventListener('click', (e) => {
            const panel = el('settings-panel');
            if (panel && panel.style.display === 'flex') {
                if (!panel.contains(e.target) && !trigger.contains(e.target)) {
                    closeSettings();
                }
            }
        });
    }

    // Clickable folder inputs (icon + readonly input)
    const folderInputWrappers = document.querySelectorAll('.settings-folder-input');
    folderInputWrappers.forEach(wrapper => {
        const targetId = wrapper.dataset.target;
        if (!targetId) return;
        const target = el(targetId);
        if (!target) return;
        wrapper.addEventListener('click', async () => {
            const folderPath = await window.electronAPI.openDirectory();
            if (folderPath) {
                target.value = folderPath;
            }
        });
    });

    const themeTrigger = el('theme-trigger');
    if (themeTrigger) {
        themeTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'vaultwares-revisited-console';
            const nextTheme = currentTheme === 'vaultwares-revisited-console' ? 'vaultwares-revisited-warm' : 'vaultwares-revisited-console';
            applyTheme(nextTheme);
            if (window.appSettings) {
                window.appSettings.theme = nextTheme;
                window.electronAPI.saveSettings(window.appSettings);
                if (window.electronAPI.setTheme) {
                    window.electronAPI.setTheme(nextTheme);
                }
            }
        });
    }

    const btnSave = el('settings-btn-save');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const rawInput = document.getElementById('pill-tag-input-glob');
            if (rawInput && rawInput.value.trim()) { pillTagAdd(rawInput.value); rawInput.value = ''; }

            // Capture old structural values before updating window.appSettings
            const oldGlobExclusions = JSON.stringify(window.appSettings.globExclusions || []);
            const oldDefaultFolder = window.appSettings.defaultFolder || '';

            const newGlobExclusions = pillTagGetValues();
            const newDefaultFolder = el('settings-default-folder').value.trim();

            const hasStructuralChange =
                JSON.stringify(newGlobExclusions) !== oldGlobExclusions ||
                newDefaultFolder !== oldDefaultFolder;

            window.appSettings.globExclusions = newGlobExclusions;
            window.appSettings.defaultFolder = newDefaultFolder;
            window.appSettings.defaultTheme = el('settings-default-theme').value;
            const chosenLang = el('settings-default-lang').value;
            window.appSettings.defaultLang = chosenLang;
            window.appSettings.lang = chosenLang;
            if (typeof window.setLanguage === 'function') window.setLanguage(chosenLang);
            window.appSettings.defaultSubLang = el('settings-default-sub-lang').value;
            window.appSettings.playbackSort = el('settings-playback-sort').value;

            const subSize = el('settings-sub-font-size').value;
            window.appSettings.subFontSize = subSize;
            document.documentElement.style.setProperty('--sub-font-size', subSize);

            window.appSettings.rememberPosition = el('settings-remember-position').checked;
            window.appSettings.mutePreviews = el('settings-mute-previews').checked;
            window.appSettings.minimizeToTray = el('settings-minimize-to-tray').checked;
            window.appSettings.singleInstance = el('settings-single-instance').checked;
            if (el('settings-dev-mode')) window.appSettings.devMode = el('settings-dev-mode').checked;

            if (el('settings-default-home-tab')) {
                window.appSettings.defaultHomeTab = el('settings-default-home-tab').value;
            }
            if (el('settings-default-folder-photoalbums')) {
                window.appSettings.defaultFolderAlbums = el('settings-default-folder-photoalbums').value.trim() || undefined;
            }
            if (el('settings-default-folder-music')) {
                window.appSettings.defaultFolderAudio = el('settings-default-folder-music').value.trim() || undefined;
            }
            if (el('settings-vsr-quality')) window.appSettings.vsrQuality = el('settings-vsr-quality').value;
            if (el('settings-vsr-scale')) window.appSettings.vsrScale = el('settings-vsr-scale').value;
            if (el('settings-vsr-bitrate')) window.appSettings.vsrBitrate = el('settings-vsr-bitrate').value;
            if (el('settings-vsr-chroma')) window.appSettings.vsrChroma = el('settings-vsr-chroma').value;
            await window.electronAPI.saveSettings(window.appSettings);
            showToast(window.currentLang === 'fr' ? 'Paramètres enregistrés' : 'Settings saved', 'success');
            closeSettings();

            if (hasStructuralChange) {
                console.log('[settings] Structural change detected (exclusions/folder). Reloading directory...');
                if (window.appSettings.defaultFolder) {
                    window.loadDirectory('root/' + window.appSettings.defaultFolder.split(/[\\/]/).pop(), window.appSettings.defaultFolder, false);
                } else if (window.currentRealPath) {
                    window.loadDirectory(window.currentNavPath, window.currentRealPath, false);
                }
            } else {
                console.log('[settings] Non-structural change saved. Skipping directory reload.');
            }
        });
    }

    // Dismiss settings panels


    document.addEventListener('click', (e) => {
        if ((!el('theme-panel') || !e.target.closest('#theme-panel')) && (!el('theme-trigger') || !e.target.closest('#theme-trigger'))) {
            const panel = el('theme-panel');
            if (panel && panel.style.display === 'block') {
                panel.style.display = 'none';
                if (el('theme-trigger')) el('theme-trigger').setAttribute('aria-expanded', 'false');
            }
        }
    });

    // Sub-panels were split into their own modules for maintainability.
    initBenchmarkDashboard();
}

window.initSettingsListeners = initSettingsListeners;
