# Vault Explorer — Comprehensive UI & Backend Fix Plan

Addresses all outstanding issues from user feedback. Changes span 3 files: `main.js`, `index.html`, `preload.js`.

---

## User Review Required

> [!IMPORTANT]
> **FFMPEG idle-time scheduling**: Preview generation will be deferred to fire only after 60 seconds of user inactivity (no mouse/keyboard events). This prevents the 2-4GB RAM flood. The queue already processes sequentially via `PriorityQueue`, but the *trigger* currently fires eagerly on every scan and renderMore batch. The fix is to gate both triggers behind an idle timer that resets on user activity. Worth confirming: **60 seconds idle threshold OK, or prefer longer (e.g. 5 min)?**

> [!WARNING]
> **Sorting fix**: Currently `applyFilters()` sorts `filteredItems` *correctly*, but `renderMore()` only renders the first 50 items (PAGE_SIZE). The sort itself is fine — the bug [VEXP-51] is that `renderMore` re-fires `generateWebm` which overwrites `hoverWebm` on items, not a sort issue. However, I'll verify the `displayedItems` array is fully sorted before any rendering begins to guarantee correctness.

---

## Proposed Changes

### A — `main.js` (Backend)

#### [MODIFY] [main.js](file:///c:/Users/Administrator/Desktop/Github%20Repos/vault-explorer/main.js)

## 1. Rename "fake" → "folder" in context menus (lines 577-583)

- `"Open Fake Folder: ${item.name}"` → `"Open Folder: ${item.name}"`
- `"Remove Fake Folder"` → `"Remove Folder"`
- Internal type stays `fakeFolder` (data format, not user-facing).

## 2. FFMPEG concurrency fix — remove eager `schedulePreviewGeneration` from scan (line 480)

- Delete the call to `schedulePreviewGeneration(res, thumbPath, hoverWebmPath)` inside `_processFileNodes`. Previews will only be generated when explicitly requested or when the idle timer fires.

## 3. Add new IPC: `schedule-idle-previews`

- Accepts an array of `{videoPath, thumbPath, webmPath}` objects from the renderer.
- Pushes them into `backgroundFfmpegQueue` one at a time.
- The renderer calls this after 60s idle with all videos missing previews.

## 4. Fix symlink/junction deletion (lines 642-671)

- Current code tries `fs.unlinkSync` on directories (which fails for junctions on Windows). Fix: use `fs.rmdirSync(itemPath)` for junctions specifically (detected via `stats.isSymbolicLink()` on `lstatSync`).

## 5. Folder size — Everything with fallback (lines 47-63, 702-705)

- Keep `get-everything-size` IPC as primary.
- New IPC: `get-folder-size-smart` — tries Everything first, falls back to a cached hash-table approach:
  - Cache key: `dirPath` → `{fileCount, totalSize, timestamp}`
  - On request: check if `fileCount` matches current `allItems.length` passed from renderer. If yes, return cached. If no, recalculate via `calculateDirectorySizeRecursive` and update cache.
  - Cache persisted in `vault-settings.json` under `sizeCache`.

## 6. Add new context menu operations (lines 562-588)

- Add to video/image/other context menu:
  - `"Cut"` — stores path in a module-level `clipboardPaths` array with mode `'cut'`
  - `"Copy"` — stores path with mode `'copy'`
  - `"Rename (F2)"` — resolves `'rename'` (already exists in renderer)
  - `"Zip Selection"` — new IPC `zip-selection` that spawns `powershell Compress-Archive`
  - `"Properties"` — resolves `'properties'` to trigger a properties dialog in renderer
  - `"Delete"` — resolves `'delete-item'` (already exists but needs confirmation dialog in renderer)

## 7. Add new IPC: `paste-files`

- Accepts `{paths: string[], mode: 'copy'|'cut', destination: string}`.
- For `copy`: `fs.copyFileSync` each file.
- For `cut`: `fs.renameSync` each file.
- Returns `{success, count, errors}`.

## 8. Add new IPC: `zip-selection`

- Accepts `{paths: string[], outputPath: string}`.
- Uses `powershell -Command "Compress-Archive -Path '...' -DestinationPath '...'"`.

## 9. Add new IPC: `get-file-properties`

- Accepts file path, returns `{size, created, modified, dimensions, codec, bitrate, duration}`.
- Uses `ffprobe` for video metadata, `fs.statSync` for basic stats.

---

### B — `index.html` (Frontend)

#### [MODIFY] [index.html](file:///c:/Users/Administrator/Desktop/Github%20Repos/vault-explorer/index.html)

## 1. Titlebar layout fix (lines 68-73, 349-379)

- Reduce `.titlebar` height from `44px` to `32px`.
- Move buttons (FR, Theme, Settings) to the LEFT side of the titlebar, after the logo, instead of `margin-left: auto`.
- Remove "aultWares" text from SVG — just keep the "V" shield logo.
- Change "Vault Explorer" span to just "Explorer" with matching `font-size: 11px`.
- Add `padding-right: 140px` to titlebar to leave room for Windows overlay buttons on the right.

## 2. Move New Folder + Refresh to toolbar as icon buttons (lines 394-409)

