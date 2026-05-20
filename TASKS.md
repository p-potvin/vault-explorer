# TASKS.md
<!-- run_id: vw-2026-05-18-001 -->
<!-- goal: Complete Vault Explorer revamp: stitch WebM previews with audio, deploy 14 new themes, resolve sorting/context/everything-size bugs, and run robust QA -->
<!-- approved_by: p-potvin -->
<!-- approved_at: 2026-05-18T12:05:00-04:00 -->

## H1 [x] Update TODO.md and ROADMAP.md
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: TODO.md, ROADMAP.md -->
<!-- ESTIMATE: 5min -->
Update repository todo backlog and roadmap documents to align with this multi-agent execution run.

## 1 [/] Backend: WebM Previews, Symbolic Folders & Exclusions
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: main.js, src/utils/thumbnails.js -->
<!-- PARALLEL: 3 -->
<!-- BLOCKS: 2 -->
<!-- ESTIMATE: 45min -->
Refactor backend services and data structures:

- **Preview Generation**: Use `ffmpeg` to extract 10 clips of 2 seconds each, spaced equally at `t = (video_length / 10) * i` for `i = 0..9`. Output each clip to WebM with video and audio (`-c:v libvpx-vp9 -c:a libvorbis`). Use FFmpeg's concat demuxer (`-f concat -safe 0`) to stitch the 10 temporary parts into a single `.webm` preview, then clean up temp parts.
- **Preview Cache**: Save output files in `.thumbs/<filename>.webm` at the root of the active vault directory.
- **Conversion Utility**: Scan existing `.thumbs/` directory on load. Identify `.mp4` preview files and convert them to `.webm` using FFmpeg re-encoding.
- **Exclusion Filters**: Filter out files ending with `_p.mp4`, `_p.webm`, `-preview.mp4`, `-preview.webm`, and user-defined glob patterns when scanning directories or building the active file list.
- **Symlink Deletion Fix**: In `main.js`, check if a directory is a symbolic link/junction using `fs.lstatSync(path).isSymbolicLink()`. If it is a symlink, delete it using `fs.unlinkSync(path)` instead of trying to recursively delete it using `fs.rmdirSync(path)`.
- **Symlink Root Fix**: Locate path calculation in backend directory listing. Ensure symbolic folders display their relative name correctly inside path breadcrumbs instead of displaying `"root/"`.

## 3 [x] Style: Theme Revamp, Layout Refactoring, Brand/Bilingual Integration
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html, theme_manager.py, index.css -->
<!-- PARALLEL: 1 -->
<!-- BLOCKS: 2 -->
<!-- ESTIMATE: 45min -->
Deploy the new UI design system and solve related layout bugs:

- **Brand Deployment**: Apply the UI Kit details found in `vaultwares-themes/assets/new-theme/dist-to-vaultwares-themes/README.md`. Move/copy CSS theme tokens into `index.css`.
- **Exporters Update**: Integrate 14 themes inside `theme_manager.py` (Title Case names, kebab-case IDs). Expose all semantic variables (`primary`, `surface`, `accent`, `text`, etc.). Add dark mode default (`golden-slate`) and light mode default (`codex-solar-light-revisited`) dynamic selector.
- **Logo Integration**: Insert the full VaultWares SVG logo in the top bar header. Use the minimal gold icon when collapsed or in tight spots.
- **Header Refactor**: Move the text folders and refresh buttons into small, elegant icon buttons placed immediately in the top bar next to "browse vault". Move the "search files..." input from the top bar to the secondary header row.
- **Dropdown Fixes**: Add `padding-right` and position arrows inside dropdown `<select>` selectors to ensure arrows are centered and do not clip or overflow standard border boundaries.
- **Aesthetic Refinements**: Replace ascending/descending text toggles with a single icon button (e.g. an arrow up/down icon). Ensure EN/QC language toggles translate all UI labels. Ensure no "fake" dummy labels remain.

## 2 [ ] Frontend: Hover Previews, Context Menus, Sorting & Virtual Folders
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html, index.js, index.css -->
<!-- BLOCKS: 4 -->
<!-- BLOCKS_ON: 1, 3 -->
<!-- ESTIMATE: 30min -->
Implement interactive client-side behaviors and data binding:
- **Hover Previews**: In the video grid, bind mouse hover events (`mouseenter`/`mouseleave`) to dynamically load and play the WebM preview (with audio enabled). Use a small `<video>` tag overlapping the thumbnail, triggering `.play()` and `.pause()` on hover.
- **Global Sorting**: Refactor sorting logic so that the sorting dropdown operates on the full global array of indexed files (`allFiles`) rather than sorting only the currently sliced, rendered subset. Ensure sorting stays active when more items are loaded.
- **Context Feedback**: For all 6 context menu button actions, trigger a visible visual notification (using semantic color tokens like `success` or `error` in a non-blocking toast banner).
- **Virtual Folders**: Ensure the "open fake folder..." button checks if the internal file array has a length > 0 before setting its enabled state.
- **Size Fallback**: Attempt to extract the true folder size from EverythingSearch. If unsupported, set up a 3-second debounce timer that triggers after the user idles in a folder. Calculate total directory size in a background process/thread, caching the size result inside local storage or state, re-running only if total folder file count changes.

## 4 [ ] Settings: Glob Pattern Exclusion Setting
<!-- TASK_TYPE: CLOUD -->
<!-- FILE_SCOPE: index.html, main.js, index.js -->
<!-- BLOCKS: 5 -->
<!-- BLOCKS_ON: 2 -->
<!-- ESTIMATE: 20min -->
Wire user glob patterns to settings files and UI fields so that directory scanning exclusions are user-configurable.

## 5 [ ] Verification: Security, Optimization, and Brand Audits
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: FINDINGS_SECURITY.md, FINDINGS_OPTIMIZER.md, FINDINGS_BRAND.md -->
<!-- BLOCKS_ON: 4 -->
<!-- ESTIMATE: 20min -->
Execute verification audits on the modified files to produce security, optimization, and brand reports.

## 6 [ ] QA: Visual and Interactive GUI Verification
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: tests/gui.spec.js -->
<!-- BLOCKS_ON: 5 -->
<!-- ESTIMATE: 25min -->
Perform full GUI verification using the new standard:

- Load the application and perform interactive navigation (2+ links deep, return).
- Verify DevTools Network inspection has no client-side errors.
- Confirm DevTools Console has no runtime exceptions.
- Trigger hover/focus states for WebM previews (with audio).
- Verify layout contrast and bilingual breakpoints using Playwright.

## 7 [ ] Project Release: Telemetry Report & Pull Request
<!-- TASK_TYPE: LOCAL -->
<!-- FILE_SCOPE: final_report.md -->
<!-- BLOCKS_ON: 6 -->
<!-- ESTIMATE: 10min -->
Compile the final execution telemetry (Gemini CLI instances, tokens, tool calls, successes, failures), present the final report, open a PR to main, and clean up Redis.
