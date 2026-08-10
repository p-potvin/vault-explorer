// subtitles.ipc.js — discovers local subtitle sidecars for the Explorer player.

const fs = require('fs');
const path = require('path');

const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt']);

const LANGUAGE_NAMES = {
    ar: 'Arabic',
    bn: 'Bengali',
    ca: 'Catalan',
    cs: 'Czech',
    da: 'Danish',
    de: 'German',
    el: 'Greek',
    en: 'English',
    es: 'Spanish',
    fi: 'Finnish',
    fr: 'French',
    qc: 'Québécois',
    he: 'Hebrew',
    hi: 'Hindi',
    hu: 'Hungarian',
    id: 'Indonesian',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    ms: 'Malay',
    nb: 'Norwegian Bokmål',
    nl: 'Dutch',
    no: 'Norwegian',
    pl: 'Polish',
    pt: 'Portuguese',
    ro: 'Romanian',
    ru: 'Russian',
    sk: 'Slovak',
    sv: 'Swedish',
    th: 'Thai',
    tr: 'Turkish',
    uk: 'Ukrainian',
    vi: 'Vietnamese',
    zh: 'Chinese',
};

const REGION_NAMES = {
    ca: 'Canada',
    cn: 'China',
    es: 'Spain',
    fr: 'France',
    gb: 'United Kingdom',
    '419': 'Latin America',
    jp: 'Japan',
    pt: 'Portugal',
    tw: 'Taiwan',
    us: 'United States',
};

const LANGUAGE_ALIASES = {
    eng: 'en',
    fre: 'fr',
    fra: 'fr',
    ger: 'de',
    deu: 'de',
    spa: 'es',
    ita: 'it',
    jpn: 'ja',
    kor: 'ko',
    por: 'pt',
    rus: 'ru',
    zho: 'zh',
    chi: 'zh',
};

function normalizeLanguageCode(token) {
    const raw = String(token || '').trim().replace(/_/g, '-').toLowerCase();
    if (!raw) return 'und';
    const parts = raw.split('-');
    const language = LANGUAGE_ALIASES[parts[0]] || parts[0];
    if (!LANGUAGE_NAMES[language]) return 'und';
    const region = parts[1] && REGION_NAMES[parts[1]] ? parts[1] : '';
    return region ? `${language}-${region}` : language;
}

function languageLabel(code) {
    if (!code || code === 'und') return 'Original';
    const normalized = normalizeLanguageCode(code);
    if (normalized === 'und') return 'Original';
    if (normalized === 'qc') return 'Québécois (QC)';
    const [language, region] = normalized.split('-');
    return region ? `${LANGUAGE_NAMES[language]} (${REGION_NAMES[region]})` : LANGUAGE_NAMES[language];
}

function parseLanguageToken(token) {
    const code = normalizeLanguageCode(token);
    return { lang: code, label: languageLabel(code) };
}

function convertSrtToVtt(sourcePath) {
    // Native HTML video tracks consume WebVTT; Chromium does not reliably parse
    // SRT directly. Keep the user-owned SRT and write only a derived VTT copy.
    if (path.extname(sourcePath).toLowerCase() !== '.srt') return sourcePath;
    const subtitleDir = path.join(path.dirname(sourcePath), '.subtitles');
    const vttPath = path.join(subtitleDir, `${path.basename(sourcePath, path.extname(sourcePath))}.vtt`);
    try {
        fs.mkdirSync(subtitleDir, { recursive: true });
        const srtText = fs.readFileSync(sourcePath, 'utf8');
        const vttText = `WEBVTT\\n\\n${srtText.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').replace(/(\\d{2}:\\d{2}:\\d{2}),(\\d{3})/g, '$1.$2')}`;
        fs.writeFileSync(vttPath, vttText, 'utf8');
        return vttPath;
    } catch (error) {
        console.warn('[subtitles] SRT conversion failed:', error.message);
        return sourcePath;
    }
}

function findLocalSidecars(videoPath) {
    if (typeof videoPath !== 'string' || !videoPath || videoPath.startsWith('http://') || videoPath.startsWith('https://')) return [];
    if (!fs.existsSync(videoPath)) return [];

    const dir = path.dirname(videoPath);
    const base = path.basename(videoPath, path.extname(videoPath)).toLowerCase();
    const results = [];

    for (const name of fs.readdirSync(dir)) {
        const ext = path.extname(name).toLowerCase();
        if (!SUBTITLE_EXTENSIONS.has(ext)) continue;

        const stem = path.basename(name, ext);
        const stemLower = stem.toLowerCase();
        if (stemLower !== base && !stemLower.startsWith(`${base}.`)) continue;

        const suffix = stemLower === base ? '' : stem.slice(base.length + 1);
        const token = suffix.split('.').filter(Boolean).pop() || '';
        const parsed = parseLanguageToken(token);
        results.push({
            label: parsed.label,
            lang: parsed.lang,
            path: convertSrtToVtt(path.join(dir, name)),
            isLocal: true,
        });
    }

    return results;
}

function languageMatches(subtitle, preferred) {
    const wanted = normalizeLanguageCode(preferred);
    if (wanted === 'und' || wanted === 'original') return false;
    const actual = normalizeLanguageCode(subtitle.lang);
    return actual === wanted || actual.split('-')[0] === wanted.split('-')[0] ||
        (actual === 'qc' && wanted === 'fr') || (actual === 'fr' && wanted === 'qc');
}

function orderSidecars(sidecars, preferredLanguage = 'original') {
    const preferred = sidecars.find((subtitle) => languageMatches(subtitle, preferredLanguage));
    const original = sidecars.find((subtitle) => subtitle.lang === 'und');
    const used = new Set([preferred, original].filter(Boolean));
    const rest = sidecars
        .filter((subtitle) => !used.has(subtitle))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }) ||
            a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));

    return [preferred, original, ...rest].filter(Boolean);
}

function registerSubtitlesIpc(ipcMain, loadSettings) {
    ipcMain.handle('find-subtitles', async (_event, videoPath) => {
        const settings = typeof loadSettings === 'function' ? loadSettings() : {};
        return orderSidecars(findLocalSidecars(videoPath), settings.defaultSubLang || 'original');
    });
}

module.exports = {
    findLocalSidecars,
    languageLabel,
    orderSidecars,
    parseLanguageToken,
    registerSubtitlesIpc,
};
