// js/streaming.js - Streaming Details Modal, Season/Episode Picker, Quality & Language-Aware Torrent Ranking

// ─── Helpers ─────────────────────────────────────────────────────────────────


/**
 * Read the user's stream quality preference from settings.
 * Returns one of: '2160p', '1080p', '720p'
 */
function getPreferredQuality() {
    const sel = el('settings-stream-quality');
    return sel ? sel.value : '1080p';
}

/**
 * Read the user's preferred stream language from settings.
 * Returns one of: 'en', 'fr', 'multi'
 */
function getPreferredLang() {
    const sel = el('settings-stream-lang');
    return sel ? sel.value : 'en';
}

/**
 * Return true if the user has "Auto-Select Best Stream" checked.
 */
function isAutoSelectEnabled() {
    const chk = el('settings-stream-auto-select');
    return chk ? chk.checked : false;
}

// Quality hierarchy: higher index = better quality
const QUALITY_RANK = { '2160p': 4, '4k': 4, '1080p': 3, '720p': 2, '480p': 1, 'sd': 0 };

/**
 * Score a torrent entry by how well it matches the user's quality & language preferences.
 * Higher score = better match.
 */
function scoreTorrent(torrent, preferredQuality, preferredLang) {
    let score = 0;
    const q = (torrent.quality || '').toLowerCase();
    const d = (torrent.desc || '').toLowerCase();
    const t = (torrent.type || '').toLowerCase();
    const text = `${q} ${d} ${t}`;

    // ── Quality scoring ─────────────────────────────────────────────────────
    const maxQualityRank = QUALITY_RANK[preferredQuality] ?? 3;

    // Parse the torrent's actual quality
    let torrentQualityRank = 0;
    if (text.includes('2160') || text.includes('4k') || text.includes('uhd')) torrentQualityRank = 4;
    else if (text.includes('1080')) torrentQualityRank = 3;
    else if (text.includes('720')) torrentQualityRank = 2;
    else if (text.includes('480')) torrentQualityRank = 1;

    // Prefer torrents at or below the max quality setting; penalise going over
    if (torrentQualityRank <= maxQualityRank) {
        score += torrentQualityRank * 10;         // closer to max = better
    } else {
        score -= (torrentQualityRank - maxQualityRank) * 5; // slight penalty for exceeding pref
    }

    // ── Language scoring ────────────────────────────────────────────────────
    if (preferredLang === 'fr') {
        if (text.includes('vf') || text.includes('french') || text.includes('truefrench') || text.includes('fr ')) score += 30;
        if (text.includes('multi') || text.includes('dual')) score += 15;
    } else if (preferredLang === 'multi') {
        if (text.includes('multi') || text.includes('dual')) score += 30;
        if (text.includes('vf') || text.includes('french')) score += 10;
    } else {
        // English: penalise obviously non-English only releases
        if (text.includes('truefrench') || (text.includes('vf') && !text.includes('vff'))) score -= 20;
    }

    // ── Source quality bonus ─────────────────────────────────────────────────
    if (text.includes('bluray') || text.includes('blu-ray') || text.includes('remux')) score += 8;
    if (text.includes('web-dl') || text.includes('webrip') || text.includes('webdl')) score += 5;
    if (text.includes('hdr') || text.includes('dolby') || text.includes('dv')) score += 3;

    // ── Seeder bonus (higher = healthier torrent) ───────────────────────────
    const seeds = parseInt(torrent.seeds) || 0;
    score += Math.min(seeds, 500) / 100; // cap at +5 pts

    return score;
}

/**
 * Sort and optionally filter a torrent list by user preferences.
 * Returns a new sorted array.
 */
function rankTorrents(torrents) {
    const quality = getPreferredQuality();
    const lang = getPreferredLang();
    return [...torrents].sort((a, b) => scoreTorrent(b, quality, lang) - scoreTorrent(a, quality, lang));
}


// ─── Details Modal ───────────────────────────────────────────────────────────

let _currentModalTvId = null;
let _currentModalImdbId = null;
let _currentModalTitle = null;
let _currentModalMediaType = null;

