// src/realdebrid.js - Manages Real-Debrid API authentication and torrent-to-stream unrestricting workflow

const fs = require('fs');
const path = require('path');

// Load environment variables from .env if process.env doesn't have it
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
    console.error('[Real-Debrid] Failed to load .env file:', e);
}

const RD_TOKEN = process.env.REAL_DEBRID_API_TOKEN || envConfig.REAL_DEBRID_API_TOKEN;
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN || envConfig.TMDB_BEARER_TOKEN;

function registerRealDebridHandlers(ipcMain) {
    // 1. Search torrents using Torrentio (scrapes all top indexes) with YTS fallback
    ipcMain.handle('search-torrents', async (event, { movieTitle, tmdbId, mediaType }) => {
        try {
            let imdbId = null;
            const itemMediaType = mediaType || 'movie';

            // Resolve IMDB ID if TMDB ID is available
            if (tmdbId && TMDB_BEARER_TOKEN) {
                console.log(`[Real-Debrid] Fetching IMDB ID from TMDB for TMDB ID: ${tmdbId} (${itemMediaType})`);
                try {
                    const extRes = await fetch(`https://api.themoviedb.org/3/${itemMediaType}/${tmdbId}/external_ids`, {
                        headers: {
                            accept: 'application/json',
                            Authorization: `Bearer ${TMDB_BEARER_TOKEN}`
                        }
                    });
                    if (extRes.ok) {
                        const extData = await extRes.json();
                        imdbId = extData.imdb_id;
                        console.log(`[Real-Debrid] Resolved IMDB ID: ${imdbId}`);
                    }
                } catch (err) {
                    console.error('[Real-Debrid] Failed to fetch external IDs from TMDB:', err);
                }
            }

            // If we have an IMDB ID, query Torrentio
            if (imdbId) {
                const streamType = itemMediaType === 'tv' || itemMediaType === 'series' ? 'series' : 'movie';
                const idParam = itemMediaType === 'tv' || itemMediaType === 'series' ? `${imdbId}:1:1` : imdbId;
                const torrentioUrl = `https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentproject,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex|limit=6/stream/${streamType}/${idParam}.json`;

                console.log(`[Real-Debrid] Fetching Torrentio streams: ${torrentioUrl}`);
                const response = await fetch(torrentioUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.streams && data.streams.length > 0) {
                        console.log(`[Real-Debrid] Found ${data.streams.length} Torrentio streams`);
                        const torrentList = data.streams.map(t => {
                            const nameStr = t.name || '';
                            const titleStr = t.title || '';

                            // Parse Quality (e.g. 1080p, 4k, 720p)
                            const qualMatch = nameStr.match(/(4[Kk]|2160[Pp]|1080[Pp]|720[Pp]|HDR|HDR10|DV)/i) || titleStr.match(/(4[Kk]|2160[Pp]|1080[Pp]|720[Pp]|HDR|HDR10|DV)/i);
                            const quality = qualMatch ? qualMatch[0] : 'HD';

                            // Parse Size (e.g. Size: 2.5 GB or 2.5GB)
                            const sizeMatch = titleStr.match(/Size:\s*([0-9.]+\s*[GgMm][Bb])/i) || titleStr.match(/([0-9.]+\s*[GgMm][Bb])/i);
                            const size = sizeMatch ? sizeMatch[1] : 'Unknown Size';

                            // Parse Seeders and Leechers (e.g. S: 142 L: 12)
                            const seedsMatch = titleStr.match(/S:\s*([0-9]+)/i) || titleStr.match(/👤\s*([0-9]+)/i);
                            const seeds = seedsMatch ? seedsMatch[1] : '—';
                            const peersMatch = titleStr.match(/L:\s*([0-9]+)/i) || titleStr.match(/📥\s*([0-9]+)/i);
                            const peers = peersMatch ? peersMatch[1] : '—';

                            // Generate clean title/description from the stream details
                            const desc = titleStr.split('\n')[0] || nameStr;

                            const magnet = `magnet:?xt=urn:btih:${t.infoHash}&dn=${encodeURIComponent(movieTitle)}&tr=udp://tracker.coppersurfer.tk:6969/announce&tr=udp://9.rarbg.to:2710/announce&tr=udp://tracker.opentrackr.org:1337/announce`;

                            return {
                                quality,
                                type: nameStr.replace('\n', ' ').trim(),
                                size,
                                seeds,
                                peers,
                                hash: t.infoHash,
                                magnet,
                                desc
                            };
                        });

                        return { success: true, title: movieTitle, torrents: torrentList };
                    }
                }
            }

            // Fallback to YTS
            console.log(`[Real-Debrid] Torrentio unavailable or not found. Falling back to YTS for: ${movieTitle}`);
            const response = await fetch(`https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(movieTitle)}`);
            if (!response.ok) {
                return { success: false, error: 'Failed to search torrent index' };
            }
            const data = await response.json();
            const movies = data.data && data.data.movies ? data.data.movies : [];
            
            const match = movies.find(m => m.title.toLowerCase().includes(movieTitle.toLowerCase())) || movies[0];
            if (!match || !match.torrents || match.torrents.length === 0) {
                return { success: false, error: 'No torrent matches found' };
            }

            const torrentList = match.torrents.map(t => {
                const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(match.title)}&tr=udp://tracker.coppersurfer.tk:6969/announce&tr=udp://9.rarbg.to:2710/announce&tr=udp://tracker.opentrackr.org:1337/announce`;
                return {
                    quality: t.quality,
                    type: 'YTS ' + t.type.toUpperCase(),
                    size: t.size,
                    seeds: t.seeds,
                    peers: t.peers,
                    hash: t.hash,
                    magnet,
                    desc: `${match.title} (${t.quality})`
                };
            });

            return { success: true, title: match.title, torrents: torrentList };
        } catch (e) {
            console.error('[Real-Debrid] Search error:', e);
            return { success: false, error: e.message };
        }
    });

    // 2. Real-Debrid unrestrict stream workflow
    ipcMain.handle('rd-stream-torrent', async (event, { magnet, hash }) => {
        try {
            if (!RD_TOKEN) {
                return { success: false, error: 'Real-Debrid API token is not configured in .env' };
            }

            console.log('[Real-Debrid] Adding magnet...');
            // Step 1: Add Magnet to Real-Debrid
            const addRes = await fetch('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${RD_TOKEN}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ magnet })
            });

            if (!addRes.ok) {
                const errText = await addRes.text();
                return { success: false, error: `Failed to add magnet: ${errText}` };
            }

            const addData = await addRes.json();
            const torrentId = addData.id;
            console.log(`[Real-Debrid] Magnet added. ID: ${torrentId}`);

            // Step 2: Get torrent info to select largest/video file
            const infoRes = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
                headers: { Authorization: `Bearer ${RD_TOKEN}` }
            });

            if (!infoRes.ok) {
                return { success: false, error: 'Failed to retrieve torrent info' };
            }

            const infoData = await infoRes.json();
            
            // Step 3: Select files (largest video file index)
            // Let's identify the files. Real-Debrid maps file IDs (1-indexed).
            let targetFiles = 'all';
            if (infoData.files && infoData.files.length > 0) {
                // Find largest video file ID
                const videoFiles = infoData.files.filter(f => f.path.match(/\.(mp4|mkv|avi|webm)$/i));
                if (videoFiles.length > 0) {
                    const largestVideo = videoFiles.reduce((prev, current) => (prev.bytes > current.bytes) ? prev : current);
                    targetFiles = largestVideo.id;
                }
            }

            console.log(`[Real-Debrid] Selecting files: ${targetFiles}`);
            const selectRes = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${RD_TOKEN}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ files: targetFiles })
            });

            if (!selectRes.ok) {
                return { success: false, error: 'Failed to select torrent files' };
            }

            // Step 4: Wait/poll for the direct links to become available
            console.log('[Real-Debrid] Polling torrent details for direct links...');
            let links = [];
            let attempts = 0;
            while (attempts < 10) {
                const checkRes = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
                    headers: { Authorization: `Bearer ${RD_TOKEN}` }
                });
                const checkData = await checkRes.json();
                if (checkData.links && checkData.links.length > 0) {
                    links = checkData.links;
                    break;
                }
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (links.length === 0) {
                return { success: false, error: 'Torrent link selection is currently downloading (not cached on Real-Debrid).' };
            }

            // Step 5: Unrestrict (debrid) the first direct link
            console.log(`[Real-Debrid] Unrestricting link: ${links[0]}`);
            const unrestrictRes = await fetch('https://api.real-debrid.com/rest/1.0/unrestrict/link', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${RD_TOKEN}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ link: links[0] })
            });

            if (!unrestrictRes.ok) {
                const errText = await unrestrictRes.text();
                return { success: false, error: `Failed to unrestrict link: ${errText}` };
            }

            const unrestrictData = await unrestrictRes.json();
            console.log('[Real-Debrid] Unrestricting succeeded. Direct stream link:', unrestrictData.download);

            return {
                success: true,
                streamUrl: unrestrictData.download,
                filename: unrestrictData.filename
            };
        } catch (e) {
            console.error('[Real-Debrid] Workflow Error:', e);
            return { success: false, error: e.message };
        }
    });

    // 3. Secure Proxy Tunnel Debrid URL Unrestricting
    ipcMain.handle('rd-unrestrict-url', async (event, { link, proxy }) => {
        try {
            if (!RD_TOKEN) {
                return { success: false, error: 'Real-Debrid API token is not configured in .env' };
            }

            if (link.startsWith('magnet:')) {
                console.log('[Real-Debrid] Processing magnet for unrestrict...');
                const addRes = await makeProxiedRequest('https://api.real-debrid.com/rest/1.0/torrents/addMagnet', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${RD_TOKEN}` },
                    body: new URLSearchParams({ magnet: link })
                }, proxy);

                if (!addRes.ok) {
                    const errText = await addRes.text();
                    return { success: false, error: `Failed to add magnet: ${errText}` };
                }

                const addData = await addRes.json();
                const torrentId = addData.id;

                const infoRes = await makeProxiedRequest(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
                    headers: { Authorization: `Bearer ${RD_TOKEN}` }
                }, proxy);

                if (!infoRes.ok) return { success: false, error: 'Failed to retrieve torrent info' };
                const infoData = await infoRes.json();
                
                let targetFiles = 'all';
                if (infoData.files && infoData.files.length > 0) {
                    const videoFiles = infoData.files.filter(f => f.path.match(/\.(mp4|mkv|avi|webm)$/i));
                    if (videoFiles.length > 0) {
                        const largestVideo = videoFiles.reduce((prev, current) => (prev.bytes > current.bytes) ? prev : current);
                        targetFiles = largestVideo.id;
                    }
                }

                const selectRes = await makeProxiedRequest(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${RD_TOKEN}` },
                    body: new URLSearchParams({ files: targetFiles })
                }, proxy);

                if (!selectRes.ok) return { success: false, error: 'Failed to select torrent files' };

                let links = [];
                let attempts = 0;
                let finalInfo = null;
                while (attempts < 10) {
                    const checkRes = await makeProxiedRequest(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
                        headers: { Authorization: `Bearer ${RD_TOKEN}` }
                    }, proxy);
                    finalInfo = await checkRes.json();
                    if (finalInfo.links && finalInfo.links.length > 0) {
                        links = finalInfo.links;
                        break;
                    }
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (links.length === 0) {
                    return { success: false, error: 'Torrent is currently downloading on Real-Debrid (not cached).' };
                }

                const unrestrictRes = await makeProxiedRequest('https://api.real-debrid.com/rest/1.0/unrestrict/link', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${RD_TOKEN}` },
                    body: new URLSearchParams({ link: links[0] })
                }, proxy);

                if (!unrestrictRes.ok) {
                    const errText = await unrestrictRes.text();
                    return { success: false, error: `Failed to unrestrict link: ${errText}` };
                }

                const unrestrictData = await unrestrictRes.json();
                return {
                    success: true,
                    download: unrestrictData.download,
                    filename: unrestrictData.filename,
                    filesize: finalInfo ? finalInfo.bytes : (unrestrictData.filesize || 0),
                    isMagnet: true
                };
            }

            console.log('[Real-Debrid] Unrestricting standard link...');
            const unrestrictRes = await makeProxiedRequest('https://api.real-debrid.com/rest/1.0/unrestrict/link', {
                method: 'POST',
                headers: { Authorization: `Bearer ${RD_TOKEN}` },
                body: new URLSearchParams({ link: link })
            }, proxy);

            if (!unrestrictRes.ok) {
                const errText = await unrestrictRes.text();
                return { success: false, error: `Failed to unrestrict link: ${errText}` };
            }

            const unrestrictData = await unrestrictRes.json();
            return {
                success: true,
                download: unrestrictData.download,
                filename: unrestrictData.filename,
                filesize: unrestrictData.filesize || 0,
                isMagnet: false
            };
        } catch (e) {
            console.error('[Real-Debrid] Proxy-aware unrestrict error:', e);
            return { success: false, error: e.message };
        }
    });

    // 4. Secure Proxy Tunnel Stream Downloader
    ipcMain.handle('rd-download-file', async (event, { downloadUrl, filename, proxy }) => {
        try {
            const { app } = require('electron');
            const downloadsDir = app.getPath('downloads');
            const destPath = path.join(downloadsDir, filename);

            console.log(`[Real-Debrid] Initiating proxy-aware download: ${filename} to ${destPath}`);

            // Download file
            await downloadFileWithProxy(downloadUrl, destPath, proxy, (progressData) => {
                event.sender.send('rd-download-progress', progressData);
            });

            return { success: true, destPath };
        } catch (e) {
            console.error('[Real-Debrid] Proxy-aware download error:', e);
            event.sender.send('rd-download-progress', {
                progress: 0,
                speed: 0,
                bytesDownloaded: 0,
                totalBytes: 0,
                status: 'Failed',
                error: e.message
            });
            return { success: false, error: e.message };
        }
    });

    // 5. Test Proxy Tunnel Connection
    ipcMain.handle('rd-test-proxy', async (event, proxy) => {
        try {
            if (!proxy) {
                return { success: false, error: 'Proxy address is empty' };
            }
            console.log(`[Real-Debrid] Testing proxy tunnel connection to: ${proxy}`);
            const startTime = Date.now();
            
            const testRes = await makeProxiedRequest('https://api.real-debrid.com/rest/1.0/time', {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }, proxy);

            const latency = Date.now() - startTime;
            if (testRes.ok) {
                console.log(`[Real-Debrid] Proxy test successful! Latency: ${latency}ms`);
                return { success: true, latency };
            } else {
                return { success: false, error: `Proxy returned status ${testRes.status}` };
            }
        } catch (e) {
            console.error('[Real-Debrid] Proxy test failed:', e);
            return { success: false, error: e.message };
        }
    });
}

// ==========================================
// Proxy Connection & Downloader Utilities
// ==========================================

const http = require('http');
const https = require('https');
const { URL } = require('url');

function parseProxyString(proxyStr) {
    if (!proxyStr) return null;
    let proxyNormalized = proxyStr.trim();
    if (!/^https?:\/\//i.test(proxyNormalized)) {
        proxyNormalized = 'http://' + proxyNormalized;
    }
    try {
        const proxyUrl = new URL(proxyNormalized);
        const host = proxyUrl.hostname;
        const port = parseInt(proxyUrl.port, 10) || 80;
        let authHeader = null;
        if (proxyUrl.username && proxyUrl.password) {
            authHeader = 'Basic ' + Buffer.from(decodeURIComponent(proxyUrl.username) + ':' + decodeURIComponent(proxyUrl.password)).toString('base64');
        }
        return { host, port, authHeader };
    } catch (e) {
        console.error('[Real-Debrid] Failed to parse proxy string:', proxyStr, e);
        return null;
    }
}

function makeProxiedRequest(url, options = {}, proxyStr) {
    if (!proxyStr) {
        return fetch(url, options);
    }
    const proxyConfig = parseProxyString(proxyStr);
    if (!proxyConfig) {
        return Promise.reject(new Error('Invalid proxy address format'));
    }
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url);
            const connectHeaders = {};
            if (proxyConfig.authHeader) {
                connectHeaders['Proxy-Authorization'] = proxyConfig.authHeader;
            }
            
            const req = http.request({
                host: proxyConfig.host,
                port: proxyConfig.port,
                method: 'CONNECT',
                path: `${urlObj.hostname}:${urlObj.port || 443}`,
                headers: connectHeaders
            });
            
            req.on('connect', (res, socket, socketHead) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Proxy CONNECT failed with status: ${res.statusCode}`));
                    return;
                }
                const headers = options.headers || {};
                let bodyData = options.body;
                if (bodyData && typeof bodyData.toString === 'function') {
                    bodyData = bodyData.toString();
                    if (!headers['Content-Type'] && !headers['content-type']) {
                        headers['Content-Type'] = 'application/x-www-form-urlencoded';
                    }
                }
                
                const requestOptions = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || 443,
                    path: urlObj.pathname + urlObj.search,
                    method: options.method || 'GET',
                    headers: headers,
                    createConnection: () => socket
                };
                
                const clientReq = https.request(requestOptions, (clientRes) => {
                    let bodyChunks = [];
                    clientRes.on('data', chunk => bodyChunks.push(chunk));
                    clientRes.on('end', () => {
                        const bodyBuffer = Buffer.concat(bodyChunks);
                        const bodyString = bodyBuffer.toString('utf8');
                        resolve({
                            ok: clientRes.statusCode >= 200 && clientRes.statusCode < 300,
                            status: clientRes.statusCode,
                            text: async () => bodyString,
                            json: async () => JSON.parse(bodyString)
                        });
                    });
                });
                
                clientReq.on('error', (err) => {
                    reject(err);
                });
                
                if (bodyData) {
                    clientReq.write(bodyData);
                }
                clientReq.end();
            });
            
            req.on('error', (err) => {
                reject(new Error(`Proxy connection error: ${err.message}`));
            });
            
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

