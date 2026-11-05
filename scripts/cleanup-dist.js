const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const pkgPath = path.join(rootDir, 'package.json');

function compareSemver(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

/**
 * Cleans up previous build installer artifacts in dist/ while preserving
 * the latest built version, win-unpacked/, and builder metadata configs.
 */
function cleanupDist() {
    if (!fs.existsSync(distDir)) {
        console.log('[cleanup-dist] dist directory does not exist, nothing to clean.');
        return { removedCount: 0, freedBytes: 0 };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const currentVersion = pkg.version;

    const files = fs.readdirSync(distDir);
    // Matches vault-explorer-setup-<version>.exe, .blockmap, .zip, etc.
    const versionRegex = /^vault-explorer(?:-setup)?-([0-9]+\.[0-9]+\.[0-9]+[a-zA-Z0-9.\-]*?)(?:\.exe)?\.(exe|blockmap|zip|7z|tar\.gz)$/i;

    // Collect all versioned artifact files
    const versionedFiles = [];
    const foundVersions = new Set();

    for (const file of files) {
        const match = file.match(versionRegex);
        if (match) {
            const v = match[1];
            versionedFiles.push({ file, version: v });
            foundVersions.add(v);
        }
    }

    // Determine the version to keep: prefer package.json currentVersion if it has artifacts in dist/,
    // otherwise fallback to the highest version found in dist/
    let keepVersion = currentVersion;
    if (!foundVersions.has(currentVersion) && foundVersions.size > 0) {
        const sortedVersions = Array.from(foundVersions).sort(compareSemver);
        keepVersion = sortedVersions[sortedVersions.length - 1];
    }

    console.log(`[cleanup-dist] Cleaning up previous versions in ${distDir} (keeping version: ${keepVersion})...`);

    let removedCount = 0;
    let freedBytes = 0;

    for (const { file, version } of versionedFiles) {
        if (version !== keepVersion) {
            const fullPath = path.join(distDir, file);
            try {
                const stat = fs.statSync(fullPath);
                const bytes = stat.size;
                fs.unlinkSync(fullPath);
                removedCount++;
                freedBytes += bytes;
                console.log(`[cleanup-dist] Removed previous version artifact: ${file} (${(bytes / (1024 * 1024)).toFixed(1)} MB)`);
            } catch (err) {
                console.error(`[cleanup-dist] Failed to remove ${file}:`, err.message);
            }
        }
    }

    const freedMB = (freedBytes / (1024 * 1024)).toFixed(1);
    console.log(`[cleanup-dist] Cleanup complete: removed ${removedCount} previous version file(s), freed ${freedMB} MB.`);

    // Refresh Windows context menus to point to latest dist/win-unpacked executable
    if (process.platform === 'win32') {
        const installScript = path.join(rootDir, 'scripts', 'pwsh', 'install_context_menu.ps1');
        const unpackedExe = path.join(distDir, 'win-unpacked', 'vault-explorer.exe');
        if (fs.existsSync(installScript) && fs.existsSync(unpackedExe)) {
            try {
                console.log('[cleanup-dist] Refreshing Windows context menus to latest unpacked build...');
                execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installScript], {
                    stdio: 'inherit',
                });
            } catch (err) {
                console.warn('[cleanup-dist] Note: Context menu update returned an error:', err.message);
            }
        }
    }

    return { removedCount, freedBytes, keepVersion };
}

if (require.main === module) {
    cleanupDist();
}

module.exports = { cleanupDist, compareSemver };
