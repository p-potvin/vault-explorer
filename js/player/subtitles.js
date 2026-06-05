// subtitles.js — manages subtitle track finding, downloading OpenSubtitles srt sidecars, and subtitle menu populating/track selection.

async function selectSubtitleTrack(trackIdx) {
    const vp = el('video-player');
    if (!vp) return;

    if (window.activeStreamingMedia) {
        window.activeStreamingMedia.selectedSubtitleTrackIdx = trackIdx;
        if (trackIdx >= 0 && vp.textTracks[trackIdx]) {
            window.activeStreamingMedia.selectedSubtitleLabel = vp.textTracks[trackIdx].label || '';
            window.activeStreamingMedia.selectedSubtitleLang = vp.textTracks[trackIdx].language || '';
        } else {
            window.activeStreamingMedia.selectedSubtitleLabel = '';
            window.activeStreamingMedia.selectedSubtitleLang = '';
        }
    }

    for (let i = 0; i < vp.textTracks.length; i++) {
        vp.textTracks[i].mode = 'disabled';
    }

    const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
    if (trackIdx >= 0 && vp.textTracks[trackIdx]) {
        const trackEl = vp.querySelectorAll('track')[trackIdx];
        if (trackEl && trackEl.dataset.opensubtitles === "true" && trackEl.dataset.downloaded === "false") {
            window.showToast(t.downloadingSubtitles || 'Downloading subtitles...', 'success');
            try {
                const fileId = trackEl.dataset.fileId;
                const lang = trackEl.dataset.lang;
                const videoPath = trackEl.dataset.videoPath;

                const localPath = await window.electronAPI.downloadSubtitleTrack({ fileId, lang, videoPath });
                if (localPath) {
                    trackEl.src = window.sanitizePath(localPath);
                    trackEl.dataset.downloaded = "true";
                    window.showToast(t.subtitlesReady || 'Subtitles ready', 'success');

                    vp.textTracks[trackIdx].mode = 'disabled';
                    setTimeout(() => {
                        const vpReal = el('video-player');
                        if (vpReal && vpReal.textTracks[trackIdx]) {
                            vpReal.textTracks[trackIdx].mode = 'showing';
                        }
                    }, 50);
                } else {
                    throw new Error("Empty path");
                }
            } catch (err) {
                console.error("OpenSubtitles download failed:", err);
                window.showToast(t.downloadFailed || 'Download failed', 'error');
                return;
            }
        }

        vp.textTracks[trackIdx].mode = 'showing';
    }

    const btn = el('btn-subtitles');
    if (btn) {
        btn.classList.toggle('active', trackIdx >= 0);
        // Show only 2-letter language code in button
        const rawLang = (trackIdx >= 0 && vp.textTracks[trackIdx]) 
            ? (vp.textTracks[trackIdx].language || vp.textTracks[trackIdx].label || 'CC')
            : 'CC';
        const ccText = rawLang.substring(0, 2).toUpperCase();
        const svgIcon = window.icons ? window.icons.subtitles('', 'width:14px; height:14px; display:block; flex-shrink:0;') : '';
        btn.innerHTML = `${svgIcon}<span>${ccText}</span>`;
    }

    const options = el('subtitles-menu').querySelectorAll('.subtitle-option');
    options.forEach(opt => {
        const idx = parseInt(opt.dataset.idx);
        if (idx === trackIdx) {
            opt.classList.add('active');
            opt.style.color = 'var(--vault-accent)';
            opt.style.fontWeight = '600';
        } else {
            opt.classList.remove('active');
            opt.style.color = 'var(--vault-text)';
            opt.style.fontWeight = 'normal';
        }
    });
}

function refreshSubtitlesList() {
    const vp = el('video-player');
    if (!vp) return;
    const listContainer = el('subtitle-tracks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    for (let i = 0; i < vp.textTracks.length; i++) {
        const track = vp.textTracks[i];
        const opt = document.createElement('div');
        opt.className = 'subtitle-option';
        opt.dataset.idx = i;
        opt.style.cssText = 'padding:6px 12px; cursor:pointer; text-align:left; font-family:var(--font-body); font-size:12px; color:var(--vault-text); transition:background 0.2s;';
        opt.textContent = track.label || `Track ${i + 1}`;

        if (track.mode === 'showing') {
            opt.classList.add('active');
            opt.style.color = 'var(--vault-accent)';
            opt.style.fontWeight = '600';
        }

        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            selectSubtitleTrack(i);
            el('subtitles-menu').style.display = 'none';
        });
        listContainer.appendChild(opt);
    }

    const offOption = el('subtitles-menu').querySelector('.subtitle-option[data-idx="-1"]');
    if (offOption) {
        offOption.onclick = (e) => {
            e.stopPropagation();
            selectSubtitleTrack(-1);
            el('subtitles-menu').style.display = 'none';
        };
    }
}

