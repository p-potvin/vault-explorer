/* ==========================================================================
   Vault Explorer — Modular Playlist View Engine & Audio Visualizer
   ========================================================================== */

(function () {
    window.playlistViewActive = false;
    window.playlistAudioPlayer = new Audio();
    window.playlistAudioPlayer.volume = 0.8;
    
    let audioCtx = null;
    let analyser = null;
    let source = null;
    let visualizerAnimationId = null;
    let currentTrackIndex = -1;
    let tracksInPlaylist = [];

    // Inject Playlist View CSS dynamically
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .spinning {
            animation: spin 12s linear infinite;
            animation-play-state: running;
        }

        .spinning.paused {
            animation-play-state: paused;
        }

        .playlist-track-row {
            display: flex;
            align-items: center;
            padding: 10px 16px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.03);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            gap: 12px;
        }

        .playlist-track-row:hover {
            background: rgba(229, 169, 59, 0.08);
            border-color: rgba(229, 169, 59, 0.2);
            transform: translateX(4px);
        }

        .playlist-track-row.active {
            background: rgba(168, 85, 247, 0.12);
            border-color: rgba(168, 85, 247, 0.4);
            box-shadow: 0 0 15px rgba(168, 85, 247, 0.15);
        }

        .playlist-track-row.playing {
            background: rgba(229, 169, 59, 0.12);
            border-color: rgba(229, 169, 59, 0.4);
            box-shadow: 0 0 15px rgba(229, 169, 59, 0.15);
        }

        .track-index-col {
            width: 24px;
            font-size: 11px;
            font-family: var(--font-mono, monospace);
            color: var(--vault-slate, #6b7280);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .track-play-state-icon {
            display: none;
            width: 14px;
            height: 14px;
            color: var(--vault-accent, #E5A93B);
        }

        .playlist-track-row.active .track-index-col,
        .playlist-track-row.playing .track-index-col {
            color: var(--vault-accent, #E5A93B);
        }

        .track-title-col {
            flex: 1;
            font-size: 12.5px;
            font-weight: 550;
            color: #ffffff;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .track-path-col {
            font-size: 10.5px;
            color: var(--vault-slate, #6b7280);
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .track-duration-col {
            width: 50px;
            font-size: 11px;
            font-family: var(--font-mono, monospace);
            color: var(--vault-slate, #6b7280);
            text-align: right;
        }

        /* Pulsing audio wave animation */
        .audio-wave-pulse {
            display: flex;
            align-items: flex-end;
            gap: 2px;
            width: 14px;
            height: 12px;
        }

        .audio-wave-bar {
            width: 2px;
            height: 100%;
            background-color: var(--vault-accent, #E5A93B);
            animation: pulse-wave 1s ease-in-out infinite alternate;
        }

        .audio-wave-bar:nth-child(2) { animation-delay: 0.2s; }
        .audio-wave-bar:nth-child(3) { animation-delay: 0.4s; }

        @keyframes pulse-wave {
            0% { height: 20%; }
            100% { height: 100%; }
        }
    `;
    document.head.appendChild(styleEl);

    // Initialize/Bind toggles
    window.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = el('btn-playlist-view-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => window.togglePlaylistView());
        }

        // Handle Audio Player End event to play next track automatically
        window.playlistAudioPlayer.addEventListener('ended', () => {
            playNextTrack();
        });

        // Sync visual styles with audio player state changes
        window.playlistAudioPlayer.addEventListener('play', () => {
            const vinyl = el('playlist-vinyl-disc');
            if (vinyl) {
                vinyl.classList.add('spinning');
                vinyl.classList.remove('paused');
            }
            updateTrackRowVisualStates();
        });

        window.playlistAudioPlayer.addEventListener('pause', () => {
            const vinyl = el('playlist-vinyl-disc');
            if (vinyl) {
                vinyl.classList.add('paused');
            }
            updateTrackRowVisualStates();
        });
    });

    window.togglePlaylistView = function (forceState) {
        const toggleBtn = el('btn-playlist-view-toggle');
        const fileGrid = el('file-grid');
        const container = el('playlist-view-container');

        if (!toggleBtn) return;

        window.playlistViewActive = forceState !== undefined ? forceState : !window.playlistViewActive;

        if (window.playlistViewActive) {
            toggleBtn.innerHTML = `☰ Grid View`;
            toggleBtn.style.background = 'rgba(168, 85, 247, 0.1)';
            toggleBtn.style.color = '#c084fc';
            toggleBtn.style.borderColor = '#a855f7';

            if (fileGrid) fileGrid.style.display = 'none';
            if (container) container.style.display = 'flex';

            window.renderPlaylistTracks();
            setupVisualizerEngine();
        } else {
            toggleBtn.innerHTML = `🎵 Playlist View`;
            toggleBtn.style.background = 'rgba(229, 169, 59, 0.1)';
            toggleBtn.style.color = 'var(--vault-accent)';
            toggleBtn.style.borderColor = 'var(--vault-accent)';

            if (fileGrid) fileGrid.style.display = 'grid';
            if (container) container.style.display = 'none';

            // Clean up player and visualizers when going back to grid
            window.playlistAudioPlayer.pause();
            const vinyl = el('playlist-vinyl-disc');
            if (vinyl) {
                vinyl.classList.remove('spinning', 'paused');
            }
            cancelAnimationFrame(visualizerAnimationId);
        }
    };

    window.renderPlaylistTracks = function () {
        const listContainer = el('playlist-tracks-list');
        const totalLbl = el('playlist-total-tracks');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        tracksInPlaylist = [];

        // Build list of only audio files in window.displayedItems
        if (window.displayedItems) {
            window.displayedItems.forEach((item, index) => {
                if (item.type === 'audio') {
                    tracksInPlaylist.push({ item, index });
                }
            });
        }

        if (totalLbl) {
            totalLbl.innerText = `${tracksInPlaylist.length} Tracks`;
        }

        if (tracksInPlaylist.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state" style="padding: 40px; text-align: center; color: var(--vault-slate);">
                    <p>No audio files or playlists found in this directory.</p>
                </div>
            `;
            return;
        }

        tracksInPlaylist.forEach((trackInfo, idx) => {
            const item = trackInfo.item;
            const index = trackInfo.index;

            const row = document.createElement('div');
            row.className = `playlist-track-row ${currentTrackIndex === index ? 'active' : ''}`;
            row.dataset.index = index;

            const cleanName = item.name.replace(/\.[^.]+$/, '');
            const parentFolder = item.path.split(/[\\/]/).slice(-2, -1)[0] || '';

            // Attempt to pre-calculate metadata
            const durationText = item.duration ? window.formatDuration(item.duration) : '--:--';

            row.innerHTML = `
                <div class="track-index-col" id="track-index-col-${index}">
                    <span class="track-num-txt">${idx + 1}</span>
                    <div class="audio-wave-pulse" style="display:none;">
                        <div class="audio-wave-bar"></div>
                        <div class="audio-wave-bar"></div>
                        <div class="audio-wave-bar"></div>
                    </div>
                </div>
                <div class="track-title-col">${cleanName}</div>
                <div class="track-path-col">${parentFolder}</div>
                <div class="track-duration-col">${durationText}</div>
            `;

            // Row selection and play trigger
            row.addEventListener('click', () => {
                highlightTrackRow(index);
                loadTrackSidebarDetails(item);
            });

            row.addEventListener('dblclick', () => {
                playTrack(index);
            });

            listContainer.appendChild(row);
        });

        // Trigger visual sync check
        updateTrackRowVisualStates();
    };

    function highlightTrackRow(index) {
        document.querySelectorAll('.playlist-track-row').forEach(row => {
            const rowIdx = parseInt(row.dataset.index);
            row.classList.toggle('active', rowIdx === index);
        });
    }

    function loadTrackSidebarDetails(item) {
        const titleEl = el('playlist-current-title');
        const artistEl = el('playlist-current-artist');
        const formatEl = el('playlist-stat-format');
        const sizeEl = el('playlist-stat-size');
        const durationEl = el('playlist-stat-duration');

        if (titleEl) titleEl.innerText = item.name.replace(/\.[^.]+$/, '');
        if (artistEl) {
            const parentFolder = item.path.split(/[\\/]/).slice(-2, -1)[0] || '';
            artistEl.innerText = `Folder: ${parentFolder}`;
        }

        const ext = item.name.split('.').pop().toUpperCase();
        if (formatEl) formatEl.innerText = ext;
        if (sizeEl) sizeEl.innerText = item.size ? window.formatBytes(item.size) : '--';
        if (durationEl) durationEl.innerText = item.duration ? window.formatDuration(item.duration) : '--:--';
    }

    function playTrack(index) {
        const trackInfo = tracksInPlaylist.find(t => t.index === index);
        if (!trackInfo) return;

        // Force cleanup of any hover sounds running
        if (window.hoverAudioPreview) {
            try { window.hoverAudioPreview.pause(); } catch(e) {}
            window.hoverAudioPreview = null;
        }

        currentTrackIndex = index;
        const item = trackInfo.item;

        window.playlistAudioPlayer.src = window.sanitizePath(item.path);
        loadTrackSidebarDetails(item);
        highlightTrackRow(index);

        window.playlistAudioPlayer.play()
            .then(() => {
                if (window.showToast) window.showToast(`Now Playing: ${item.name}`, 'success');
            })
            .catch(err => {
                console.error("Playback failed:", err);
                if (window.showToast) window.showToast("Failed to initiate audio track playback", "error");
            });

        updateTrackRowVisualStates();
    }

    function playNextTrack() {
        if (tracksInPlaylist.length <= 1) return;

        const currentIdxInPlaylist = tracksInPlaylist.findIndex(t => t.index === currentTrackIndex);
        if (currentIdxInPlaylist === -1) {
            // Nothing active yet, play first track
            playTrack(tracksInPlaylist[0].index);
            return;
        }

        const nextIdxInPlaylist = (currentIdxInPlaylist + 1) % tracksInPlaylist.length;
        playTrack(tracksInPlaylist[nextIdxInPlaylist].index);
    }

    function updateTrackRowVisualStates() {
        const isPlaying = !window.playlistAudioPlayer.paused && window.playlistAudioPlayer.src;

        document.querySelectorAll('.playlist-track-row').forEach(row => {
            const idx = parseInt(row.dataset.index);
            const numTxt = row.querySelector('.track-num-txt');
            const waveAnim = row.querySelector('.audio-wave-pulse');

            if (idx === currentTrackIndex) {
                row.classList.add('playing');
                if (numTxt) numTxt.style.display = 'none';
                if (waveAnim) {
                    waveAnim.style.display = isPlaying ? 'flex' : 'none';
                }
            } else {
                row.classList.remove('playing');
                if (numTxt) numTxt.style.display = 'block';
                if (waveAnim) waveAnim.style.display = 'none';
            }
        });
    }

    // Audio Visualizer Core Engine
    function setupVisualizerEngine() {
        const canvas = el('playlist-visualizer-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const player = window.playlistAudioPlayer;

        // Try setting up web audio API first
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 64;
                source = audioCtx.createMediaElementSource(player);
                source.connect(analyser);
                analyser.connect(audioCtx.destination);
            } catch (e) {
                console.log("[Visualizer] Standard Web Audio node blocked (CORS/Platform). Activating Generative Fallback.");
                setupGenerativeFallback(canvas, ctx, player);
                return;
            }
        }

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function drawRealtimeWave() {
            if (!window.playlistViewActive) return;
            visualizerAnimationId = requestAnimationFrame(drawRealtimeWave);

            analyser.getByteFrequencyData(dataArray);

            ctx.fillStyle = '#080610';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 1.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i] / 3.5; // Scale height appropriately
                
                // Neon glow styling
                const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, '#6366f1'); // Indigo
                gradient.addColorStop(0.5, '#a855f7'); // Purple
                gradient.addColorStop(1, '#E5A93B'); // Gold
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
                
                x += barWidth;
            }
        }

        cancelAnimationFrame(visualizerAnimationId);
        drawRealtimeWave();
    }

    // High fidelity generative fallback when native audio context triggers security exceptions on local resources
    function setupGenerativeFallback(canvas, ctx, player) {
        function drawGenerativeWave() {
            if (!window.playlistViewActive) return;
            visualizerAnimationId = requestAnimationFrame(drawGenerativeWave);

            ctx.fillStyle = '#080610';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const isPlaying = !player.paused;
            const time = Date.now() * 0.005;

            const bars = 24;
            const barWidth = canvas.width / bars;

            for (let i = 0; i < bars; i++) {
                let heightFactor = isPlaying ? Math.sin(time + i * 0.4) * 0.5 + 0.5 : 0.08;
                
                // Spiky micro-animations during real playing state
                if (isPlaying && Math.random() > 0.82) {
                    heightFactor += Math.random() * 0.35;
                }

                const barHeight = Math.max(3, heightFactor * canvas.height * 0.75);

                const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, '#6366f1');
                gradient.addColorStop(0.5, '#a855f7');
                gradient.addColorStop(1, '#E5A93B');

                ctx.fillStyle = gradient;
                ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 2, barHeight);
            }
        }

        cancelAnimationFrame(visualizerAnimationId);
        drawGenerativeWave();
    }

})();
