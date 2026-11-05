// sidecar-record: the explorer writes sidecars in the shared v2 record format (vault-raggae record.py) and never
// clobbers what other tools keep in them. Throwaway files in %TEMP%.
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const sidecarRecord = require('../src/sidecar-record');

console.log('=== SIDECAR RECORD (v2) ===\n');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-sidecar-'));
try {
    // A new sidecar: canonical name, envelope, this app's keys only
    const clip = path.join(dir, 'clip.mp4');
    fs.writeFileSync(clip, 'video bytes');
    const rec = sidecarRecord.update(clip, { duration: 12.5, hasVideo: true, name: 'clip.mp4', path: clip, random: 1 });
    assert.ok(rec);
    const onDisk = JSON.parse(fs.readFileSync(clip + '.json', 'utf8'));
    assert.equal(onDisk.schema, 2);
    assert.equal(onDisk.vw.kind, 'video');
    assert.ok(onDisk.vw.created && onDisk.vw.updated && /Z$/.test(onDisk.vw.updated));
    assert.equal(onDisk.master.basename, 'clip.mp4');
    assert.equal(onDisk.master.ext, '.mp4');
    assert.equal(onDisk.master.size, 11);
    assert.equal(onDisk.duration, 12.5);
    for (const k of ['name', 'path', 'random']) assert.ok(!(k in onDisk), `${k} is not stored`);
    console.log('✓ [PASS] new sidecar: <file.ext>.json, schema 2, vw + master envelope, owned keys only');

    // Another tool's keys survive, even when they were added after this app read the file
    const stale = sidecarRecord.read(clip).record;
    const later = JSON.parse(fs.readFileSync(clip + '.json', 'utf8'));
    later.vw.id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    later.history = [{ event: 'move', by: 'media-sync' }];
    later.vision = { kfc: { people: [] } };
    fs.writeFileSync(clip + '.json', JSON.stringify(later));
    stale.enhancements = { audio: true, video: false, subtitles: ['en'], translation: [] };
    sidecarRecord.update(clip, stale);
    const merged = JSON.parse(fs.readFileSync(clip + '.json', 'utf8'));
    assert.equal(merged.vw.id, '01ARZ3NDEKTSV4RRFFQ69G5FAV');
    assert.deepEqual(merged.history, [{ event: 'move', by: 'media-sync' }]);
    assert.deepEqual(merged.vision, { kfc: { people: [] } });
    assert.equal(merged.enhancements.audio, true);
    assert.equal(merged.vw.created, onDisk.vw.created, 'created is kept');
    console.log('✓ [PASS] vw.id, history and sections written by others are kept');

    // An old flat sidecar under its old name: upgraded in place, derived keys dropped
    const old = path.join(dir, 'old.mkv');
    fs.writeFileSync(old, 'x');
    fs.writeFileSync(old + '.meta.json', JSON.stringify({ name: 'old.mkv', path: 'D:\\gone\\old.mkv', size: 1, type: '.mkv', width: 640, codec: 'h264' }));
    sidecarRecord.update(old, { height: 360 });
    const up = JSON.parse(fs.readFileSync(old + '.meta.json', 'utf8'));
    assert.ok(!fs.existsSync(old + '.json'), 'written under the name it already had');
    assert.equal(up.schema, 2);
    assert.equal(up.width, 640);
    assert.equal(up.height, 360);
    for (const k of ['name', 'path', 'size', 'type']) assert.ok(!(k in up), `${k} dropped`);
    assert.equal(sidecarRecord.kindOf('a.flac'), 'audio');
    assert.equal(sidecarRecord.kindOf('a.JPG'), 'image');
    console.log('✓ [PASS] an old flat sidecar is upgraded in place');
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}