/**
 * Open the streaming-details-modal for a media item from the TMDB card grid.
 * @param {object} movie - The media object from the card grid (has id, title, media_type, etc.)
 */
window.showMediaDetails = async function(movie) {
    const modal = el('streaming-details-modal');
    if (!modal) return;

    window._detailsModalJustOpened = true;
    setTimeout(() => { window._detailsModalJustOpened = false; }, 100);

    _currentModalTvId = movie.id;
    _currentModalImdbId = null;
    _currentModalTitle = movie.title;
    _currentModalMediaType = movie.media_type;

    // Show modal immediately with available data
    modal.style.display = 'flex';

    // Reset modal state
    el('streaming-details-header-title').textContent = movie.title;
    el('streaming-details-title').textContent = movie.title;
    el('streaming-details-year').textContent = movie.year || '—';
    el('streaming-details-genres').textContent = movie.genres || '—';
    el('streaming-details-rating').textContent = `★ ${movie.rating || '—'}`;
    el('streaming-details-overview').textContent = movie.overview || '';
    el('streaming-details-poster').src = movie.poster || 'oppenheimer_poster.png';

    // Reset action containers
    const movieActions = el('movie-actions-container');
    const tvActions = el('tv-actions-container');
    const trailerWrapper = el('movie-trailer-wrapper');
    const btnFollow = el('btn-modal-follow');

    if (movieActions) movieActions.style.display = 'none';
    if (tvActions) tvActions.style.display = 'none';
    if (trailerWrapper) trailerWrapper.style.display = 'none';
    if (btnFollow) btnFollow.style.display = 'none';

    const isTV = movie.media_type === 'tv';

    if (isTV) {
        await _setupTVModal(movie);
    } else {
        _setupMovieModal(movie);
    }

    // Setup Add to Library visual state and click handler
    const btnLib = el('btn-modal-library');
    if (btnLib) {
        window.appSettings = window.appSettings || {};
        window.appSettings.library = window.appSettings.library || [];
        const isCurrentlySaved = window.appSettings.library.some(item => item.id === movie.id && item.media_type === movie.media_type);
        
        const plusSvg = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; margin-right:4.5px; display:inline-block; vertical-align:middle;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        const minusSvg = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; margin-right:4.5px; display:inline-block; vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        
        btnLib.innerHTML = isCurrentlySaved 
            ? `${minusSvg}<span>${window.currentLang === 'fr' ? 'Retirer de la bibliothèque' : 'Remove from Library'}</span>` 
            : `${plusSvg}<span>${window.currentLang === 'fr' ? 'Ajouter à la bibliothèque' : 'Add to Library'}</span>`;
        btnLib.style.background = isCurrentlySaved ? 'rgba(245,185,41,0.15)' : 'rgba(255,255,255,0.06)';
        btnLib.style.borderColor = isCurrentlySaved ? 'var(--vault-gold)' : 'var(--vault-border)';
        
        btnLib.onclick = () => {
            window.appSettings.library = window.appSettings.library || [];
            const idx = window.appSettings.library.findIndex(item => item.id === movie.id && item.media_type === movie.media_type);
            let added = false;
            if (idx !== -1) {
                window.appSettings.library.splice(idx, 1);
                window.showToast(window.currentLang === 'fr' ? 'Retiré de la bibliothèque' : 'Removed from Library', 'success');
            } else {
                window.appSettings.library.push(movie);
                window.showToast(window.currentLang === 'fr' ? 'Ajouté à la bibliothèque' : 'Added to Library', 'success');
                added = true;
            }
            
            // Save settings persistently
            window.electronAPI.saveSettings(window.appSettings);
            
            // Live refresh of the library view if open
            if (typeof window.renderFavorites === 'function') {
                window.renderFavorites();
            }
            
            // Live refresh of the catalog results to update golden border/glow instantly
            if (window.currentTab === 'tmdb' && typeof window.searchTMDB === 'function') {
                // If they are on tmdb tab, trigger class update or redraw
                const cards = document.querySelectorAll('.tmdb-movie-card');
                cards.forEach(card => {
                    // Quick check if this card corresponds to this movie
                    if (card.innerHTML.includes(movie.poster)) {
                        if (added) {
                            card.classList.add('in-library');
                            card.style.border = '1.5px solid var(--vault-console-gold)';
                            card.style.boxShadow = '0 0 12px rgba(214, 164, 65, 0.35)';
                        } else {
                            card.classList.remove('in-library');
                            card.style.border = '1px solid var(--vault-border)';
                            card.style.boxShadow = 'none';
                        }
                    }
                });
            }
            
            // Visual feedback on the detail modal button itself
            btnLib.innerHTML = added 
                ? `${minusSvg}<span>${window.currentLang === 'fr' ? 'Retirer de la bibliothèque' : 'Remove from Library'}</span>` 
                : `${plusSvg}<span>${window.currentLang === 'fr' ? 'Ajouter à la bibliothèque' : 'Add to Library'}</span>`;
            btnLib.style.background = added ? 'rgba(245,185,41,0.15)' : 'rgba(255,255,255,0.06)';
            btnLib.style.borderColor = added ? 'var(--vault-gold)' : 'var(--vault-border)';
        };
    }

    // Fetch trailer asynchronously
    _fetchAndInjectTrailer(movie.id, movie.media_type);
};

