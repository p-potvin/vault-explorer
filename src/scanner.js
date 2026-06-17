const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const child_process = require('child_process');
const { execFile } = child_process;
const { app } = require('electron');
const previews = require('./previews');

function globToRegex(pattern) {
    let regexStr = '^';
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === '*') {
            if (pattern[i + 1] === '*') {
                regexStr += '.*';
                i++;
            } else {
                regexStr += '[^/\\\\]*';
            }
        } else if (char === '?') {
            regexStr += '[^/\\\\]';
        } else if ('./+^${}()|[\]\\'.includes(char)) {
            regexStr += '\\' + char;
        } else {
            regexStr += char;
        }
    }
    regexStr += '$';
    return new RegExp(regexStr, 'i');
}

async function findVideosAsync(dir, exclusionRegexes = [], rootDir = dir, visitedPaths = new Set(), depth = 0) {
    let results = [];
    if (depth > 12) return results; // Prevent native stack overflows on extremely deep/recursive trees
    
    let realDir;
    try {
        const resolvedPath = await fsPromises.realpath(dir);
        realDir = resolvedPath.toLowerCase();
        if (visitedPaths.has(realDir)) {
            return results; // Circular link detected! Prevent infinite loops
        }
        visitedPaths.add(realDir);
    } catch (e) {
        return results; // Broken cloud link or unreadable directory - skip cleanly
    }

    try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        
        for (const d of entries) {
            try {
                const fullPath = path.join(dir, d.name);
                const relativePath = path.relative(rootDir, fullPath);
                
                const isExcluded = exclusionRegexes.some(rx => rx.test(relativePath) || rx.test(d.name));
                if (isExcluded) continue;

                let isDir = d.isDirectory();
                if (d.isSymbolicLink()) {
                    try {
                        const targetStat = await fsPromises.stat(fullPath);
                        if (targetStat.isDirectory()) {
                            isDir = true;
                        }
                    } catch(e) {}
                }

                if (isDir) {
                    const nameLower = d.name.toLowerCase();
                    // System hidden directories to skip completely
                    const isSystemDir = [
                        '.thumbs', '.git', '.normalized', '.trickplay', 'node_modules', 'bower_components', 
                        'jspm_packages', 'web_modules', '.venv', 'venv', 'env', 'virtualenv', '.conda',
                        '.gitmodules', '.gitattributes', '.gitignore', '.github', '.svn', '.hg',
                        '.npm', '.yarn', '.pnpm-store', '.cache', '.sass-cache', '.eslintcache', 
                        '__pycache__', '.parcel-cache', '.next', '.nuxt', 'dist', 'build', 'out', 
                        'target', 'tmp', 'temp', '$recycle.bin', 'recycler', '.trashes', 
                        'system volume information', 'appdata', 'local settings'
                    ].includes(nameLower) || 
                    nameLower.startsWith('.') || 
                    nameLower.startsWith('$') ||
                    nameLower.includes('google drive') ||
                    nameLower.includes('onedrive') ||
                    nameLower.includes('dropbox') ||
                    nameLower.includes('proton drive') ||
                    nameLower.includes('icloud photos') ||
                    nameLower.includes('icloud drive') ||
                    nameLower.includes('mega') ||
                    nameLower.includes('nextcloud') ||
                    nameLower.includes('pcloud') ||
                    nameLower.includes('yandex disk') ||
                    nameLower.includes('yandexdisk');

                    if (!isSystemDir) {
                        const subResults = await findVideosAsync(fullPath, exclusionRegexes, rootDir, visitedPaths, depth + 1);
                        results.push(...subResults);
                    }
                } else {
                    const nameLower = d.name.toLowerCase();
                    // Skip system metadata, package lock, and preview files
                    const isSystemFile = [
                        '.ds_store', 'thumbs.db', 'desktop.ini', 'ehthumbs.db',
                        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
                        'ntuser.dat', '.gitignore', '.gitmodules', '.gitattributes'
                    ].includes(nameLower) || 
                    nameLower.endsWith('_p.mp4') || 
                    nameLower.endsWith('_p.webm') || 
                    nameLower.endsWith('-preview.mp4') || 
                    nameLower.endsWith('-preview.webm') ||
                    nameLower.endsWith('.meta.json');

                    if (!isSystemFile) {
                        results.push(fullPath);
                    }
                }
            } catch (entryErr) {
                console.error(`[scanner:find] Failed reading directory entry inside ${dir}:`, entryErr);
            }
        }
    } catch(e) {}
    return results;
}

