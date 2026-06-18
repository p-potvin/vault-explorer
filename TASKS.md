# TASKS.md
<!-- run_id: vw-2026-05-20-001 -->
<!-- goal: Revamp Vault Explorer visual layout and implement robust backend IPCs for file management and WebM previews -->
<!-- approved_by: USER -->
<!-- approved_at: 2026-05-20T09:20:00-04:00 -->

## H1 [x] Update TODO.md and ROADMAP.md
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: TODO.md, ROADMAP.md -->
<!-- ESTIMATE: 5min -->
Update the root-level hygiene tracking files to reflect this multi-agent execution phase.

## 1 [x] Implement Main Backend IPCs and Handlers
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, preload.js -->
<!-- PARALLEL: 2 -->
<!-- BLOCKS: 3 -->
<!-- ESTIMATE: 60min -->
Add backend handlers in `main.js` and their `preload.js` bridges for file cut/copy/paste, zip selection, properties, idle WebM generation, and smart folder size calculation. Update context menu handlers to reflect new visual semantics (removing 'fake').

### 1a [x] Symlink and Context Menu IPCs
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, preload.js -->
<!-- PARALLEL: 1b -->
Implement symlink deletion (using `fs.rmdirSync`), update context menu names (Fake -> Folder), and implement cut/copy clipboard internal tracking.

### 1b [x] Heavy Compute IPCs (ZIP, Size, Properties)
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, preload.js -->
<!-- PARALLEL: 1a -->
<!-- BLOCKS: 1c -->
Implement PowerShell ZIP archival, Everything-backed folder size calculations with fallback cache, and ffprobe-backed file properties retrieval.

### 1c [x] Background FFmpeg Idle Previews
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, preload.js -->
<!-- BLOCKS_ON: 1b -->
Remove eager `schedulePreviewGeneration` from directory scans, and implement the new `schedule-idle-previews` IPC that sequentially manages preview generation queue.

## 2 [x] Frontend Revamp and Layout Restructuring
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html -->
<!-- PARALLEL: 1 -->
<!-- BLOCKS: 3 -->
<!-- ESTIMATE: 60min -->
Update `index.html` layout: shrink titlebar to 32px, align buttons left, implement icon-based toolbar, replace select dropdowns with styled buttons, implement arrow key list focus navigation, F5/Esc keyboard shortcuts, and idle timers.

### 2a [x] Titlebar and Toolbar Restructuring
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html -->
<!-- PARALLEL: 2b, 2c -->
Shrink titlebar, move action items to the left, remove "aultWares" text from logo. Move folder and refresh buttons to `.toolbar` as icons. Replace sort order select with an icon button.

### 2b [x] List Navigation and Metadata Features
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html -->
<!-- PARALLEL: 2a, 2c -->
Implement ArrowLeft/Right/Up/Down grid navigation. Add duration/file type metadata badges to `.file-card`.

### 2c [x] Frontend Modals and Clipboard Notifications
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html -->
<!-- PARALLEL: 2a, 2b -->
Implement the green upward-animating clipboard toast, the properties modal, and the idle timer logic firing after 60s of inactivity to call background FFmpeg preview queue.

## 3 [ ] Playwright Visual QA and Verification
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: tests/gui.spec.js -->
<!-- BLOCKS_ON: 1, 2 -->
<!-- ESTIMATE: 30min -->
Write and run Playwright tests for `index.html` using Electron. Establish visual regression baselines and verify hover, focus states, titlebar arrangements, and bilingual text lengths.

**Note (2026-05-30):** Started smoke-testing with Gemini Code Assist integration. Created draft PR #34 to test Gemini Code Assist for GitHub. CodeQL checks in-progress; no Gemini bot response yet. Branch: `vw-codex-gemini-test`.

### 3t [ ] Run GUI Visual Regression
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: tests/gui.spec.js -->
<!-- BLOCKS_ON: 1, 2 -->
Execute `toHaveScreenshot` and verify contrast ratios and bilingual alignment.

---

## Phase 2: Redesigned Tabs & Media UX (in progress)

### 2.1 [x] Fix startup bug from stale `vault` tab
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: js/app.js, js/navigation/tabs.js, js/settings/core.js, js/navigation/directory.js, js/navigation/idle.js -->
Replaced old `vault` tab references with `files`, added backward-compat redirect, and fixed the window startup failure.

### 2.2 [x] Photos tab + Photo Editor
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: js/photos.js, js/photo-editor.js, index.html -->
- Photos tab: masonry river layout for images, double-click opens editor.
- Photo Editor: modal with canvas, zoom, filmstrip, rotate, flip, brightness/contrast/saturation, grayscale/sepia/invert, reset, save-to-download.

### 2.3 [x] Audio tab + Audio Bottom Bar
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: js/audio.js, js/audio-bar.js, index.html -->
- Audio tab: sidebar playlists, tracklist, double-click to play.
- Audio Bottom Bar: play/pause, prev/next, seek, volume, real HTML5 audio playback.

### 2.4 [x] Albums, Playlists, and Misc tabs
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: js/albums.js, js/playlists.js, js/misc.js, index.html -->
- Albums: image groups by folder, clickable cards that jump to Photos filtered by album.
- Playlists: audio groups by folder, clickable cards that jump to Audio filtered by playlist.
- Misc: non-media/uncategorized files grid with document icons.

### 2.5 [ ] Next: Video player context menu
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: js/player/player.js, index.html -->
<!-- ESTIMATE: 45min -->
Right-click menu on the video canvas for speed, audio track, subtitles, PiP, clip start/end markers.

### 2.6 [ ] Settings panel segmentation
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: js/settings/core.js, index.html -->
<!-- ESTIMATE: 45min -->
Break the monolithic settings panel into tabbed sections (General, Playback, Appearance, Shortcuts, Network).

### 2.7 [ ] Custom icon set integration
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: js/icons.js, index.html, css -->
<!-- ESTIMATE: 60min -->
Replace generic inline SVGs with the VaultWares custom icon set where appropriate.

### 2.8 [ ] Keyboard shortcut mapper
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: js/navigation/keybindings.js, js/settings/core.js -->
<!-- ESTIMATE: 60min -->
Allow users to view and rebind keyboard shortcuts from the settings panel.

**Note (2026-06-18):** Smoke test passed after Photo Editor implementation. All redesigned tabs have real content renderers. Ledger events recorded.
