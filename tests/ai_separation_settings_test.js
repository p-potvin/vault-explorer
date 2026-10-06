// Settings > AI > Subtitle Audio Cleanup: defaults to RNNoise, persists the
// chosen separator, migrates the old aiSeparate checkbox, translates to QC,
// and reaches the generate-subtitles arguments.
const { _electron: electron } = require('playwright');
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

async function openAiSettings(win) {
    await win.locator('#settings-trigger').click();
    await win.locator('#settings-panel').waitFor({ state: 'visible' });
    await win.locator('.settings-section-tab[data-settings-section="ai"]').click();
}

async function saveSettings(win) {
    await win.locator('#settings-btn-save').click();
    await win.locator('#settings-panel').waitFor({ state: 'hidden' });
}

async function testSettingsUi() {
    // Isolated profile: never touch the user's real settings.
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-explorer-separator-'));
    const app = await electron.launch({
        cwd: path.resolve(__dirname, '..'),
        args: ['.'],
        env: { ...process.env, VAULT_EXPLORER_E2E: '1', VAULT_EXPLORER_E2E_USER_DATA: userData },
    });
    try {
        const win = await app.firstWindow();
        await win.waitForFunction(() => typeof window.getSubtitleSeparator === 'function' && window.appSettings);

        await openAiSettings(win);
        const select = win.locator('#settings-ai-separator');
        await select.waitFor({ state: 'visible' });
        assert.equal(await select.inputValue(), 'rnnoise', 'Default must be RNNoise');
        assert.equal(await win.locator('#settings-ai-separate').count(), 0, 'Old checkbox must be gone');

        await select.selectOption('mel_band_roformer');
        await saveSettings(win);
        const stored = await win.evaluate(() => window.electronAPI.getSettings());
        assert.equal(stored.aiSeparator, 'mel_band_roformer');
        assert.equal(stored.aiSeparate, undefined, 'Legacy key is dropped on save');

        await openAiSettings(win);
        assert.equal(await select.inputValue(), 'mel_band_roformer', 'Choice must survive reopening');

        // Legacy migration: an unchecked old checkbox means "none".
        const migrated = await win.evaluate(() => {
            const saved = window.appSettings;
            const pick = (settings) => { window.appSettings = settings; return window.getSubtitleSeparator(); };
            const result = {
                off: pick({ aiSeparate: false }),
                on: pick({ aiSeparate: true }),
                bad: pick({ aiSeparator: 'bogus' }),
            };
            window.appSettings = saved;
            return result;
        });
        assert.deepEqual(migrated, { off: 'none', on: 'rnnoise', bad: 'rnnoise' });

        // QC strings.
        const qc = await win.evaluate(() => {
            window.setLanguage('fr');
            const out = {
                label: document.getElementById('label-ai-separator').innerText,
                option: document.querySelector('#settings-ai-separator option[value="none"]').text,
            };
            window.setLanguage('en');
            return out;
        });
        assert.match(qc.label, /Nettoyage audio/i);
        assert.equal(qc.option, 'Aucun (audio brut)');
        await saveSettings(win);
        console.log('[PASS] AI separator setting: default, persistence, migration, QC');
    } finally {
        await app.close();
        fs.rmSync(userData, { recursive: true, force: true });
    }
}

function testBuildArgs() {
    // The main-process argument builder passes the choice through and rejects junk.
    const load = Module._load;
    Module._load = function (request, ...rest) {
        if (request === 'electron') return { BrowserWindow: { getAllWindows: () => [] }, app: { getPath: () => os.tmpdir() } };
        return load.call(this, request, ...rest);
    };
    const { buildArgs } = require('../src/enhancements');
    const separatorOf = (opts) => {
        const args = buildArgs('generate-subtitles', { videoPath: 'x.mkv', ...opts });
        return args[args.indexOf('--separator') + 1];
    };
    assert.equal(separatorOf({ separator: 'htdemucs' }), 'htdemucs');
    assert.equal(separatorOf({}), 'rnnoise');
    assert.equal(separatorOf({ separator: '; rm -rf' }), 'rnnoise');
    console.log('[PASS] generate-subtitles args carry the separator');
}

testSettingsUi()
    .then(testBuildArgs)
    .then(() => console.log('\n[ALL VAULT EXPLORER SETTINGS TESTS PASSED]'))
    .catch((err) => {
        console.error('Test failed:', err);
        process.exit(1);
    });