- Remove `#btn-new-folder` and `#btn-refresh` from `.sorting-bar`.
- Add them into `.toolbar` right after `#btn-select` as compact icon-only buttons:
  - New Folder: folder-plus SVG icon, 32×32px
  - Refresh: rotate-cw SVG icon, 32×32px
- Move `#search-box` from `.toolbar` into `.sorting-bar`.

**3. Replace Ascending/Descending dropdown with icon button (lines 405-408)**

- Remove `<select id="sort-order">`.
- Add `<button id="btn-sort-order">` with an up/down arrow SVG.
- JS toggles the sort direction and swaps the SVG on click.

**4. Fix select dropdown arrow overflow (lines 87-103)**

- Add CSS: `select { appearance: none; padding-right: 28px; background-image: url("data:image/svg+xml,...chevron..."); background-repeat: no-repeat; background-position: right 8px center; background-size: 12px; }`

**5. Remove "fake" from user-facing strings**

- `"+ Folder"` stays (already good).
- Dialog placeholder: `"My Virtual Folder"` → `"My Folder"`.
- Comments: `// FAKE folders handling` → `// Folder handling`.
- CSS class `.fake-folder` stays (internal), but no user-visible text says "fake" or "virtual".

**6. Keyboard bindings (new block after line 1172)**

- `Escape` → click `#btn-back` (if not at root).
- `F5` → click `#btn-refresh`.
- Arrow keys (`ArrowLeft/Right/Up/Down`) → change focused `.file-card` instead of scrolling. Calculate grid columns from container width / card width, then move focus index accordingly.

**7. FFMPEG idle-time trigger (replace lines 888-893 in renderMore)**

- Remove the eager `generateWebm` loop from `renderMore`.
- Add a global `idleTimer` that resets on `mousemove`, `keydown`, `scroll`.
- After 60s idle, collect all `displayedItems` where `type === 'video' && !hoverWebm`, send them to `schedule-idle-previews` IPC.

**8. Context menu visual feedback (lines 839-878)**

- `'opened'` / `'show'` / `'closed'` → no-op (already handled by OS).
- `'copied'` → show a small green "Copied to clipboard" notification with a quick upward fade animation (not a full toast — a lighter, ephemeral `.clipboard-notification` element).
- `'generate-webm'` → show toast "Generating preview..." (info), then on completion "Preview ready" (success) or error.
- `'upscale-video'` → show toast "AI upscaling in progress..." (info), then result.
- `'delete-item'` → show confirmation dialog first (`confirm()` or custom modal), then `deleteItem` IPC, then toast.
- `'rename'` → trigger F2 rename flow (already exists).
- `'cut'` / `'copy'` → store paths in `window._clipboardPaths`, show clipboard notification.
- `'paste'` → call `paste-files` IPC, toast result.
- `'zip-selection'` → prompt for filename, call `zip-selection` IPC, toast result.
- `'properties'` → open properties panel/modal.

**9. Clipboard notification component (new CSS + JS)**

- Small green pill that appears centered above the status bar.
- Animates upward + fades out over 1.5s.
- Text: "Copied to clipboard ✓" / "Copié dans le presse-papiers ✓".

**10. Selection box blur (line 197)**

- Change `.selection-box` background to include `backdrop-filter: blur(2px)`.

**11. Video card metadata enrichment (lines 717-724)**

- Add file size badge (bottom-left of thumbnail, similar to duration badge).
- Add file type label (extension) below filename.
- If dimensions are available from scan, show them.

**12. Properties panel (new HTML + CSS + JS)**

- A slide-out panel or modal showing:
  - File name, path, size, created date, modified date
  - For videos: duration, dimensions, codec, bitrate
  - For images: dimensions
- Triggered via context menu "Properties" or keyboard shortcut (Alt+Enter).

**13. Folder size status bar fix (lines 650-654 in updateStatusBar)**

- Replace the current eager Everything call with the new smart IPC.
- Only fire after 3 seconds of being in the same folder (debounced).
- Show "Calculating..." while working, then cache the result.

---

### C — `preload.js`

#### [MODIFY] [preload.js](file:///c:/Users/Administrator/Desktop/Github%20Repos/vault-explorer/preload.js)

Add new IPC bridges:

- `scheduleIdlePreviews: (items) => ipcRenderer.invoke('schedule-idle-previews', items)`
- `pasteFiles: (data) => ipcRenderer.invoke('paste-files', data)`
- `zipSelection: (data) => ipcRenderer.invoke('zip-selection', data)`
- `getFileProperties: (p) => ipcRenderer.invoke('get-file-properties', p)`
- `getFolderSizeSmart: (dirPath, fileCount) => ipcRenderer.invoke('get-folder-size-smart', dirPath, fileCount)`

---

## Verification Plan

### Automated Tests

1. Launch Electron app via `npm start`.
2. Browser subagent: open a vault, verify titlebar layout (buttons left, Windows controls right).
3. Right-click a file → verify all context menu items appear with correct names (no "fake"/"virtual").
4. Test Escape → back navigation, F5 → refresh, arrow key card focus.
5. Verify FFMPEG does NOT spawn on scan — only after 60s idle.
6. Verify folder size shows from Everything or falls back to cached calculation.

### Manual Verification

- Delete a symbolic folder → confirm it works.
- Copy path → verify green clipboard notification with fade animation.
- Generate WebM → verify toast shows progress and completion.
- Delete file → verify confirmation dialog appears first.
