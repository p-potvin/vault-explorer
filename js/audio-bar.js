/* ==========================================================================
   Vault Explorer — Audio Bottom Bar Playback Controls
   Complete playback suite: Play/Pause, Next/Prev, Seek Scrubber, Volume/Mute,
   Shuffle, Repeat (Off / All / One), MediaSession API, Spacebar hotkey,
   and persistent playback state.
   ========================================================================== */

(function () {
    const STATE_KEY = 'vault-audio-playback-state';

    let audioEl = null;
    let currentPlaylist = [];
    let currentIndex = -1;
    let isPlaying = false;
    let isShuffle = false;
    let repeatMode = 'off'; // 'off' | 'all' | 'one'
    let shuffledIndices = [];
    let shufflePos = -1;
    let isMuted = false;
    let prevVolume = 0.8;
    let isDraggingSeek = false;

    function getAudio() {
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.style.display = 'none';
            audioEl.preload = 'metadata';
            document.body.appendChild(audioEl);
        }
        return audioEl;
    }

    // ── Persistent state ────────────────────────────────────────────────────
    function loadSavedState() {
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function saveCurrentState() {
        if (!currentPlaylist.length || currentIndex < 0) return;
        const item = currentPlaylist[currentIndex];
        const a = getAudio();
        const state = {
            trackPath: item ? item.path : null,
            currentTime: a ? a.currentTime : 0,
            volume: a ? a.volume : 0.8,
            isShuffle,
            repeatMode,
        };
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch (_) {}
    }

    // ── Shuffle generator ───────────────────────────────────────────────────
    function buildShuffleQueue(startIdx) {
        shuffledIndices = currentPlaylist.map((_, i) => i);
        // Fisher-Yates shuffle
        for (let i = shuffledIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
        }
        // Ensure startIdx is first in queue if specified
        if (startIdx >= 0 && startIdx < currentPlaylist.length) {
            const pos = shuffledIndices.indexOf(startIdx);
            if (pos !== -1) {
                shuffledIndices.splice(pos, 1);
                shuffledIndices.unshift(startIdx);
            }
            shufflePos = 0;
        } else {
            shufflePos = 0;
        }
    }

    // ── UI Updates ──────────────────────────────────────────────────────────
    function updatePlayButton() {
        const btn = el('audio-bar-play');
        if (!btn) return;
        btn.innerHTML = isPlaying
            ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`
            : `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    }

    function updateTrackInfo(item) {
        const title = el('audio-bar-title');
        const artist = el('audio-bar-artist');
        if (title) title.innerText = item.name ? item.name.replace(/\.[^.]+$/, '') : '--';
        if (artist) artist.innerText = item.artist || item.folder || 'Unknown Artist';

        // Update MediaSession API for OS integration
        if ('mediaSession' in navigator && item) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: item.name ? item.name.replace(/\.[^.]+$/, '') : 'Track',
                    artist: item.artist || item.folder || 'Vault Explorer',
                    album: item.folder || 'Vault Music',
                });
            } catch (_) {}
        }
    }

    function updateProgress() {
        if (isDraggingSeek) return;
        const a = getAudio();
        const fill = el('audio-bar-progress-fill');
        const cur = el('audio-bar-current-time');
        const dur = el('audio-bar-duration');
        if (!a || !fill) return;

        const duration = a.duration || 0;
        const current = a.currentTime || 0;
        const pct = duration > 0 ? (current / duration) * 100 : 0;
        fill.style.width = pct + '%';

        if (cur) cur.innerText = window.formatDuration(current);
        if (dur) dur.innerText = window.formatDuration(duration);
    }

    function updateShuffleUI() {
        const btn = el('audio-bar-shuffle');
        if (!btn) return;
        btn.style.color = isShuffle ? 'var(--vault-accent)' : 'var(--vault-slate)';
        btn.style.background = isShuffle ? 'rgba(176, 124, 255, 0.15)' : 'transparent';
        btn.title = isShuffle ? 'Shuffle: On' : 'Shuffle: Off';
    }

    function updateRepeatUI() {
        const btn = el('audio-bar-repeat');
        const badge = el('audio-bar-repeat-one-badge');
        if (!btn) return;

        if (repeatMode === 'off') {
            btn.style.color = 'var(--vault-slate)';
            btn.style.background = 'transparent';
            btn.title = 'Repeat: Off';
            if (badge) badge.style.display = 'none';
        } else if (repeatMode === 'all') {
            btn.style.color = 'var(--vault-accent)';
            btn.style.background = 'rgba(176, 124, 255, 0.15)';
            btn.title = 'Repeat: All';
            if (badge) badge.style.display = 'none';
        } else if (repeatMode === 'one') {
            btn.style.color = 'var(--vault-accent)';
            btn.style.background = 'rgba(176, 124, 255, 0.15)';
            btn.title = 'Repeat: Current Track';
            if (badge) badge.style.display = 'inline';
        }
    }

    function updateVolumeIcon(vol) {
        const icon = el('audio-bar-volume-icon');
        if (!icon) return;
        if (vol === 0 || isMuted) {
            icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
        } else if (vol < 0.5) {
            icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
        } else {
            icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`;
        }
    }

    // ── Playback Engine ─────────────────────────────────────────────────────
    function playTrack(index, startTime = 0) {
        if (!currentPlaylist.length) return;
        currentIndex = (index + currentPlaylist.length) % currentPlaylist.length;
        const item = currentPlaylist[currentIndex];
        const a = getAudio();

        if (isShuffle && (shuffledIndices.length !== currentPlaylist.length || !shuffledIndices.includes(currentIndex))) {
            buildShuffleQueue(currentIndex);
        }

        a.src = window.sanitizePath(item.path);
        a.load();

        if (startTime > 0) {
            a.currentTime = startTime;
        }

        a.play().then(() => {
            isPlaying = true;
            updatePlayButton();
            updateTrackInfo(item);
            saveCurrentState();
        }).catch(e => {
            console.error('[audio-bar] Playback error:', e);
            if (window.showToast) window.showToast('Could not play audio track: ' + item.name, 'error');
            isPlaying = false;
            updatePlayButton();
        });

        // Show bottom bar
        const bar = el('audio-bottom-bar');
        if (bar) bar.style.display = 'flex';
    }

    function togglePlay() {
        const a = getAudio();
        if (!a.src) {
            if (currentPlaylist.length > 0) {
                playTrack(0);
            }
            return;
        }
        if (a.paused) {
            a.play().then(() => {
                isPlaying = true;
                updatePlayButton();
                saveCurrentState();
            }).catch(e => console.error('[audio-bar] Resume error:', e));
        } else {
            a.pause();
            isPlaying = false;
            updatePlayButton();
            saveCurrentState();
        }
    }

    function nextTrack() {
        if (!currentPlaylist.length) return;
        if (isShuffle) {
            shufflePos = (shufflePos + 1) % shuffledIndices.length;
            playTrack(shuffledIndices[shufflePos]);
        } else {
            playTrack(currentIndex + 1);
        }
    }

    function prevTrack() {
        const a = getAudio();
        if (a && a.currentTime > 3) {
            a.currentTime = 0;
            updateProgress();
            return;
        }
        if (!currentPlaylist.length) return;
        if (isShuffle) {
            shufflePos = (shufflePos - 1 + shuffledIndices.length) % shuffledIndices.length;
            playTrack(shuffledIndices[shufflePos]);
        } else {
            playTrack(currentIndex - 1);
        }
    }

    function toggleShuffle() {
        isShuffle = !isShuffle;
        if (isShuffle) {
            buildShuffleQueue(currentIndex);
        }
        updateShuffleUI();
        saveCurrentState();
        if (window.showToast) window.showToast(`Shuffle: ${isShuffle ? 'On' : 'Off'}`, 'info');
    }

    function toggleRepeat() {
        if (repeatMode === 'off') repeatMode = 'all';
        else if (repeatMode === 'all') repeatMode = 'one';
        else repeatMode = 'off';

        updateRepeatUI();
        saveCurrentState();
        const modeLabels = { off: 'Repeat: Off', all: 'Repeat: All Tracks', one: 'Repeat: Single Track' };
        if (window.showToast) window.showToast(modeLabels[repeatMode], 'info');
    }

    function toggleMute() {
        const a = getAudio();
        const volInput = el('audio-bar-volume');
        isMuted = !isMuted;
        if (isMuted) {
            prevVolume = a.volume || 0.8;
            a.volume = 0;
            if (volInput) volInput.value = 0;
        } else {
            a.volume = prevVolume > 0 ? prevVolume : 0.8;
            if (volInput) volInput.value = a.volume;
        }
        updateVolumeIcon(a.volume);
    }

    function seekToEvent(e) {
        const track = el('audio-bar-progress-track');
        const a = getAudio();
        if (!track || !a || !a.duration) return;
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        a.currentTime = pct * a.duration;
        updateProgress();
    }

    // ── Setup Listeners ─────────────────────────────────────────────────────
    function setupListeners() {
        const a = getAudio();

        // Audio events
        a.addEventListener('timeupdate', updateProgress);
        a.addEventListener('ended', () => {
            if (repeatMode === 'one') {
                a.currentTime = 0;
                a.play().catch(() => {});
            } else if (repeatMode === 'all') {
                nextTrack();
            } else {
                // Repeat off: stop at end of playlist
                if (isShuffle) {
                    if (shufflePos + 1 < shuffledIndices.length) {
                        nextTrack();
                    } else {
                        isPlaying = false;
                        updatePlayButton();
                    }
                } else {
                    if (currentIndex + 1 < currentPlaylist.length) {
                        nextTrack();
                    } else {
                        isPlaying = false;
                        updatePlayButton();
                    }
                }
            }
        });

        a.addEventListener('play', () => { isPlaying = true; updatePlayButton(); });
        a.addEventListener('pause', () => { isPlaying = false; updatePlayButton(); });

        // UI Controls
        const closeBtn = el('audio-bar-close');
        const prevBtn = el('audio-bar-prev');
        const playBtn = el('audio-bar-play');
        const nextBtn = el('audio-bar-next');
        const shuffleBtn = el('audio-bar-shuffle');
        const repeatBtn = el('audio-bar-repeat');
        const muteBtn = el('audio-bar-mute-btn');
        const volInput = el('audio-bar-volume');
        const progressTrack = el('audio-bar-progress-track');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                a.pause();
                isPlaying = false;
                updatePlayButton();
                const bar = el('audio-bottom-bar');
                if (bar) bar.style.display = 'none';
            });
        }

        if (prevBtn) prevBtn.addEventListener('click', prevTrack);
        if (playBtn) playBtn.addEventListener('click', togglePlay);
        if (nextBtn) nextBtn.addEventListener('click', nextTrack);
        if (shuffleBtn) shuffleBtn.addEventListener('click', toggleShuffle);
        if (repeatBtn) repeatBtn.addEventListener('click', toggleRepeat);
        if (muteBtn) muteBtn.addEventListener('click', toggleMute);

        if (volInput) {
            volInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                isMuted = val === 0;
                a.volume = val;
                updateVolumeIcon(val);
                saveCurrentState();
            });
            a.volume = parseFloat(volInput.value || 0.8);
            updateVolumeIcon(a.volume);
        }

        // Progress scrubber drag & click
        if (progressTrack) {
            progressTrack.addEventListener('mousedown', (e) => {
                isDraggingSeek = true;
                seekToEvent(e);
                const onMove = (moveEv) => { if (isDraggingSeek) seekToEvent(moveEv); };
                const onUp = () => {
                    isDraggingSeek = false;
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        }

        // Global Spacebar & Arrow hotkeys for audio playback
        window.addEventListener('keydown', (e) => {
            const active = document.activeElement;
            const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
            const isModalOpen = (el('photo-editor-modal')?.style.display === 'flex') || (el('image-viewer-modal')?.classList.contains('active'));
            if (isInput || isModalOpen) return;

            if (e.code === 'Space' && (window.currentTab === 'music' || isPlaying)) {
                e.preventDefault();
                togglePlay();
            } else if (e.code === 'ArrowRight' && e.altKey && isPlaying) {
                e.preventDefault();
                const cur = a.currentTime;
                a.currentTime = Math.min(a.duration || 0, cur + 5);
                updateProgress();
            } else if (e.code === 'ArrowLeft' && e.altKey && isPlaying) {
                e.preventDefault();
                const cur = a.currentTime;
                a.currentTime = Math.max(0, cur - 5);
                updateProgress();
            }
        });

        // MediaSession API action handlers
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.setActionHandler('play', () => { if (!isPlaying) togglePlay(); });
                navigator.mediaSession.setActionHandler('pause', () => { if (isPlaying) togglePlay(); });
                navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
                navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
                navigator.mediaSession.setActionHandler('seekto', (details) => {
                    if (details.seekTime !== undefined && a.duration) {
                        a.currentTime = details.seekTime;
                        updateProgress();
                    }
                });
            } catch (_) {}
        }

        // Restore saved settings
        const saved = loadSavedState();
        if (saved) {
            if (saved.isShuffle) { isShuffle = true; updateShuffleUI(); }
            if (saved.repeatMode) { repeatMode = saved.repeatMode; updateRepeatUI(); }
            if (typeof saved.volume === 'number' && volInput) {
                volInput.value = saved.volume;
                a.volume = saved.volume;
                updateVolumeIcon(saved.volume);
            }
        }
    }

    // ── Global API ──────────────────────────────────────────────────────────
    window.playAudio = function (item, playlist, index) {
        currentPlaylist = playlist || [item];
        currentIndex = -1;
        playTrack(index || 0);
    };

    window.getAudioPlaylist = function () {
        return {
            items: currentPlaylist,
            currentIndex,
            isPlaying,
            isShuffle,
            repeatMode,
        };
    };

    window.toggleAudioPlay = togglePlay;
    window.nextAudioTrack = nextTrack;
    window.prevAudioTrack = prevTrack;

    setupListeners();
})();
