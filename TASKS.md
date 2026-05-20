# TASKS.md
<!-- run_id: vw-2026-05-20-001 -->
<!-- goal: Revamp Vault Explorer visual layout and implement robust backend IPCs for file management and WebM previews -->
<!-- approved_by: USER -->
<!-- approved_at: 2026-05-20T09:20:00-04:00 -->

## H1 [ ] Update TODO.md and ROADMAP.md
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: TODO.md, ROADMAP.md -->
<!-- ESTIMATE: 5min -->
Update the root-level hygiene tracking files to reflect this multi-agent execution phase.

## 1 [ ] Implement Main Backend IPCs and Handlers
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, preload.js -->
<!-- PARALLEL: 2 -->
<!-- BLOCKS: 3 -->
<!-- ESTIMATE: 60min -->
Add backend handlers in `main.js` and their `preload.js` bridges for file cut/copy/paste, zip selection, properties, idle WebM generation, and smart folder size calculation. Update context menu handlers to reflect new visual semantics (removing 'fake').

### 1a [ ] Symlink and Context Menu IPCs
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, preload.js -->
<!-- PARALLEL: 1b -->
Implement symlink deletion (using `fs.rmdirSync`), update context menu names (Fake -> Folder), and implement cut/copy clipboard internal tracking.

### 1b [ ] Heavy Compute IPCs (ZIP, Size, Properties)
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, preload.js -->
<!-- PARALLEL: 1a -->
<!-- BLOCKS: 1c -->
Implement PowerShell ZIP archival, Everything-backed folder size calculations with fallback cache, and ffprobe-backed file properties retrieval.

### 1c [ ] Background FFmpeg Idle Previews
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, preload.js -->
<!-- BLOCKS_ON: 1b -->
Remove eager `schedulePreviewGeneration` from directory scans, and implement the new `schedule-idle-previews` IPC that sequentially manages preview generation queue.

## 2 [ ] Frontend Revamp and Layout Restructuring
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html -->
<!-- PARALLEL: 1 -->
<!-- BLOCKS: 3 -->
<!-- ESTIMATE: 60min -->
Update `index.html` layout: shrink titlebar to 32px, align buttons left, implement icon-based toolbar, replace select dropdowns with styled buttons, implement arrow key list focus navigation, F5/Esc keyboard shortcuts, and idle timers.

### 2a [ ] Titlebar and Toolbar Restructuring
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html -->
<!-- PARALLEL: 2b, 2c -->
Shrink titlebar, move action items to the left, remove "aultWares" text from logo. Move folder and refresh buttons to `.toolbar` as icons. Replace sort order select with an icon button.

### 2b [ ] List Navigation and Metadata Features
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html -->
<!-- PARALLEL: 2a, 2c -->
Implement ArrowLeft/Right/Up/Down grid navigation. Add duration/file type metadata badges to `.file-card`.

### 2c [ ] Frontend Modals and Clipboard Notifications
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

### 3t [ ] Run GUI Visual Regression
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: tests/gui.spec.js -->
<!-- BLOCKS_ON: 1, 2 -->
Execute `toHaveScreenshot` and verify contrast ratios and bilingual alignment.