function _setupMovieModal(movie) {
    const movieActions = el('movie-actions-container');
    if (!movieActions) return;
    movieActions.style.display = 'flex';

    const btnStream = el('btn-stream-movie');
    if (btnStream) {
        btnStream.onclick = () => {
            el('streaming-details-modal').style.display = 'none';
            el('movie-trailer-iframe').src = '';
            window.triggerRDStream(movie.title, movie.id, 'movie');
        };
    }
}

async function _setupTVModal(movie) {
    const tvActions = el('tv-actions-container');
    const seasonSelect = el('tv-season-select');
    const episodesList = el('tv-episodes-list');
    const btnFollow = el('btn-modal-follow');

    if (!tvActions || !seasonSelect || !episodesList) return;

    tvActions.style.display = 'flex';
    if (btnFollow) {
        btnFollow.style.display = 'flex';
        
        window.appSettings = window.appSettings || {};
        window.appSettings.followedShows = window.appSettings.followedShows || [];
        const isFollowed = window.appSettings.followedShows.some(id => id === movie.id);
        
        const plusSvg = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; margin-right:4.5px; display:inline-block; vertical-align:middle;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        const minusSvg = `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; margin-right:4.5px; display:inline-block; vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        
        btnFollow.innerHTML = isFollowed
            ? `${minusSvg}<span>${window.currentLang === 'fr' ? 'Ne plus suivre' : 'Unfollow Show'}</span>`
            : `${plusSvg}<span>${window.currentLang === 'fr' ? 'Suivre la série' : 'Follow Show'}</span>`;
        btnFollow.style.background = isFollowed ? 'rgba(245,185,41,0.15)' : 'rgba(255,255,255,0.06)';
        btnFollow.style.borderColor = isFollowed ? 'var(--vault-gold)' : 'var(--vault-border)';
        
        btnFollow.onclick = () => {
            window.appSettings.followedShows = window.appSettings.followedShows || [];
            const idx = window.appSettings.followedShows.indexOf(movie.id);
            let followed = false;
            if (idx !== -1) {
                window.appSettings.followedShows.splice(idx, 1);
                window.showToast(window.currentLang === 'fr' ? 'Série retirée des suivis' : 'Unfollowed Show', 'success');
            } else {
                window.appSettings.followedShows.push(movie.id);
                window.showToast(window.currentLang === 'fr' ? 'Série ajoutée aux suivis' : 'Followed Show', 'success');
                followed = true;
            }
            window.electronAPI.saveSettings(window.appSettings);
            
            btnFollow.innerHTML = followed
                ? `${minusSvg}<span>${window.currentLang === 'fr' ? 'Ne plus suivre' : 'Unfollow Show'}</span>`
                : `${plusSvg}<span>${window.currentLang === 'fr' ? 'Suivre la série' : 'Follow Show'}</span>`;
            btnFollow.style.background = followed ? 'rgba(245,185,41,0.15)' : 'rgba(255,255,255,0.06)';
            btnFollow.style.borderColor = followed ? 'var(--vault-gold)' : 'var(--vault-border)';
        };
    }

    seasonSelect.innerHTML = '<option value="">Loading seasons...</option>';
    episodesList.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--vault-slate); padding:20px;">Loading...</td></tr>';

    try {
        const tvRes = await window.electronAPI.getTMDBTV(movie.id);
        if (!tvRes || !tvRes.success || !tvRes.data) {
            seasonSelect.innerHTML = '<option value="">No seasons found</option>';
            return;
        }

        const tvData = tvRes.data;

        // Cache IMDB ID if available
        if (tvData.external_ids && tvData.external_ids.imdb_id) {
            _currentModalImdbId = tvData.external_ids.imdb_id;
        }

        // Update overview with full version if richer
        if (tvData.overview) {
            el('streaming-details-overview').textContent = tvData.overview;
        }

        // Populate season dropdown — exclude specials (season_number 0) unless it's the only one
        const seasons = (tvData.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
        if (seasons.length === 0) {
            seasonSelect.innerHTML = '<option value="">No seasons available</option>';
            episodesList.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--vault-slate);padding:16px;">No episodes found.</td></tr>';
            return;
        }

        seasonSelect.innerHTML = seasons.map(s =>
            `<option value="${s.season_number}">${window.escapeHtml(s.name || `Season ${s.season_number}`)} (${s.episode_count} ep.)</option>`
        ).join('');

        // Load episodes for first season
        await _loadSeasonEpisodes(movie.id, seasons[0].season_number);

        // Season change handler
        seasonSelect.onchange = async () => {
            const selectedSeason = parseInt(seasonSelect.value, 10);
            if (!isNaN(selectedSeason)) {
                episodesList.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--vault-slate);padding:16px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>';
                await _loadSeasonEpisodes(movie.id, selectedSeason);
            }
        };

    } catch (e) {
        console.error('[streaming] Failed to set up TV modal:', e);
        seasonSelect.innerHTML = '<option value="">Error loading seasons</option>';
        episodesList.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--vault-signal-alert,#FF6B7A);padding:16px;">${window.escapeHtml(e.message)}</td></tr>`;
    }
}

