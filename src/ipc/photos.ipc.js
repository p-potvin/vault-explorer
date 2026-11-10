// photos.ipc.js — the Photos tab's data, from vault-raggae (app/photos.py and the people routes).
//
//   photos-get      GET  /v1/photos/library | timeline | person/{g}/{id} | {vw_id}, /v1/identities[...]
//   photos-request  POST /v1/identities/{gallery}/{id}/requests   (rename / remove_crop: filed for ColONEL-KFC,
//                   audited by the gateway; nothing in the galleries is written here)
//   photos-folders  the folders directly under the photo roots (the sidebar's Folders)
//
// Only those paths are allowed through. `null` means the gateway did not answer: the tab falls back to scanning
// the folders itself (no People, file dates).

const fs = require('fs');
const path = require('path');

const RAGGAE_URL = process.env.RAGGAE_URL || 'http://127.0.0.1:8750';
const ALLOWED_GET = /^\/v1\/(photos\/(library|timeline|person\/[\w-]+\/\d+|[0-9A-Z]{26})|identities(\/[\w-]+\/\d+)?)$/;
const COOLDOWN_MS = 15000;
let offlineUntil = 0;

async function gatewayGet(route, params) {
    if (typeof route !== 'string' || !ALLOWED_GET.test(route)) return { error: 'route not allowed' };
    if (Date.now() < offlineUntil) return null;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    try {
        const res = await fetch(`${RAGGAE_URL}${route}?${qs}`, {
            headers: { 'x-vw-project': 'vault-explorer' }, signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return { error: `${res.status}`, status: res.status };
        return await res.json();
    } catch (_) {
        offlineUntil = Date.now() + COOLDOWN_MS;
        return null;
    }
}

function registerPhotosIpc(ipcMain) {
    ipcMain.handle('photos-get', (_e, route, params) => gatewayGet(route, params));

    ipcMain.handle('photos-request', async (_e, gallery, identityId, body) => {
        const op = body && body.op;
        if (!/^[\w-]+$/.test(String(gallery)) || !Number.isInteger(identityId) || !['rename', 'remove_crop', 'note'].includes(op)) {
            return { error: 'bad request' };
        }
        try {
            const res = await fetch(`${RAGGAE_URL}/v1/identities/${gallery}/${identityId}/requests`, {
                method: 'POST', body: JSON.stringify(body),
                headers: { 'content-type': 'application/json', 'x-vw-project': 'vault-explorer' },
                signal: AbortSignal.timeout(20000),
            });
            const data = await res.json().catch(() => ({}));
            return res.ok ? data : { error: data.detail || `${res.status}` };
        } catch (e) {
            return { error: e.message };
        }
    });

    ipcMain.handle('photos-folders', async (_e, roots) => {
        const out = [];
        for (const root of Array.isArray(roots) ? roots : []) {
            try {
                for (const d of fs.readdirSync(root, { withFileTypes: true })) {
                    if (d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('$')) {
                        out.push({ name: d.name, path: path.join(root, d.name) });
                    }
                }
            } catch (_) { /* a root that is not there */ }
        }
        return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    });
}

module.exports = { registerPhotosIpc, ALLOWED_GET };
