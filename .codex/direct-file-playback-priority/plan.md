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

Status: in progress

Implementation

- [ ] Commit and push the scoped change to the active PR.

Verification

- [ ] Run full relevant regressions and inspect PR branch state.

Exit criteria

- [ ] All goal requirements have current evidence before marking the goal complete.
