# TODO List

## Core Implementation Tasks
- [x] **WebM Previews**: Generate 10 stitched 2-second clips with video/audio previews in `.thumbs/` directory.
- [x] **Exclusion Rules**: Filter out preview files and match user-defined glob pattern filters.
- [x] **Symlink Support**: Fix symbolic directory deletion and Relative Name naming inside breadcrumbs.
- [x] **UI Theme Revamp**: Deploy 14 themes, custom select elements, SVGs in title bar, and Quebecois/English bilingual toggle.
- [x] **Interactive Frontend**: Hover audio/video playback, global sorting on full dataset, non-blocking toast notifications for 6 context actions, and debounced folder size cache.
- [x] **Glob Exclusion Settings**: Map UI/backend inputs to user-configurable settings.

## Bugs
- [x] BUG-01: Newly generated WebMs are not loading — shows broken image with visible HTML tags in the card
- [x] BUG-02: Broken encoded strings throughout the UI — worse in French (mojibake: "Ã©" instead of "é")
- [x] BUG-03: Deleting a "fake" (virtual) folder does not work
- [x] BUG-04: F5 keyboard shortcut does not refresh the directory
- [x] BUG-05: Video size badge overlaid on thumbnail is broken / not rendering correctly
- [x] BUG-06: Renaming files does not work
- [x] BUG-07: Copy operation only works for 1 file — multi-file copy is broken
- [x] BUG-08: No visual feedback (toast) when zipping files
- [x] BUG-09: Refresh button is broken — click does nothing or errors
- [x] BUG-10: Folder creation dialog is too small and poorly positioned — should appear right under the create button
- [x] BUG-11: Creating a folder works but cannot delete the created folder afterwards
- [x] BUG-12: Image filter still shows video previews because they share a similar filename with a video file
- [x] BUG-13: Clicking on the folder source input (path-display) should open an explorer dialog to choose a folder
- [x] BUG-14: Browse Vault button should be next to the path input bar; back arrow should be same size as other buttons
- [x] BUG-15: Language starts in English but the lang switch displays "QC" — initial state mismatch
- [x] BUG-16: Theme selector panel appears at the right edge — should appear directly under the theme button
- [x] BUG-17: Settings panel appears at the right edge — should appear directly under the settings button
- [x] BUG-18: Upscale Video returns nothing / no feedback to user
- [x] BUG-19: Every context menu option returns zero visual feedback — need toast notifications for all actions
- [x] BUG-20: Opening a file crashes VLC media player
- [x] BUG-21: Seek bar preview shows only a black image
- [x] BUG-22: Legacy MP4 conversion still attempted — ffmpeg error: "Output file does not contain any stream"
- [x] BUG-23: No console/debug logging throughout the app — impossible to diagnose issues without logs

## Verification & Release

- [ ] Run security, performance optimization, and brand audits.
- [ ] Perform Playwright GUI verification (Console/Network/Interactive navigation).
- [ ] Package release telemetry and PR.


## features to add

- [x] can browse the folder while video plays minimized in the corner (like picture in picture)
- [x] add a play icon when video is over or switch to the next one automatically after 5 second
- [x] make the encryption fully functional
- [ ] add more settings -> to plan with me
- [x] fix the AI enhancements
- [x] fix webm playback/generation
- [x] remove old mp4 capture
- [x] add a local model for video inference
- [x] add keyboard shortcuts for all actions

