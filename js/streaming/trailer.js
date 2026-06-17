// js/streaming/trailer.js — trailer resolution (KinoCheck + TMDB fallback) and TMDB token cache
// Part of the streaming feature, split out of the former monolithic js/streaming.js.

async function _fetchAndInjectTrailer(tmdbId, mediaType) {
    try {
        let trailerKey = null;

        // 1. Try KinoCheck Premium API handler first
        if (window.electronAPI && window.electronAPI.getKinoCheckTrailer) {
            console.log(`[streaming] Attempting KinoCheck Premium for TMDB ID: ${tmdbId}`);
            const kcResult = await window.electronAPI.getKinoCheckTrailer({ tmdbId, mediaType });
            if (kcResult && kcResult.success && kcResult.key) {
                console.log(`[streaming] KinoCheck successfully resolved trailer key:`, kcResult.key);
                trailerKey = kcResult.key;
            } else {
                console.warn(`[streaming] KinoCheck premium lookup skipped or empty:`, kcResult ? kcResult.error : 'No response');
            }
        }

        // 2. Fallback to TMDB videos endpoint if KinoCheck didn't resolve a key
        if (!trailerKey) {
            console.log(`[streaming] Falling back to TMDB video lookup for TMDB ID: ${tmdbId}`);
            const type = mediaType === 'tv' ? 'tv' : 'movie';
            const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/videos?language=en-US`;
            const TMDB_BEARER_TOKEN = await _getTMDBToken();
            if (TMDB_BEARER_TOKEN) {
                const res = await fetch(url, {
                    headers: { accept: 'application/json', Authorization: `Bearer ${TMDB_BEARER_TOKEN}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const trailer = (data.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube') || data.results?.[0];
                    if (trailer && trailer.key) {
                        trailerKey = trailer.key;
                    }
                }
            }
        }

        if (!trailerKey) {
            console.warn('[streaming] No trailer could be resolved from KinoCheck or TMDB fallback.');
            return;
        }

        window._currentTrailerKey = trailerKey;

        const iframeWrapper = el('movie-trailer-wrapper');
        const iframe = el('movie-trailer-iframe');
        const btnTrailer = el('btn-watch-trailer-browser');

        if (iframeWrapper && iframe) {
            // YouTube error 152/150/101 = "embed disabled" OR an origin
            // mismatch. main.js overrides Referer/Origin to
            // https://www.youtube.com/ for every YouTube request, so the
            // iframe must load from that SAME domain — the previous attempt
            // used youtube-nocookie.com which mismatched the spoofed Referer
            // and YouTube's player rejected it. Also: spoof a valid http
            // origin in the query so YouTube's JS-side validator passes.
            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            iframe.removeAttribute('sandbox');

            const spoofedOrigin = 'https://www.youtube.com';
            const params = new URLSearchParams({
                autoplay: '0', rel: '0', modestbranding: '1',
                playsinline: '1', enablejsapi: '1',
                origin: spoofedOrigin,
                widget_referrer: spoofedOrigin,
            });
            iframe.src = `https://www.youtube.com/embed/${trailerKey}?${params.toString()}`;

            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
            iframe.setAttribute('allowfullscreen', 'true');

            // YouTube embed playback errors do NOT fire iframe.onerror; they
            // arrive as postMessage events on window from youtube(-nocookie).com.
            // Error info codes worth treating as fatal: 2, 5, 100, 101, 150.
            if (window._ytTrailerListener) {
                window.removeEventListener('message', window._ytTrailerListener);
            }
            const showFallback = (reason) => {
                console.error('[streaming] YouTube embed unplayable:', reason);
                if (iframeWrapper) iframeWrapper.style.display = 'none';
                if (btnTrailer) btnTrailer.style.display = 'flex';
                window.showToast('Trailer blocked from embedding. Use "Watch Trailer on YouTube" to open in your browser.', 'warning');
            };
            window._ytTrailerListener = (ev) => {
                if (!ev.origin || !/youtube(-nocookie)?\.com$/i.test(new URL(ev.origin).hostname)) return;
                let data = ev.data;
                if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { return; } }
                if (data && data.event === 'onError' && [2, 5, 100, 101, 150].includes(data.info)) {
                    showFallback(`onError ${data.info}`);
                }
            };
            window.addEventListener('message', window._ytTrailerListener);

            // After load, ping the iframe with the listening handshake the
            // IFrame API expects so it'll send us onError/onStateChange events.
            iframe.onload = () => {
                try {
                    iframe.contentWindow.postMessage(
                        JSON.stringify({ event: 'listening', id: trailerKey, channel: 'widget' }),
                        '*'
                    );
                    iframe.contentWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onError'] }),
                        '*'
                    );
                } catch (_) { /* cross-origin write — non-fatal */ }
            };

            iframeWrapper.style.display = 'block';
        }
        if (btnTrailer) {
            btnTrailer.style.display = 'flex';
            btnTrailer.onclick = () => {
                if (window.electronAPI && window.electronAPI.openExternalURL) {
                    window.electronAPI.openExternalURL(`https://www.youtube.com/watch?v=${trailerKey}`);
                }
            };
        }

        // Re-draw badges with the newly active trailer key
        const titleEl = el('streaming-details-title');
        const title = titleEl ? titleEl.textContent : '';
        _populateExternalBadges(title, tmdbId, mediaType, trailerKey);
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
