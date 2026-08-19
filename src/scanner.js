const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { app } = require('electron');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp', '.ts', '.m2ts']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif', '.avif', '.tiff', '.tif', '.svg', '.ico']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus', '.wma', '.aiff', '.ape']);
const SKIPPED_DIRECTORIES = new Set([
    '.thumbs', '.enhanced', '.git', '.normalized', '.trickplay', 'node_modules', 'bower_components',
    'jspm_packages', 'web_modules', '.venv', 'venv', 'env', 'virtualenv', '.conda', '.github',
    '.svn', '.hg', '.npm', '.yarn', '.pnpm-store', '.cache', '.sass-cache', '.eslintcache',
    '__pycache__', '.parcel-cache', '.next', '.nuxt', 'dist', 'build', 'out', 'target', 'tmp',
    'temp', '$recycle.bin', 'recycler', '.trashes', 'system volume information', 'appdata',
    'local settings', '.access', '.subtitles',
]);
const SKIPPED_FILES = new Set([
    '.ds_store', 'thumbs.db', 'desktop.ini', 'ehthumbs.db', 'package-lock.json', 'yarn.lock',
    'pnpm-lock.yaml', 'bun.lockb', 'ntuser.dat', '.gitignore', '.gitmodules', '.gitattributes',
    '.srt', '.vtt', '.ass', '.ssa', '.sub',
]);

function globToRegex(pattern) {
    let regexStr = '^';
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === '*') {
            if (pattern[i + 1] === '*') { regexStr += '.*'; i++; }
            else regexStr += '[^/\\\\]*';
        } else if (char === '?') regexStr += '[^/\\\\]';
        else if ('./+^${}()|[\\]'.includes(char)) regexStr += `\\${char}`;
        else regexStr += char;
    }
    return new RegExp(`${regexStr}$`, 'i');
}

function isSkippedDirectory(name) {
    const lower = name.toLowerCase();
    return SKIPPED_DIRECTORIES.has(lower) || lower.startsWith('.') || lower.startsWith('$') ||
        ['google drive', 'onedrive', 'dropbox', 'proton drive', 'icloud photos', 'icloud drive',
            'mega', 'nextcloud', 'pcloud', 'yandex disk', 'yandexdisk'].some(part => lower.includes(part));
}

function isSkippedFile(name) {
    const lower = name.toLowerCase();
    return SKIPPED_FILES.has(lower) || ['.srt', '.vtt', '.ass', '.ssa', '.sub'].includes(path.extname(lower)) ||
        lower.endsWith('_p.mp4') || lower.endsWith('_p.webm') || lower.endsWith('-preview.mp4') ||
        lower.endsWith('-preview.webm') || lower.endsWith('.meta.json');
}

async function findVideosAsync(dir, exclusionRegexes = [], rootDir = dir, visitedPaths = new Set(), depth = 0) {
    if (depth > 12) return [];
    let realDir;
    try {
        realDir = (await fsPromises.realpath(dir)).toLowerCase();
        if (visitedPaths.has(realDir)) return [];
        visitedPaths.add(realDir);
    } catch (_) { return []; }

    let entries;
    try { entries = await fsPromises.readdir(dir, { withFileTypes: true }); }
    catch (_) { return []; }

    if (dir !== rootDir && entries.some(entry => entry.name === '.git')) return [];
    const results = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootDir, fullPath);
        if (exclusionRegexes.some(regex => regex.test(relativePath) || regex.test(entry.name))) continue;

        let isDirectory = entry.isDirectory();
        if (entry.isSymbolicLink()) {
            try { isDirectory = (await fsPromises.stat(fullPath)).isDirectory(); } catch (_) { isDirectory = false; }
        }
        if (isDirectory) {
            if (!isSkippedDirectory(entry.name)) {
                results.push(...await findVideosAsync(fullPath, exclusionRegexes, rootDir, visitedPaths, depth + 1));
            }
        } else if (!isSkippedFile(entry.name)) {
            results.push(fullPath);
        }
    }
    return results;
}

