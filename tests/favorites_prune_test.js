const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'favorites.js'), 'utf8');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-favorites-'));
const present = path.join(tempDir, 'present.mp4');
const missing = path.join(tempDir, 'gone.mp4');
fs.writeFileSync(present, 'x');

async function runRender(favorites, { saveResult = true, duringCheck = null } = {}) {
    const saved = [];
    const shown = [];
    const settings = { favorites: [...favorites] };
    const context = {
        console,
        window: {
            appSettings: settings,
            currentLang: 'en',
            translations: { en: {} },
            displayedItems: [],
            electronAPI: {
                filterExistingPaths: async (paths) => {
                    if (duringCheck) duringCheck(settings);
                    return paths.filter((p) => fs.existsSync(p));
                },
                scanSpecificFiles: async (paths) => paths.map((p) => ({ name: path.basename(p), path: p, type: 'video' })),
                saveSettings: async (value) => { saved.push(JSON.parse(JSON.stringify(value))); return saveResult; },
            },
            createCardElement: () => ({}),
            renderMore: () => {},
            showToast: (message, kind) => shown.push({ message, kind }),
        },
        document: { createDocumentFragment: () => ({ appendChild() {} }), querySelectorAll: () => [] },
    };
    context.el = (id) => (id === 'favorites-grid' ? { innerHTML: '', appendChild() {} } : null);
    vm.createContext(context);
    vm.runInContext(source, context);
    await context.window.renderFavorites();
    return { settings, saved, shown };
}

(async () => {
    const dropped = await runRender([present, missing]);
    assert.deepEqual(dropped.settings.favorites, [present], 'invalid favorites must be removed from settings');
    assert.equal(dropped.saved.length, 1, 'cleaned favorites must be persisted');
    assert.deepEqual(dropped.saved[0].favorites, [present]);

    const clean = await runRender([present]);
    assert.equal(clean.saved.length, 0, 'nothing is saved when every favorite exists');

    const allGone = await runRender([missing]);
    assert.deepEqual(allGone.settings.favorites, [], 'all-missing favorites are emptied');
    assert.equal(allGone.saved.length, 1, 'emptied favorites are persisted');

    const racing = await runRender([present, missing], {
        duringCheck: (settings) => settings.favorites.push(path.join(tempDir, 'starred-while-checking.mp4')),
    });
    assert.deepEqual(racing.settings.favorites, [present, path.join(tempDir, 'starred-while-checking.mp4')],
        'a favorite starred during the existence check must survive the cleanup');

    const none = await runRender([]);
    assert.equal(none.saved.length, 0, 'an empty favorites list makes no existence check or save');

    console.log('Favorites prune: ok');
})().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(() => fs.rmSync(tempDir, { recursive: true, force: true }));
