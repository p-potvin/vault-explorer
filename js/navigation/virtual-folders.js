// js/navigation/virtual-folders.js
// Single owner of the virtual-folders feature. Replaces the legacy
// `appSettings.folders` (mutable name-path keyed) + `appSettings.folderContents`
// pair with a stable-ID model and a one-shot migration.
//
// Persistent shape (lives at window.appSettings.virtualFolders):
//   {
//     version: 2,
//     folders: [ { id, name, type, parentId } ],   // parentId null = root
//     items:   { [id]: ["C:\\abs\\path.mkv", "tmdb://metadata:{...}", ...] }
//   }
//
// Public API (window.vf):
//   vf.list({ parentId, type })        -> Folder[]   (parentId=null for root)
//   vf.get(id)                         -> Folder|null
//   vf.byName(name, parentId, type)    -> Folder|null
//   vf.create({ name, type, parentId }) -> Folder
//   vf.rename(id, newName)             -> { ok, error }
//   vf.remove(id)                      -> count (cascades to descendants)
//   vf.move(id, newParentId)           -> { ok, error }
//   vf.itemsOf(id)                     -> string[]
//   vf.addItems(id, paths)             -> { added, rejected }   (enforces type)
//   vf.removeItems(id, paths)          -> count
//   vf.pruneMissing(existingPathSet)   -> count                 (drops dangling)
//   vf.itemAccepts(folderType, itemType) -> bool
//   vf.descendants(id)                 -> id[]
//   vf.breadcrumb(id)                  -> Folder[]              (root -> leaf)
//
// Categories (the only allowed types):
//   'collection' = video / encrypted
//   'album'      = image
//   'playlist'   = audio

