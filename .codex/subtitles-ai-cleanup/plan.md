# Implementation plan

Goal: [goal.md](./goal.md)

## Phase 1: Baseline and code-path inventory

Status: complete

Implementation

- [x] Read the repository router and selected protocol summaries.
- [x] Inspect Explorer and vault-streaming subtitle, player, AI, Settings, and navigation paths.
- [x] Record current test/build commands and working-tree state.

Verification

- [x] Node syntax checks passed for the initially affected JavaScript files.
- [x] Baseline subtitle regression failed because the current subtitle module no longer contains the expected normalization call.
- [x] Baseline Electron GUI tests failed to launch Electron in this environment.

Evidence

- Current working tree already had unrelated changes in `BENCHMARKS.md`, `public/vaultwares_logo.png`, `python-scripts/audio_normalize.py`, `src/previews.js`, `src/utils.js`, and untracked `.vscode/`; these will not be reverted.
- Explorer has no registered local subtitle IPC handler, while the renderer still calls `findSubtitles`.
- Explorer player/context paths contain stale provider-era subtitle branches and undefined enhancement-dialog assumptions.

Exit criteria

- [x] Baseline failures and source ownership are recorded.

## Phase 2: Local subtitle catalog and player rendering

Status: complete

Implementation

- [x] Add/register Explorer-local subtitle discovery IPC with language-token parsing.
- [x] Remove remote/provider subtitle code paths and display all local sidecars.
- [x] Implement preferred/original/alphabetical ordering and full-name ellipsized language pills.
- [x] Remove subtitle-induced video padding and repair live cue track lifecycle.

Verification

- [x] `tests/local_subtitles_test.js` passed.
- [x] `tests/subtitle_asr_options_regression_test.js` passed.
- [x] Project JavaScript syntax checks passed.
- [ ] Real local video/CC menu inspection remains blocked because Patchright Electron launch fails in this environment.

Exit criteria

- [x] Static implementation covers every local sidecar and subtitle activation no longer applies player padding.
- [ ] Interactive visual confirmation remains required on a working Electron session.

## Phase 3: AI Live Subtitles and upscaling

Status: complete

Implementation

- [x] Repair first-use/saved-language AI Live Subtitle flow and status/cue rendering.
- [x] Enable and harden player upscaling with MediaSource/source restoration and codec/error fallback.
- [x] Repair contextual-menu enhancement flow while preserving original media.

Verification

- [x] `tests/ai_paths_regression_test.js` passed.
- [x] Python and JavaScript syntax checks passed for project sources.
- [ ] Live cues and GPU VSR require an interactive local Electron/GPU run; Patchright Electron launch is blocked here.

Exit criteria

- [x] Static implementation restores/reverts AI playback paths and writes additive enhanced/AI sidecars.
- [ ] Hardware-backed interactive confirmation remains required.

## Phase 4: Settings, tab, idle-preview, and provider cleanup

Status: complete

Implementation

- [x] Copy the sibling Settings modal layout and retain only Explorer-relevant settings, including language in the modal.
- [x] Remove the Others tab and all related render/default-folder paths.
- [x] Enable idle preview generation for all users while suppressing idle progress/toast diagnostics outside Dev Mode.
- [x] Remove stale provider/catalog references and API key/configuration values from Explorer.

Verification

- [x] `tests/explorer_cleanup_test.js` passed.
- [x] Static scan found no removed provider/settings/tab terms in Explorer source; only a compressed vendored theme artifact remains outside the app surface.
- [x] Idle runner starts for all users; diagnostics and IPC progress are silent outside Dev Mode.
- [ ] Settings visual open/save/close requires an interactive Electron session.

Exit criteria

- [x] Explorer source/config no longer exposes the migrated provider surface or credentials.
- [ ] Interactive Settings and idle-mode behavior remains to be checked manually.

## Phase 5: Full verification and evidence

Status: blocked

Implementation

- [x] Review diff for source preservation and token/style consistency.
- [x] Record exact evidence and unresolved environment limitations.

Verification

- [x] Targeted regression tests passed: local subtitles, AI paths, ASR options, and cleanup scan.
- [x] Project JavaScript and Python syntax checks passed.
- [x] Patchright 1.61.1 installed and `pnpm exec patchright install chromium` completed; the Patchright Electron API loads.
- [ ] Patchright Electron integration still fails before the app surface launches.
- [ ] `npm run dist` reached packaging but failed because a running `vault-explorer.exe` locked `dist/win-unpacked/d3dcompiler_47.dll` with Access Denied.
- [ ] GUI verification is blocked: Patchright Electron launch fails before the app surface is available; manual handoff is required for console/network, navigation, settings, subtitle geometry, live cues, and GPU VSR.

Evidence

- Original media paths are never replaced by the new AI paths; video enhancement outputs use `.enhanced` and AI live captions use `.ai.<language>.srt` sidecars.
- Existing unrelated working-tree changes were preserved.

Exit criteria

- [ ] Completion proof is partial until the Electron/GPU manual verifier runs.
- [x] Shared ledger remains the final response step.
