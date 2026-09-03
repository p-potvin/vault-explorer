// system.ipc.js — handles settings, themes, clipboard, external shells, and native context menus.

const { Menu, BrowserWindow, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { safeOpenFile } = require('./files.ipc');

function registerSystemIpc(ipcMain, settingsPath, loadSettings, saveSettings) {
    // Settings Settings
    ipcMain.handle('get-settings', () => loadSettings());
    ipcMain.handle('save-settings', async (_e, s) => { return await saveSettings(s); });

    // Themes
    ipcMain.handle('get-theme', async () => {
        const appSettings = loadSettings();
        return { success: true, theme: appSettings.theme || 'golden-slate' };
    });
    ipcMain.handle('set-theme', async (_event, theme) => {
        if (typeof theme !== 'string') return { success: false, error: 'Invalid input' };
        const appSettings = loadSettings();
        appSettings.theme = theme;
        await saveSettings(appSettings);
        return { success: true };
    });

    // Clipboard
    ipcMain.handle('copy-to-clipboard', (_event, text) => {
        console.log('[system.ipc:clipboard] Copying text');
        clipboard.writeText(text);
    });

    // External URL
    ipcMain.handle('open-external-url', async (_event, url) => {
        if (typeof url === 'string') {
            await shell.openExternal(url);
            return { success: true };
        }
        return { success: false, error: 'Invalid URL' };
    });

    // Context Menus
    ipcMain.handle('show-context-menu', async (event, item) => {
        return new Promise((resolve) => {
            let resolved = false;
            const once = (val) => { if (!resolved) { resolved = true; resolve(val); } };
            let templ = [];
            
            const folderSubmenu = (item.folders && item.folders.length > 0)
                ? item.folders.map(f => ({
                    label: f.label || f.name,
                    click: () => once(`add-to-folder:${f.id || f.name}`)
                  }))
                : [{ label: 'No virtual folders created', enabled: false }];
                       if (item.isMultiSelect) {
                const selected = item.selectedItems || [];
                const hasVideo = selected.some(s => s.type === 'video');
                const hasImage = selected.some(s => s.type === 'image');
                const hasEncrypted = selected.some(s => s.path && s.path.toLowerCase().endsWith('.enc'));
                const hasNonEncrypted = selected.some(s => s.path && !s.path.toLowerCase().endsWith('.enc'));
                const hasEnhanced = selected.some(s => s.enhancedPath || (s.enhancements && (s.enhancements.audio || s.enhancements.video || s.enhancements.subtitles || s.enhancements.translation)));

                const aiSubmenu = [];
                if (hasVideo) {
                    aiSubmenu.push(
                        { label: 'Enhance Audio for Selection 🪄', click: () => once('normalize-audio') },
                        { label: 'Generate Subtitles for Selection', click: () => once('generate-subtitles-prompt') },
                        { label: 'Translate Selection Video Tracks', click: () => once('translate-video-prompt') },
                        { label: 'Enhance Selection Videos 🪄', click: () => once('enhance-video-prompt') }
                    );
                    if (hasEnhanced) {
                        aiSubmenu.push(
                            { type: 'separator' },
                            { label: '    Revert Enhancements', click: () => once('revert-enhancements') }
                        );
                    }
                }
                if (hasImage) {
                    if (aiSubmenu.length > 0) aiSubmenu.push({ type: 'separator' });
                    aiSubmenu.push({ label: 'Enhance Selected Images (Real-ESRGAN x4) 🪄', click: () => once('enhance-image-realesrgan') });
                }

                templ = [
                    { label: 'Add to Favorites', click: () => once('toggle-favorite') },
                    { label: 'Add Selection to Virtual Folder', submenu: folderSubmenu },
                    { type: 'separator' },
                    { label: 'Cut Selection', click: () => once('cut') },
                    { label: 'Copy Selection', click: () => once('copy') },
                ];

                if (hasVideo) {
                    templ.push({ label: 'Generate Previews', click: () => once('generate-webm') });
                }

                if (aiSubmenu.length > 0) {
                    templ.push({ type: 'separator' });
                    templ.push({ label: 'AI Enhancements 🪄', submenu: aiSubmenu });
                }

                templ.push({ type: 'separator' });

                if (hasNonEncrypted) {
                    templ.push({ label: 'Encrypt Selection', click: () => once('encrypt-prompt') });
                }
                if (hasEncrypted) {
                    templ.push({ label: 'Decrypt Selection', click: () => once('decrypt-prompt') });
                }

                templ.push(
                    { label: 'Zip Selection', click: () => once('zip-selection') },
                    { label: 'Delete Selection', click: () => once('delete-item') }
                );
            } else if (item.type === 'video' || item.type === 'image' || item.type === 'other' || item.type === 'encrypted') {
                const isEnc = typeof item.path === 'string' && item.path.toLowerCase().endsWith('.enc');
                const enh = item.enhancements || {};
                const subLangs = Array.isArray(enh.subtitles) ? enh.subtitles : [];
                const transLangs = Array.isArray(enh.translation) ? enh.translation : [];
                const hasAudioEnh = !!enh.audio;
                const hasVideoEnh = !!enh.video;

                // The checkbox is the applied-state indicator, and the label
                // names the languages already produced, so the menu says exactly
                // what has been done to this file rather than just "on/off".
                const withLangs = (label, langs) =>
                    langs.length ? `${label} (${langs.join(', ').toUpperCase()})` : label;

                const aiSubmenu = [];
                if (item.type === 'video' || (item.type === 'encrypted' && !isEnc)) {
                    aiSubmenu.push(
                        { label: 'Enhance Audio 🪄', type: 'checkbox', checked: hasAudioEnh, click: () => once('normalize-audio') },
                        { label: withLangs('Generate Subtitles', subLangs), type: 'checkbox', checked: subLangs.length > 0, click: () => once('generate-subtitles-prompt') },
                        { label: withLangs('Translate this video', transLangs), type: 'checkbox', checked: transLangs.length > 0, click: () => once('translate-video-prompt') },
                        { label: 'Enhance Video 🪄', type: 'checkbox', checked: hasVideoEnh, click: () => once('enhance-video-prompt') },
                        { type: 'separator' },
                        { label: '✨ AI Video Studio (Experimental)…', click: () => once('open-video-studio') }
                    );

                    // Revert only what has actually been applied.
                    const revertItems = [];
                    if (hasAudioEnh) revertItems.push({ label: 'Audio Enhancement', click: () => once('revert-enhancement:audio') });
                    if (hasVideoEnh) revertItems.push({ label: 'Video Enhancement', click: () => once('revert-enhancement:video') });
                    if (subLangs.length) revertItems.push({ label: withLangs('Subtitles', subLangs), click: () => once('revert-enhancement:subtitles') });
                    if (transLangs.length) revertItems.push({ label: withLangs('Translations', transLangs), click: () => once('revert-enhancement:translation') });

                    if (revertItems.length) {
                        if (revertItems.length > 1) {
                            revertItems.push({ type: 'separator' });
                            revertItems.push({ label: 'Everything', click: () => once('revert-enhancements') });
                        }
                        aiSubmenu.push(
                            { type: 'separator' },
                            { label: 'Revert', submenu: revertItems }
                        );
                    }
                } else if (item.type === 'image') {
                    aiSubmenu.push(
                        { label: 'Enhance Image (Real-ESRGAN x4) 🪄', click: () => once('enhance-image-realesrgan') }
                    );
                } else if (item.type === 'audio') {
                    aiSubmenu.push(
                        { label: 'Normalize Audio 🪄', click: () => once('normalize-audio') }
                    );
                }

                const openActionLabel = item.type === 'image' ? 'Open in Image Viewer' : (item.type === 'audio' ? 'Play Audio' : 'Open File');
                const virtualFolderLabel = item.type === 'image' ? 'Add to Photo Album' : (item.type === 'audio' ? 'Add to Playlist' : 'Add to Virtual Folder');

                templ = [
                    {
                        label: openActionLabel, click: () => {
                            safeOpenFile(item.path)
                                .then(() => once('opened'))
                                .catch(() => once('open-error'));
                        }
                    },
                ];

                if (item.type === 'image') {
                    templ.push({ label: 'Edit in Photo Editor', click: () => once('open-photo-editor') });
                }

                templ.push(
                    { label: 'Show in Windows Explorer', click: () => { shell.showItemInFolder(item.path); once('show'); } },
                    { label: item.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', click: () => once('toggle-favorite') },
                    { label: virtualFolderLabel, submenu: folderSubmenu },
                    { type: 'separator' },
                    { label: 'Copy Path', click: () => { clipboard.writeText(item.path); once('copied'); } },
                    { label: 'Cut', click: () => once('cut') },
                    { label: 'Copy', click: () => once('copy') },
                    { label: 'Rename', click: () => once('rename') }
                );

                const hasAiOrPreview = (aiSubmenu.length > 0) || (item.type === 'video' || (item.type === 'encrypted' && !isEnc));
                if (hasAiOrPreview) {
                    templ.push({ type: 'separator' });
                    if (aiSubmenu.length > 0) {
                        templ.push({ label: 'AI Enhancements 🪄', submenu: aiSubmenu });
                    }
                    if (item.type === 'video' || (item.type === 'encrypted' && !isEnc)) {
                        templ.push({ label: 'Generate Preview', click: () => once('generate-webm') });
                    }
                }

                templ.push(
                    { type: 'separator' },
                    isEnc ? { label: 'Decrypt File', click: () => once('decrypt-prompt') }
                        : { label: 'Encrypt File', click: () => once('encrypt-prompt') },
                    { label: 'Zip Selection', click: () => once('zip-selection') },
                    { label: 'Delete', click: () => once('delete-item') },
                    { type: 'separator' },
                    { label: 'Properties', click: () => once('properties') }
                );
            } else if (item.type === 'stream' || item.isStream) {
                const isVideo = item.mediaType === 'video' || (typeof item.path === 'string' && (item.path.includes('.mp4') || item.path.includes('.mkv') || item.path.includes('.webm') || item.path.includes('.ts') || item.path.includes('.mov') || item.path.includes('.m4v') || item.path.includes('.avi') || item.path.includes('.flv') || item.path.includes('.wmv')));
                templ = [
                    { label: isVideo ? 'Play Stream' : 'Open Image', click: () => once('play-stream') },
                    { type: 'separator' }
                ];
                if (isVideo) {
                    templ.push({ label: 'Generate Preview', click: () => once('generate-webm') });
                }
                templ.push(
                    { label: 'Save Stream Locally', click: () => once('download-stream') },
                    { type: 'separator' },
                    { label: 'Copy Stream URL', click: () => { clipboard.writeText(item.path); once('copied'); } },
                    { label: 'Copy Title', click: () => { clipboard.writeText(item.name || item.title || item.path); once('copied'); } },
                    { type: 'separator' },
                    { label: 'Properties', click: () => once('properties') }
                );
            } else if (item.type === 'fakeFolder') {
                templ = [
                    { label: `Open Folder: ${item.name}`, click: () => once('open-folder') },
                    { type: 'separator' },
                    { label: 'Rename Folder', click: () => once('rename') },
                    { label: 'Paste into Folder', enabled: item._hasClipboard === true, click: () => once('paste-into-folder') },
                    { type: 'separator' },
                    { label: 'Remove Folder', click: () => once('remove-folder') }
                ];
            } else if (item.type === 'background') {
                templ = [
                    { label: 'Paste', enabled: item._hasClipboard === true, click: () => once('paste') },
                    { type: 'separator' },
                    { label: 'Refresh', click: () => once('bg-refresh') },
                    { label: 'Select All', click: () => once('bg-select-all') },
                    { label: 'Generate Previews for All Videos', click: () => once('bg-generate-previews') },
                    { type: 'separator' },
                    { label: 'New Virtual Folder…', click: () => once('bg-new-folder') },
                ];
            } else if (item.type === 'videoPlayer') {
                const isLocal = !item.isStreaming;
                const enh = item.enhancements || {};
                const subLangs = Array.isArray(enh.subtitles) ? enh.subtitles : [];
                const transLangs = Array.isArray(enh.translation) ? enh.translation : [];
                const hasAudioEnh = !!enh.audio;
                const hasVideoEnh = !!enh.video;

                const withLangs = (label, langs) =>
                    langs.length ? `${label} (${langs.join(', ').toUpperCase()})` : label;

                const aiSubmenu = [];
                if (isLocal) {
                    aiSubmenu.push(
                        { label: 'Enhance Audio 🪄', type: 'checkbox', checked: hasAudioEnh, click: () => once('normalize-audio') },
                        { label: withLangs('Generate Subtitles', subLangs), type: 'checkbox', checked: subLangs.length > 0, click: () => once('generate-subtitles-prompt') },
                        { label: withLangs('Translate this video', transLangs), type: 'checkbox', checked: transLangs.length > 0, click: () => once('translate-video-prompt') },
                        { label: 'Enhance Video 🪄', type: 'checkbox', checked: hasVideoEnh, click: () => once('enhance-video-prompt') },
                        { type: 'separator' },
                        { label: '✨ AI Video Studio (Experimental)…', click: () => once('open-video-studio') }
                    );

                    // Revert only what has actually been applied.
                    const revertItems = [];
                    if (hasAudioEnh) revertItems.push({ label: 'Audio Enhancement', click: () => once('revert-enhancement:audio') });
                    if (hasVideoEnh) revertItems.push({ label: 'Video Enhancement', click: () => once('revert-enhancement:video') });
                    if (subLangs.length) revertItems.push({ label: withLangs('Subtitles', subLangs), click: () => once('revert-enhancement:subtitles') });
                    if (transLangs.length) revertItems.push({ label: withLangs('Translations', transLangs), click: () => once('revert-enhancement:translation') });

                    if (revertItems.length) {
                        if (revertItems.length > 1) {
                            revertItems.push({ type: 'separator' });
                            revertItems.push({ label: 'Everything', click: () => once('revert-enhancements') });
                        }
                        aiSubmenu.push(
                            { type: 'separator' },
                            { label: 'Revert', submenu: revertItems }
                        );
                    }
                }

                templ = [
                    { label: item.isPlaying ? 'Pause' : 'Play', click: () => once('play-pause') },
                    { label: item.isMuted ? 'Unmute' : 'Mute', click: () => once('mute') },
                    { type: 'separator' },
                    { label: 'Playback Speed', submenu: [
                        { label: '0.5x', type: 'radio', checked: item.speed === 0.5, click: () => once('speed:0.5') },
                        { label: '0.75x', type: 'radio', checked: item.speed === 0.75, click: () => once('speed:0.75') },
                        { label: 'Normal', type: 'radio', checked: !item.speed || item.speed === 1, click: () => once('speed:1') },
                        { label: '1.25x', type: 'radio', checked: item.speed === 1.25, click: () => once('speed:1.25') },
                        { label: '1.5x', type: 'radio', checked: item.speed === 1.5, click: () => once('speed:1.5') },
                        { label: '2x', type: 'radio', checked: item.speed === 2, click: () => once('speed:2') }
                    ]},
                    { label: 'Picture-in-Picture', click: () => once('pip') },
                    { label: 'Fullscreen', click: () => once('fullscreen') },
                    { type: 'separator' }
                ];
                if (aiSubmenu.length > 0) {
                    templ.push({ label: 'AI Enhancements 🪄', submenu: aiSubmenu });
                }
                if (isLocal) {
                    templ.push(
                        { label: 'Generate Preview', click: () => once('generate-webm') },
                        { type: 'separator' },
                        { label: 'Show in Windows Explorer', click: () => { shell.showItemInFolder(item.path); once('show'); } },
                        { label: 'Copy Path', click: () => { clipboard.writeText(item.path); once('copied'); } }
                    );
                } else {
                    templ.push(
                        { type: 'separator' },
                        { label: 'Copy Stream URL', click: () => { clipboard.writeText(item.path || ''); once('copied'); } }
                    );
                }
                if (isLocal) {
                    templ.push(
                        { type: 'separator' },
                        { label: 'Properties', click: () => once('properties') }
                    );
                }
            }
            const menu = Menu.buildFromTemplate(templ);
            menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
            menu.once('menu-will-close', () => { setTimeout(() => once('closed'), 50); });
        });
    });
}

module.exports = {
    registerSystemIpc
};