function showAsrContextMenu(anchorEl, defaultLangs) {
    return new Promise((resolve) => {
        const existing = document.getElementById('asr-generation-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'asr-generation-context-menu';
        menu.style.cssText = `
            position: fixed;
            background: var(--vault-card-bg, rgba(25, 20, 35, 0.95));
            border: 1px solid var(--vault-border, rgba(255,255,255,0.08));
            border-radius: 8px;
            padding: 12px;
            z-index: 10006;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            backdrop-filter: blur(8px);
            font-family: var(--font-body), sans-serif;
            color: var(--vault-text, #fff);
            width: 220px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        const title = document.createElement('div');
        title.style.cssText = 'font-size:10px; font-weight:700; text-transform:uppercase; color:var(--vault-gold); letter-spacing:0.05em; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.08); user-select:none;';
        title.textContent = 'Generate Subtitles';
        menu.appendChild(title);

        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto; padding-right:2px;';
        menu.appendChild(listContainer);

        const languages = [
            { code: 'en', name: 'English (EN)' },
            { code: 'qc', name: 'French / Québécois (FR)' },
            { code: 'es', name: 'Spanish (ES)' },
            { code: 'de', name: 'German (DE)' },
            { code: 'it', name: 'Italian (IT)' },
            { code: 'pt', name: 'Portuguese (PT)' },
            { code: 'nl', name: 'Dutch (NL)' },
            { code: 'ru', name: 'Russian (RU)' },
            { code: 'zh', name: 'Chinese (ZH)' },
            { code: 'ja', name: 'Japanese (JA)' },
            { code: 'ko', name: 'Korean (KO)' },
            { code: 'ar', name: 'Arabic (AR)' },
            { code: 'hi', name: 'Hindi (HI)' },
            { code: 'bn', name: 'Bengali (BN)' },
            { code: 'tr', name: 'Turkish (TR)' },
            { code: 'pl', name: 'Polish (PL)' },
            { code: 'sv', name: 'Swedish (SV)' },
            { code: 'no', name: 'Norwegian (NO)' },
            { code: 'da', name: 'Danish (DA)' },
            { code: 'fi', name: 'Finnish (FI)' },
            { code: 'cs', name: 'Czech (CS)' },
            { code: 'el', name: 'Greek (EL)' },
            { code: 'he', name: 'Hebrew (HE)' },
            { code: 'id', name: 'Indonesian (ID)' },
            { code: 'vi', name: 'Vietnamese (VI)' },
            { code: 'uk', name: 'Ukrainian (UK)' }
        ];

        const selectedCodes = new Set(defaultLangs && defaultLangs.length > 0 ? defaultLangs : ['en', 'qc']);

        function createLangItem(lang) {
            const item = document.createElement('label');
            item.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; font-size:11px; padding:4px 6px; border-radius:4px; transition:background 0.2s; user-select:none;';
            item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
            item.addEventListener('mouseleave', () => item.style.background = 'transparent');

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = lang.code;
            cb.checked = selectedCodes.has(lang.code);
            cb.style.cssText = 'accent-color:var(--vault-accent); width:12px; height:12px; margin:0; cursor:pointer;';
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selectedCodes.add(lang.code);
                } else {
                    selectedCodes.delete(lang.code);
                }
            });

            const span = document.createElement('span');
            span.textContent = lang.name;

            item.appendChild(cb);
            item.appendChild(span);
            return item;
        }

        let initialList = languages.filter(l => selectedCodes.has(l.code));
        if (initialList.length === 0) {
            initialList = [languages[0], languages[1]];
            selectedCodes.add('en');
            selectedCodes.add('qc');
        }

        function renderList(list) {
            listContainer.innerHTML = '';
            list.forEach(lang => {
                listContainer.appendChild(createLangItem(lang));
            });
        }

        renderList(initialList);

        const showMore = document.createElement('div');
        showMore.style.cssText = 'font-size:10px; color:var(--vault-accent); cursor:pointer; text-align:center; padding:6px 0; border-top:1px dashed rgba(255,255,255,0.08); margin-top:4px; font-weight:600; user-select:none;';
        showMore.textContent = 'Show more...';
        menu.appendChild(showMore);

        function adjustPosition() {
            // Force layout reflow by checking offsetWidth/offsetHeight
            const menuWidth = menu.offsetWidth || menu.getBoundingClientRect().width || 220;
            const menuHeight = menu.offsetHeight || menu.getBoundingClientRect().height || 280;

            const rect = anchorEl.getBoundingClientRect();
            let left = rect.left;
            let top = rect.bottom + 8;

            // Horizontal bounds check
            if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 12;
            }
            if (left < 12) {
                left = 12;
            }

            // Vertical bounds check: if it goes below the window, position it above the anchor
            if (top + menuHeight > window.innerHeight) {
                const spaceAbove = rect.top;
                const spaceBelow = window.innerHeight - rect.bottom;
                
                if (spaceAbove > spaceBelow) {
                    top = rect.top - menuHeight - 8;
                } else {
                    top = rect.bottom + 8;
                }
            }

            // Final clamp to prevent clipping off the screen entirely
            if (top + menuHeight > window.innerHeight) {
                top = window.innerHeight - menuHeight - 12;
            }
            if (top < 12) {
                top = 12;
            }

            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
        }

        showMore.addEventListener('click', (e) => {
            e.stopPropagation();
            renderList(languages);
            showMore.style.display = 'none';
            adjustPosition();
        });

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; justify-content:flex-end; gap:6px; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px; margin-top:4px;';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.style.cssText = 'background:transparent; border:1px solid var(--vault-border, rgba(255,255,255,0.15)); color:var(--vault-text, #fff); font-size:10px; font-weight:600; padding:4px 8px; border-radius:4px; cursor:pointer; font-family:var(--font-mono);';
        cancelBtn.textContent = 'Cancel';
        
        const cleanup = () => {
            menu.remove();
            document.removeEventListener('mousedown', onMouseDown);
        };

        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(null);
        });

        const applyBtn = document.createElement('button');
        applyBtn.style.cssText = 'background:var(--vault-accent); color:var(--vault-accent-text, #0b0813); border:none; font-size:10px; font-weight:700; padding:4px 10px; border-radius:4px; cursor:pointer; font-family:var(--font-mono);';
        applyBtn.textContent = 'Generate';
        applyBtn.addEventListener('click', () => {
            const chosen = Array.from(selectedCodes);
            cleanup();
            resolve(chosen);
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(applyBtn);
        menu.appendChild(btnRow);

        document.body.appendChild(menu);
        adjustPosition();

        const onMouseDown = (e) => {
            if (!menu.contains(e.target) && !anchorEl.contains(e.target)) {
                cleanup();
                resolve(null);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
    });
}

function initSubtitleListeners() {
    const vp = el('video-player');

    // Subtitles Dropdown Triggers
    el('btn-subtitles').addEventListener('click', (e) => {
        e.stopPropagation();
        el('speed-menu').style.display = 'none';
        const menu = el('subtitles-menu');
        const isHidden = menu.style.display === 'none';
        menu.style.display = isHidden ? 'block' : 'none';
    });

    el('opt-upload-subtitle').addEventListener('click', (e) => {
        e.stopPropagation();
        el('subtitles-menu').style.display = 'none';
        el('subtitle-file-input').click();
    });

    const optGen = el('opt-generate-subtitle');
    if (optGen) {
        optGen.addEventListener('click', async (e) => {
            e.stopPropagation();
            el('subtitles-menu').style.display = 'none';

            let videoPath = null;
            let itemName = 'Active Video';

            if (window.currentPlayingItem) {
                videoPath = window.currentPlayingItem.path;
                itemName = window.currentPlayingItem.name;
            } else if (window.currentPlayingIndex !== -1) {
                const itm = window.displayedItems[window.currentPlayingIndex];
                if (itm) {
                    videoPath = itm.path;
                    itemName = itm.name;
                }
            } else if (window.activeStreamingMedia) {
                videoPath = window.activeStreamingMedia.path;
                itemName = window.activeStreamingMedia.name || 'Stream';
            }

            if (!videoPath || videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
                window.showToast('ASR Subtitles require a local playback source.', 'error');
                return;
            }

            const defaultLangs = (window.appSettings && window.appSettings.preferredASRLangs) || ['en'];
            const langs = await showAsrContextMenu(optGen, defaultLangs);
            if (langs && langs.length > 0) {
                if (!window.appSettings) window.appSettings = {};
                window.appSettings.preferredASRLangs = langs;
                window.electronAPI.saveSettings(window.appSettings);

                window.showToast(`AI Vocal Isolation & Transcription started for "${itemName}"...`, 'success');
                
                // Show inline subtitle loading text in subtitle button
                const subBtn = el('btn-subtitles');
                const originalContent = subBtn.innerHTML;
                subBtn.innerHTML = `<span>ASR...</span>`;
                subBtn.disabled = true;

                const progressHandler = (eventData) => {
                    const normPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
                    if (normPath(eventData.videoPath) === normPath(videoPath)) {
                        subBtn.innerHTML = `<span>ASR: ${eventData.percent}%</span>`;
                    }
                };
                window.electronAPI.onNormalizeProgress(progressHandler);

                try {
                    const res = await window.electronAPI.normalizeAudio(videoPath, window.currentRealPath, true);
                    subBtn.disabled = false;
                    subBtn.innerHTML = originalContent;

                    if (res.success || res.status === 'SUCCESS' || res.status === 'EXISTS') {
                        window.showToast('Subtitles generated successfully! Refreshing tracks...', 'success');
                        
                        // Trigger track reloading in player
                        if (window.loadActiveSubtitles) {
                            await window.loadActiveSubtitles(videoPath);
                        }
                    } else {
                        window.showToast('Subtitles generation failed: ' + (res.error || 'Unknown'), 'error');
                    }
                } catch (err) {
                    subBtn.disabled = false;
                    subBtn.innerHTML = originalContent;
                    window.showToast('Subtitles generation failed: ' + err.message, 'error');
                }
            }
        });
    }

    el('subtitle-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = file.name;
        track.srclang = 'und';
        track.src = URL.createObjectURL(file);

        vp.appendChild(track);
        refreshSubtitlesList();

        const trackIdx = vp.textTracks.length - 1;
        selectSubtitleTrack(trackIdx);

        const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
        window.showToast((t.subtitlesLoaded || 'Subtitles loaded: ') + file.name, 'success');
        e.target.value = '';
    });
}

async function loadActiveSubtitles(videoPath) {
    const vpReal = el('video-player');
    if (!vpReal) return;
    vpReal.querySelectorAll('track').forEach(t => t.remove());
    try {
        const subs = await window.electronAPI.findSubtitles(videoPath, null, true);
        if (subs && subs.length > 0) {
            subs.forEach((sub, i) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = sub.isOpenSubtitles ? sub.label : (sub.label === 'Original' ? 'original' : `Subtitles (${sub.label})`);
                track.srclang = sub.lang;
                if (sub.isOpenSubtitles) {
                    track.dataset.opensubtitles = "true";
                    track.dataset.fileId = sub.fileId;
                    track.dataset.lang = sub.lang;
                    track.dataset.videoPath = videoPath;
                    track.dataset.downloaded = "false";
                    track.src = "";
                } else {
                    track.src = window.sanitizePath(sub.path);
                }
                vpReal.appendChild(track);
            });
            
            refreshSubtitlesList();
            
            let preferredTrackIdx = -1;
            const prefLang = (window.appSettings && window.appSettings.defaultSubLang) || 'original';
            
            if (prefLang === 'original') {
                for (let i = 0; i < vpReal.textTracks.length; i++) {
                    const lbl = vpReal.textTracks[i].label || '';
                    if (lbl.toLowerCase() === 'original') {
                        preferredTrackIdx = i;
                        break;
                    }
                }
            } else if (prefLang !== 'und') {
                for (let i = 0; i < vpReal.textTracks.length; i++) {
                    const tl = vpReal.textTracks[i].language || '';
                    const lbl = vpReal.textTracks[i].label || '';
                    if (tl.toLowerCase().startsWith(prefLang.toLowerCase()) || lbl.toLowerCase().includes(`(${prefLang.toLowerCase()})`)) {
                        preferredTrackIdx = i;
                        break;
                    }
                }
            }
            selectSubtitleTrack(preferredTrackIdx >= 0 ? preferredTrackIdx : 0);
        } else {
            refreshSubtitlesList();
            selectSubtitleTrack(-1);
        }
    } catch (err) {
        console.error("Subtitles reload failed:", err);
    }
}

// Bind to globals
window.selectSubtitleTrack = selectSubtitleTrack;
window.refreshSubtitlesList = refreshSubtitlesList;
window.initSubtitleListeners = initSubtitleListeners;
window.loadActiveSubtitles = loadActiveSubtitles;