async function _loadSeasonEpisodes(tvId, seasonNumber) {
    const episodesList = el('tv-episodes-list');
    if (!episodesList) return;

    try {
        const seasonRes = await window.electronAPI.getTMDBTVSeason(tvId, seasonNumber);
        if (!seasonRes || !seasonRes.success || !seasonRes.data) {
            episodesList.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--vault-slate);padding:16px;">No episodes found.</td></tr>';
            return;
        }

        const episodes = seasonRes.data.episodes || [];
        if (episodes.length === 0) {
            episodesList.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--vault-slate);padding:16px;">No episodes in this season.</td></tr>';
            return;
        }

        episodesList.innerHTML = episodes.map(ep => {
            const num = ep.episode_number;
            const title = window.escapeHtml(ep.name || `Episode ${num}`);
            const airDate = ep.air_date ? ep.air_date.substring(0, 7) : '';
            const rating = ep.vote_average ? `★ ${ep.vote_average.toFixed(1)}` : '';
            return `
                <tr style="border-bottom:1px solid var(--vault-border); transition:background 0.15s;" 
                    onmouseenter="this.style.background='rgba(255,255,255,0.03)'"
                    onmouseleave="this.style.background='transparent'">
                    <td style="padding:10px 12px; color:var(--vault-accent); font-family:var(--font-mono); font-weight:700; font-size:12px;">
                        E${num}
                    </td>
                    <td style="padding:10px 12px;">
                        <div style="font-weight:600; color:#fff; font-size:12px; margin-bottom:2px;">${title}</div>
                        <div style="font-size:10px; color:var(--vault-slate); display:flex; gap:10px;">
                            ${airDate ? `<span>${airDate}</span>` : ''}
                            ${rating ? `<span style="color:var(--vault-gold);">${rating}</span>` : ''}
                        </div>
                    </td>
                    <td style="padding:10px 12px; text-align:right;">
                        <button 
                            style="background:var(--vault-accent); color:var(--vt-primary); border:none; padding:5px 14px; border-radius:4px; font-weight:700; cursor:pointer; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; font-family:var(--font-mono); transition:opacity 0.2s; white-space:nowrap;"
                            onclick="window._streamEpisode(${tvId}, ${seasonNumber}, ${num})"
                            onmouseenter="this.style.opacity='0.8'"
                            onmouseleave="this.style.opacity='1'"
                        >⚡ Play</button>
                    </td>
                </tr>`;
        }).join('');

    } catch (e) {
        console.error('[streaming] Failed to load season episodes:', e);
        episodesList.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--vault-signal-alert,#FF6B7A);padding:16px;">${window.escapeHtml(e.message)}</td></tr>`;
    }
}