const cachePath = app ? path.join(app.getPath('userData'), 'vault-cache.json') : path.join(__dirname, '..', 'vault-cache.json');

async function loadCache() {
    try { return JSON.parse(await fsPromises.readFile(cachePath, 'utf8')); }
    catch (_) { return {}; }
}

async function saveCache(cache) {
    try { await fsPromises.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8'); }
    catch (error) { console.error('[scanner:cache] Failed to save scan cache:', error.message); }
}

function classifyFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
    if (ext === '.enc') return 'encrypted';
    return 'other';
}

async function readSidecar(filePath) {
    try { return JSON.parse(await fsPromises.readFile(`${filePath}.meta.json`, 'utf8')); }
    catch (_) { return null; }
}

async function exists(filePath) {
    try { await fsPromises.access(filePath); return true; } catch (_) { return false; }
}

async function _processFileNodes(filesArray, allFilesSet, vaultRoot) {
    const output = [];
    const globalThumbsDir = vaultRoot ? path.join(vaultRoot, '.thumbs') : null;

    async function processFile(filePath) {
        try {
            const type = classifyFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const dir = path.dirname(filePath);
            const name = path.basename(filePath);
            const baseName = path.basename(filePath, ext);
            if (filePath.split(/[\\/]/).some(part => part.toLowerCase() === '.thumbs' || part.toLowerCase() === '.enhanced')) return;

            if (ext === '.ts') {
                try { if ((await fsPromises.stat(filePath)).size < 2 * 1024 * 1024) return; }
                catch (_) { return; }
            }

            const isDerivedPreview = type === 'image' || ext === '.webm' || name.toLowerCase().endsWith('_p.mp4') || name.toLowerCase().endsWith('-preview.mp4');
            if (isDerivedPreview && allFilesSet) {
                const checkName = name.toLowerCase().endsWith('_p.mp4') ? baseName.slice(0, -2) : baseName.replace(/-preview$/i, '');
                const hasParent = ['.mp4', '.mkv', '.avi', '.mov', '.ts', '.wmv'].some(videoExt =>
                    allFilesSet.has(path.join(dir, `${checkName}${videoExt}`).toLowerCase()));
                if (hasParent) return;
            }

            const meta = await readSidecar(filePath);
            let poster = null;
            let hoverWebm = null;
            const localThumbsDir = path.join(dir, '.thumbs');
            if (type === 'video') {
                const localThumb = path.join(localThumbsDir, `${baseName}.jpg`);
                const localWebm = path.join(localThumbsDir, `${baseName}.webm`);
                const globalThumb = globalThumbsDir ? path.join(globalThumbsDir, `${baseName}.jpg`) : null;
                const globalWebm = globalThumbsDir ? path.join(globalThumbsDir, `${baseName}.webm`) : null;
                if (await exists(localThumb)) poster = localThumb;
                else if (globalThumb && await exists(globalThumb)) poster = globalThumb;
                if (await exists(localWebm)) hoverWebm = localWebm;
                else if (globalWebm && await exists(globalWebm)) hoverWebm = globalWebm;
            } else if (type === 'image') {
                const enhancedThumb = path.join(localThumbsDir, `${baseName}_enhanced.jpg`);
                poster = await exists(enhancedThumb) ? enhancedThumb : filePath;
            }

            const stat = await fsPromises.stat(filePath);
            let enhancedPath = null;
            if ((type === 'video' || type === 'encrypted') && meta && meta.enhancedPath && await exists(meta.enhancedPath)) {
                enhancedPath = meta.enhancedPath;
            }
            if (!enhancedPath && meta && meta.enhancements && (meta.enhancements.video || meta.enhancements.audio)) {
                // The enhanced copy keeps the original filename; the `_enhanced`
                // suffix is the older upscaler's naming, still checked so
                // pre-existing libraries keep resolving.
                for (const candidate of [
                    path.join(dir, '.enhanced', `${baseName}${ext}`),
                    path.join(dir, '.enhanced', `${baseName}_enhanced${ext}`),
                ]) {
                    if (await exists(candidate)) { enhancedPath = candidate; break; }
                }
            }

            const trickplayPath = type === 'video' ? path.join(dir, `${baseName}.trickplay`) : null;
            const nfoPath = type === 'video' ? path.join(dir, `${baseName}.nfo`) : null;
            const nfoMeta = {};
            if (nfoPath && await exists(nfoPath)) {
                try {
                    const nfo = await fsPromises.readFile(nfoPath, 'utf8');
                    const readTag = tag => nfo.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]?.trim();
                    const title = readTag('title');
                    const year = readTag('year');
                    const plot = readTag('plot');
                    const rating = readTag('rating');
                    if (title) nfoMeta.title = title;
                    if (year) nfoMeta.year = Number.parseInt(year, 10);
                    if (plot) nfoMeta.plot = plot;
                    if (rating) nfoMeta.rating = Number.parseFloat(rating);
                } catch (error) { console.warn('[scanner:nfo] Failed to parse:', error.message); }
            }

            output.push({
                name, path: filePath, type, poster, thumbnail: poster, hoverWebm,
                size: stat.size, mtime: stat.mtimeMs, created: stat.birthtimeMs || stat.ctimeMs,
                mtimeFormatted: new Date(stat.mtimeMs).toISOString().slice(0, 16).replace('T', ' '),
                ext, duration: meta?.duration || 0, width: meta?.width || null, height: meta?.height || null,
                codec: meta?.codec || null, fps: meta?.fps || null, audioCodec: meta?.audioCodec || null,
                channels: meta?.channels || null, sampleRate: meta?.sampleRate || null, bitrate: meta?.bitrate || null,
                hasAudio: meta?.hasAudio ?? null, hasVideo: meta?.hasVideo ?? null,
                enhancements: meta?.enhancements || null, enhancedPath,
                trickplayFolder: trickplayPath && await exists(trickplayPath) ? trickplayPath : null,
                nfoMeta: Object.keys(nfoMeta).length ? nfoMeta : null,
            });
        } catch (error) { console.error('[scanner:process] Skipping file:', filePath, error.message); }
    }

    for (let i = 0; i < filesArray.length; i += 32) {
        await Promise.all(filesArray.slice(i, i + 32).map(processFile));
    }
    return output;
}

