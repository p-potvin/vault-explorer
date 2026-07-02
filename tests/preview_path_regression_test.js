const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

const { _processFileNodes } = require('../src/scanner');

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-preview-path-'));
    try {
        const nested = path.join(root, 'cwd');
        fs.mkdirSync(nested, { recursive: true });

        const nestedVideo = path.join(nested, 'nested.mp4');
        const rootVideo = path.join(root, 'root-video.mp4');
        fs.writeFileSync(nestedVideo, '');
        fs.writeFileSync(rootVideo, '');

        const nestedThumbs = path.join(nested, '.thumbs');
        fs.mkdirSync(nestedThumbs, { recursive: true });
        fs.writeFileSync(path.join(nestedThumbs, 'root-video.webm'), '');
        fs.writeFileSync(path.join(nestedThumbs, 'root-video.jpg'), '');

        const items = await _processFileNodes(
            [nestedVideo, rootVideo],
            new Set([nestedVideo.toLowerCase(), rootVideo.toLowerCase()]),
            null
        );

        const rootItem = items.find(item => item.path === rootVideo);
        assert.ok(rootItem, 'root-level video should be returned');
        assert.equal(
            rootItem.hoverWebm,
            null,
            'scan-specific-files must not resolve root-level previews from the first selected nested folder'
        );
        assert.equal(
            rootItem.thumbnail,
            null,
            'scan-specific-files must not resolve root-level thumbnails from the first selected nested folder'
        );

        const rootThumbs = path.join(root, '.thumbs');
        fs.mkdirSync(rootThumbs, { recursive: true });
        const expectedWebm = path.join(rootThumbs, 'root-video.webm');
        const expectedThumb = path.join(rootThumbs, 'root-video.jpg');
        fs.writeFileSync(expectedWebm, '');
        fs.writeFileSync(expectedThumb, '');

        const rescanned = await _processFileNodes(
            [nestedVideo, rootVideo],
            new Set([nestedVideo.toLowerCase(), rootVideo.toLowerCase()]),
            null
        );
        const rescannedRootItem = rescanned.find(item => item.path === rootVideo);
        assert.equal(rescannedRootItem.hoverWebm, expectedWebm);
        assert.equal(rescannedRootItem.thumbnail, expectedThumb);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
