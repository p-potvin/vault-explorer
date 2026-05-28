/* ==========================================================================
   Vault Premium Netflix-Style Interactive Hover Preview Cards
   ========================================================================== */

// Shared global state to manage all interactive card state, preventing closure isolation
window.premiumHoverState = {
    activeCard: null,
    hoverTimeout: null,
    closeTimeout: null,
    trailerTimeout: null
};

window.attachPremiumHoverCard = function(card, movie) {
    card.addEventListener('mouseenter', (e) => {
        if (window.premiumHoverState.cooldown) return;
        
        if (window.premiumHoverState.closeTimeout) {
            clearTimeout(window.premiumHoverState.closeTimeout);
            window.premiumHoverState.closeTimeout = null;
        }
        
        if (window.premiumHoverState.hoverTimeout) {
            clearTimeout(window.premiumHoverState.hoverTimeout);
        }
        
        window.premiumHoverState.hoverTimeout = setTimeout(() => {
            window.showPremiumHoverCard(card, movie);
        }, 300);
    });
    
    card.addEventListener('mouseleave', (e) => {
        if (window.premiumHoverState.hoverTimeout) {
            clearTimeout(window.premiumHoverState.hoverTimeout);
            window.premiumHoverState.hoverTimeout = null;
        }
        
        if (window.premiumHoverState.closeTimeout) {
            clearTimeout(window.premiumHoverState.closeTimeout);
        }
        
        window.premiumHoverState.closeTimeout = setTimeout(() => {
            window.hidePremiumHoverCard();
        }, 250);
    });
};

