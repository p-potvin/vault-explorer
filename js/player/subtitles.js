// subtitles.js — manages local subtitle tracks, AI live captions, and track selection.

window.SUBTITLE_CUE_LINE = -4;

function raiseTrackCues(track) {
    if (!track) return;
    const apply = () => {
        if (!track.cues || !track.cues.length) return false;
        for (let i = 0; i < track.cues.length; i++) {
            try { track.cues[i].line = window.SUBTITLE_CUE_LINE; } catch (_) { /* ignore */ }
        }
        return true;
    };
    if (apply()) return;
    let tries = 0;
    const timer = setInterval(() => {
        if (apply() || ++tries > 20) clearInterval(timer);
    }, 150);
}
window.raiseTrackCues = raiseTrackCues;

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

    if (trackIdx >= 0 && vp.textTracks[trackIdx]) {
        vp.textTracks[trackIdx].mode = 'showing';
        if (typeof window.raiseTrackCues === 'function') window.raiseTrackCues(vp.textTracks[trackIdx]);
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

// Select subtitle from the allAvailableSubtitles array by index
function selectSubtitleByIndex(idx) {
    // Picking a loaded subtitle is exclusive with AI subs — stop the live
    // session so its in-memory track doesn't keep rendering on top.
    if (window._liveSubActive && idx >= 0) window.stopLiveSubtitles(true);
    if (!window._allAvailableSubtitles || idx < 0 || idx >= window._allAvailableSubtitles.length) {
        window._selectedSubtitleIdx = -1;
        selectSubtitleTrack(-1);
        return;
    }
    // Track the renderer's selected index explicitly. The previous active-state
    // check tried to reverse-derive it by comparing track.label/srclang/src
    // against the sub catalog — which collapses any duplicate-label or
    // shared-language entries onto the first match (so picking the 2nd
    // English sub still highlighted the 1st).
    window._selectedSubtitleIdx = idx;
    const sub = window._allAvailableSubtitles[idx];
    const vp = el('video-player');
    if (!vp) return;

    // Remove all existing tracks
    vp.querySelectorAll('track').forEach(t => t.remove());

    // Create and load the selected subtitle
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = sub.label || `Track ${idx + 1}`;
    track.srclang = sub.lang || 'und';
    track.src = window.sanitizePath(sub.path);
    track.default = true;
    vp.appendChild(track);

    // Set it as showing
    const trackIndex = vp.textTracks.length - 1;
    selectSubtitleTrack(trackIndex);
    track.addEventListener('load', () => selectSubtitleTrack(trackIndex), { once: true });
}

function subtitleTextAsVtt(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (/^WEBVTT(?:\s|$)/i.test(normalized)) return normalized;
    return `WEBVTT\n\n${normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
}

function addSubtitleTrack(source, label) {
    const vp = el('video-player');
    if (!vp || !source) return;
    if (window._liveSubActive) window.stopLiveSubtitles(true);

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label;
    track.srclang = 'und';
    track.default = true;
    track.src = source;
    vp.appendChild(track);

    window._allAvailableSubtitles = [{ label, lang: 'und', path: track.src, isLocal: true }];
    window._selectedSubtitleIdx = 0;
    refreshSubtitlesList();
    const trackIdx = vp.textTracks.length - 1;
    selectSubtitleTrack(trackIdx);
    track.addEventListener('load', () => selectSubtitleTrack(trackIdx), { once: true });

    const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
    window.showToast((t.subtitlesLoaded || 'Subtitles loaded: ') + label, 'success');
}

async function addUploadedSubtitle(file) {
    if (!file) return;
    const vttText = subtitleTextAsVtt(await file.text());
    addSubtitleTrack(URL.createObjectURL(new Blob([vttText], { type: 'text/vtt' })), file.name);
}

function refreshSubtitlesList() {
    const vp = el('video-player');
    if (!vp) return;
    const listContainer = el('subtitle-tracks-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    // If we have all available subtitles stored, use them
    if (window._allAvailableSubtitles && window._allAvailableSubtitles.length > 0) {
        window._allAvailableSubtitles.forEach((sub, idx) => {
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'subtitle-option';
            opt.dataset.idx = idx;
            opt.dataset.lang = sub.lang || 'und';
            opt.dataset.path = sub.path || '';
            opt.dataset.label = sub.label || '';

            const label = document.createElement('span');
            label.className = 'subtitle-option-label';
            label.textContent = sub.path ? sub.path.split(/[\\\\/]/).pop() : `Track ${idx + 1}`;

            const languagePill = document.createElement('span');
            languagePill.className = 'subtitle-language-pill';
            languagePill.title = sub.label || 'Original';
            languagePill.textContent = sub.label || 'Original';

            opt.append(label, languagePill);

            // Active iff this idx matches the renderer's explicit selection.
            const isActive = window._selectedSubtitleIdx === idx;
            if (isActive) {
                opt.classList.add('active');
                opt.style.color = 'var(--vault-accent)';
                opt.style.fontWeight = '600';
            }

            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                selectSubtitleByIndex(idx);
                el('subtitles-menu').style.display = 'none';
            });
            listContainer.appendChild(opt);
        });
    } else {
        // Fallback: show only loaded tracks
        for (let i = 0; i < vp.textTracks.length; i++) {
            const track = vp.textTracks[i];
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'subtitle-option';
            opt.dataset.idx = i;
            opt.style.cssText = 'padding:6px 12px; cursor:pointer; text-align:left; font-family:var(--font-body); font-size:12px; color:var(--vault-text); transition:background 0.2s; background:transparent; border:none; width:100%;';
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
    }

    const offOption = el('subtitles-menu').querySelector('.subtitle-option[data-idx="-1"]');
    if (offOption) {
        // Mirror the explicit selection: Off is active when nothing is picked.
        const offActive = window._selectedSubtitleIdx === -1 || window._selectedSubtitleIdx === undefined;
        offOption.classList.toggle('active', offActive);
        offOption.style.color = offActive ? 'var(--vault-accent)' : 'var(--vault-text)';
        offOption.style.fontWeight = offActive ? '600' : 'normal';
        offOption.onclick = (e) => {
            e.stopPropagation();
            if (window._liveSubActive) window.stopLiveSubtitles(true);
            window._selectedSubtitleIdx = -1;
            selectSubtitleTrack(-1);
            el('subtitles-menu').style.display = 'none';
        };
    }
}

function showAsrContextMenu(anchorEl, defaultLangs) {
    return new Promise((resolve) => {
        const existing = document.getElementById('asr-generation-context-menu');
        if (existing) existing.remove();
        const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
        const clampVolumeBoost = (value) => {
            const parsed = Number.parseFloat(value);
            if (!Number.isFinite(parsed)) return 1.5;
            return Math.min(2.5, Math.max(1, parsed));
        };
        let volumeBoost = clampVolumeBoost(window.appSettings && window.appSettings.asrVolumeBoost);

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
            width: 240px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        const title = document.createElement('div');
        title.style.cssText = 'font-size:10px; font-weight:700; text-transform:uppercase; color:var(--vault-gold); letter-spacing:0.05em; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.08); user-select:none;';
        title.textContent = t.asrGenerateSubtitles || 'Generate Subtitles';
        menu.appendChild(title);

        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto; padding-right:2px;';
        menu.appendChild(listContainer);

        const languages = [
            { code: 'en', name: 'English (EN)' },
            { code: 'qc', name: 'Québécois (QC)' },
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
        showMore.textContent = t.asrShowMore || 'Show more...';
        menu.appendChild(showMore);

        const boostWrap = document.createElement('div');
        boostWrap.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; display:flex; flex-direction:column; gap:6px;';

        const boostLabel = document.createElement('label');
        boostLabel.htmlFor = 'asr-volume-boost';
        boostLabel.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:10px; color:var(--vault-text); font-weight:700; text-transform:uppercase; user-select:none;';

        const boostText = document.createElement('span');
        boostText.textContent = t.asrVolumeBoost || 'Voice boost';

        const boostValue = document.createElement('span');
        boostValue.id = 'asr-volume-boost-value';
        boostValue.style.cssText = 'color:var(--vault-accent); font-family:var(--font-mono); white-space:nowrap;';

        const formatBoost = (value) => `+${Math.round((value - 1) * 100)}%`;
        boostValue.textContent = formatBoost(volumeBoost);

        boostLabel.appendChild(boostText);
        boostLabel.appendChild(boostValue);

        const boostSlider = document.createElement('input');
        boostSlider.id = 'asr-volume-boost';
        boostSlider.type = 'range';
        boostSlider.min = '1';
        boostSlider.max = '2.5';
        boostSlider.step = '0.1';
        boostSlider.value = String(volumeBoost);
        boostSlider.title = t.asrVolumeBoostHint || 'Boost mixed vocals for clearer subtitles';
        boostSlider.style.cssText = 'width:100%; accent-color:var(--vault-accent); cursor:pointer;';
        boostSlider.addEventListener('input', () => {
            volumeBoost = clampVolumeBoost(boostSlider.value);
            boostValue.textContent = formatBoost(volumeBoost);
        });

        boostWrap.appendChild(boostLabel);
        boostWrap.appendChild(boostSlider);
        menu.appendChild(boostWrap);

        function adjustPosition() {
            // Force layout reflow by checking offsetWidth/offsetHeight
            const menuWidth = menu.offsetWidth || menu.getBoundingClientRect().width || 220;
            const menuHeight = menu.offsetHeight || menu.getBoundingClientRect().height || 280;

            const rect = anchorEl.getBoundingClientRect();
            // Right-align the menu with the anchor button so it hangs from the
            // right edge (matches the subtitles dropdown's `right:0` layout in
            // the video bottom bar).
            let left = rect.right - menuWidth;
            let top = rect.bottom + 8;

            // Horizontal bounds check
            if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 12;
            }
            if (left < 12) {
                left = 12;
            }

            // Vertical bounds check: prefer opening upward when the anchor is
            // in the bottom bar (typical case for the player).
            if (top + menuHeight > window.innerHeight) {
                const spaceAbove = rect.top;
                const spaceBelow = window.innerHeight - rect.bottom;

                if (spaceAbove > spaceBelow) {
                    top = rect.top - menuHeight - 8;
                } else {
                    top = rect.bottom + 8;
                }
            } else if (rect.top > window.innerHeight * 0.6) {
                // Anchor sits in the lower 40% of the viewport — open upward
                // even if there's room below, so the menu doesn't cover the
                // playback controls.
                top = rect.top - menuHeight - 8;
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
            menu.style.right = 'auto';
            menu.style.bottom = 'auto';
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
        cancelBtn.textContent = t.cancel || 'Cancel';

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
        applyBtn.textContent = t.generate || 'Generate';
        applyBtn.addEventListener('click', () => {
            const chosen = Array.from(selectedCodes);
            cleanup();
            resolve({ langs: chosen, volumeBoost });
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

// ── Live streaming ASR subtitles (Parakeet) ─────────────────────────────────
// Starts a background transcription that streams VTTCues onto the <video> in
// real time while the file plays, and writes an .srt sidecar on the Python
// side. Cues carry absolute timestamps so they stay in sync with currentTime.

const _liveNormPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();

function updateLiveSubButton(active) {
    const btn = el('btn-subtitles');
    if (!btn) return;
    const svgIcon = window.icons ? window.icons.subtitles('', 'width:14px; height:14px; display:block; flex-shrink:0;') : '';
    if (active) {
        btn.classList.add('active');
        btn.innerHTML = `${svgIcon}<span style="color:var(--vault-gold);">● LIVE</span>`;
    }
    // When inactive we leave whatever selectSubtitleTrack last rendered.

    // Reflect the running state in the menu item label so a second click reads
    // as "Stop".
    const optGen = el('opt-generate-subtitle');
    const span = optGen && optGen.querySelector('span');
    if (span) span.textContent = active ? 'Stop Live Subtitles' : 'Live Subtitles (AI)';
}

function startLiveSubtitleSession(videoPath, itemName, langs, volumeBoost) {
    const vp = el('video-player');
    if (!vp) return;

    // Tear down any prior live track before starting a fresh take.
    window.stopLiveSubtitles(true);

    // AI subtitles are exclusive: unload any loaded SRT/VTT tracks so we never
    // render two overlapping subtitle streams. The AI sidecar (.srt) it writes
    // will overwrite the previous one for this file.
    const hadLoaded = vp.querySelectorAll('track').length > 0;
    vp.querySelectorAll('track').forEach(t => t.remove());
    for (let i = 0; i < vp.textTracks.length; i++) vp.textTracks[i].mode = 'disabled';
    if (window.refreshSubtitlesList) window.refreshSubtitlesList();
    if (hadLoaded) window.showToast('Replaced the loaded subtitles with AI subtitles.', 'info');

    ensureLiveSubtitleListeners();

    const primaryLang = (langs && langs[0]) || 'en';
    const startTime = Math.max(0, (vp.currentTime || 0) - 1.0);

    // Use a real track element so the live track can be removed cleanly when
    // switching videos or returning to a local sidecar.
    const trackElement = document.createElement('track');
    trackElement.kind = 'subtitles';
    trackElement.label = `AI Live (${primaryLang.toUpperCase()})`;
    trackElement.srclang = primaryLang;
    const trackUrl = URL.createObjectURL(new Blob(['WEBVTT\\n\\n'], { type: 'text/vtt' }));
    trackElement.src = trackUrl;
    vp.appendChild(trackElement);
    const track = trackElement.track;
    track.mode = 'showing';

    window._liveSubTrack = track;
    window._liveSubTrackElement = trackElement;
    window._liveSubTrackUrl = trackUrl;
    window._liveSubVideoPath = videoPath;
    window._liveSubActive = true;
    window._selectedSubtitleIdx = -1;

    // The picked primary language is the desired output language: transcribe in
    // the spoken language (auto-detected) and translate finals to it. Same-lang
    // is a near-passthrough.
    const translateTo = primaryLang;

    console.log('[live-subs] session start', { videoPath, primaryLang, translateTo, langs, volumeBoost, startTime: startTime.toFixed(2) });

    updateLiveSubButton(true);
    window.showToast(`Live subtitles started for "${itemName}" (${primaryLang.toUpperCase()})…`, 'success');

    window.electronAPI.startLiveSubtitles({
        videoPath,
        langs,
        volumeBoost,
        startTime,
        translateTo,
    }).then((res) => {
        if (!res || !res.success) {
            window.showToast('Live subtitles failed to start: ' + ((res && res.error) || 'unknown'), 'error');
            window.stopLiveSubtitles(true);
        }
    }).catch((err) => {
        window.showToast('Live subtitles failed to start: ' + err.message, 'error');
        window.stopLiveSubtitles(true);
    });
}

// Stops the Python process and (optionally) removes the in-memory live track.
window.stopLiveSubtitles = function stopLiveSubtitles(clearTrack) {
    if (window._liveSubActive || window._liveSubTrack) {
        console.log('[live-subs] stop', { clearTrack: !!clearTrack, cues: window._liveSubTrack && window._liveSubTrack.cues ? window._liveSubTrack.cues.length : 0 });
        try { window.electronAPI.stopLiveSubtitles(); } catch (e) { /* noop */ }
    }
    window._liveSubActive = false;

    if (clearTrack && window._liveSubTrack) {
        try {
            window._liveSubTrack.mode = 'disabled';
            // Drop cues so a stale track can't linger over the next video.
            const cues = window._liveSubTrack.cues;
            if (cues) {
                for (let i = cues.length - 1; i >= 0; i--) {
                    window._liveSubTrack.removeCue(cues[i]);
                }
            }
        } catch (e) { /* noop */ }
        if (window._liveSubTrackElement) window._liveSubTrackElement.remove();
        if (window._liveSubTrackUrl) {
            try { URL.revokeObjectURL(window._liveSubTrackUrl); } catch (_) { }
        }
        window._liveSubTrack = null;
        window._liveSubTrackElement = null;
        window._liveSubTrackUrl = null;
        window._liveSubVideoPath = null;
        window._livePartialCue = null;
        window._lastLiveCue = null;
    }
    updateLiveSubButton(false);
};

let _liveListenersBound = false;
function ensureLiveSubtitleListeners() {
    if (_liveListenersBound) return;
    _liveListenersBound = true;

    window.electronAPI.onLiveSubtitleCue((cue) => {
        if (!window._liveSubActive || !window._liveSubTrack) return;
        if (_liveNormPath(cue.videoPath) !== _liveNormPath(window._liveSubVideoPath)) return;
        if (cue.partial) return; // finals only
        try {
            const track = window._liveSubTrack;
            const MIN_DISPLAY = 1.6;                       // keep short lines readable
            const off = window._subtitleOffset || 0;       // user sync nudge (±0.25s)
            const s = Math.max(0, cue.start + off);
            const e = Math.max(s + MIN_DISPLAY, cue.end + off);

            // Trim the previous cue so an extended line doesn't overlap the next.
            if (window._lastLiveCue && window._lastLiveCue.endTime > s) {
                window._lastLiveCue.endTime = Math.max(window._lastLiveCue.startTime + 0.1, s);
            }
            const vtt = new VTTCue(s, e, cue.text);
            track.addCue(vtt);
            window._lastLiveCue = vtt;

            const vp = el('video-player');
            console.log(`[live-subs] +FINAL [${s.toFixed(2)}-${e.toFixed(2)}] "${cue.text}" ` +
                `(playhead=${vp ? vp.currentTime.toFixed(1) : '?'}s, offset=${off.toFixed(2)}s, cues=${track.cues ? track.cues.length : '?'})`);
        } catch (e) {
            console.warn('[live-subs] addCue failed', cue, e);
        }
    });

    window.electronAPI.onLiveSubtitleStatus((s) => {
        // Model-download / daemon-lifecycle events aren't tied to a video.
        if (s.status === 'downloading') {
            const pct = s.percent || 0;
            const btn = el('btn-subtitles');
            if (btn) btn.innerHTML = `<span style="color:var(--vault-gold);">DL ${pct}%</span>`;
            if (pct === 0 || pct % 25 === 0) {
                window.showToast(`Downloading AI subtitle model… ${pct}% (${s.receivedMB || 0}/${s.totalMB || 0} MB)`, 'info');
            }
            return;
        }
        if (s.status === 'downloaded') { window.showToast('Model downloaded — starting…', 'success'); return; }
        if (s.status === 'download-failed') {
            window.showToast('Model download failed: ' + (s.error || 'unknown'), 'error');
            window.stopLiveSubtitles(true);
            return;
        }
        if (s.status === 'loading' || s.status === 'ready' || s.status === 'error') {
            console.log('[live-subs] daemon', s.status, s.message || '');
            return;
        }

        // Session events must match the active video.
        if (_liveNormPath(s.videoPath) !== _liveNormPath(window._liveSubVideoPath)) return;
        console.log('[live-subs] status', s);
        if (s.status === 'started') { updateLiveSubButton(true); return; }
        if (s.final) {
            if (s.status === 'SUCCESS') {
                window.showToast(`Live subtitles finished — ${s.cues || 0} cues written to sidecar.`, 'success');
            } else if (s.status === 'FAILED') {
                window.showToast('Live subtitles error: ' + (s.error || 'unknown'), 'error');
            }
            window._liveSubActive = false;
            updateLiveSubButton(false);
        }
    });
}

window.startLiveSubtitleSession = startLiveSubtitleSession;

// ── Subtitle sync offset (±0.25s) ───────────────────────────────────────────
// Shifts every cue on the active subtitle track(s) — live or loaded SRT — by a
// user-tunable delay. VTTCue start/end are mutable, so we retime existing cues
// in place and remember the offset for future live cues. Persisted in settings.
window._subtitleOffset = (window.appSettings && Number(window.appSettings.subtitleOffset)) || 0;

function updateSubtitleOffsetLabel() {
    const lbl = el('subtitle-offset-value');
    if (lbl) {
        const o = window._subtitleOffset || 0;
        lbl.textContent = `${o >= 0 ? '+' : ''}${o.toFixed(2)}s`;
    }
}

function adjustSubtitleOffset(delta) {
    window._subtitleOffset = Math.round(((window._subtitleOffset || 0) + delta) * 100) / 100;
    const vp = el('video-player');
    if (vp && vp.textTracks) {
        for (const track of vp.textTracks) {
            if (!track.cues) continue;
            for (let i = 0; i < track.cues.length; i++) {
                const c = track.cues[i];
                const ns = Math.max(0, c.startTime + delta);
                const ne = Math.max(ns + 0.1, c.endTime + delta);
                c.startTime = ns;
                c.endTime = ne;
            }
        }
    }
    if (window.appSettings) {
        window.appSettings.subtitleOffset = window._subtitleOffset;
        window.electronAPI.saveSettings(window.appSettings);
    }
    updateSubtitleOffsetLabel();
    const o = window._subtitleOffset;
    window.showToast(`Subtitle delay: ${o >= 0 ? '+' : ''}${o.toFixed(2)}s`, 'info');
}
window.adjustSubtitleOffset = adjustSubtitleOffset;

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

    el('opt-upload-subtitle').addEventListener('click', async (e) => {
        e.stopPropagation();
        el('subtitles-menu').style.display = 'none';
        const videoPath = window.currentPlayingItem && window.currentPlayingItem.path;
        if (videoPath && window.electronAPI.chooseSubtitleFile && window.electronAPI.prepareSubtitleFile) {
            const selectedPath = await window.electronAPI.chooseSubtitleFile(videoPath);
            if (!selectedPath) return;
            const preparedPath = await window.electronAPI.prepareSubtitleFile(selectedPath);
            if (!preparedPath) return;
            const name = selectedPath.split(/[\\/]/).pop();
            addSubtitleTrack(window.sanitizePath(preparedPath), name);
            return;
        }
        el('subtitle-file-input').click();
    });

    // Subtitle sync nudge (±0.25s) — retimes active cues and persists the offset.
    updateSubtitleOffsetLabel();
    const offMinus = el('subtitle-offset-minus');
    const offPlus = el('subtitle-offset-plus');
    if (offMinus) offMinus.addEventListener('click', (e) => { e.stopPropagation(); adjustSubtitleOffset(-0.25); });
    if (offPlus) offPlus.addEventListener('click', (e) => { e.stopPropagation(); adjustSubtitleOffset(0.25); });

    const optGen = el('opt-generate-subtitle');
    if (optGen) {
        optGen.addEventListener('click', async (e) => {
            e.stopPropagation();
            el('subtitles-menu').style.display = 'none';

            // Toggle: a second click while a session is running stops it.
            if (window._liveSubActive) {
                window.stopLiveSubtitles(true);
                window.showToast('Live subtitles stopped.', 'info');
                return;
            }

            let videoPath = null;
            let itemName = 'Active Video';
            if (window.currentPlayingItem) {
                videoPath = window.currentPlayingItem.path;
                itemName = window.currentPlayingItem.name;
            } else if (window.currentPlayingIndex !== -1) {
                const itm = window.displayedItems[window.currentPlayingIndex];
                if (itm) { videoPath = itm.path; itemName = itm.name; }
            }

            if (!videoPath || videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
                window.showToast('Live subtitles require a local playback source.', 'error');
                return;
            }

            const savedLangs = window.appSettings && Array.isArray(window.appSettings.preferredASRLangs)
                ? window.appSettings.preferredASRLangs.filter(Boolean)
                : [];
            const shouldChooseLanguages = savedLangs.length === 0 || e.altKey || e.shiftKey;
            let langs = savedLangs.length ? savedLangs : ['en'];
            let volumeBoost = Number(window.appSettings && window.appSettings.asrVolumeBoost) || 1.5;

            if (shouldChooseLanguages) {
                // Anchor to the persistent CC button — optGen lives in the menu
                // we just hid, and a hidden element reports a zero-size rect.
                const asrAnchor = el('btn-subtitles') || optGen;
                const asrConfig = await showAsrContextMenu(asrAnchor, langs);
                const chosenLangs = Array.isArray(asrConfig) ? asrConfig : (asrConfig && asrConfig.langs);
                if (!chosenLangs || chosenLangs.length === 0) return;
                langs = chosenLangs;
                volumeBoost = Array.isArray(asrConfig) ? volumeBoost : (asrConfig.volumeBoost || volumeBoost);

                if (!window.appSettings) window.appSettings = {};
                window.appSettings.preferredASRLangs = langs;
                window.appSettings.asrVolumeBoost = volumeBoost;
                await window.electronAPI.saveSettings(window.appSettings);
            }

            startLiveSubtitleSession(videoPath, itemName, langs, volumeBoost);
        });
    }

    el('subtitle-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await addUploadedSubtitle(file);
        e.target.value = '';
    });
}

async function loadActiveSubtitles(videoPath) {
    const vpReal = el('video-player');
    if (!vpReal) return;
    vpReal.querySelectorAll('track').forEach(t => t.remove());
    try {
        const subs = await window.electronAPI.findSubtitles(videoPath);

        // Store all available subtitles for the menu
        window._allAvailableSubtitles = subs || [];

        if (subs && subs.length > 0) {
            // Find the best matching subtitle for user's preferred language
            const prefLang = (window.appSettings && window.appSettings.defaultSubLang) || 'original';
            let bestSub = null;

            // Priority order: 1. Exact match with prefLang, 2. Language starts with prefLang, 3. Original, 4. First available
            for (const sub of subs) {
                const subLang = sub.lang || '';
                const subLabel = sub.label || '';

                if (prefLang === 'original' && subLabel.toLowerCase() === 'original') {
                    bestSub = sub;
                    break;
                } else if (prefLang !== 'und' && subLang.toLowerCase() === prefLang.toLowerCase()) {
                    bestSub = sub;
                    break;
                } else if (prefLang !== 'und' && subLabel.toLowerCase().includes(`(${prefLang.toLowerCase()})`)) {
                    bestSub = sub;
                    break;
                }
            }

            // If no exact match, fall back to first subtitle
            if (!bestSub && subs.length > 0) {
                bestSub = subs[0];
            }

            // Only load the best matching subtitle
            if (bestSub) {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = bestSub.label || 'Original';
                track.srclang = bestSub.lang || 'und';
                track.src = window.sanitizePath(bestSub.path);
                vpReal.appendChild(track);
            }

            window._selectedSubtitleIdx = bestSub ? subs.indexOf(bestSub) : -1;
            refreshSubtitlesList();
            selectSubtitleTrack(bestSub ? 0 : -1);
        } else {
            window._allAvailableSubtitles = [];
            refreshSubtitlesList();
            selectSubtitleTrack(-1);
        }
    } catch (err) {
        console.error("Subtitles reload failed:", err);
    }
}

// Bind to globals
window.selectSubtitleTrack = selectSubtitleTrack;
window.selectSubtitleByIndex = selectSubtitleByIndex;
window.refreshSubtitlesList = refreshSubtitlesList;
window.initSubtitleListeners = initSubtitleListeners;
window.loadActiveSubtitles = loadActiveSubtitles;
