// generate_subtitles.py must transcribe through `vw better-subtitles -Separator <setting>`
// (via scripts/pwsh/Start-Subtitles.ps1), pass the picked language as the Riva
// translation target (-TranslateTo, never `qc`), write the transcript as the
// default <video>.srt and the translation as <video>.<lang>.srt, fall back to
// vw_media.asr when vw yields no SRT, and construct ModelRun with model=.
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

def srt(text):
    return "1\n00:00:00,000 --> 00:00:01,000\n" + text + "\n"

class FakeProc:
    def __init__(self, cmd, **kw):
        calls["cmd"] = cmd
        if os.environ.get("PROBE_OSERROR") == "1":
            raise OSError("pwsh cannot be executed")
        self.stdout = iter(["  [ASR] Transcribing\n"])
        self.returncode = 0
        if os.environ.get("PROBE_WRITE_SRT") == "1":
            out = cmd[cmd.index("-OutputDir") + 1]
            stem = os.path.splitext(os.path.basename(cmd[cmd.index("-Target") + 1]))[0]
            open(os.path.join(out, stem + ".srt"), "w", encoding="utf-8").write(srt("bonjour"))
            if "-TranslateTo" in cmd and os.environ.get("PROBE_TRANSLATE") == "1":
                to = cmd[cmd.index("-TranslateTo") + 1]
                same = os.environ.get("PROBE_PASSTHROUGH") == "1"
                open(os.path.join(out, stem + "." + to + ".srt"), "w", encoding="utf-8").write(srt("bonjour" if same else "hello"))
    def wait(self): return 0
gs.subprocess.Popen = FakeProc
gs.transcribe_native = lambda *a: [{"start": 0.0, "end": 1.0, "text": "native"}]
gs.media.require_streams = lambda *a, **k: None
gs.media.get_video_duration = lambda *a: 1.0

# Full action in a scratch folder: which files land, and what the sidecar says.
folder = tempfile.mkdtemp()
video = os.path.join(folder, "Don't.mkv")
open(video, "wb").close()
args = types.SimpleNamespace(language=os.environ["PROBE_LANGUAGE"], separator=os.environ["PROBE_SEPARATOR"], output=None)
gs.process_one(video, args, None)
files = sorted(f for f in os.listdir(folder) if f.endswith(".srt"))
tracks = {f: open(os.path.join(folder, f), encoding="utf-8").read().split("\n")[2] for f in files}
sidecar = gs.state.load(video)
gs.shutil.rmtree(folder, ignore_errors=True)
print(json.dumps({"engine": calls.get("set", {}).get("engine"), "cmd": calls.get("cmd"), "tracks": tracks,
                  "languages": (sidecar.get("enhancements") or {}).get("subtitles")}))
`;

function runProbe({ writeSrt = true, translate = true, separator = 'rnnoise', language = 'en', osError = false, passthrough = false } = {}) {
    const result = spawnSync(utils.getRobustPythonExe(), ['-c', probe], {
        cwd: rootDir, encoding: 'utf8',
        env: {
            ...process.env, VW_SUBTITLES_ENGINE: '',
            PROBE_WRITE_SRT: writeSrt ? '1' : '0', PROBE_TRANSLATE: translate ? '1' : '0',
            PROBE_SEPARATOR: separator, PROBE_LANGUAGE: language, PROBE_OSERROR: osError ? '1' : '0',
            PROBE_PASSTHROUGH: passthrough ? '1' : '0',
        },
    });
    assert.equal(result.status, 0, `probe failed:\n${result.stderr}`);
    return JSON.parse(result.stdout.trim().split('\n').pop());
}
const argAfter = (cmd, flag) => cmd[cmd.indexOf(flag) + 1];

// Picked language is the translation target; qc reaches Riva as fr.
const qc = runProbe({ language: 'qc' });
assert.equal(qc.engine, 'vw better-subtitles');
assert.equal(argAfter(qc.cmd, '-TranslateTo'), 'fr', 'qc must reach Riva as fr');
assert.ok(!qc.cmd.includes('qc'), 'qc is a UI label only');
assert.ok(!qc.cmd.includes('-TranslateFrom'), 'Parakeet identifies the spoken language; no source is forced');
assert.deepEqual(qc.tracks, { "Don't.srt": 'bonjour', "Don't.fr.srt": 'hello' },
    'Transcript is the default track, the translation is the language track');
assert.deepEqual(qc.languages, ['fr']);

// Separator setting and argv shape.
assert.equal(argAfter(qc.cmd, '-Separator'), 'rnnoise', 'default separator');
assert.ok(!qc.cmd.includes('-NoSeparate'), 'The separator setting replaces the hard-coded -NoSeparate');
assert.equal(argAfter(runProbe({ separator: 'mel_band_roformer' }).cmd, '-Separator'), 'mel_band_roformer');
assert.ok(qc.cmd.some(a => a.endsWith('Start-Subtitles.ps1')), 'Must go through Start-Subtitles.ps1');
assert.ok(argAfter(qc.cmd, '-Target').endsWith("Don't.mkv"), 'Path must be passed as one argv entry');

// Translation missing: transcript only, never mislabelled as the target.
const noTrans = runProbe({ language: 'es', translate: false });
assert.deepEqual(noTrans.tracks, { "Don't.srt": 'bonjour' });
assert.deepEqual(noTrans.languages, []);

// Riva handing the transcript back unchanged is not a translation.
const passthrough = runProbe({ language: 'en', passthrough: true });
assert.deepEqual(passthrough.tracks, { "Don't.srt": 'bonjour' }, 'An unchanged transcript must not be labelled as the target');
assert.deepEqual(passthrough.languages, []);

// Fallbacks: no vw transcript, or a shell that cannot start, use the built-in ASR.
const fallback = runProbe({ writeSrt: false });
assert.equal(fallback.engine, 'vw_media.asr', 'No SRT from vw must fall back to native ASR');
assert.deepEqual(fallback.tracks, { "Don't.srt": 'native' });
assert.equal(runProbe({ osError: true }).engine, 'vw_media.asr', 'A shell that cannot start must fall back, not crash');

console.log('Generate Subtitles vw pipeline routing passed.');
