/* ==========================================================================
   Vault Explorer — Livestream Spoken Translator Module
   ========================================================================== */

window.isStreamPlaying = false;
window.isTranslationActive = false;
window._livestreamSettingsLoaded = false;

window.loadLivestreamSettingsOnce = function() {
    if (window._livestreamSettingsLoaded) return;
    window._livestreamSettingsLoaded = true;

    console.log('[settings] Initializing livestream settings lazily on first tab open...');
    const voiceSelect = el('livestream-voice-preset');
    const langSelect = el('livestream-lang-profile');
    const threshRange = el('livestream-silence-thresh');
    const volRange = el('livestream-playback-vol');
    const translationToggle = el('livestream-translation-toggle');
    const urlInput = el('livestream-url-input');

    if (voiceSelect) {
        const saved = localStorage.getItem('livestream_voice');
        if (saved) voiceSelect.value = saved;
        voiceSelect.addEventListener('change', () => {
            localStorage.setItem('livestream_voice', voiceSelect.value);
            window.appSettings.livestreamVoice = voiceSelect.value;
            window.electronAPI.saveSettings(window.appSettings);
        });
        window.appSettings.livestreamVoice = voiceSelect.value;
    }
    if (langSelect) {
        const saved = localStorage.getItem('livestream_lang');
        if (saved) langSelect.value = saved;
        langSelect.addEventListener('change', () => {
            localStorage.setItem('livestream_lang', langSelect.value);
            window.appSettings.livestreamLang = langSelect.value;
            window.electronAPI.saveSettings(window.appSettings);
        });
        window.appSettings.livestreamLang = langSelect.value;
    }
    if (threshRange) {
        const saved = localStorage.getItem('livestream_threshold');
        if (saved) {
            threshRange.value = saved;
            const threshVal = el('livestream-silence-val');
            if (threshVal) threshVal.innerText = parseFloat(saved).toFixed(3);
        }
        threshRange.addEventListener('input', () => {
            localStorage.setItem('livestream_threshold', threshRange.value);
            const threshVal = el('livestream-silence-val');
            if (threshVal) threshVal.innerText = parseFloat(threshRange.value).toFixed(3);
        });
    }
    if (volRange) {
        const saved = localStorage.getItem('livestream_volume');
        if (saved) {
            volRange.value = saved;
            const volVal = el('livestream-playback-vol-val');
            if (volVal) volVal.innerText = `${Math.round(parseFloat(saved) * 100)}%`;
        }
        volRange.addEventListener('input', () => {
            localStorage.setItem('livestream_volume', volRange.value);
            const volVal = el('livestream-playback-vol-val');
            if (volVal) volVal.innerText = `${Math.round(parseFloat(volRange.value) * 100)}%`;
        });
    }
    if (translationToggle) {
        const saved = localStorage.getItem('livestream_translation');
        if (saved) translationToggle.checked = (saved === 'true');
        translationToggle.addEventListener('change', async () => {
            localStorage.setItem('livestream_translation', translationToggle.checked);
            if (window.isStreamPlaying) {
                if (translationToggle.checked) {
                    if (!window.isTranslationActive) {
                        await startTranslationBackend();
                    }
                } else {
                    if (window.isTranslationActive) {
                        await stopTranslationBackend();
                    }
                }
            }
        });
    }
    if (urlInput) {
        const saved = localStorage.getItem('livestream_url');
        if (saved) urlInput.value = saved;
        urlInput.addEventListener('input', () => localStorage.setItem('livestream_url', urlInput.value));
    }

    window.electronAPI.saveSettings(window.appSettings);
};