function downloadFileWithProxy(downloadUrl, destPath, proxyStr, onProgress) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(downloadUrl);
        const fileStream = fs.createWriteStream(destPath);
        
        let req;
        
        const handleResponse = (res) => {
            if (res.statusCode !== 200) {
                fileStream.close();
                try { fs.unlinkSync(destPath); } catch(_) {}
                return reject(new Error(`Server returned status code: ${res.statusCode}`));
            }
            
            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let downloadedBytes = 0;
            let lastUpdate = Date.now();
            let lastBytes = 0;
            
            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                fileStream.write(chunk);
                
                const now = Date.now();
                if (now - lastUpdate >= 300) {
                    const elapsed = (now - lastUpdate) / 1000;
                    const speed = elapsed > 0 ? (downloadedBytes - lastBytes) / elapsed : 0;
                    
                    onProgress({
                        progress: totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0,
                        speed,
                        bytesDownloaded: downloadedBytes,
                        totalBytes,
                        status: 'Downloading'
                    });
                    
                    lastUpdate = now;
                    lastBytes = downloadedBytes;
                }
            });
            
            res.on('end', () => {
                fileStream.end();
                onProgress({
                    progress: 100,
                    speed: 0,
                    bytesDownloaded: downloadedBytes,
                    totalBytes,
                    status: 'Completed'
                });
                resolve();
            });
        };
 
        if (proxyStr) {
            const proxyConfig = parseProxyString(proxyStr);
            if (!proxyConfig) {
                fileStream.close();
                try { fs.unlinkSync(destPath); } catch(_) {}
                return reject(new Error('Invalid proxy address format'));
            }
            const connectHeaders = {};
            if (proxyConfig.authHeader) {
                connectHeaders['Proxy-Authorization'] = proxyConfig.authHeader;
            }
            
            req = http.request({
                host: proxyConfig.host,
                port: proxyConfig.port,
                method: 'CONNECT',
                path: `${urlObj.hostname}:${urlObj.port || 443}`,
                headers: connectHeaders
            });
            
            req.on('connect', (res, socket, socketHead) => {
                if (res.statusCode !== 200) {
                    fileStream.close();
                    try { fs.unlinkSync(destPath); } catch(_) {}
                    reject(new Error(`Proxy CONNECT failed with status: ${res.statusCode}`));
                    return;
                }
                const clientReq = https.request({
                    hostname: urlObj.hostname,
                    port: urlObj.port || 443,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    createConnection: () => socket
                }, handleResponse);
                
                clientReq.on('error', (err) => {
                    fileStream.close();
                    try { fs.unlinkSync(destPath); } catch(_) {}
                    reject(err);
                });
                clientReq.end();
            });
            
            req.on('error', (err) => {
                fileStream.close();
                try { fs.unlinkSync(destPath); } catch(_) {}
                reject(err);
            });
            req.end();
        } else {
            https.get(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, handleResponse)
                .on('error', (err) => {
                    fileStream.close();
                    try { fs.unlinkSync(destPath); } catch(_) {}
                    reject(err);
                });
        }
    });
}

module.exports = {
    registerRealDebridHandlers
};