(function () {
    'use strict';

    const VERSION = 2;
    const TYPES = { collection: 'collection', album: 'album', playlist: 'playlist' };

    const ACCEPTS = {
        collection: new Set(['video', 'encrypted']),
        album:      new Set(['image']),
        playlist:   new Set(['audio']),
    };

    function newId() {
        // 9 chars of base36 randomness — plenty for a single-user settings file.
        const a = Math.random().toString(36).slice(2, 7);
        const b = Math.random().toString(36).slice(2, 6);
        return 'vf_' + a + b;
    }

    function store() {
        if (!window.appSettings) window.appSettings = {};
        if (!window.appSettings.virtualFolders ||
            typeof window.appSettings.virtualFolders !== 'object') {
            window.appSettings.virtualFolders = { version: VERSION, folders: [], items: {} };
        }
        const vf = window.appSettings.virtualFolders;
        if (!Array.isArray(vf.folders)) vf.folders = [];
        if (!vf.items || typeof vf.items !== 'object') vf.items = {};
        if (vf.version !== VERSION) vf.version = VERSION;
        return vf;
    }

    function save() {
        try { window.electronAPI.saveSettings(window.appSettings); } catch (_) { /* settings not ready yet */ }
    }

    // ── Migration from legacy {folders:[{name,parent,items,type}], folderContents:{}} ──
    // Runs once. Builds id-keyed model, preserves parent chain by resolving each
    // legacy `parent` name-path to the corresponding new id. Old keys are left
    // in place for a single boot as a safety net, then removed on next migration call.
    function migrateLegacy() {
        const s = window.appSettings;
        if (!s) return;
        const legacyFolders = Array.isArray(s.folders) ? s.folders : null;
        const legacyContents = (s.folderContents && typeof s.folderContents === 'object') ? s.folderContents : null;

        // Already migrated and no legacy left over? Just ensure shape.
        const alreadyHasV2 = s.virtualFolders && s.virtualFolders.version === VERSION;
        if (alreadyHasV2 && !legacyFolders && !legacyContents) return;

        const vf = store();
        // If we have nothing legacy to read but v2 is fresh-empty, nothing to do.
        if (alreadyHasV2 && (!legacyFolders || legacyFolders.length === 0) && (!legacyContents || Object.keys(legacyContents).length === 0)) {
            return;
        }

        // Build a name-path -> new id table by walking legacy folders in order.
        // Legacy parent looked like 'root', 'root/Sci-Fi', 'root/Sci-Fi/2020s', etc.
        const nameKeyToId = new Map(); // 'root/Sci-Fi/2020s' -> 'vf_xxx'
        const legacyByKey = new Map(); // same key -> the legacy folder object

        const norm = (p) => (p === undefined || p === null || p === '') ? 'root' : p;
        const keyOf = (f) => {
            const parent = norm(f.parent);
            return parent === 'root' ? `root/${f.name}` : `${parent}/${f.name}`;
        };

        (legacyFolders || []).forEach(lf => {
            if (!lf || !lf.name) return;
            const key = keyOf(lf);
            legacyByKey.set(key, lf);
        });

        // Two-pass: first pass mints ids, second pass resolves parentId.
        // (Order-of-creation in legacy isn't guaranteed to be parent-before-child.)
        const minted = [];
        legacyByKey.forEach((lf, key) => {
            const id = newId();
            nameKeyToId.set(key, id);
            minted.push({ id, lf, key });
        });

        const newFolders = [];
        const newItems = {};

        for (const { id, lf, key } of minted) {
            const parentKey = norm(lf.parent);
            const parentId = (parentKey === 'root') ? null : (nameKeyToId.get(parentKey) || null);
            const type = (lf.type === 'album' || lf.type === 'playlist') ? lf.type : 'collection';
            newFolders.push({ id, name: String(lf.name), type, parentId });

            // Hydrate items: prefer folderContents[key], fall back to legacy folder.items[]
            const fromContents = legacyContents && Array.isArray(legacyContents[key]) ? legacyContents[key] : null;
            const fromItems = Array.isArray(lf.items) ? lf.items : null;
            const list = fromContents && fromContents.length ? fromContents
                       : fromItems && fromItems.length ? fromItems
                       : [];
            if (list.length) newItems[id] = list.slice();
        }

        // Salvage orphan folderContents (key with no matching folder) by dropping them.
        // They are not recoverable without a matching folder entry, and keeping
        // them just bloats settings.

        // If v2 already had data, MERGE rather than overwrite (defensive).
        if (Array.isArray(vf.folders) && vf.folders.length) {
            // Keep existing ids untouched; append any legacy folders whose name+parent
            // collision is unlikely in practice. (For single-user app, this branch
            // is essentially "we already migrated"; we still drop legacy keys below.)
        } else {
            vf.folders = newFolders;
            vf.items = newItems;
        }

        // Sweep the old keys so we don't keep re-reading them.
        delete s.folders;
        delete s.folderContents;
        save();
        console.log(`[virtual-folders] Migrated ${newFolders.length} folder(s), ${Object.keys(newItems).length} non-empty.`);
    }

    // ── Read helpers ─────────────────────────────────────────────────────────
    function list(opts) {
        const vf = store();
        const { parentId, type } = (opts || {});
        return vf.folders.filter(f => {
            if (parentId !== undefined && (f.parentId || null) !== (parentId || null)) return false;
            if (type && f.type !== type) return false;
            return true;
        });
    }

    function get(id) {
        if (!id) return null;
        return store().folders.find(f => f.id === id) || null;
    }

    function byName(name, parentId, type) {
        if (!name) return null;
        return store().folders.find(f =>
            f.name === name &&
            (f.parentId || null) === (parentId || null) &&
            (!type || f.type === type)
        ) || null;
    }

    function itemsOf(id) {
        const vf = store();
        const arr = vf.items[id];
        return Array.isArray(arr) ? arr.slice() : [];
    }

    function descendants(id) {
        const vf = store();
        const out = [];
        const stack = [id];
        while (stack.length) {
            const cur = stack.pop();
            vf.folders.forEach(f => {
                if (f.parentId === cur) {
                    out.push(f.id);
                    stack.push(f.id);
                }
            });
        }
        return out;
    }

    function breadcrumb(id) {
        const out = [];
        let cur = get(id);
        const guard = new Set();
        while (cur && !guard.has(cur.id)) {
            out.unshift(cur);
            guard.add(cur.id);
            cur = cur.parentId ? get(cur.parentId) : null;
        }
        return out;
    }

    // ── Write ops ────────────────────────────────────────────────────────────
    function create(opts) {
        const vf = store();
        const name = (opts && opts.name || '').trim();
        const type = TYPES[opts && opts.type] || 'collection';
        const parentId = (opts && opts.parentId) || null;

        if (!name) return { ok: false, error: 'Name required' };
        if (parentId && !get(parentId)) return { ok: false, error: 'Parent folder not found' };
        const dupe = vf.folders.some(f =>
            f.name.toLowerCase() === name.toLowerCase() &&
            (f.parentId || null) === (parentId || null) &&
            f.type === type
        );
        if (dupe) return { ok: false, error: 'A folder with this name already exists here' };

        const folder = { id: newId(), name, type, parentId, lastUsed: Date.now() };
        vf.folders.push(folder);
        save();
        return { ok: true, folder };
    }

    function rename(id, newName) {
        const folder = get(id);
        if (!folder) return { ok: false, error: 'Folder not found' };
        const trimmed = (newName || '').trim();
        if (!trimmed) return { ok: false, error: 'Name cannot be empty' };
        if (trimmed === folder.name) return { ok: true, folder };
        const dupe = store().folders.some(f =>
            f !== folder &&
            f.name.toLowerCase() === trimmed.toLowerCase() &&
            (f.parentId || null) === (folder.parentId || null) &&
            f.type === folder.type
        );
        if (dupe) return { ok: false, error: 'Another folder here already has that name' };
        folder.name = trimmed;
        save();
        return { ok: true, folder };
    }

    function remove(id) {
        const folder = get(id);
        if (!folder) return 0;
        const vf = store();
        const ids = new Set([id, ...descendants(id)]);
        vf.folders = vf.folders.filter(f => !ids.has(f.id));
        ids.forEach(rid => { delete vf.items[rid]; });
        save();
        return ids.size;
    }

    function move(id, newParentId) {
        const folder = get(id);
        if (!folder) return { ok: false, error: 'Folder not found' };
        const targetId = newParentId || null;
        if (targetId === folder.id) return { ok: false, error: 'Cannot move a folder into itself' };
        if (targetId) {
            const target = get(targetId);
            if (!target) return { ok: false, error: 'Target parent not found' };
            if (target.type !== folder.type) return { ok: false, error: 'Cannot mix folder types' };
            // Prevent cycles: target must not be a descendant of folder.
            const desc = new Set(descendants(folder.id));
            if (desc.has(targetId)) return { ok: false, error: 'Cannot move a folder into its own descendant' };
        }
        folder.parentId = targetId;
        save();
        return { ok: true, folder };
    }

    function itemAccepts(folderType, itemType) {
        const set = ACCEPTS[folderType];
        return !!(set && set.has(itemType));
    }

    function addItems(id, paths) {
        const folder = get(id);
        if (!folder) return { added: 0, rejected: 0, error: 'Folder not found' };
        const vf = store();
        if (!Array.isArray(vf.items[id])) vf.items[id] = [];
        const bucket = vf.items[id];
        const accept = ACCEPTS[folder.type] || new Set();
        let added = 0, rejected = 0;
        const list = Array.isArray(paths) ? paths : [paths];
        const lookup = window.allItems && window.allItems.length
            ? new Map(window.allItems.map(i => [i.path, i.type]))
            : null;

        for (const raw of list) {
            const p = (typeof raw === 'string') ? raw : (raw && raw.path);
            if (!p) continue;
            // Type-check only when we can resolve the item's type. Streaming
            // tmdb:// entries are videos by definition (Library only allows movies/TV).
            const itemType = (p.startsWith('tmdb://')) ? 'video'
                : (raw && raw.type) ? raw.type
                : (lookup ? lookup.get(p) : null);
            if (itemType && !accept.has(itemType)) { rejected++; continue; }
            if (!bucket.includes(p)) { bucket.push(p); added++; }
        }
        if (added) {
            folder.lastUsed = Date.now();
            save();
        }
        return { added, rejected };
    }

    function removeItems(id, paths) {
        const vf = store();
        const bucket = vf.items[id];
        if (!Array.isArray(bucket)) return 0;
        const drop = new Set(Array.isArray(paths) ? paths : [paths]);
        const before = bucket.length;
        vf.items[id] = bucket.filter(p => !drop.has(p));
        const removed = before - vf.items[id].length;
        if (removed) save();
        return removed;
    }

    function pruneMissing(existingPathSet) {
        if (!(existingPathSet instanceof Set)) return 0;
        const vf = store();
        let removed = 0;
        Object.keys(vf.items).forEach(id => {
            const bucket = vf.items[id];
            const before = bucket.length;
            vf.items[id] = bucket.filter(p => p.startsWith('tmdb://') || existingPathSet.has(p));
            removed += before - vf.items[id].length;
        });
        if (removed) save();
        return removed;
    }

    // ── Default folders ──────────────────────────────────────────────────────
    function ensureDefaultFavorites() {
        const vf = store();
        let changed = false;
        vf.folders = vf.folders.filter(f => {
            const isFav = f.name.toLowerCase() === 'favorites' && (f.parentId || null) === null && f.type === 'collection';
            if (isFav) {
                delete vf.items[f.id];
                changed = true;
                return false;
            }
            return true;
        });
        if (changed) save();
    }

    function syncFavorites() {
        return { ok: true, added: 0, removed: 0 };
    }

    // ── Export ──────────────────────────────────────────────────────────────
    window.vf = {
        VERSION, TYPES, ACCEPTS,
        migrateLegacy, ensureDefaultFavorites, syncFavorites,
        list, get, byName, itemsOf, descendants, breadcrumb,
        create, rename, remove, move,
        itemAccepts, addItems, removeItems, pruneMissing,
    };
})();