function registerScannerHandlers(ipcMain) {
    ipcMain.handle('get-cached-directory', async (_event, dirPath) => {
        if (!dirPath) return [];
        const cache = await loadCache();
        return cache[dirPath.toLowerCase().replace(/\\/g, '/')]?.items || [];
    });

    ipcMain.handle('scan-directory', async (_event, dirPath) => {
        if (!dirPath || !fs.existsSync(dirPath)) return [];
        try {
            const settingsPath = path.join(app.getPath('userData'), 'vault-settings.json');
            let settings = {};
            try { settings = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8')); } catch (_) { }
            const exclusions = (settings.globExclusions || []).map(globToRegex);
            const files = await findVideosAsync(dirPath, exclusions, dirPath);
            const items = await _processFileNodes(files, new Set(files.map(file => file.toLowerCase())), dirPath);
            const cache = await loadCache();
            cache[dirPath.toLowerCase().replace(/\\/g, '/')] = { timestamp: Date.now(), items };
            await saveCache(cache);
            return items;
        } catch (error) {
            console.error('[scanner] Scan failed:', error.message);
            return [];
        }
    });

    ipcMain.handle('scan-specific-files', async (_event, pathsArray) => {
        const safe = Array.isArray(pathsArray) ? pathsArray.filter(file => typeof file === 'string' && file.trim()) : [];
        return safe.length ? _processFileNodes(safe, new Set(safe.map(file => file.toLowerCase())), null) : [];
    });
}

module.exports = { findVideosAsync, _processFileNodes, globToRegex, registerScannerHandlers };
