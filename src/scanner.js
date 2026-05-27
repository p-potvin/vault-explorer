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
        realDir = fs.realpathSync(dir).toLowerCase();
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
                        const targetStat = fs.statSync(fullPath);
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

function _processFileNodes(filesArray, allFilesSet, vaultRoot) {
    const output = [];
    if (!vaultRoot && filesArray.length > 0) {
        vaultRoot = path.dirname(filesArray[0]);
    }
    let thumbsDir = vaultRoot ? path.join(vaultRoot, '.thumbs') : null;
    if (thumbsDir) {
        try {
            if (!fs.existsSync(thumbsDir)) {
                fs.mkdirSync(thumbsDir, { recursive: true });
            }
            previews.convertLegacyMp4Previews(thumbsDir);
        } catch (e) {
            console.error(`[scanner:thumbs] Failed to initialize thumbs directory: ${thumbsDir}`, e);
            thumbsDir = null;
        }
    }

    for (let res of filesArray) {
        try {
            const ext = path.extname(res).toLowerCase();
            let type = 'other';
            if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) type = 'video';
            else if (['.jpg', '.png', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
            else if (ext === '.enc') type = 'encrypted';
            
            if (type !== 'video' && type !== 'image' && type !== 'encrypted') continue;

            const dir = path.dirname(res);
            const name = path.basename(res);
            const baseName = path.basename(res, ext);
            
            if (res.split(/[\\/]/).includes('.thumbs')) continue;

            let checkName = baseName;

            if (type === 'image' || ext === '.webm' || name.endsWith('_p.mp4') || name.endsWith('-preview.mp4')) {
                if (name.endsWith('_p.mp4')) checkName = baseName.substring(0, baseName.length - 2);
                else if (name.endsWith('-preview.mp4')) checkName = baseName.replace('-preview', '');
                else if (name.endsWith('-poster')) checkName = baseName.replace('-poster', '');
                
                if (allFilesSet) {
                    const hasParent = ['.mp4', '.mkv', '.avi', '.mov', '.ts', '.wmv'].some(e => 
                        allFilesSet.has(path.join(dir, checkName + e).toLowerCase())
                    );
                    if (hasParent) continue; 
                }
            }

            let poster = null;
            let hoverWebm = null;

            if (type === 'video') {
                const localThumbsDir = path.join(dir, '.thumbs');
                const localThumb = path.join(localThumbsDir, `${baseName}.jpg`);
                const localWebm = path.join(localThumbsDir, `${baseName}.webm`);

                if (fs.existsSync(localThumb)) {
                    poster = localThumb;
                } else if (thumbsDir && fs.existsSync(path.join(thumbsDir, `${baseName}.jpg`))) {
                    poster = path.join(thumbsDir, `${baseName}.jpg`);
                }

                if (fs.existsSync(localWebm)) {
                    hoverWebm = localWebm;
                } else if (thumbsDir && fs.existsSync(path.join(thumbsDir, `${baseName}.webm`))) {
                    hoverWebm = path.join(thumbsDir, `${baseName}.webm`);
                }
            }

            let size = 0;
            let mtime = Date.now();
            let mtimeFormatted = '';
            try {
                const stat = fs.statSync(res);
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
            if (fs.existsSync(metaPath)) {
                try {
                    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                } catch (e) {}
            }

            let enhancedPath = null;
            if (type === 'video' || type === 'encrypted') {
                const potentialEnhanced = path.join(dir, '.enhanced', name);
                if (fs.existsSync(potentialEnhanced)) {
                    enhancedPath = potentialEnhanced;
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
                enhancedPath
            });
        } catch (itemErr) {
            console.error(`[scanner:process] Skipping corrupted/offline iCloud file node: ${res}`, itemErr);
        }
    }
    return output;
}

function registerScannerHandlers(ipcMain) {
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
            return _processFileNodes(files, fileSet, dirPath);
        } catch (e) {
            console.error("[main:scan] Scan failed:", e);
            return [];
        }
    });

    ipcMain.handle('scan-specific-files', async (event, pathsArray) => {
        const fileSet = new Set(pathsArray.map(f => f.toLowerCase()));
        return _processFileNodes(pathsArray, fileSet, null);
    });

    ipcMain.handle('find-subtitles', async (event, videoPath, queryTitle) => {
        let base = '';
        const results = [];
        if (videoPath && !videoPath.startsWith('http://') && !videoPath.startsWith('https://')) {
            try {
                const dir = path.dirname(videoPath);
                const ext = path.extname(videoPath);
                base = path.basename(videoPath, ext);
                const files = fs.readdirSync(dir);
                for (const f of files) {
                    if (f.toLowerCase().startsWith(base.toLowerCase()) && f.toLowerCase().endsWith('.srt')) {
                        const parts = f.substring(base.length).split('.');
                        let label = 'Original';
                        if (parts.length >= 3) {
                            label = parts[parts.length - 2].toUpperCase();
                        }
                        results.push({
                            path: path.join(dir, f),
                            label,
                            lang: label.toLowerCase() === 'original' ? 'und' : label.toLowerCase()
                        });
                    }
                }
            } catch(e) {}
        }

        const searchQuery = queryTitle || base;
        if (!searchQuery) {
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
                const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(searchQuery)}&languages=en,fr,es`;
                const response = await fetchFn(searchUrl, {
                    headers: {
                        'Api-Key': apiKey,
                        'User-Agent': 'VaultExplorer v1.0.0'
                    }
                });
                
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
        const downloadRes = await fetchFn(downloadUrl, {
            method: 'POST',
            headers: {
                'Api-Key': apiKey,
                'User-Agent': 'VaultExplorer v1.0.0',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file_id: parseInt(fileId) })
        });

        if (!downloadRes.ok) {
            const errText = await downloadRes.text();
            throw new Error(`OpenSubtitles download ticket failed: ${downloadRes.status} ${errText}`);
        }

        const downloadData = await downloadRes.json();
        if (!downloadData || !downloadData.link) {
            throw new Error("No download link returned by OpenSubtitles");
        }

        const subFileRes = await fetchFn(downloadData.link);
        if (!subFileRes.ok) {
            throw new Error(`Failed to fetch subtitle file: ${subFileRes.status}`);
        }
        const srtContent = await subFileRes.text();

        let finalSubPath;
        if (videoPath.startsWith('http://') || videoPath.startsWith('https://')) {
            const tempDir = app.getPath('temp');
            const subDir = path.join(tempDir, 'vault-subtitles');
            if (!fs.existsSync(subDir)) {
                fs.mkdirSync(subDir, { recursive: true });
            }
            finalSubPath = path.join(subDir, `${fileId}.${lang}.srt`);
        } else {
            const dir = path.dirname(videoPath);
            const subDir = path.join(dir, '.subtitles');
            if (!fs.existsSync(subDir)) {
                fs.mkdirSync(subDir, { recursive: true });
            }
            const ext = path.extname(videoPath);
            const base = path.basename(videoPath, ext);
            finalSubPath = path.join(subDir, `${base}.${lang}.srt`);
        }
        
        fs.writeFileSync(finalSubPath, srtContent, 'utf8');
        console.log(`[OpenSubtitles] Saved subtitle track to: ${finalSubPath}`);
        return finalSubPath;
    });
}

module.exports = {
    findVideosAsync,
    _processFileNodes,
    registerScannerHandlers
};
