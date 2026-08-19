# Goal: Repair subtitles and remove migrated streaming scope

## Outcome

Vault Explorer is a local-only media explorer/player with working local subtitle discovery, AI Live Subtitles, and AI upscaling; the player keeps its video geometry when subtitles are enabled; Settings matches the VaultWares console modal layout while containing only Explorer-relevant settings; the Others tab and migrated provider/catalog integrations are gone.

## Baseline

- The Explorer renderer still contains provider-era subtitle paths and controls even though streaming was extracted to vault-streaming.
- Local sidecars are not registered through an Explorer subtitle IPC handler, so `findSubtitles` has no main-process implementation.
- Subtitle activation applies bottom padding to the video, producing black bars/shrinkage.
- AI Live Subtitle setup and event wiring are present but require validation and repair.
- The player AI upscale control is disabled in the Explorer markup while its stream IPC and renderer code exist.
- Context-menu enhancement calls a permanent enhancement path that must preserve source media.

## Constraints

- Console mode only; use the sibling settings modal structure and existing tokens/icons.
- Local Explorer scope only. Streaming/debrid/provider/catalog features remain permanently out of scope.
- Remove provider names, API keys, and stale provider configuration from Explorer.
- Preserve original media. Enhancements are additive (`.enhanced` outputs); subtitle files are additive sidecars.
- Subtitle catalog includes `.srt`/`.vtt` sidecars: unqualified, language-coded, and regional variants. Preferred language first, original next, remaining languages alphabetically.
- First AI Live Subtitle use asks for languages; later starts use the saved choice, with a hidden override path when the user selects a new language.

## Primary verifier

Run the Electron app from this checkout with a representative local video and sidecars named `<base>.srt`, `<base>.en.srt`, and `<base>.fr.srt`; verify the CC menu exposes all tracks, each track has a full-name ellipsized pill on the right, selecting a subtitle does not change the video element's rendered geometry, and AI Live Subtitles produces visible cues. Toggle player AI upscale and invoke contextual-menu AI enhancement; verify failures recover to the original source and successful enhancement creates only an additive output.

## Supporting checks

- Static grep finds no Explorer code/config references to the removed provider/catalog integrations.
- Node syntax checks and repository regression tests pass.
- Settings opens, saves, closes, and contains no provider key or streaming setting.
- Others tab is absent and invalid legacy default-tab settings fall back to Files.
- Idle preview generation runs for all users, while progress/toast/diagnostic messages are suppressed outside Dev Mode.
- GUI test automation uses Patchright rather than Playwright.

## Iteration loop

Inspect one affected path, make a focused change, run its syntax/regression verifier, inspect the diff, then continue. Keep failed checks and evidence in the companion plan/worklog.

## Anti-cheating rules

Do not weaken tests, hide console errors, replace real IPC with mocks for the primary verifier, or modify original media files to make checks pass.

## Approval gates

No deployment, push, commit, external API requests, or destructive media deletion. Existing stale configuration may be removed from Explorer source/config as requested.

## Completion proof

Record exact checks, test outputs, static-scan results, and the real-surface manual verification status in `.codex/subtitles-ai-cleanup/plan.md` and the final response.

Companion plan: `.codex/subtitles-ai-cleanup/plan.md`
