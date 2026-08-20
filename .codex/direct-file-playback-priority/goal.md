# Direct-file playback priority goal

## Outcome

When Vault Explorer receives a file through the explicit `--prioritize-player`
launch mode, it starts the selected local video before scanning or loading its
folder. Folder scanning, playback-context hydration, and deferred warm-up work
begin only after the media element signals that playback has started.

## Baseline

The current launch event reaches the renderer after normal application startup.
The Files tab starts directory work before the direct file is played, and
`playItem` builds folder playback context before setting the video source.

## Constraints

- The priority behavior is active only for `--prioritize-player`; normal CLI
  launches preserve existing behavior.
- The Windows Explorer association must be able to pass that argument.
- Do not weaken existing single-instance forwarding or media cleanup.
- Never claim a fast direct launch without exercising a real Electron launch
  with a representative local video.

## Primary verifier

Launch Electron with `--prioritize-player <local-video>` and prove, from
renderer event order, that the `<video>` reaches `playing` before the folder
scan IPC is invoked. Repeat after forwarding the same mode to a running
single-instance primary window.

## Supporting checks

- Existing single-instance, media-context, and Electron smoke tests.
- Syntax checks and a regression test for argument parsing and deferred work.
- Normal launch without the flag still starts the normal home-tab workflow.

## Completion proof

- Code and tests show flag propagation through primary and second-instance
  launch paths.
- A real Electron run captures `playing` before `scan-directory` for a direct
  priority launch.
- A normal launch remains covered by smoke testing.

## Blocker standard

Only a missing representative local video or unavailable Electron runtime is a
verifier blocker; document the exact manual workflow if either occurs.