/**
 * Called when the user clicks ⚡ Play on an episode row.
 */
window._streamEpisode = function(tvId, seasonNumber, episodeNumber) {
    // Close the details modal
    el('streaming-details-modal').style.display = 'none';
    el('movie-trailer-iframe').src = '';

    window.triggerRDStream(
        _currentModalTitle,
        tvId,
        'tv',
        seasonNumber,
        episodeNumber
    );
};

async function _fetchAndInjectTrailer(tmdbId, mediaType) {
    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/videos?language=en-US`;
        const TMDB_BEARER_TOKEN = await _getTMDBToken();
        if (!TMDB_BEARER_TOKEN) return;

        const res = await fetch(url, {
            headers: { accept: 'application/json', Authorization: `Bearer ${TMDB_BEARER_TOKEN}` }
        });
        if (!res.ok) return;

        const data = await res.json();
        const trailer = (data.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube') || data.results?.[0];
        if (!trailer) return;

        const iframeWrapper = el('movie-trailer-wrapper');
        const iframe = el('movie-trailer-iframe');
        const btnTrailer = el('btn-watch-trailer-browser');

        if (iframeWrapper && iframe) {
            iframe.src = `https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=0&rel=0`;
            iframeWrapper.style.display = 'block';
        }
        if (btnTrailer) {
            btnTrailer.style.display = 'flex';
            btnTrailer.onclick = () => {
                if (window.electronAPI && window.electronAPI.openExternalURL) {
                    window.electronAPI.openExternalURL(`https://www.youtube.com/watch?v=${trailer.key}`);
                }
            };
        }
    } catch (e) {
        // Trailers are optional — fail silently
        console.warn('[streaming] Failed to fetch trailer:', e.message);
    }
}

// Cache TMDB token retrieval (read from settings data or env indirectly through search result headers)
let _cachedTMDBToken = null;
async function _getTMDBToken() {
    if (_cachedTMDBToken) return _cachedTMDBToken;
    // We use the TMDB search endpoint to confirm the token is valid; the token itself
    // lives in the backend (.env). For front-end trailer fetches, we must re-use it from window.appSettings.
    const settings = window.appSettings || {};
    if (settings.tmdbBearerToken) {
        _cachedTMDBToken = settings.tmdbBearerToken;
        return _cachedTMDBToken;
    }
    return null; // Trailer fetch will silently skip — movie info still works
}


// ─── Quality/Language-Aware triggerRDStream ───────────────────────────────────

let _torrentRequestCounter = 0;

/**
 * Overrides the base triggerRDStream to inject season/episode for TV and
 * apply quality+language ranking before displaying the torrent list.
 *
 * @param {string} movieTitle
 * @param {number|null} tmdbId
 * @param {string} mediaType  'movie' | 'tv'
 * @param {number} [season]   Season number (TV only)
 * @param {number} [episode]  Episode number (TV only)
 */
