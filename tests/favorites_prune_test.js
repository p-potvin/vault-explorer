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

async function runRender(favorites, { saveResult = true } = {}) {
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
                filterExistingPaths: async (paths) => paths.filter((p) => fs.existsSync(p)),
                scanSpecificFiles: async (paths) => paths.map((p) => ({ name: path.basename(p), path: p, type: 'video' })),
                saveSettings: async (value) => { saved.push(JSON.parse(JSON.stringify(value))); return saveResult; },
            },
            createCardElement: () => ({}),
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

    console.log('Favorites prune: ok');
})().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(() => fs.rmSync(tempDir, { recursive: true, force: true }));
