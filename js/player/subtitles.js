// subtitles.js — manages subtitle track finding, downloading OpenSubtitles srt sidecars, and subtitle menu populating/track selection.

async function selectSubtitleTrack(trackIdx) {
    const vp = el('video-player');
    if (!vp) return;
    for (let i = 0; i < vp.textTracks.length; i++) {
        vp.textTracks[i].mode = 'disabled';
    }
    
    if (trackIdx >= 0 && vp.textTracks[trackIdx]) {
        const trackEl = vp.querySelectorAll('track')[trackIdx];
        if (trackEl && trackEl.dataset.opensubtitles === "true" && trackEl.dataset.downloaded === "false") {
            window.showToast(window.currentLang === 'fr' ? 'Téléchargement des sous-titres...' : 'Downloading subtitles...', 'success');
            try {
                const fileId = trackEl.dataset.fileId;
                const lang = trackEl.dataset.lang;
                const videoPath = trackEl.dataset.videoPath;
                
                const localPath = await window.electronAPI.downloadSubtitleTrack({ fileId, lang, videoPath });
                if (localPath) {
                    trackEl.src = window.sanitizePath(localPath);
                    trackEl.dataset.downloaded = "true";
                    window.showToast(window.currentLang === 'fr' ? 'Sous-titres prêts' : 'Subtitles ready', 'success');
                    
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
                window.showToast(window.currentLang === 'fr' ? 'Échec du téléchargement' : 'Download failed', 'error');
                return;
            }
        }
        
        vp.textTracks[trackIdx].mode = 'showing';
        el('btn-subtitles').classList.add('active');
        el('btn-subtitles').textContent = `${vp.textTracks[trackIdx].label.replace('Subtitles (', '').replace(')', '')} ▾`;
    } else {
        el('btn-subtitles').classList.remove('active');
        el('btn-subtitles').textContent = 'CC ▾';
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
        
        window.showToast('Subtitles loaded: ' + file.name, 'success');
        e.target.value = '';
    });
}

// Bind to globals
window.selectSubtitleTrack = selectSubtitleTrack;
window.refreshSubtitlesList = refreshSubtitlesList;
window.initSubtitleListeners = initSubtitleListeners;
