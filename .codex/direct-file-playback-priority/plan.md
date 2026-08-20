# Plan: direct-file playback priority

Goal: [goal.md](goal.md)

## Phase 1: Trace and design the launch handoff

Status: complete

Implementation

- [x] Located main-process argv forwarding and renderer initial-file handling.
- [x] Identified the default-tab scan and `playItem` folder-context scan as the
  startup work that must be deferred.

Verification

- [x] Confirmed current source starts default tab work before direct playback.

Exit criteria

- [x] A flag-to-renderer design preserves normal launch behavior.

## Phase 2: Implement explicit priority launch mode

Status: complete

Implementation

- [x] Parse `--prioritize-player` with the target path in initial and
  second-instance launches.
- [x] Make the renderer fetch the launch intent before home-tab startup.
- [x] Start direct playback without a folder scan in priority mode.
- [x] Defer folder scan, playback-context hydration, and warm-up work until
  the video emits `playing`.

Verification

- [x] Add regression tests for flag propagation and deferred ordering.

Exit criteria

- [x] The explicit mode reaches playback before folder work in source and test.

## Phase 3: Exercise the real Electron launch surface

Status: complete

Implementation

- [x] Create a small local representative video fixture outside the
  repository.

Verification

- [x] Launch Electron with `--prioritize-player` and capture event ordering.
- [x] Verify a normal no-flag launch retains home-tab behavior.
- [x] Verify a second-instance priority launch focuses and plays in the primary.

Exit criteria

- [x] Real-surface evidence meets the goal completion proof.

## Phase 4: Publish and audit

Status: complete

Implementation

- [x] Commit and push the scoped change to the active PR.
- [x] Inspect every exact `vault-explorer.exe` application command in HKCU and
  HKLM, then add `--prioritize-player` only to those commands.
- [x] Diagnose and correct the installed-app single-instance identity.

Evidence: `HKCU\Software\Classes\Applications\vault-explorer.exe\shell\open\command`
now reads `"...\vault-explorer.exe" --prioritize-player "%1"`. After the
user closed the app, `npm run dist` rebuilt the unpacked executable and the
installed two-launch verifier retained one root process.

Verification

- [x] Installed-app / Explorer-association command validation completed.
- [x] Individual direct-launch and forwarding Electron verifiers passed before
  the final aggregate command was interrupted by the user test handoff.
- [x] Read back registry values after the update and run an installed-app
  two-launch verification.

Exit criteria

- [x] One registered Explorer command includes `--prioritize-player`, and a
  second installed-app launch focuses the same primary window.
