/* ==========================================================================
   Vault Explorer — Audio Bottom Bar Playback Controls
   ========================================================================== */

(function () {
    let audioEl = null;
    let currentPlaylist = [];
    let currentIndex = -1;
    let isPlaying = false;

    function getAudio() {
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.style.display = 'none';
            document.body.appendChild(audioEl);
        }
        return audioEl;
    }

    function updatePlayButton() {
        const btn = el('audio-bar-play');
        if (!btn) return;
        btn.innerHTML = isPlaying
            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    }

    function updateTrackInfo(item) {
        const title = el('audio-bar-title');
        const artist = el('audio-bar-artist');
        if (title) title.innerText = item.name.replace(/\.[^.]+$/, '');
        if (artist) artist.innerText = item.artist || item.folder || 'Unknown';
    }

    function updateProgress() {
        const a = getAudio();
        const fill = el('audio-bar-progress-fill');
        const cur = el('audio-bar-current-time');
        const dur = el('audio-bar-duration');
        if (!a || !fill) return;

        const pct = a.duration ? (a.currentTime / a.duration) * 100 : 0;
        fill.style.width = pct + '%';

        if (cur) cur.innerText = window.formatDuration(a.currentTime);
        if (dur) dur.innerText = window.formatDuration(a.duration || 0);
    }

    function seekTo(clientX) {
        const track = el('audio-bar-progress-track');
        const a = getAudio();
        if (!track || !a || !a.duration) return;
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        a.currentTime = pct * a.duration;
        updateProgress();
    }

    function playTrack(index) {
        if (!currentPlaylist.length) return;
        currentIndex = (index + currentPlaylist.length) % currentPlaylist.length;
        const item = currentPlaylist[currentIndex];
        const a = getAudio();

        a.src = window.sanitizePath(item.path);
        a.load();
        a.play().then(() => {
            isPlaying = true;
            updatePlayButton();
            updateTrackInfo(item);
        }).catch(e => {
            console.error('Audio playback error:', e);
            window.showToast('Could not play audio file', 'error');
        });

        // Show bottom bar
        const bar = el('audio-bottom-bar');
        if (bar) bar.style.display = 'flex';
    }

    function togglePlay() {
        const a = getAudio();
        if (!a.src) return;
        if (a.paused) {
            a.play().then(() => { isPlaying = true; updatePlayButton(); });
        } else {
            a.pause();
            isPlaying = false;
            updatePlayButton();
        }
    }

    function setupListeners() {
        const a = getAudio();

        a.addEventListener('timeupdate', updateProgress);
        a.addEventListener('ended', () => {
            if (currentIndex + 1 < currentPlaylist.length) {
                playTrack(currentIndex + 1);
            } else {
                isPlaying = false;
                updatePlayButton();
            }
        });

        const prevBtn = el('audio-bar-prev');
        const playBtn = el('audio-bar-play');
        const nextBtn = el('audio-bar-next');
        const volInput = el('audio-bar-volume');
        const progressTrack = el('audio-bar-progress-track');

        if (prevBtn) prevBtn.addEventListener('click', () => playTrack(currentIndex - 1));
        if (playBtn) playBtn.addEventListener('click', togglePlay);
        if (nextBtn) nextBtn.addEventListener('click', () => playTrack(currentIndex + 1));

        if (volInput) {
            volInput.addEventListener('input', (e) => {
                getAudio().volume = parseFloat(e.target.value);
            });
            getAudio().volume = parseFloat(volInput.value);
        }

        if (progressTrack) {
            progressTrack.addEventListener('click', (e) => seekTo(e.clientX));
        }
    }

    // Global API
    window.playAudio = function (item, playlist, index) {
        currentPlaylist = playlist || [item];
        currentIndex = -1;
        playTrack(index || 0);
    };

    setupListeners();
})();
