const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    findLocalSidecars,
    orderSidecars,
    parseLanguageToken,
} = require('../src/ipc/subtitles.ipc');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-subs-'));
try {
    const video = path.join(tempDir, 'episode.mkv');
    fs.writeFileSync(video, 'video');
    for (const file of ['episode.srt', 'episode.en.srt', 'episode.fr.srt', 'episode.ja.vtt', 'episode.other.txt']) {
        fs.writeFileSync(path.join(tempDir, file), 'subtitle');
    }

    const found = findLocalSidecars(video);
    assert.equal(found.length, 4);
    assert.match(found.find(item => item.lang === 'en').path, /\.subtitles[\\/]episode\.en\.vtt$/i);
    assert.deepEqual(parseLanguageToken('fr-CA'), { lang: 'fr-ca', label: 'Québécois (QC)' });
    assert.deepEqual(parseLanguageToken('qc'), { lang: 'qc', label: 'Québécois (QC)' });
    assert.equal(found.find(item => item.lang === 'und').label, 'Original');

    const ordered = orderSidecars(found, 'fr');
    assert.equal(ordered[0].lang, 'fr');
    assert.equal(ordered[1].lang, 'und');
    assert.deepEqual(ordered.slice(2).map(item => item.lang), ['en', 'ja']);
    console.log('local subtitles: ok');
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
