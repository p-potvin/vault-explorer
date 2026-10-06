// generate_subtitles.py must transcribe through `vw better-subtitles -Separator <setting>`
// (via scripts/pwsh/Start-Subtitles.ps1), fall back to vw_media.asr when vw
// yields no SRT, and construct ModelRun with its required model= argument.
// Python is driven with subprocess, ASR and ModelRun stubbed; no GPU needed.
const assert = require('assert').strict;
const { spawnSync } = require('child_process');
const path = require('path');
const utils = require('../src/utils');

const rootDir = path.resolve(__dirname, '..');
const probe = String.raw`
import json, os, sys, tempfile, types
sys.argv = ["generate_subtitles.py"]
sys.path.insert(0, os.path.join(os.getcwd(), "python-scripts"))
import generate_subtitles as gs

calls = {}
class FakeRun:
    def __init__(self, **kw):
        assert kw.get("model"), "ModelRun needs model="
        calls["modelrun"] = kw
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def set(self, **kw): calls.setdefault("set", {}).update(kw)
gs.ModelRun = FakeRun
gs.shutil.which = lambda name: "pwsh.exe"

class FakeProc:
    def __init__(self, cmd, **kw):
        calls["cmd"] = cmd
        self.stdout = iter(["  [ASR] Transcribing\n"])
        self.returncode = 0
        if os.environ.get("PROBE_WRITE_SRT") == "1":
            out = cmd[cmd.index("-OutputDir") + 1]
            open(os.path.join(out, "clip.srt"), "w", encoding="utf-8").write(
                "1\n00:00:00,000 --> 00:00:01,000\nhello\n")
    def wait(self): return 0
gs.subprocess.Popen = FakeProc
gs.transcribe_native = lambda *a: [{"start": 0.0, "end": 1.0, "text": "native"}]

work = tempfile.mkdtemp()
try:
    segments, engine = gs.transcribe("C:/media/Don't.mkv", "en", 1.0, work, os.environ["PROBE_SEPARATOR"])
finally:
    gs.shutil.rmtree(work, ignore_errors=True)
with FakeRun(provider="local", runtime="nemo-speech",
             model=os.environ.get("VW_ASR_MODEL") or gs.asr.NEMO_SPEECH_MODEL) as run:
    pass
print(json.dumps({"engine": engine, "text": segments[0]["text"], "cmd": calls["cmd"]}))
`;

function runProbe(writeSrt, separator = 'rnnoise') {
    const result = spawnSync(utils.getRobustPythonExe(), ['-c', probe], {
        cwd: rootDir, encoding: 'utf8',
        env: { ...process.env, PROBE_WRITE_SRT: writeSrt ? '1' : '0', PROBE_SEPARATOR: separator, VW_SUBTITLES_ENGINE: '' },
    });
    assert.equal(result.status, 0, `probe failed:\n${result.stderr}`);
    return JSON.parse(result.stdout.trim().split('\n').pop());
}

const viaVw = runProbe(true);
assert.equal(viaVw.engine, 'vw better-subtitles');
assert.equal(viaVw.text, 'hello');
assert.equal(viaVw.cmd[viaVw.cmd.indexOf('-Separator') + 1], 'rnnoise', `default separator: ${viaVw.cmd.join(' ')}`);
assert.ok(!viaVw.cmd.includes('-NoSeparate'), 'The separator setting replaces the hard-coded -NoSeparate');
const viaMel = runProbe(true, 'mel_band_roformer');
assert.equal(viaMel.cmd[viaMel.cmd.indexOf('-Separator') + 1], 'mel_band_roformer', 'Setting must reach vw');
assert.ok(viaVw.cmd.some(a => a.endsWith('Start-Subtitles.ps1')), 'Must go through Start-Subtitles.ps1');
assert.equal(viaVw.cmd[viaVw.cmd.indexOf('-Target') + 1], "C:/media/Don't.mkv", 'Path must be passed as one argv entry');

const fallback = runProbe(false);
assert.equal(fallback.engine, 'vw_media.asr', 'No SRT from vw must fall back to native ASR');
assert.equal(fallback.text, 'native');

// The track is tagged with the transcript's language, never the user-facing `qc`.
const langProbe = String.raw`
import json, os, sys
sys.path.insert(0, os.path.join(os.getcwd(), "python-scripts"))
from vw_media import subtitles as s
fr = "L'important en magie c'est d'essayer ses tours dans la rue au vrai public. On est des frères jumeaux, mais on a dix mois de différence et pour nous c'est une histoire avec la magie dans le fond, pis on s'est retrouvé."
en = "At dawn the harbor station opens its tall windows, and the first clerk begins a careful report for the day. She notes the weather above the river and the slow cargo boats that are waiting at the bridge with the porters."
print(json.dumps({"fr": s.detect_language(fr), "en": s.detect_language(en),
                  "short": s.detect_language("bonjour tout le monde"),
                  "qc": [s.external_code("qc"), s.source_code("qc"), s.source_code("fr-CA")]}))
`;
const lang = spawnSync(utils.getRobustPythonExe(), ['-c', langProbe], { cwd: rootDir, encoding: 'utf8' });
assert.equal(lang.status, 0, `language probe failed:\n${lang.stderr}`);
const detected = JSON.parse(lang.stdout.trim().split('\n').pop());
assert.equal(detected.fr, 'fr');
assert.equal(detected.en, 'en');
assert.equal(detected.short, null, 'Too little text must keep the caller tag');
assert.deepEqual(detected.qc, ['fr', 'fr', 'fr'], 'qc is a UI label only; codes must be fr');

console.log('Generate Subtitles vw pipeline routing passed.');