window.triggerRDStream = async function(movieTitle, tmdbId = null, mediaType = 'movie', season = null, episode = null) {
    _torrentRequestCounter++;
    const currentRequestNum = _torrentRequestCounter;

    window._rdDialogJustOpened = true;
    setTimeout(() => { window._rdDialogJustOpened = false; }, 100);

    const dialog = el('rd-stream-dialog');
    const loadingStatus = el('rd-loading-status');
    const statusText = el('rd-status-text');
    const torrentsList = el('rd-torrents-list');

    if (!dialog || !loadingStatus || !statusText || !torrentsList) return;

    // Reset view state
    dialog.style.display = 'flex';
    const backdrop = el('rd-stream-backdrop');
    if (backdrop) backdrop.style.display = 'block';
    loadingStatus.style.display = 'block';
    torrentsList.style.display = 'none';
    torrentsList.innerHTML = '';
    const chooseManuallyBtn = el('btn-rd-choose-manually');
    if (chooseManuallyBtn) chooseManuallyBtn.style.display = 'none';

    const isTV = mediaType === 'tv';
    const epLabel = isTV && season != null ? ` S${String(season).padStart(2,'0')}E${String(episode || 1).padStart(2,'0')}` : '';
    statusText.innerHTML = `🔍 Scraping Torrentio index for:<br><strong>${window.escapeHtml(movieTitle)}${epLabel}</strong>...`;

    const preferredQuality = getPreferredQuality();
    const preferredLang = getPreferredLang();

    // Cache streaming media metadata for the watch history system
    const posterEl = el('streaming-details-poster');
    const yearEl = el('streaming-details-year');
    window.activeStreamingMedia = {
        mediaType: mediaType || 'movie',
        tmdbId: tmdbId || null,
        title: movieTitle,
        season: isTV ? (season || 1) : null,
        episode: isTV ? (episode || 1) : null,
        poster: posterEl ? posterEl.src : null,
        year: yearEl ? yearEl.textContent : null
    };

    try {
        // Stagger request to prevent rate limits
        await new Promise(r => setTimeout(r, 500));

        // Cancel output if another search was triggered during the stagger delay
        if (currentRequestNum !== _torrentRequestCounter) {
            console.log(`[streaming] Cancelled outdated torrent search stagger for: ${movieTitle}`);
            return;
        }

        // Pass season/episode for TV shows so the backend queries the correct Torrentio endpoint
        const response = await window.electronAPI.searchTorrents({
            movieTitle,
            tmdbId,
            mediaType,
            season: season || 1,
            episode: episode || 1
        });

        // Cancel output if a different movie was opened in the meantime
        if (currentRequestNum !== _torrentRequestCounter) {
            console.log(`[streaming] Cancelled outdated torrent search results for: ${movieTitle}`);
            return;
        }

        if (!response || !response.success || !response.torrents || response.torrents.length === 0) {
            loadingStatus.querySelector('.spinner').style.display = 'none';
            statusText.innerHTML = `❌ No torrent sources found for:<br><strong>${window.escapeHtml(movieTitle)}${epLabel}</strong>.`;
            return;
        }

        // ── Rank torrents by user's quality + language prefs ────────────────
        const ranked = rankTorrents(response.torrents);
        window.currentTorrentList = ranked;
        window.currentMovieTitle = response.title;

        // ── Auto-select if setting is enabled ────────────────────────────────
        if (isAutoSelectEnabled()) {
            loadingStatus.style.display = 'none';
            torrentsList.style.display = 'none';
            window.showToast(`Auto-selecting best ${preferredQuality} ${preferredLang !== 'en' ? preferredLang.toUpperCase() + ' ' : ''}stream...`, 'info');
            await new Promise(r => setTimeout(r, 600));
            window.startRDDebridFlow(ranked[0], response.title, 0);
            return;
        }

        // ── Manual selection: show ranked list ───────────────────────────────
        loadingStatus.style.display = 'none';
        torrentsList.style.display = 'flex';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'font-weight:700; font-size:12px; color:#fff; margin-bottom:6px; font-family:var(--font-mono); display:flex; justify-content:space-between; align-items:center;';
        header.innerHTML = `
            <span>Available streams for "<em>${window.escapeHtml(response.title)}${epLabel}</em>"</span>
            <span style="font-size:9.5px; color:var(--vault-slate); font-weight:500;">
                Ranked: ${preferredQuality} · ${preferredLang.toUpperCase()}
            </span>`;
        torrentsList.appendChild(header);

        ranked.forEach((t, idx) => {
            const btn = document.createElement('button');
            btn.className = 'ctrl-btn-sm';
            btn.style.cssText = 'background:var(--vault-warm-card,#252535); border:1px solid var(--vault-border); border-radius:6px; padding:12px; color:var(--vault-text); font-family:var(--font-sans); text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:4px; transition:all 0.2s; width:100%; position:relative;';

            // Best match badge on first result
            const isBest = idx === 0;
            btn.innerHTML = `
                ${isBest ? `<span style="position:absolute; top:6px; right:8px; background:var(--vault-accent); color:var(--vt-primary); font-size:8px; font-weight:800; padding:2px 6px; border-radius:3px; font-family:var(--font-mono); text-transform:uppercase;">Best Match</span>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; padding-right:${isBest ? '80px' : '0'};">
                    <strong style="color:var(--vault-accent); font-family:var(--font-mono); font-size:11px;">${window.escapeHtml(t.quality)} <span style="color:var(--vault-slate); font-weight:400;">(${window.escapeHtml(t.type.substring(0, 30).toUpperCase())})</span></strong>
                    <span style="font-size:9.5px; color:var(--vault-slate); font-weight:600; display:inline-flex; align-items:center; gap:3.5px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:10px; height:10px; display:inline-block; vertical-align:middle;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> ${window.escapeHtml(t.size)}</span>
                </div>
                <div style="font-size:10px; color:#eee; text-align:left; margin:2px 0; font-weight:500; font-family:var(--font-sans); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;">${window.escapeHtml(t.desc || '')}</div>
                <div style="display:flex; gap:15px; font-size:9.5px; color:var(--vault-slate); margin-top:2px;">
                    <span style="display:inline-flex; align-items:center; gap:4.5px;"><span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:var(--vault-signal-online, #6BE675); box-shadow: 0 0 5px var(--vault-signal-online);"></span> Seeds: ${t.seeds}</span>
                    <span style="display:inline-flex; align-items:center; gap:4.5px;"><span style="display:inline-block; width:5.5px; height:5.5px; border-radius:50%; background:var(--vault-signal-alert, #FF6B7A); box-shadow: 0 0 5px var(--vault-signal-alert);"></span> Peers: ${t.peers}</span>
                </div>`;

            btn.addEventListener('mouseenter', () => {
                btn.style.borderColor = 'var(--vault-gold)';
                btn.style.background = 'rgba(245,185,41,0.05)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = 'var(--vault-border)';
                btn.style.background = 'var(--vault-warm-card,#252535)';
            });
            btn.addEventListener('click', () => window.startRDDebridFlow(t, response.title, idx));

            torrentsList.appendChild(btn);
        });

    } catch (e) {
        console.error('[streaming] triggerRDStream failed:', e);
        loadingStatus.querySelector('.spinner').style.display = 'none';
        statusText.innerText = 'Error scraping torrent index.';
    }
};

// Close modals when clicking outside their active boundaries
document.addEventListener('click', (e) => {
    const detailsModal = document.getElementById('streaming-details-modal');
    if (detailsModal && detailsModal.style.display === 'flex' && !window._detailsModalJustOpened) {
        if (!detailsModal.contains(e.target)) {
            detailsModal.style.display = 'none';
            const trailer = document.getElementById('movie-trailer-iframe');
            if (trailer) trailer.src = '';
        }
    }

    const rdDialog = document.getElementById('rd-stream-dialog');
    if (rdDialog && rdDialog.style.display === 'flex' && !window._rdDialogJustOpened) {
        if (!rdDialog.contains(e.target)) {
            rdDialog.style.display = 'none';
            const backdrop = document.getElementById('rd-stream-backdrop');
            if (backdrop) backdrop.style.display = 'none';
        }
    }
});
