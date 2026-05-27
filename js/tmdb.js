/* ==========================================================================
   Vault TMDB searching & Results Rendering Module
   ========================================================================== */

const MOCK_TMDB_DATA = [
    {
        title: "Dune: Part Two",
        year: "2024",
        rating: "8.3",
        genres: "Sci-Fi, Adventure",
        poster: "dune_poster.png",
        overview: "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family."
    },
    {
        title: "Oppenheimer",
        year: "2023",
        rating: "8.1",
        genres: "Drama, History",
        poster: "oppenheimer_poster.png",
        overview: "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II."
    },
    {
        title: "Interstellar",
        year: "2014",
        rating: "8.4",
        genres: "Sci-Fi, Drama",
        poster: "dune_poster.png",
        overview: "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel."
    },
    {
        title: "The Dark Knight",
        year: "2008",
        rating: "8.6",
        genres: "Action, Crime, Drama",
        poster: "oppenheimer_poster.png",
        overview: "When the menace known as the Joker wreaks havoc and chaos on Gotham, Batman must accept one of the greatest psychological and physical tests."
    }
];

function updateProviderButtonsUI() {
    document.querySelectorAll('.provider-btn').forEach(btn => {
        const prov = btn.dataset.provider;
        if (prov === window.tmdbCurrentProvider) {
            btn.classList.add('active');
            btn.style.background = 'var(--vault-accent)';
            btn.style.color = 'var(--vt-primary)';
            btn.style.border = 'none';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            if (prov === 'all') {
                btn.style.color = 'var(--vault-text)';
                btn.style.border = '1px solid var(--vault-border)';
            } else if (prov === '8') {
                btn.style.color = '#E50914';
                btn.style.border = '1px solid rgba(229,9,20,0.4)';
            } else if (prov === '337') {
                btn.style.color = '#0063e5';
                btn.style.border = '1px solid rgba(0,99,229,0.4)';
            } else if (prov === '350') {
                btn.style.color = '#fff';
                btn.style.border = '1px solid rgba(255,255,255,0.3)';
            } else if (prov === '9') {
                btn.style.color = '#00A8E1';
                btn.style.border = '1px solid rgba(0,168,225,0.4)';
            }
        }
    });
}

function updateSubtabsUI() {
    const subtabMovies = el('subtab-movies');
    const subtabSeries = el('subtab-series');
    if (!subtabMovies || !subtabSeries) return;
    if (window.tmdbCurrentMediaType === 'movie') {
        subtabMovies.classList.add('active');
        subtabMovies.style.background = 'var(--vault-accent)';
        subtabMovies.style.color = 'var(--vt-primary)';
        subtabMovies.style.border = 'none';
        subtabMovies.style.opacity = '1';

        subtabSeries.classList.remove('active');
        subtabSeries.style.background = 'transparent';
        subtabSeries.style.color = 'var(--vault-text)';
        subtabSeries.style.border = '1px solid var(--vault-border)';
        subtabSeries.style.opacity = '0.8';
    } else {
        subtabSeries.classList.add('active');
        subtabSeries.style.background = 'var(--vault-accent)';
        subtabSeries.style.color = 'var(--vt-primary)';
        subtabSeries.style.border = 'none';
        subtabSeries.style.opacity = '1';

        subtabMovies.classList.remove('active');
        subtabMovies.style.background = 'transparent';
        subtabMovies.style.color = 'var(--vault-text)';
        subtabMovies.style.border = '1px solid var(--vault-border)';
        subtabMovies.style.opacity = '0.8';
    }
}

window.updateProviderButtonsUI = updateProviderButtonsUI;
window.updateSubtabsUI = updateSubtabsUI;

