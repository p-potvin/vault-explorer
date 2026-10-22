/**
 * subtitles-ai-menu.js — Submenu for Live Subtitles AI configuration.
 *
 * Provides a 2-step configuration submenu when clicking "Live Subtitles AI":
 *  1. Audio Separator selection (defaulting to settings or rnnoise).
 *  2. Translation languages (Translate From, Translate To; validated 2-letter codes, default from settings).
 *
 * Invokes `vw better-subtitles -Separator <name> -TranslateTo <l1> -TranslateFrom <l2>` with translator "hf".
 */

(function () {
    const SUBTITLE_SEPARATORS = [
        { id: 'rnnoise', label: 'RNNoise (Fast filter, default)' },
        { id: 'mel_band_roformer', label: 'Mel-Band Roformer (Vocal isolation)' },
        { id: 'bs_roformer', label: 'BS-Roformer (Vocal isolation)' },
        { id: 'htdemucs', label: 'HTDemucs (4-stem separation)' },
        { id: 'none', label: 'None (No separation/filtering)' }
    ];

    /**
     * Shows the 2-step AI subtitles submenu anchored near `anchorEl`.
     * Resolves with { separator, translateTo, translateFrom, translateEngine } or null if dismissed.
     */
    function showAiSubtitlesSubmenu(anchorEl) {
        return new Promise((resolve) => {
            const existing = document.getElementById('ai-subtitles-submenu');
            if (existing) existing.remove();

            // Default values from settings or fallback
            const defaultSep = typeof window.getSubtitleSeparator === 'function'
                ? window.getSubtitleSeparator()
                : ((window.appSettings && window.appSettings.aiSeparator) || 'rnnoise');

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
                if (!anchorEl) return;
                const menuWidth = menu.offsetWidth || 270;
                const menuHeight = menu.offsetHeight || 220;
                const rect = anchorEl.getBoundingClientRect();

                let left = rect.right - menuWidth;
                let top = rect.bottom + 8;

                if (left + menuWidth > window.innerWidth) {
                    left = window.innerWidth - menuWidth - 12;
                }
                if (left < 12) {
                    left = 12;
                }

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
                if (!menu.contains(e.target) && anchorEl && !anchorEl.contains(e.target)) {
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

                // Header
                const header = document.createElement('div');
                header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:8px;';

                const title = document.createElement('div');
                title.style.cssText = 'font-size:12px; font-weight:700; color:var(--vault-accent, #e5a93b); display:flex; align-items:center; gap:6px;';
                title.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px; height:13px; flex-shrink:0;">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <span>Live Subtitles AI</span>
                `;

                const stepBadge = document.createElement('span');
                stepBadge.style.cssText = 'font-size:10px; font-family:var(--font-mono, monospace); font-weight:600; color:var(--vault-accent, #e5a93b); background:rgba(229,169,59,0.12); border:1px solid rgba(229,169,59,0.25); border-radius:10px; padding:1px 7px;';
                stepBadge.textContent = currentStep === 1 ? 'Step 1/2' : 'Step 2/2';

                header.appendChild(title);
                header.appendChild(stepBadge);
                menu.appendChild(header);

                // Content
                const body = document.createElement('div');
                body.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

                if (currentStep === 1) {
                    const prompt = document.createElement('label');
                    prompt.htmlFor = 'ai-sub-separator-select';
                    prompt.style.cssText = 'font-size:11px; font-weight:600; color:var(--vault-text, #fff); user-select:none;';
                    prompt.textContent = 'Audio Separator:';

                    const hint = document.createElement('div');
                    hint.style.cssText = 'font-size:10px; color:var(--vault-text-dim, #94a3b8); margin-top:-4px; margin-bottom:2px;';
                    hint.textContent = 'Choose vocal separation/filter model to clean audio.';

                    const select = document.createElement('select');
                    select.id = 'ai-sub-separator-select';
                    select.style.cssText = `
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

                    SUBTITLE_SEPARATORS.forEach((s) => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = s.label;
                        opt.style.background = '#1a1626';
                        opt.style.color = '#fff';
                        if (s.id === chosenSeparator) opt.selected = true;
                        select.appendChild(opt);
                    });

                    select.addEventListener('change', () => {
                        chosenSeparator = select.value;
                    });

                    body.appendChild(prompt);
                    body.appendChild(hint);
                    body.appendChild(select);

                    // Button Row Step 1
                    const btnRow = document.createElement('div');
                    btnRow.style.cssText = 'display:flex; justify-content:flex-end; gap:6px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; margin-top:2px;';

                    const cancelBtn = document.createElement('button');
                    cancelBtn.style.cssText = 'background:transparent; border:1px solid var(--vault-border, rgba(255,255,255,0.15)); color:var(--vault-text, #fff); font-size:11px; font-weight:600; padding:4px 10px; border-radius:4px; cursor:pointer; font-family:var(--font-mono, monospace);';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.addEventListener('click', () => {
                        cleanup();
                        resolve(null);
                    });

                    const nextBtn = document.createElement('button');
                    nextBtn.style.cssText = 'background:var(--vault-accent, #e5a93b); color:var(--vault-accent-text, #0b0813); border:none; font-size:11px; font-weight:700; padding:4px 12px; border-radius:4px; cursor:pointer; font-family:var(--font-mono, monospace);';
                    nextBtn.textContent = 'Next →';
                    nextBtn.addEventListener('click', () => {
                        chosenSeparator = select.value;
                        currentStep = 2;
                        render();
                    });

                    btnRow.appendChild(cancelBtn);
                    btnRow.appendChild(nextBtn);

                    menu.appendChild(body);
                    menu.appendChild(btnRow);
                } else {
                    // Step 2: Translation Languages
                    const prompt = document.createElement('div');
                    prompt.style.cssText = 'font-size:11px; font-weight:600; color:var(--vault-text, #fff); user-select:none;';
                    prompt.textContent = 'Translation Languages:';

                    const hint = document.createElement('div');
                    hint.style.cssText = 'font-size:10px; color:var(--vault-text-dim, #94a3b8); margin-top:-4px; margin-bottom:2px;';
                    hint.textContent = 'Leave empty to skip translation, or enter 2-letter codes.';

                    // Translate From
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

                    // Translate To
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

                    // Button Row Step 2
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

                        // Check: If second input (Translate To) is empty, omit both translateTo and translateFrom.
                        // If first input (Translate From) is empty, omit translateFrom.
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

                        // Persist to appSettings for next time
                        if (!window.appSettings) window.appSettings = {};
                        window.appSettings.aiSeparator = chosenSeparator;
                        window.appSettings.translateFrom = lFrom;
                        window.appSettings.translateTo = lTo;
                        if (window.electronAPI && typeof window.electronAPI.saveSettings === 'function') {
                            window.electronAPI.saveSettings(window.appSettings);
                        }

                        cleanup();
                        resolve({
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

    window.showAiSubtitlesSubmenu = showAiSubtitlesSubmenu;
})();