const cachePath = app ? path.join(app.getPath('userData'), 'vault-cache.json') : path.join(__dirname, '..', 'vault-cache.json');

async function loadCache() {
    try {
        let exists = false;
        try {
            await fsPromises.access(cachePath);
            exists = true;
        } catch(e) {}
        
        if (exists) {
            const data = await fsPromises.readFile(cachePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[scanner:cache] Failed to load scan cache:', e);
    }
    return {};
}

async function saveCache(cache) {
    try {
        await fsPromises.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
        console.error('[scanner:cache] Failed to save scan cache:', e);
    }
}

async function _processFileNodes(filesArray, allFilesSet, vaultRoot) {
    const output = [];
    if (!vaultRoot && filesArray.length > 0) {
        vaultRoot = path.dirname(filesArray[0]);
    }
    let thumbsDir = vaultRoot ? path.join(vaultRoot, '.thumbs') : null;
    if (thumbsDir) {
        try {
            let thumbsExist = false;
            try {
                await fsPromises.access(thumbsDir);
                thumbsExist = true;
            } catch(e) {}
            
            if (!thumbsExist) {
                await fsPromises.mkdir(thumbsDir, { recursive: true });
            }
        } catch (e) {
            console.error(`[scanner:thumbs] Failed to initialize thumbs directory: ${thumbsDir}`, e);
            thumbsDir = null;
        }
    }

    const CONCURRENCY_LIMIT = 32;

    async function processFile(res) {
        try {
            const ext = path.extname(res).toLowerCase();
            let type = 'other';
            if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) type = 'video';
            else if (['.jpg', '.png', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
            else if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'].includes(ext)) type = 'audio';
            else if (ext === '.enc') type = 'encrypted';
            
            if (type !== 'video' && type !== 'image' && type !== 'audio' && type !== 'encrypted') return;

            const dir = path.dirname(res);
            const name = path.basename(res);
            const baseName = path.basename(res, ext);
            
            if (res.split(/[\\/]/).includes('.thumbs')) return;

            let checkName = baseName;

            if (type === 'image' || ext === '.webm' || name.endsWith('_p.mp4') || name.endsWith('-preview.mp4')) {
                if (name.endsWith('_p.mp4')) checkName = baseName.substring(0, baseName.length - 2);
                else if (name.endsWith('-preview.mp4')) checkName = baseName.replace('-preview', '');
                else if (name.endsWith('-poster')) checkName = baseName.replace('-poster', '');
                
                if (allFilesSet) {
                    const hasParent = ['.mp4', '.mkv', '.avi', '.mov', '.ts', '.wmv'].some(e => 
                        allFilesSet.has(path.join(dir, checkName + e).toLowerCase())
                    );
                    if (hasParent) return; 
                }
            }

            let poster = null;
            let hoverWebm = null;

            if (type === 'video') {
                const localThumbsDir = path.join(dir, '.thumbs');
                const localThumb = path.join(localThumbsDir, `${baseName}.jpg`);
                const localWebm = path.join(localThumbsDir, `${baseName}.webm`);

                let hasLocalThumb = false;
                try {
                    await fsPromises.access(localThumb);
                    hasLocalThumb = true;
                } catch(e) {}

                if (hasLocalThumb) {
                    poster = localThumb;
                } else if (thumbsDir) {
                    try {
                        const globalThumb = path.join(thumbsDir, `${baseName}.jpg`);
                        await fsPromises.access(globalThumb);
                        poster = globalThumb;
                    } catch(e) {}
                }

                let hasLocalWebm = false;
                try {
                    await fsPromises.access(localWebm);
                    hasLocalWebm = true;
                } catch(e) {}

                if (hasLocalWebm) {
                    hoverWebm = localWebm;
                } else if (thumbsDir) {
                    try {
                        const globalWebm = path.join(thumbsDir, `${baseName}.webm`);
                        await fsPromises.access(globalWebm);
                        hoverWebm = globalWebm;
                    } catch(e) {}
                }
            } else if (type === 'image') {
                const localThumbsDir = path.join(dir, '.thumbs');
                const localThumb = path.join(localThumbsDir, `${baseName}_enhanced.jpg`);
                let hasLocalThumb = false;
                try {
                    await fsPromises.access(localThumb);
                    hasLocalThumb = true;
                } catch(e) {}

                if (hasLocalThumb) {
                    poster = localThumb;
                } else {
                    poster = res;
                }
            }

            let size = 0;
            let mtime = Date.now();
            let mtimeFormatted = '';
            try {
                const stat = await fsPromises.stat(res);
                size = stat.size;
                mtime = stat.mtimeMs;
                const date = new Date(stat.mtimeMs);
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                const hr = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                mtimeFormatted = `${y}-${m}-${d} ${hr}:${min}`;
            } catch (e) {}

            const metaPath = res + '.meta.json';
            let meta = null;
            let hasMeta = false;
            try {
                await fsPromises.access(metaPath);
                hasMeta = true;
            } catch(e) {}

            if (hasMeta) {
                try {
                    const metaContent = await fsPromises.readFile(metaPath, 'utf8');
                    meta = JSON.parse(metaContent);
                } catch (e) {}
            }

            // Plex/Jellyfin/Kodi NFO interoperability: check for .nfo file adjacent to the video file
            let nfoMeta = {};
            if (type === 'video') {
                const nfoPath = path.join(dir, `${baseName}.nfo`);
                let hasNfo = false;
                try {
                    await fsPromises.access(nfoPath);
                    hasNfo = true;
                } catch(e) {}

                if (hasNfo) {
                    try {
                        const nfoContent = await fsPromises.readFile(nfoPath, 'utf8');
                        const titleMatch = nfoContent.match(/<title>([\s\S]*?)<\/title>/i);
                        const yearMatch = nfoContent.match(/<year>([\s\S]*?)<\/year>/i);
                        const plotMatch = nfoContent.match(/<plot>([\s\S]*?)<\/plot>/i);
                        const ratingMatch = nfoContent.match(/<rating>([\s\S]*?)<\/rating>/i);
                        
                        if (titleMatch) nfoMeta.title = titleMatch[1].trim();
                        if (yearMatch) nfoMeta.year = parseInt(yearMatch[1].trim(), 10);
                        if (plotMatch) nfoMeta.plot = plotMatch[1].trim();
                        if (ratingMatch) nfoMeta.rating = parseFloat(ratingMatch[1].trim());
                    } catch (nfoErr) {
                        console.error(`[scanner:nfo] Error parsing NFO for ${res}:`, nfoErr);
                    }
                }
            }

            let enhancedPath = null;
            let trickplayFolder = null;
            if (type === 'video' || type === 'encrypted') {
                const potentialEnhanced = path.join(dir, '.thumbs', `${baseName}_enhanced${ext}`);
                let hasEnhanced = false;
                try {
                    await fsPromises.access(potentialEnhanced);
                    hasEnhanced = true;
                } catch(e) {}

                if (hasEnhanced) {
                    enhancedPath = potentialEnhanced;
                }
            }
            if (type === 'video') {
                const potentialTrickplay = path.join(dir, `${baseName}.trickplay`);
                let hasTrickplay = false;
                try {
                    await fsPromises.access(potentialTrickplay);
                    hasTrickplay = true;
                } catch(e) {}

                if (hasTrickplay) {
                    trickplayFolder = potentialTrickplay;
                }
            }

            output.push({
                name,
                path: res,
                type,
                poster,
                thumbnail: poster,
                hoverWebm,
                size,
                mtime,
                mtimeFormatted,
                ext,
                duration: (meta && meta.duration) ? meta.duration : 0,
                width: meta ? meta.width : null,
                height: meta ? meta.height : null,
                codec: meta ? meta.codec : null,
                fps: meta ? meta.fps : null,
                audioCodec: meta ? meta.audioCodec : null,
                channels: meta ? meta.channels : null,
                sampleRate: meta ? meta.sampleRate : null,
                bitrate: meta ? meta.bitrate : null,
                hasAudio: meta ? meta.hasAudio : null,
                hasVideo: meta ? meta.hasVideo : null,
                enhancements: meta ? meta.enhancements : null,
                enhancedPath,
                trickplayFolder,
                nfoMeta: Object.keys(nfoMeta).length > 0 ? nfoMeta : null
            });
        } catch (itemErr) {
            console.error(`[scanner:process] Skipping corrupted/offline file node: ${res}`, itemErr);
        }
    }

    for (let i = 0; i < filesArray.length; i += CONCURRENCY_LIMIT) {
        const batch = filesArray.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(batch.map(file => processFile(file)));
    }

    return output;
}

function registerScannerHandlers(ipcMain) {
    ipcMain.handle('get-cached-directory', async (event, dirPath) => {
        if (!dirPath) return [];
        const normPath = dirPath.toLowerCase().replace(/\\/g, '/');
        const cache = await loadCache();
        if (cache[normPath]) {
            return cache[normPath].items || [];
        }
        return [];
    });

    ipcMain.handle('scan-directory', async (event, dirPath) => {
        console.log(`[main:scan] Scanning directory: ${dirPath}`);
        if (!fs.existsSync(dirPath)) return [];
        
        try {
            const settingsPath = path.join(app.getPath('userData'), 'vault-settings.json');
            let exclusions = [];
            if (fs.existsSync(settingsPath)) {
                try {
                    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                    exclusions = settings.globExclusions || [];
                } catch(err) {
                    console.error("[main:scan] Failed to parse vault-settings:", err);
                }
            }
            const exclusionRegexes = exclusions.map(pat => globToRegex(pat));

            const files = await findVideosAsync(dirPath, exclusionRegexes, dirPath);
            const fileSet = new Set(files.map(f => f.toLowerCase()));
            const scannedItems = await _processFileNodes(files, fileSet, dirPath);

            // Save results to persistent cache
            const normPath = dirPath.toLowerCase().replace(/\\/g, '/');
            const cache = await loadCache();
            cache[normPath] = {
                timestamp: Date.now(),
                items: scannedItems
            };
            await saveCache(cache);

            return scannedItems;
        } catch (e) {
            console.error("[main:scan] Scan failed:", e);
            return [];
        }
    });

    ipcMain.handle('scan-specific-files', async (event, pathsArray) => {
        // Defensive: drop non-string / empty entries so one bad path can't 502 the whole call.
        const safe = Array.isArray(pathsArray)
            ? pathsArray.filter(p => typeof p === 'string' && p.trim() !== '')
            : [];
        if (safe.length === 0) return [];
        const fileSet = new Set(safe.map(f => f.toLowerCase()));
        return await _processFileNodes(safe, fileSet, null);
    });

    ipcMain.handle('find-subtitles', async (event, videoPath, queryTitle, skipOpenSubtitles, langsOverride) => {
        let base = '';
        const results = [];
        if (videoPath && !videoPath.startsWith('http://') && !videoPath.startsWith('https://')) {
            try {
                const dir = path.dirname(videoPath);
                const ext = path.extname(videoPath);
                base = path.basename(videoPath, ext);
                const files = fs.readdirSync(dir);
                const addedLabels = new Set();
                for (const f of files) {
                    if (f.toLowerCase().startsWith(base.toLowerCase()) && (f.toLowerCase().endsWith('.srt') || f.toLowerCase().endsWith('.vtt'))) {
                        const isSrt = f.toLowerCase().endsWith('.srt');
                        const parts = f.substring(base.length).split('.');
                        let label = 'Original';
                        if (parts.length >= 3) {
                            label = parts[parts.length - 2].toUpperCase();
                        }
                        
                        if (addedLabels.has(label)) continue;
                        addedLabels.add(label);
                        
                        let finalPath = path.join(dir, f);
                        if (isSrt) {
                            try {
                                const subDir = path.join(dir, '.subtitles');
                                if (!fs.existsSync(subDir)) {
                                    fs.mkdirSync(subDir, { recursive: true });
                                }
                                const vttPath = path.join(subDir, f.replace(/\.srt$/i, '.vtt'));
                                if (!fs.existsSync(vttPath)) {
                                    const srtText = fs.readFileSync(finalPath, 'utf8');
                                    const vttText = 'WEBVTT\n\n' + srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
                                    fs.writeFileSync(vttPath, vttText, 'utf8');
                                }
                                finalPath = vttPath;
                            } catch (convErr) {
                                console.error("[Subtitles] Local conversion failed:", convErr);
                            }
                        }
                        
                        results.push({
                            path: finalPath,
                            label,
                            lang: label.toLowerCase() === 'original' ? 'und' : label.toLowerCase()
                        });
                    }
                }
            } catch(e) {}
        }

        const searchQuery = queryTitle || base;
        if (!searchQuery || skipOpenSubtitles) {
            return results;
        }

        // Query OpenSubtitles API if configured
        const userDataPath = app.getPath('userData');
        const settingsPath = path.join(userDataPath, 'vault-settings.json');
        let apiKey = process.env.OPENSUBTITLES_API_KEY;
        try {
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                if (settings.openSubtitlesKey) {
                    apiKey = settings.openSubtitlesKey;
                }
            }
        } catch (e) {}

        if (apiKey) {
            console.log(`[OpenSubtitles] Querying OpenSubtitles API for: ${searchQuery}`);
            try {
                const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
                // langsOverride lets the renderer narrow the search per click
                // (e.g. 'fr-CA,fr' for the French Canadian preset). Otherwise
                // default to en+fr (and add Spanish only if the user opted in).
                let langsParam;
                if (typeof langsOverride === 'string' && langsOverride.trim()) {
                    langsParam = langsOverride.trim();
                } else {
                    let includeEs = false;
                    try {
                        if (fs.existsSync(settingsPath)) {
                            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                            includeEs = settings.subsIncludeSpanish === true;
                        }
                    } catch (_) {}
                    langsParam = includeEs ? 'en,fr,es' : 'en,fr';
                }
                const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(searchQuery)}&languages=${encodeURIComponent(langsParam)}`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
                const response = await fetchFn(searchUrl, {
                    headers: {
                        'Api-Key': apiKey,
                        'User-Agent': 'VaultExplorer v1.0.0'
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && Array.isArray(data.data)) {
                        const hits = data.data.slice(0, 5);
                        for (const hit of hits) {
                            const attrs = hit.attributes;
                            if (attrs && attrs.files && attrs.files.length > 0) {
                                const fileId = attrs.files[0].file_id;
                                const releaseName = attrs.release || attrs.feature_details.title || searchQuery;
                                const lang = attrs.language || 'en';
                                
                                results.push({
                                    path: `opensubtitles://${fileId}`,
                                    label: `OpenSubtitles [${lang.toUpperCase()}] - ${releaseName}`,
                                    lang: lang,
                                    isOpenSubtitles: true,
                                    fileId: fileId
                                });
                            }
                        }
                    }
                } else {
                    console.error('[OpenSubtitles] API error:', response.status, await response.text());
                }
            } catch (err) {
                console.error('[OpenSubtitles] Search request failed:', err);
            }
        }
        return results;
    });

    ipcMain.handle('download-subtitle-track', async (event, { fileId, lang, videoPath }) => {
        const userDataPath = app.getPath('userData');
        const settingsPath = path.join(userDataPath, 'vault-settings.json');
        let apiKey = process.env.OPENSUBTITLES_API_KEY;
        try {
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                if (settings.openSubtitlesKey) {
                    apiKey = settings.openSubtitlesKey;
                }
            }
        } catch (e) {}

        if (!apiKey) {
            throw new Error("OpenSubtitles API key is not configured");
        }

        console.log(`[OpenSubtitles] Requesting download for File ID: ${fileId}`);
        const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
        const downloadUrl = `https://api.opensubtitles.com/api/v1/download`;
        const controller1 = new AbortController();
        const timeoutId1 = setTimeout(() => controller1.abort(), 15000); // 15 second timeout
        const downloadRes = await fetchFn(downloadUrl, {
            method: 'POST',
            headers: {
                'Api-Key': apiKey,
                'User-Agent': 'VaultExplorer v1.0.0',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file_id: parseInt(fileId) }),
            signal: controller1.signal
        });
        clearTimeout(timeoutId1);

        if (!downloadRes.ok) {
            const errText = await downloadRes.text();
            throw new Error(`OpenSubtitles download ticket failed: ${downloadRes.status} ${errText}`);
        }

        const downloadData = await downloadRes.json();
        if (!downloadData || !downloadData.link) {
            throw new Error("No download link returned by OpenSubtitles");
        }

        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 15000); // 15 second timeout
        const subFileRes = await fetchFn(downloadData.link, { signal: controller2.signal });
        clearTimeout(timeoutId2);
        if (!subFileRes.ok) {
            throw new Error(`Failed to fetch subtitle file: ${subFileRes.status}`);
        }
        const srtContent = await subFileRes.text();
        const vttContent = 'WEBVTT\n\n' + srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

        let finalSubPath;
        if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
            const tempDir = app.getPath('temp');
            const subDir = path.join(tempDir, 'vault-subtitles');
            if (!fs.existsSync(subDir)) {
                fs.mkdirSync(subDir, { recursive: true });
            }
            finalSubPath = path.join(subDir, `${fileId}.${lang}.vtt`);
        } else {
            const dir = path.dirname(videoPath);
            const subDir = path.join(dir, '.subtitles');
            if (!fs.existsSync(subDir)) {
                fs.mkdirSync(subDir, { recursive: true });
            }
            const ext = path.extname(videoPath);
            const base = path.basename(videoPath, ext);
            finalSubPath = path.join(subDir, `${base}.${lang}.vtt`);
        }
        
        fs.writeFileSync(finalSubPath, vttContent, 'utf8');
        console.log(`[OpenSubtitles] Saved subtitle track to WebVTT: ${finalSubPath}`);
        return finalSubPath;
    });
}

module.exports = {
    findVideosAsync,
    _processFileNodes,
    registerScannerHandlers
};
