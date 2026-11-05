// raggae-ops.js — file operations through vault-raggae's media ops (app/files/records/ops.py), the same local CLI
// contract as Anything (vault-raggae/rust/raggae-desktop/src/fileops.rs). A media file's sidecar, thumbnails, hover
// clip and subtitles follow it on rename / move / copy, the media index row is updated, and Delete goes to the
// Recycle Bin with everything that belongs to the file. Run as a local process, never over HTTP: the gateway is
// reachable on the tailnet and does not take file operations.
//
// When vault-raggae is not there (another PC, venv missing), `available()` is false and the callers keep their
// own plain file operations. A request that ran and failed (target exists, protected tree) is an answer, not a
// reason to fall back.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 120000;

function repoDir() {
    return process.env.VAULT_RAGGAE_DIR
        || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'Github Repos', 'vault-raggae');
}

function paths() {
    const repo = repoDir();
    return {
        repo,
        python: process.env.VAULT_RAGGAE_PYTHON || path.join(repo, '.venv', 'Scripts', 'python.exe'),
        script: path.join(repo, 'app', 'files', 'records', 'ops.py'),
    };
}

function available() {
    const p = paths();
    return fs.existsSync(p.script) && fs.existsSync(p.python);
}

/** Runs `ops.py --json <args>` (stdin: an optional JSON value) and resolves its JSON report. Rejects with
 *  `err.unavailable = true` when it could not run at all (no vault-raggae, no JSON back: an older ops.py). */
function run(args, stdin) {
    const p = paths();
    return new Promise((resolve, reject) => {
        if (!available()) {
            const e = new Error(`vault-raggae not found (${p.script})`);
            e.unavailable = true;
            return reject(e);
        }
        const child = spawn(p.python, [p.script, '--json', ...args], {
            cwd: p.repo, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        let out = '', err = '';
        const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        child.on('error', e => { clearTimeout(timer); e.unavailable = true; reject(e); });
        child.on('close', () => {
            clearTimeout(timer);
            try {
                resolve(JSON.parse(out));
            } catch (_) {
                const last = err.trim().split(/\r?\n/).pop() || 'no output';
                const e = new Error(`media ops failed: ${last}`);
                // argparse's "invalid choice" = an ops.py without this command yet: let the caller do it itself
                e.unavailable = /invalid choice/.test(err);
                reject(e);
            }
        });
        if (stdin !== undefined) child.stdin.end(JSON.stringify(stdin));
        else child.stdin.end();
    });
}

/** Rename a file in its folder; resolves `{ success, newPath, followed, warnings, error }`. */
async function rename(oldPath, newName) {
    const r = await run(['rename', oldPath, newName]);
    if (r.error || !r.to) return { success: false, error: r.error || (r.errors || []).join('; ') || 'rename failed' };
    return { success: true, newPath: r.to, followed: (r.stats && r.stats.companions_moved) || 0, warnings: r.errors || [] };
}

/** Move or copy files (`pairs`: `[{ src, dst }]`, `dst` the full target path); one result per pair, as
 *  `{ ok, from, to, error, warning }`. Files only: folders are not media masters. */
async function transfer(mode, pairs) {
    const op = mode === 'copy' ? 'copy' : 'move';
    const out = await run(['batch'], pairs.map(({ src, dst }) => ({ op, src, dst })));
    return pairs.map(({ src }, i) => {
        const r = (out.results || [])[i] || { ok: false, error: 'no result' };
        // `to` set = the file itself moved / was copied; a companion left behind is a warning, not a failure
        const done = !!r.to;
        const res = { ok: done, from: src, to: r.to || null, error: done ? null : (r.error || 'failed') };
        if (done && (r.errors || []).length) res.warning = r.errors.join('; ');
        return res;
    });
}

/** Send paths to the Recycle Bin with what belongs to each file; one result per path, as `{ ok, path, error }`. */
async function recycle(itemPaths) {
    const out = await run(['delete', ...itemPaths]);
    return (out.results || []).map(r => ({ ok: !!r.ok, path: r.path, recycled: r.recycled || [], error: r.error || null }));
}

module.exports = { available, run, rename, transfer, recycle, paths };