async function startTranslationBackend() {
    const statusLbl = el('livestream-status-lbl');
    const consoleBox = el('livestream-console');
    const voiceSelect = el('livestream-voice-preset');
    const langSelect = el('livestream-lang-profile');
    const threshRange = el('livestream-silence-thresh');
    const volRange = el('livestream-playback-vol');
    const audioEl = el('livestream-audio');
    const urlInput = el('livestream-url-input');

    const streamUrl = urlInput ? urlInput.value.trim() : 'LOOPBACK';
    const voice = voiceSelect ? voiceSelect.value : 'ff_siwis';
    const lang = langSelect ? langSelect.value : 'fr-fr';
    const threshold = threshRange ? parseFloat(threshRange.value) : 0.005;
    const volume = volRange ? parseFloat(volRange.value) : 0.80;

    if (statusLbl) statusLbl.innerText = 'INITIALIZING TRANSLATION...';
    if (consoleBox) consoleBox.innerHTML += `\n[System] Spawning translator backend process...\nVoice: ${voice}\nLang: ${lang}\nSensitivity: ${threshold}\nVolume: ${volume}\n\n`;

    // Duck original stream audio to allow clear spoken translation audio
    if (audioEl) {
        audioEl.muted = true;
    }

    const res = await window.electronAPI.startLivestream({
        streamUrl,
        voice,
        lang,
        threshold,
        volume
    });

    if (res && res.success) {
        window.isTranslationActive = true;
        if (statusLbl) statusLbl.innerText = 'TRANSLATING';
        if (consoleBox) consoleBox.innerHTML += `[System] Translator active.\n`;

        window.electronAPI.onLivestreamLog((text) => {
            if (consoleBox) {
                consoleBox.innerHTML += text + '\n';
                consoleBox.scrollTop = consoleBox.scrollHeight;
            }
            if (text && text.includes('[System] Process terminated')) {
                window.resetLivestreamUIState();
            }
        });

        window.electronAPI.onLivestreamVisualizer((fftData) => {
            const bars = document.querySelectorAll('.visualizer-bar');
            if (bars.length && Array.isArray(fftData)) {
                bars.forEach((bar, idx) => {
                    const val = fftData[idx % fftData.length] || 0;
                    const height = Math.max(4, Math.min(60, val * 60));
                    bar.style.height = `${height}px`;
                    if (val > 0.6) {
                        bar.style.background = 'var(--vault-gold)';
                        bar.style.boxShadow = '0 0 10px var(--vault-gold)';
                    } else {
                        bar.style.background = 'var(--vault-accent)';
                        bar.style.boxShadow = '0 0 8px var(--vault-accent)';
                    }
                });
            }
        });
    } else {
        const err = (res && res.error) ? res.error : 'Unknown error starting translator';
        if (statusLbl) statusLbl.innerText = 'PLAYING ONLY';
        if (consoleBox) consoleBox.innerHTML += `\n[Error] ${err}\n`;
        window.showToast(err, 'error');
        
        // Unmute stream audio since translation failed
        if (audioEl) {
            audioEl.muted = false;
        }
        window.isTranslationActive = false;
    }
}

async function stopTranslationBackend() {
    const statusLbl = el('livestream-status-lbl');
    const consoleBox = el('livestream-console');
    const audioEl = el('livestream-audio');

    if (statusLbl) statusLbl.innerText = 'STOPPING TRANSLATION...';
    await window.electronAPI.stopLivestream();
    window.electronAPI.offLivestreamLog();
    window.electronAPI.offLivestreamVisualizer();
    window.isTranslationActive = false;

    // Restore original stream audio volume
    if (audioEl) {
        audioEl.muted = false;
    }

    if (statusLbl) statusLbl.innerText = 'PLAYING ONLY';
    if (consoleBox) consoleBox.innerHTML += '\n[System] Translator deactivated.\n';
}

window.resetLivestreamUIState = function() {
    window.isStreamPlaying = false;
    window.isTranslationActive = false;
    
    const btnToggle = el('btn-livestream-toggle');
    const statusLbl = el('livestream-status-lbl');
    const audioEl = el('livestream-audio');
    
    if (btnToggle) {
        btnToggle.style.background = 'var(--vault-gold)';
        btnToggle.style.color = '#0b0813';
        const span = btnToggle.querySelector('span');
        if (span) span.innerText = 'Start Player';
        btnToggle.disabled = false;
    }
    if (statusLbl) {
        statusLbl.innerText = 'STANDBY';
    }
    if (audioEl) {
        audioEl.pause();
        audioEl.src = '';
        audioEl.muted = false;
    }
};

