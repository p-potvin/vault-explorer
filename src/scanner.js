const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const child_process = require('child_process');
const { execFile } = child_process;
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

async function findVideosAsync(dir, exclusionRegexes = [], rootDir = dir) {
    let results = [];
    try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        const dirPromises = [];
        
        for (const d of entries) {
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
                if (d.name !== '.thumbs' && d.name !== '.git' && d.name !== '.normalized' && !d.name.startsWith('.') && !d.name.startsWith('$') && !d.name.endsWith('.trickplay') && d.name.toLowerCase() !== 'system volume information') {
                    dirPromises.push(findVideosAsync(fullPath, exclusionRegexes, rootDir));
                }
            } else {
                const nameLower = d.name.toLowerCase();
                if (nameLower.endsWith('_p.mp4') || nameLower.endsWith('_p.webm') || 
                    nameLower.endsWith('-preview.mp4') || nameLower.endsWith('-preview.webm')) {
                    continue;
                }
                results.push(fullPath);
            }
        }
        
        const nestedArrays = await Promise.all(dirPromises);
        for (const arr of nestedArrays) {
            results.push(...arr);
        }
    } catch(e) {}
    return results;
}

function _processFileNodes(filesArray, allFilesSet, vaultRoot) {
    const output = [];
    if (!vaultRoot && filesArray.length > 0) {
        vaultRoot = path.dirname(filesArray[0]);
    }
    const thumbsDir = vaultRoot ? path.join(vaultRoot, '.thumbs') : null;
    if (thumbsDir && !fs.existsSync(thumbsDir)) {
        try { fs.mkdirSync(thumbsDir, { recursive: true }); } catch (e) {}
    }

    if (thumbsDir) {
        previews.convertLegacyMp4Previews(thumbsDir);
    }

    for (let res of filesArray) {
        const ext = path.extname(res).toLowerCase();
        let type = 'other';
        if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'].includes(ext)) type = 'video';
        else if (['.jpg', '.png', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
        
        if (type !== 'video' && type !== 'image') continue;

        const dir = path.dirname(res);
        const name = path.basename(res);
        const baseName = path.basename(res, ext);
        
        if (thumbsDir && res.startsWith(thumbsDir)) continue;

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

        if (type === 'video' && thumbsDir) {
            const specificThumb = path.join(thumbsDir, `${baseName}.jpg`);
            const specificWebm = path.join(thumbsDir, `${baseName}.webm`);
            
            if (fs.existsSync(specificThumb)) {
                poster = specificThumb;
            }
            if (fs.existsSync(specificWebm)) {
                hoverWebm = specificWebm;
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
            ext
        });
    }
    return output;
}

function registerScannerHandlers(ipcMain) {
    ipcMain.handle('scan-directory', async (event, dirPath) => {
        console.log(`[main:scan] Scanning directory: ${dirPath}`);
        if (!fs.existsSync(dirPath)) return [];
        
        try {
            const settingsPath = path.join(path.dirname(__dirname), 'vault-settings.json');
            let exclusions = [];
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                exclusions = settings.exclusions || [];
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

    ipcMain.handle('find-subtitles', async (event, videoPath) => {
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath);
        const base = path.basename(videoPath, ext);
        const results = [];
        try {
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
                        label
                    });
                }
            }
        } catch(e) {}
        return results;
    });
}

module.exports = {
    findVideosAsync,
    _processFileNodes,
    registerScannerHandlers
};
