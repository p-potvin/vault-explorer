// src/tmdb.js - Exposes real-time TMDB Search and Trending API handlers using process.env secrets

const fs = require('fs');
const path = require('path');

// Load environment variables from .env
let envConfig = {};
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                if (key) {
                    envConfig[key] = value;
                    process.env[key] = value;
                }
            }
        });
    }
} catch (e) {
    console.error('[TMDB] Failed to load .env file:', e);
}

const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN || envConfig.TMDB_BEARER_TOKEN;
const TMDB_API_TOKEN = process.env.TMDB_API_TOKEN || envConfig.TMDB_API_TOKEN;

// Map TMDB genre IDs to human-readable strings
const GENRE_MAP = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
    10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

function registerTmdbHandlers(ipcMain) {
    ipcMain.handle('search-tmdb', async (event, query) => {
        try {
            if (!TMDB_BEARER_TOKEN) {
                console.warn('[TMDB] No Bearer Token configured in .env');
                return { success: false, error: 'No Bearer Token configured in .env' };
            }

            let url;
            if (!query) {
                // Fetch trending movies and TV shows for the day by default
                url = 'https://api.themoviedb.org/3/trending/all/day?language=en-US';
            } else {
                url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
            }

            console.log(`[TMDB] Fetching API: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    accept: 'application/json',
                    Authorization: `Bearer ${TMDB_BEARER_TOKEN}`
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[TMDB] Fetch failed:', response.status, errText);
                return { success: false, status: response.status, error: errText };
            }

            const data = await response.json();
            const results = (data.results || []).map(item => {
                const title = item.title || item.name || 'Untitled';
                const dateStr = item.release_date || item.first_air_date || '';
                const year = dateStr ? dateStr.substring(0, 4) : '—';
                const rating = item.vote_average ? item.vote_average.toFixed(1) : '—';
                
                // Map genre IDs
                const genres = (item.genre_ids || [])
                    .map(id => GENRE_MAP[id])
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(', ') || 'General';

                const poster = item.poster_path 
                    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                    : 'oppenheimer_poster.png'; // Fallback to our premium asset

                return {
                    id: item.id,
                    media_type: item.media_type || 'movie',
                    title,
                    year,
                    rating,
                    genres,
                    poster,
                    overview: item.overview || 'No description available.'
                };
            });

            return { success: true, results };
        } catch (err) {
            console.error('[TMDB] Handler Error:', err);
            return { success: false, error: err.message };
        }
    });
}

module.exports = {
    registerTmdbHandlers
};
