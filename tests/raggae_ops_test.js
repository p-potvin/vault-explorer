// raggae-ops: Rename / Paste / Delete through vault-raggae's media ops (src/raggae-ops.js), on throwaway files in
// %TEMP%. Needs vault-raggae on this PC (VAULT_RAGGAE_DIR, default Desktop\Github Repos\vault-raggae) with the
// `delete` op (vault-raggae PR #44); skipped when it is not there. The delete step sends three tiny files to the
// Recycle Bin.
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');

console.log('=== RAGGAE OPS (rename / paste / delete through vault-raggae) ===\n');

(async () => {
    // Unavailable: the callers fall back to their own file operations
    const saved = process.env.VAULT_RAGGAE_DIR;
    process.env.VAULT_RAGGAE_DIR = path.join(os.tmpdir(), 'no-vault-raggae-here');
    delete require.cache[require.resolve('../src/raggae-ops')];
    let ops = require('../src/raggae-ops');
    assert.equal(ops.available(), false);
    await assert.rejects(ops.rename('x', 'y'), e => e.unavailable === true);
    console.log('✓ [PASS] no vault-raggae: unavailable, the caller falls back');
    if (saved === undefined) delete process.env.VAULT_RAGGAE_DIR; else process.env.VAULT_RAGGAE_DIR = saved;
    delete require.cache[require.resolve('../src/raggae-ops')];
    ops = require('../src/raggae-ops');
    if (!ops.available()) {
        console.log('- [SKIP] vault-raggae not found on this PC');
        return;
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-raggae-ops-'));
    const put = (rel, data = 'x') => {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, data);
        return p;
    };
    try {
        const master = put('A/clip.mp4', 'video');
        put('A/clip.mp4.json', '{}');
        put('A/clip.en.srt', '1');
        put('A/.thumbs/clip.jpg', 'j');
        put('A/clip.trickplay/0001.jpg', 's');                // the explorer's own companion
        put('A/clip.nfo', '<movie/>');
        const other = put('A/clipper.mp4', 'other');          // shares the prefix: never follows

        const r = await ops.rename(master, 'film.mp4');
        assert.equal(r.success, true, JSON.stringify(r));
        for (const rel of ['film.mp4', 'film.mp4.json', 'film.en.srt', '.thumbs/film.jpg', 'film.trickplay/0001.jpg', 'film.nfo']) {
            assert.ok(fs.existsSync(path.join(dir, 'A', rel)), `renamed: ${rel}`);
        }
        assert.ok(fs.existsSync(other), 'a file sharing the prefix stays');
        console.log('✓ [PASS] rename: sidecar, subtitle, thumb, trickplay and nfo follow');

        fs.mkdirSync(path.join(dir, 'B'));
        const moved = await ops.transfer('cut', [{ src: path.join(dir, 'A', 'film.mp4'), dst: path.join(dir, 'B', 'film.mp4') }]);
        assert.equal(moved[0].ok, true, JSON.stringify(moved));
        assert.ok(fs.existsSync(path.join(dir, 'B', 'film.en.srt')) && fs.existsSync(path.join(dir, 'B', 'film.trickplay')));
        const copied = await ops.transfer('copy', [{ src: path.join(dir, 'B', 'film.mp4'), dst: path.join(dir, 'A', 'film.mp4') }]);
        assert.equal(copied[0].ok, true, JSON.stringify(copied));
        assert.ok(fs.existsSync(path.join(dir, 'A', 'film.en.srt')), 'a copy takes its subtitle along');
        const clash = await ops.transfer('copy', [{ src: path.join(dir, 'B', 'film.mp4'), dst: path.join(dir, 'A', 'film.mp4') }]);
        assert.equal(clash[0].ok, false);
        assert.match(clash[0].error, /FileExistsError/);
        console.log('✓ [PASS] paste: cut and copy carry what belongs to the file, an occupied target is refused');

        const gone = await ops.recycle([path.join(dir, 'B', 'film.mp4')]);
        assert.equal(gone.length, 1);
        assert.equal(gone[0].ok, true, JSON.stringify(gone));
        assert.deepEqual(fs.readdirSync(path.join(dir, 'B')).filter(n => !n.startsWith('.')), []);
        console.log('✓ [PASS] delete: the file and what belongs to it went to the Recycle Bin');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(e => {
    console.error('✗ [FAIL]', e);
    process.exit(1);
});
