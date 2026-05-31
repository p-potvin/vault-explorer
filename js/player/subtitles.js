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
            const langs = await window.showLanguageModal('Generate Subtitles', true, defaultLangs);
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