window.renderTMDB = async function(query = '', append = false) {
    const grid = el('tmdb-results-grid');
    if (!grid) return;
    
    const loadMoreContainer = el('tmdb-load-more-container');
    const loadMoreText = el('tmdb-load-more-text');
    
    if (!append) {
        grid.innerHTML = '';
        window.tmdbCurrentPage = 1;
        window.tmdbCurrentQuery = query;
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;"><div class="spinner" style="margin: 0 auto 12px;"></div>Searching TMDB...</div>';
    } else {
        if (loadMoreText) loadMoreText.innerText = 'Loading...';
    }

    // Update UI for active/inactive state of providers and subtabs
    updateProviderButtonsUI();
    updateSubtabsUI();

    try {
        let response;
        if (window.tmdbCurrentQuery) {
            response = await window.electronAPI.searchTMDB(window.tmdbCurrentQuery, window.tmdbCurrentPage);
        } else {
            response = await window.electronAPI.discoverTMDB(window.tmdbCurrentProvider, window.tmdbCurrentMediaType, window.tmdbCurrentPage);
        }

        if (!append) {
            grid.innerHTML = '';
        } else {
            if (loadMoreText) loadMoreText.innerText = 'Load More';
        }
        
        if (!response || !response.success) {
            const errMsg = response ? response.error : 'Unknown error';
            if (!append) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 0;">
                       <svg viewBox="0 0 24 24" fill="none" stroke="var(--vault-signal-alert, #FF6B7A)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 12px;">
                          <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
                       </svg>
                       <h3>TMDB Request Failed</h3>
                       <p>${window.escapeHtml(errMsg)}</p>
                    </div>
                `;
            } else {
                window.showToast('Failed to load more items: ' + errMsg, 'error');
            }
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            return;
        }

        const results = response.results || [];
        if (results.length === 0) {
            if (!append) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 0;">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--vault-accent);">
                          <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                       </svg>
                       <h3>No TMDB Results Found</h3>
                       <p>We couldn't find any movies or TV shows matching your criteria.</p>
                    </div>
                `;
            } else {
                window.showToast('No more items found', 'info');
            }
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            return;
        }

        results.forEach(movie => {
            const card = document.createElement('div');
            
            // Check if movie is currently saved in the library to apply the premium highlight state
            window.appSettings = window.appSettings || {};
            window.appSettings.library = window.appSettings.library || [];
            const isCurrentlySaved = window.appSettings.library.some(item => item.id === movie.id && item.media_type === movie.media_type);
            
            if (isCurrentlySaved) {
                card.className = 'file-card tmdb-movie-card in-library';
                card.style.cssText = 'cursor: pointer; background: var(--vault-warm-card); border: 1.5px solid var(--vault-console-gold); border-radius: 6px; box-shadow: 0 0 12px rgba(214, 164, 65, 0.35); position: relative;';
            } else {
                card.className = 'file-card tmdb-movie-card';
                card.style.cssText = 'cursor: pointer; background: var(--vault-warm-card); border: 1px solid var(--vault-border); border-radius: 6px; position: relative;';
            }
            
            card.addEventListener('click', () => {
                window.showMediaDetails(movie);
            });
            
            const isTV = movie.media_type === 'tv';
            
            // Modernized SVGs for standard badging
            const tvSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px; height:11px; display:inline-block;"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>`;
            const movieSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px; height:11px; display:inline-block;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
            
            card.innerHTML = `
                <div class="thumbnail-container" style="position:relative; background:#111; height: 180px; width: 100%; border-top-left-radius: 5px; border-top-right-radius: 5px; overflow: hidden;">
                   <button onclick="event.stopPropagation(); window.showMediaDetails(${JSON.stringify(movie).replace(/"/g, '&quot;')})" style="position: absolute; top: 8px; left: 8px; border: none; background: rgba(0,0,0,0.8); color: var(--vault-gold); font-family: var(--font-mono); font-size: 10px; font-weight: 800; padding: 4px 6.5px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; border: 1px solid var(--vault-gold); transition: all 0.2s;" title="${isTV ? 'Browse Seasons' : 'Stream Movie'}">
                      ${isTV ? tvSvg : movieSvg}
                   </button>
                   <img class="thumbnail" src="${movie.poster}" alt="${window.escapeHtml(movie.title)}" style="object-fit: cover; width:100%; height:100%; transition: opacity 0.25s ease;" onerror="this.src='oppenheimer_poster.png'">
                   <div class="size-badge" style="background:var(--vault-accent); color:var(--vt-primary); font-weight:800; position:absolute; bottom: 8px; left: 8px; width: 28px; height: 28px; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 8.5px; line-height: 1.1; padding: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.4); text-align: center;">
                      <span>★</span>
                      <span style="margin-top:-1px;">${movie.rating}</span>
                   </div>
                </div>
                <div class="filename-container" style="padding:12px; text-align:left;">
                   <div style="font-weight:700; font-size:13px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-mono);">${window.escapeHtml(movie.title)}</div>
                   <div style="font-size:10px; color:var(--vault-slate); margin-top:2px; font-weight:500;">${movie.year} • ${window.escapeHtml(movie.genres)}</div>
                   <div style="font-size:11px; color:#bbb; margin-top:6px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4; font-family:var(--font-body);">${window.escapeHtml(movie.overview)}</div>
                </div>
            `;
            card.setAttribute('data-id', String(movie.id));
            window.attachPremiumHoverCard(card, movie);
            grid.appendChild(card);
        });

        // Show pagination container if results are returned
        if (loadMoreContainer) {
            loadMoreContainer.style.display = 'flex';
        }
        
        window.updateStatusBar();
    } catch (e) {
        console.error("TMDB render error:", e);
        if (!append) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--vault-slate); padding: 40px 0;">Error loading TMDB results.</div>';
        } else {
            window.showToast('Error loading more items', 'error');
        }
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    }
};
