const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const { getOfflineCloudPaths } = require(path.join(root, 'src', 'cloud-files.js'));

async function run() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-cloud-'));
    const localFile = path.join(tempDir, 'available.mp4');
    fs.writeFileSync(localFile, 'metadata-only test', 'utf8');
    try {
        const offline = await getOfflineCloudPaths([localFile]);
        assert.equal(offline.has(localFile), false, 'A normal local file must remain visible');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    assert.match(read('src/scanner.js'), /getOfflineCloudPaths\(filesArray\)/,
        'Directory scans must filter offline cloud placeholders before file processing');
    assert.match(read('src/scanner.js'), /getOfflineCloudPaths\(items\.map\(\(item\) => item\.path\)\)/,
        'Cached directory results must also hide offline placeholders');
    assert.match(read('src/previews.js'), /await isOfflineCloudFile\(videoPath\)/,
        'Preview generation must reject offline placeholders before probing or FFmpeg');
    assert.match(read('src/cloud-files.js'), /FileAttributes\]::Offline/,
        'Cloud detection must use the metadata-only Offline attribute');
    assert.match(read('index.css'), /\.settings-backdrop[\s\S]*backdrop-filter: blur\(5px\)/,
        'Settings modal must render a shadowed backdrop');
    console.log('Cloud file regression checks passed.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