window.showPremiumHoverCard = function(card, movie) {
    let popup = document.getElementById('premium-hover-card');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'premium-hover-card';
        popup.className = 'premium-hover-popup vw-console-shell';
        popup.style.cssText = 'display:none; position:fixed; z-index:9999; border-radius:8px; overflow:hidden; border:1.5px solid var(--vault-accent); background: var(--vault-console-bg); pointer-events:auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5);';
        document.body.appendChild(popup);
        
        popup.addEventListener('mouseenter', () => {
            if (window.premiumHoverState.closeTimeout) {
                clearTimeout(window.premiumHoverState.closeTimeout);
                window.premiumHoverState.closeTimeout = null;
            }
        });
        
        popup.addEventListener('mouseleave', () => {
            if (window.premiumHoverState.closeTimeout) {
                clearTimeout(window.premiumHoverState.closeTimeout);
            }
            window.premiumHoverState.closeTimeout = setTimeout(() => {
                window.hidePremiumHoverCard();
            }, 250);
        });
    }
    
    // Restore visibility of any previous card before overwriting the active card reference
    if (window.premiumHoverState.activeCard && window.premiumHoverState.activeCard !== card) {
        window.premiumHoverState.activeCard.style.visibility = 'visible';
    }
    window.premiumHoverState.activeCard = card;
    
    popup.style.cursor = 'pointer';
    popup.onclick = (e) => {
        if (e.target.closest('.actions-row')) return;
        e.preventDefault();
        e.stopPropagation();
        window.showMediaDetails(movie);
        window.hidePremiumHoverCard();
    };
    
    if (window.premiumHoverState.closeTimeout) {
        clearTimeout(window.premiumHoverState.closeTimeout);
        window.premiumHoverState.closeTimeout = null;
    }
    
    if (window.premiumHoverState.trailerTimeout) {
        clearTimeout(window.premiumHoverState.trailerTimeout);
        window.premiumHoverState.trailerTimeout = null;
    }
    
    const isTV = movie.media_type === 'tv';
    const title = movie.title || movie.name || 'Unknown Title';
    const rating = movie.rating || movie.vote_average || '0.0';
    const overview = movie.overview || 'No description available.';
    const year = movie.year || (movie.release_date ? movie.release_date.substring(0,4) : (movie.first_air_date ? movie.first_air_date.substring(0,4) : ''));
    const genres = movie.genres || '';
    
    const isSaved = (window.appSettings.library || []).some(item => item.id === movie.id && item.media_type === movie.media_type);
    const libraryIcon = isSaved ? 
        `<svg viewBox="0 0 24 24" fill="none" stroke="var(--vault-gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;"><polyline points="20 6 9 17 4 12"></polyline></svg>` : 
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></svg>`;
        
    popup.innerHTML = `
      <div class="media-container" style="position:relative; width:100%; height:180px; background:#111; overflow:hidden;">
        <img class="poster" src="${movie.poster || 'oppenheimer_poster.png'}" style="width:100%; height:100%; object-fit:cover; transition:opacity 0.3s;" />
        <div class="trailer-iframe-container" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; transition:opacity 0.5s; pointer-events:none;"></div>
      </div>
      <div class="details-container" style="padding:14px; background:linear-gradient(180deg, rgba(20,18,30,0.95), rgba(11,8,19,0.99)); color:#fff; text-align:left; border-top:1px solid rgba(255,255,255,0.06); font-family: var(--font-sans);">
        <div class="title-row" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <span class="title" style="font-weight:700; font-size:14px; color:#fff; font-family:var(--font-mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${window.escapeHtml(title)}</span>
          <span class="rating-badge" style="background:var(--vault-accent); color:var(--vt-primary); font-weight:800; font-size:9.5px; padding:1.5px 5px; border-radius:4px; font-family:var(--font-mono); white-space:nowrap;">★ ${rating}</span>
        </div>
        <div class="meta-row" style="font-size:10px; color:var(--vault-slate); margin-top:2px; font-weight:600; text-transform:uppercase;">${year} • ${window.escapeHtml(genres)}</div>
        <p class="overview" style="font-size:11px; color:#bbb; margin-top:6px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; font-family:var(--font-body); height:46px; margin-bottom:0;">${window.escapeHtml(overview)}</p>
        
        <div class="actions-row" style="display:flex; gap:6px; margin-top:10px; align-items:center;">
          <button class="btn-hover-play" style="flex:1; background:var(--vault-accent); color:var(--vt-primary); border:none; padding:6px 10px; border-radius:4px; font-size:10.5px; font-weight:800; text-transform:uppercase; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px; transition:all 0.2s;">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width:10px; height:10px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span class="btn-text-play">${window.currentLang === 'fr' ? 'DIFFUSER' : 'STREAM'}</span>
          </button>
          <button class="btn-hover-library" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; width:28px; height:28px; border-radius:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; padding:0;" title="${isSaved ? (window.currentLang === 'fr' ? 'Retirer de la bibliothèque' : 'Remove from Library') : (window.currentLang === 'fr' ? 'Ajouter à la bibliothèque' : 'Add to Library')}">
            ${libraryIcon}
          </button>
          <button class="btn-hover-details" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:#fff; width:28px; height:28px; border-radius:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; padding:0;" title="${window.currentLang === 'fr' ? 'Plus de détails' : 'More Details'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          </button>
        </div>
      </div>
    `;
    
    const btnPlay = popup.querySelector('.btn-hover-play');
    btnPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        window.showMediaDetails(movie);
        window.hidePremiumHoverCard();
        setTimeout(() => {
            if (movie.media_type === 'movie') {
                const btnStream = document.getElementById('btn-stream-movie');
                if (btnStream) btnStream.click();
            } else {
                const epConfirmBtn = document.getElementById('btn-confirm-stream') || document.querySelector('.btn-modal-follow');
                if (epConfirmBtn) epConfirmBtn.click();
            }
        }, 300);
    });
    
    const btnLib = popup.querySelector('.btn-hover-library');
    btnLib.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        window.appSettings.library = window.appSettings.library || [];
        const idx = window.appSettings.library.findIndex(item => item.id === movie.id && item.media_type === movie.media_type);
        if (idx !== -1) {
            window.appSettings.library.splice(idx, 1);
            window.showToast(window.currentLang === 'fr' ? 'Retiré de la bibliothèque' : 'Removed from Library', 'info');
        } else {
            window.appSettings.library.push(movie);
            window.showToast(window.currentLang === 'fr' ? 'Ajouté à la bibliothèque' : 'Added to Library', 'success');
        }
        await window.electronAPI.saveSettings(window.appSettings);
        
        if (typeof window.renderFavorites === 'function') {
            window.renderFavorites();
        }
        
        const matchedCards = document.querySelectorAll('.tmdb-movie-card');
        matchedCards.forEach(c => {
            const isMatch = c.getAttribute('data-id') === String(movie.id);
            if (isMatch) {
                const isSavedNow = window.appSettings.library.some(item => item.id === movie.id && item.media_type === movie.media_type);
                if (isSavedNow) {
                    c.className = 'file-card tmdb-movie-card in-library';
                    c.style.cssText = 'cursor: pointer; background: var(--vault-warm-card); border: 1.5px solid var(--vault-console-gold); border-radius: 6px; box-shadow: 0 0 12px rgba(214, 164, 65, 0.35); position: relative;';
                } else {
                    c.className = 'file-card tmdb-movie-card';
                    c.style.cssText = 'cursor: pointer; background: var(--vault-warm-card); border: 1px solid var(--vault-border); border-radius: 6px; position: relative;';
                }
            }
        });
        
        const isSavedNow = window.appSettings.library.some(item => item.id === movie.id && item.media_type === movie.media_type);
        btnLib.innerHTML = isSavedNow ? 
            `<svg viewBox="0 0 24 24" fill="none" stroke="var(--vault-gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;"><polyline points="20 6 9 17 4 12"></polyline></svg>` : 
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></svg>`;
        btnLib.title = isSavedNow ? (window.currentLang === 'fr' ? 'Retirer de la bibliothèque' : 'Remove from Library') : (window.currentLang === 'fr' ? 'Ajouter à la bibliothèque' : 'Add to Library');
    });
    
    const btnDet = popup.querySelector('.btn-hover-details');
    btnDet.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        window.hidePremiumHoverCard();
        window.showMediaDetails(movie);
    });
    
    const rect = card.getBoundingClientRect();
    popup.style.display = 'block';
    
    popup.style.top = rect.top + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.width = rect.width + 'px';
    popup.style.height = rect.height + 'px';
    
    const expWidth = 320; 
    const expHeight = 350;
    
    const targetLeft = Math.max(10, Math.min(window.innerWidth - expWidth - 10, rect.left - (expWidth - rect.width) / 2));
    const targetTop = Math.max(10, Math.min(window.innerHeight - expHeight - 10, rect.top - 60));
    
    requestAnimationFrame(() => {
        popup.style.left = targetLeft + 'px';
        popup.style.top = targetTop + 'px';
        popup.style.width = expWidth + 'px';
        popup.style.height = expHeight + 'px';
        popup.classList.add('active');
        card.style.visibility = 'hidden';
    });
    
    window.premiumHoverState.trailerTimeout = setTimeout(async () => {
        const iframeContainer = popup.querySelector('.trailer-iframe-container');
        if (!iframeContainer) return;
        
        let trailerKey = '';
        if (movie.id) {
            try {
                const res = movie.media_type === 'tv'
                    ? await window.electronAPI.getTMDBTV(movie.id)
                    : await window.electronAPI.getTMDBMovie(movie.id);
                if (res && res.success && res.data) {
                    const videos = res.data.videos ? res.data.videos.results : [];
                    const trailer = (Array.isArray(videos) ? videos : []).find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip'));
                    if (trailer) {
                        trailerKey = trailer.key;
                    }
                }
            } catch (e) {
                console.error('[HoverCard] Failed to fetch trailer key:', e);
            }
        }
        
        let embedUrl;
        if (trailerKey) {
            embedUrl = `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&disablekb=1`;
        } else {
            embedUrl = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(title + ' ' + (year || '') + ' official trailer')}&autoplay=1&mute=1&controls=0&modestbranding=1&rel=0`;
        }
        
        iframeContainer.innerHTML = `<iframe src="${embedUrl}" style="width:100%; height:100%; border:none; transform: scale(1.02); pointer-events:none;" allow="autoplay; encrypted-media"></iframe>`;
        iframeContainer.style.opacity = '1';
    }, 850);
};

window.hidePremiumHoverCard = function() {
    const popup = document.getElementById('premium-hover-card');
    if (popup) {
        if (window.premiumHoverState.trailerTimeout) {
            clearTimeout(window.premiumHoverState.trailerTimeout);
            window.premiumHoverState.trailerTimeout = null;
        }
        popup.classList.remove('active');
        const iframeContainer = popup.querySelector('.trailer-iframe-container');
        if (iframeContainer) iframeContainer.innerHTML = '';
        popup.style.display = 'none';
        
        if (window.premiumHoverState.activeCard) {
            window.premiumHoverState.activeCard.style.visibility = 'visible';
            window.premiumHoverState.activeCard = null;
        }

        // Add 200ms cooldown to ignore instant enter events on backdrop cards
        window.premiumHoverState.cooldown = true;
        if (window.premiumHoverState.cooldownTimeout) {
            clearTimeout(window.premiumHoverState.cooldownTimeout);
        }
        window.premiumHoverState.cooldownTimeout = setTimeout(() => {
            window.premiumHoverState.cooldown = false;
        }, 200);
    }
};
