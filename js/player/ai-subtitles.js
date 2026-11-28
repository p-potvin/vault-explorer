/**
 * ai-subtitles.js — Unified renderer UI & player session controller for AI Subtitles.
 *
 * Combines the 2-step AI Subtitles configuration submenu (separator + translation
 * languages) and the player's AI Subtitles trigger into one place, routing through
 * the same `generateSubtitles` pipeline as every other Generate Subtitles button.
 */

(function () {
    const SUBTITLE_MODELS = [
        { id: 'parakeet-tdt', label: 'Parakeet TDT (Fast default)' },
        { id: 'nemotron-3.5', label: 'Nemotron 3.5 (Multilingual)' },
        { id: 'parakeet-ctc', label: 'Parakeet CTC' },
        { id: 'nemotron-en', label: 'Nemotron EN (English-only)' }
    ];

    const SUBTITLE_SEPARATORS = [
        { id: 'none', label: 'None (No separation/filtering)' },
        { id: 'rnnoise', label: 'RNNoise (Fast filter)' },
        { id: 'mel_band_roformer', label: 'Mel-Band Roformer (Vocal isolation)' },
        { id: 'bs_roformer', label: 'BS-Roformer (Vocal isolation)' },
        { id: 'htdemucs', label: 'HTDemucs (4-stem separation)' }
    ];

    const _aiNormPath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();

    /**
     * Shows the 2-step AI subtitles submenu anchored near `anchorEl` (or centered when null).
     * Resolves with { model, separator, translateTo, translateFrom, translateEngine } or null if dismissed.
     */
    function showAiSubtitlesSubmenu(anchorEl, options = {}) {
        const modalTitle = (options && options.title) || 'AI Subtitles';
        return new Promise((resolve) => {
            const existing = document.getElementById('ai-subtitles-submenu');
            if (existing) existing.remove();

            const defaultModel = (window.appSettings && window.appSettings.aiAsrModel) || 'parakeet-tdt';

            const defaultSep = typeof window.getSubtitleSeparator === 'function'
                ? window.getSubtitleSeparator()
                : ((window.appSettings && window.appSettings.aiSeparator) || 'none');

            const defFrom = ((window.appSettings && (
                window.appSettings.translateFrom ||
                (window.appSettings.preferredASRLangs && window.appSettings.preferredASRLangs[0])
            )) || 'en').slice(0, 2).toLowerCase();

            const defTo = ((window.appSettings && (
                window.appSettings.translateTo ||
                (window.appSettings.defaultSubLang && window.appSettings.defaultSubLang !== 'original' && window.appSettings.defaultSubLang.length === 2
                    ? window.appSettings.defaultSubLang
                    : 'fr')
            )) || 'fr').slice(0, 2).toLowerCase();

            let currentStep = 1;
            let chosenModel = SUBTITLE_MODELS.some((m) => m.id === defaultModel) ? defaultModel : 'parakeet-tdt';
            let chosenSeparator = defaultSep;
            let chosenTranslateFrom = defFrom;
            let chosenTranslateTo = defTo;

            const menu = document.createElement('div');
            menu.id = 'ai-subtitles-submenu';
            menu.style.cssText = `
                position: fixed;
                background: rgba(18, 16, 26, 0.96);
                backdrop-filter: blur(14px);
                border: 1px solid var(--vault-border, rgba(255, 255, 255, 0.12));
                border-radius: 8px;
                padding: 14px;
                width: 270px;
                box-sizing: border-box;
                z-index: 10001;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
                display: flex;
                flex-direction: column;
                gap: 12px;
                font-family: var(--font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
                color: var(--vault-text, #e2e8f0);
            `;

            function adjustPosition() {
                if (!anchorEl) {
                    menu.style.left = '50%';
                    menu.style.top = '50%';
                    menu.style.right = 'auto';
                    menu.style.bottom = 'auto';
                    menu.style.transform = 'translate(-50%, -50%)';
                    return;
                }
                menu.style.transform = 'none';
                const menuWidth = menu.offsetWidth || 270;
                const menuHeight = menu.offsetHeight || 220;
                const rect = anchorEl.getBoundingClientRect();

                let left = rect.right - menuWidth;
                let top = rect.bottom + 8;

                if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 12;
                if (left < 12) left = 12;
                if (top + menuHeight > window.innerHeight || rect.top > window.innerHeight * 0.55) {
                    top = Math.max(12, rect.top - menuHeight - 8);
                }

                menu.style.left = `${left}px`;
                menu.style.top = `${top}px`;
                menu.style.right = 'auto';
                menu.style.bottom = 'auto';
            }

            function cleanup() {
                menu.remove();
                document.removeEventListener('mousedown', onMouseDown);
                document.removeEventListener('keydown', onKeyDown);
            }

            const onMouseDown = (e) => {
                if (!menu.contains(e.target) && (!anchorEl || !anchorEl.contains(e.target))) {
                    cleanup();
                    resolve(null);
                }
            };

            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            };

            function render() {
                menu.innerHTML = '';

                const header = document.createElement('div');
                header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:8px;';

                const title = document.createElement('div');
                title.style.cssText = 'font-size:12px; font-weight:700; color:var(--vault-accent, #e5a93b); display:flex; align-items:center; gap:6px;';
                title.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px; height:13px; flex-shrink:0;">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <span>${modalTitle}</span>
                `;

                const stepBadge = document.createElement('span');
                stepBadge.style.cssText = 'font-size:10px; font-family:var(--font-mono, monospace); font-weight:600; color:var(--vault-accent, #e5a93b); background:rgba(229,169,59,0.12); border:1px solid rgba(229,169,59,0.25); border-radius:10px; padding:1px 7px;';
                stepBadge.textContent = currentStep === 1 ? 'Step 1/2' : 'Step 2/2';

                header.appendChild(title);
                header.appendChild(stepBadge);
                menu.appendChild(header);

                const body = document.createElement('div');
                body.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

                if (currentStep === 1) {
                    const selectCss = `
                        width: 100%;
                        background: rgba(0, 0, 0, 0.4);
                        border: 1px solid var(--vault-border, rgba(255, 255, 255, 0.15));
                        border-radius: 4px;
                        color: var(--vault-text, #fff);
                        font-family: var(--font-body, sans-serif);
                        font-size: 11.5px;
                        padding: 6px 8px;
                        outline: none;
                        cursor: pointer;
                        box-sizing: border-box;
                    `;

                    const modelLabel = document.createElement('label');
                    modelLabel.htmlFor = 'ai-sub-model-select';
                    modelLabel.style.cssText = 'font-size:11px; font-weight:600; color:var(--vault-text, #fff); user-select:none;';
                    modelLabel.textContent = 'ASR Model:';

                    const modelSelect = document.createElement('select');
                    modelSelect.id = 'ai-sub-model-select';
                    modelSelect.style.cssText = selectCss;

                    SUBTITLE_MODELS.forEach((m) => {
                        const opt = document.createElement('option');
                        opt.value = m.id;
                        opt.textContent = m.label;
                        opt.style.background = '#1a1626';
                        opt.style.color = '#fff';
                        if (m.id === chosenModel) opt.selected = true;
                        modelSelect.appendChild(opt);
                    });

                    modelSelect.addEventListener('change', () => { chosenModel = modelSelect.value; });

                    const prompt = document.createElement('label');
                    prompt.htmlFor = 'ai-sub-separator-select';
                    prompt.style.cssText = 'font-size:11px; font-weight:600; color:var(--vault-text, #fff); user-select:none; margin-top:4px;';
                    prompt.textContent = 'Audio Separator:';

                    const hint = document.createElement('div');
                    hint.style.cssText = 'font-size:10px; color:var(--vault-text-dim, #94a3b8); margin-top:-4px; margin-bottom:2px;';
                    hint.textContent = 'Choose vocal separation/filter model to clean audio.';

                    const select = document.createElement('select');
                    select.id = 'ai-sub-separator-select';
                    select.style.cssText = selectCss;

                    SUBTITLE_SEPARATORS.forEach((s) => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = s.label;
                        opt.style.background = '#1a1626';
                        opt.style.color = '#fff';
                        if (s.id === chosenSeparator) opt.selected = true;
                        select.appendChild(opt);
                    });

                    select.addEventListener('change', () => { chosenSeparator = select.value; });

                    body.appendChild(modelLabel);
                    body.appendChild(modelSelect);
                    body.appendChild(prompt);
                    body.appendChild(hint);
                    body.appendChild(select);

                    const btnRow = document.createElement('div');
                    btnRow.style.cssText = 'display:flex; justify-content:flex-end; gap:6px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; margin-top:2px;';

                    const cancelBtn = document.createElement('button');
                    cancelBtn.style.cssText = 'background:transparent; border:1px solid var(--vault-border, rgba(255,255,255,0.15)); color:var(--vault-text, #fff); font-size:11px; font-weight:600; padding:4px 10px; border-radius:4px; cursor:pointer; font-family:var(--font-mono, monospace);';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });

                    const nextBtn = document.createElement('button');
                    nextBtn.style.cssText = 'background:var(--vault-accent, #e5a93b); color:var(--vault-accent-text, #0b0813); border:none; font-size:11px; font-weight:700; padding:4px 12px; border-radius:4px; cursor:pointer; font-family:var(--font-mono, monospace);';
                    nextBtn.textContent = 'Next →';
                    nextBtn.addEventListener('click', () => {
                        chosenModel = modelSelect.value;
                        chosenSeparator = select.value;
                        currentStep = 2;
                        render();
                    });

                    btnRow.appendChild(cancelBtn);
                    btnRow.appendChild(nextBtn);

                    menu.appendChild(body);
                    menu.appendChild(btnRow);
                } else {
                    const prompt = document.createElement('div');
                    prompt.style.cssText = 'font-size:11px; font-weight:600; color:var(--vault-text, #fff); user-select:none;';
                    prompt.textContent = 'Translation Languages:';

                    const hint = document.createElement('div');
                    hint.style.cssText = 'font-size:10px; color:var(--vault-text-dim, #94a3b8); margin-top:-4px; margin-bottom:2px;';
                    hint.textContent = 'Leave empty to skip translation, or enter 2-letter codes.';

                    const rowFrom = document.createElement('div');
                    rowFrom.style.cssText = 'display:flex; flex-direction:column; gap:3px;';
                    const lblFrom = document.createElement('label');
                    lblFrom.htmlFor = 'ai-sub-lang-from';
                    lblFrom.style.cssText = 'font-size:10.5px; font-family:var(--font-mono, monospace); color:var(--vault-text, #ccc);';
                    lblFrom.textContent = 'Translate From:';

                    const inputFrom = document.createElement('input');
                    inputFrom.id = 'ai-sub-lang-from';
                    inputFrom.type = 'text';
                    inputFrom.maxLength = 2;
                    inputFrom.value = chosenTranslateFrom;
                    inputFrom.placeholder = 'en';
                    inputFrom.style.cssText = `
                        width: 100%;
                        background: rgba(0, 0, 0, 0.4);
                        border: 1px solid var(--vault-border, rgba(255, 255, 255, 0.15));
                        border-radius: 4px;
                        color: var(--vault-accent, #e5a93b);
                        font-family: var(--font-mono, monospace);
                        font-size: 12px;
                        font-weight: 700;
                        text-transform: lowercase;
                        padding: 5px 8px;
                        box-sizing: border-box;
                        outline: none;
                    `;
                    rowFrom.appendChild(lblFrom);
                    rowFrom.appendChild(inputFrom);

                    const rowTo = document.createElement('div');
                    rowTo.style.cssText = 'display:flex; flex-direction:column; gap:3px;';
                    const lblTo = document.createElement('label');
                    lblTo.htmlFor = 'ai-sub-lang-to';
                    lblTo.style.cssText = 'font-size:10.5px; font-family:var(--font-mono, monospace); color:var(--vault-text, #ccc);';
                    lblTo.textContent = 'Translate To:';

                    const inputTo = document.createElement('input');
                    inputTo.id = 'ai-sub-lang-to';
                    inputTo.type = 'text';
                    inputTo.maxLength = 2;
                    inputTo.value = chosenTranslateTo;
                    inputTo.placeholder = 'fr';
                    inputTo.style.cssText = `
                        width: 100%;
                        background: rgba(0, 0, 0, 0.4);
                        border: 1px solid var(--vault-border, rgba(255, 255, 255, 0.15));
                        border-radius: 4px;
                        color: var(--vault-accent, #e5a93b);
                        font-family: var(--font-mono, monospace);
                        font-size: 12px;
                        font-weight: 700;
                        text-transform: lowercase;
                        padding: 5px 8px;
                        box-sizing: border-box;
                        outline: none;
                    `;
                    rowTo.appendChild(lblTo);
                    rowTo.appendChild(inputTo);

                    const errorMsg = document.createElement('div');
                    errorMsg.id = 'ai-sub-validation-error';
                    errorMsg.style.cssText = 'color:var(--vault-danger, #ef4444); font-size:10px; font-family:var(--font-mono, monospace); display:none; margin-top:2px;';

                    body.appendChild(prompt);
                    body.appendChild(hint);
                    body.appendChild(rowFrom);
                    body.appendChild(rowTo);
                    body.appendChild(errorMsg);

                    const btnRow = document.createElement('div');
                    btnRow.style.cssText = 'display:flex; justify-content:space-between; gap:6px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; margin-top:2px;';

                    const backBtn = document.createElement('button');
                    backBtn.style.cssText = 'background:transparent; border:1px solid var(--vault-border, rgba(255,255,255,0.15)); color:var(--vault-text, #fff); font-size:11px; font-weight:600; padding:4px 10px; border-radius:4px; cursor:pointer; font-family:var(--font-mono, monospace);';
                    backBtn.textContent = '← Back';
                    backBtn.addEventListener('click', () => {
                        chosenTranslateFrom = inputFrom.value.trim().toLowerCase();
                        chosenTranslateTo = inputTo.value.trim().toLowerCase();
                        currentStep = 1;
                        render();
                    });

                    const startBtn = document.createElement('button');
                    startBtn.style.cssText = 'background:var(--vault-accent, #e5a93b); color:var(--vault-accent-text, #0b0813); border:none; font-size:11px; font-weight:700; padding:4px 12px; border-radius:4px; cursor:pointer; font-family:var(--font-mono, monospace);';
                    startBtn.textContent = 'Start AI';

                    const handleConfirm = () => {
                        errorMsg.style.display = 'none';
                        inputFrom.style.borderColor = '';
                        inputTo.style.borderColor = '';

                        const lFrom = inputFrom.value.trim().toLowerCase();
                        const lTo = inputTo.value.trim().toLowerCase();

                        let finalTranslateTo = null;
                        let finalTranslateFrom = null;

                        if (lTo === '') {
                            finalTranslateTo = null;
                            finalTranslateFrom = null;
                        } else {
                            if (!/^[a-z]{2}$/i.test(lTo)) {
                                errorMsg.style.display = 'block';
                                errorMsg.textContent = 'Translate To must be a 2-letter code (or left empty).';
                                inputTo.style.borderColor = 'var(--vault-danger, #ef4444)';
                                inputTo.focus();
                                return;
                            }
                            finalTranslateTo = lTo;

                            if (lFrom === '') {
                                finalTranslateFrom = null;
                            } else {
                                if (!/^[a-z]{2}$/i.test(lFrom)) {
                                    errorMsg.style.display = 'block';
                                    errorMsg.textContent = 'Translate From must be a 2-letter code (or left empty).';
                                    inputFrom.style.borderColor = 'var(--vault-danger, #ef4444)';
                                    inputFrom.focus();
                                    return;
                                }
                                finalTranslateFrom = lFrom;
                            }
                        }

                        if (!window.appSettings) window.appSettings = {};
                        window.appSettings.aiAsrModel = chosenModel;
                        window.appSettings.aiSeparator = chosenSeparator;
                        window.appSettings.translateFrom = lFrom;
                        window.appSettings.translateTo = lTo;
                        if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
                            window.electronAPI.saveSettings(window.appSettings);
                        }

                        cleanup();
                        resolve({
                            model: chosenModel,
                            separator: chosenSeparator,
                            translateTo: finalTranslateTo,
                            translateFrom: finalTranslateFrom,
                            translateEngine: 'hf'
                        });
                    };

                    startBtn.addEventListener('click', handleConfirm);
                    inputFrom.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleConfirm(); });
                    inputTo.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleConfirm(); });

                    btnRow.appendChild(backBtn);
                    btnRow.appendChild(startBtn);

                    menu.appendChild(body);
                    menu.appendChild(btnRow);

                    setTimeout(() => inputTo.focus(), 50);
                }

                adjustPosition();
            }

            document.body.appendChild(menu);
            document.addEventListener('mousedown', onMouseDown);
            document.addEventListener('keydown', onKeyDown);
            render();
        });
    }

    function updateAiSubButton(active) {
        const btn = document.getElementById('btn-subtitles');
        if (btn) {
            const svgIcon = window.icons ? window.icons.subtitles('', 'width:14px; height:14px; display:block; flex-shrink:0;') : '';
            if (active) {
                btn.classList.add('active');
                btn.innerHTML = `${svgIcon}<span style="color:var(--vault-gold);">● AI</span>`;
            } else {
                const vp = document.getElementById('video-player');
                const hasShowingTrack = vp && vp.textTracks && Array.from(vp.textTracks).some(t => t.mode === 'showing');
                if (!hasShowingTrack || window._selectedSubtitleIdx < 0) {
                    btn.classList.remove('active');
                    btn.innerHTML = `${svgIcon}<span>CC</span>`;
                }
            }
        }

        const optGen = document.getElementById('opt-generate-subtitle');
        const span = optGen && optGen.querySelector('span');
        if (span) span.textContent = active ? 'Generating AI Subtitles…' : 'AI Subtitles';
    }

    async function selectGeneratedSubtitle(videoPath, srtPath) {
        if (_aiNormPath(window.currentPlayingItem && window.currentPlayingItem.path) !== _aiNormPath(videoPath)) return;
        if (typeof window.loadActiveSubtitles === 'function') {
            await window.loadActiveSubtitles(videoPath);
        }
        if (!srtPath) return;
        const name = (srtPath.split(/[\\/]/).pop() || '').replace(/\.srt$/i, '').toLowerCase();
        const idx = (window._allAvailableSubtitles || []).findIndex((sub) => {
            const file = _aiNormPath(sub.path).split('/').pop();
            return file === `${name}.srt` || file === `${name}.vtt`;
        });
        if (idx >= 0 && typeof window.selectSubtitleByIndex === 'function') {
            window.selectSubtitleByIndex(idx);
        }
    }

    function startAiSubtitlesSession(videoPath, itemName, options = {}) {
        const vp = document.getElementById('video-player');
        if (!vp) return;

        window.stopAiSubtitles();

        const hadLoaded = vp.querySelectorAll('track').length > 0;
        vp.querySelectorAll('track').forEach(t => t.remove());
        for (let i = 0; i < vp.textTracks.length; i++) vp.textTracks[i].mode = 'disabled';
        if (window.refreshSubtitlesList) window.refreshSubtitlesList();
        if (hadLoaded) window.showToast('Replaced the loaded subtitles with AI subtitles.', 'info');

        window._aiSubActive = true;
        window._liveSubActive = true;
        window._aiSubVideoPath = videoPath;
        window._liveSubVideoPath = videoPath;
        window._selectedSubtitleIdx = -1;

        updateAiSubButton(true);
        window.showToast(`Generating AI subtitles for "${itemName}"…`, 'success');

        const model = options.model || (window.appSettings && window.appSettings.aiAsrModel) || 'parakeet-tdt';
        const separator = options.separator || (typeof window.getSubtitleSeparator === 'function' ? window.getSubtitleSeparator() : 'none');
        const translateTo = options.translateTo || null;
        const translateFrom = options.translateFrom || null;
        const translateEngine = options.translateEngine || 'hf';
        const itemFolder = window.currentRealPath || '';
        // this run's token: Stop or a newer run changes it, and this run's late result is then ignored
        const token = (window._aiSubToken = (window._aiSubToken || 0) + 1);

        window.electronAPI.generateSubtitles(videoPath, itemFolder, {
            model,
            separator,
            translateTo,
            translateFrom,
            translateEngine
        }).then(async (res) => {
            if (token !== window._aiSubToken) return;            // stopped, or replaced by a newer run
            if (res && res.status === 'STOPPED') {
                stopAiSubtitles(false);
                return;
            }
            window._aiSubActive = false;
            window._liveSubActive = false;
            window._aiSubVideoPath = null;
            window._liveSubVideoPath = null;
            updateAiSubButton(false);

            if (res && (res.success || res.status === 'SUCCESS' || res.status === 'EXISTS')) {
                window.showToast(`AI subtitles ready for "${itemName}".`, 'success');
                await selectGeneratedSubtitle(videoPath, res.path);
            } else {
                const err = (res && res.error) || 'unknown';
                window.showToast('AI subtitles error: ' + err, 'error');
                if (typeof window.selectSubtitleTrack === 'function') window.selectSubtitleTrack(-1);
            }
        }).catch((err) => {
            if (token !== window._aiSubToken) return;
            window._aiSubActive = false;
            window._liveSubActive = false;
            window._aiSubVideoPath = null;
            window._liveSubVideoPath = null;
            updateAiSubButton(false);
            window.showToast('AI subtitles failed: ' + err.message, 'error');
            if (typeof window.selectSubtitleTrack === 'function') window.selectSubtitleTrack(-1);
        });
    }

    function stopAiSubtitles(unselect = false) {
        window._aiSubToken = (window._aiSubToken || 0) + 1;     // the running job's result no longer applies
        if (window._aiSubActive) {
            try { window.electronAPI.stopLiveSubtitles(); } catch (_) { /* noop */ }
        }
        window._aiSubActive = false;
        window._liveSubActive = false;
        window._aiSubVideoPath = null;
        window._liveSubVideoPath = null;
        if (unselect && typeof window.selectSubtitleTrack === 'function') {
            window.selectSubtitleTrack(-1);
        }
        updateAiSubButton(false);
    }

    window.showAiSubtitlesSubmenu = showAiSubtitlesSubmenu;
    window.startAiSubtitlesSession = startAiSubtitlesSession;
    window.stopAiSubtitles = stopAiSubtitles;
    // Backward-compatible aliases
    window.startLiveSubtitleSession = startAiSubtitlesSession;
    window.stopLiveSubtitles = stopAiSubtitles;
})();