window.initLivestreamListeners = function() {
    console.log('[livestream] Initializing livestream UI component...');
    
    // Populate Kokoro voice activity visualizer bars
    const vizContainer = el('kokoro-visualizer-bars');
    if (vizContainer) {
        vizContainer.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            const bar = document.createElement('div');
            bar.className = 'visualizer-bar';
            bar.style.width = '10px';
            bar.style.height = '4px';
            bar.style.background = 'var(--vault-accent)';
            bar.style.borderRadius = '2px';
            bar.style.boxShadow = '0 0 8px var(--vault-accent)';
            bar.style.transition = 'height 0.08s ease, background 0.2s';
            vizContainer.appendChild(bar);
        }
    }

    const btnToggle = el('btn-livestream-toggle');
    const statusLbl = el('livestream-status-lbl');
    const consoleBox = el('livestream-console');

    if (btnToggle) {
        btnToggle.addEventListener('click', async () => {
            const urlInputEl = el('livestream-url-input');
            const translationToggleEl = el('livestream-translation-toggle');
            const streamUrl = urlInputEl ? urlInputEl.value.trim() : 'LOOPBACK';
            const audioEl = el('livestream-audio');

            if (window.isStreamPlaying) {
                // STOP PLAYER/STREAM
                btnToggle.disabled = true;
                if (window.isTranslationActive) {
                    await stopTranslationBackend();
                }
                window.resetLivestreamUIState();
                if (consoleBox) consoleBox.innerHTML += '\n[System] Disconnected from stream.\n';
            } else {
                // START PLAYER/STREAM
                btnToggle.disabled = true;
                if (consoleBox) consoleBox.innerHTML = `[System] Connecting to stream target: ${streamUrl}...\n`;
                
                let isTranslationChecked = translationToggleEl && translationToggleEl.checked;
                let streamPlayedNatively = false;

                if (streamUrl && streamUrl.toUpperCase() !== 'LOOPBACK' && audioEl) {
                    if (!isTranslationChecked) {
                        audioEl.src = streamUrl;
                        try {
                            await audioEl.play();
                            streamPlayedNatively = true;
                            if (consoleBox) consoleBox.innerHTML += `[System] Playing remote audio stream normally.\n`;
                        } catch (playErr) {
                            if (consoleBox) consoleBox.innerHTML += `[System Warning] Standard audio player could not play this stream format natively: ${playErr.message}\n`;
                            window.showToast('Audio playback not supported natively. Falling back to translation backend.', 'warning');
                            isTranslationChecked = true;
                            if (translationToggleEl) {
                                translationToggleEl.checked = true;
                            }
                        }
                    } else {
                        // Translation is checked: backend will handle audio capture, no need to play original natively in frontend
                        if (consoleBox) consoleBox.innerHTML += `[System] Real-time translation enabled. Bypassing frontend audio player.\n`;
                    }
                } else if (streamUrl && streamUrl.toUpperCase() === 'LOOPBACK') {
                    if (consoleBox) consoleBox.innerHTML += `[System] Capturing loopback system audio.\n`;
                }

                window.isStreamPlaying = true;
                btnToggle.style.background = 'var(--vault-signal-alert, #FF6B7A)';
                btnToggle.style.color = '#fff';
                btnToggle.querySelector('span').innerText = 'Stop Player';
                if (statusLbl) statusLbl.innerText = isTranslationChecked ? 'TRANSLATING' : 'PLAYING ONLY';

                // If translation toggle is checked, also start translation!
                if (isTranslationChecked) {
                    await startTranslationBackend();
                }

                btnToggle.disabled = false;
            }
        });
    }
};
