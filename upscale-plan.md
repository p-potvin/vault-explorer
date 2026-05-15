# Video Upscaling Feature Plan

## Objective
Implement the `upscale-video` feature currently scaffolded in `main.js`. This feature will allow users to right-click a video file and select "Upscale Video (AI)", which will process the file to improve its resolution using a selected AI upscaling tool/script.

## Task Breakdown for Agent Delegation (Assigned to `kraftwerk`)

### Task 1: UI Feedback and State Management
- **Goal:** Provide immediate visual feedback to the user when an upscaling task begins and completes.
- **Details:**
    - The IPC handler `upscale-video` is already invoked from the frontend context menu.
    - `index.html` and `preload.js` will need to be updated to capture the `upscale-video` return result or receive async progress events from `main.js`.
    - Create a toast notification or a progress indicator on the video node to show the status (e.g., "Upscaling...", "Finished", "Failed").

### Task 2: Backend Integration & Scripting
- **Goal:** Connect the `upscale-video` IPC handler in `main.js` to an actual upscaling backend.
- **Details:**
    - Develop a new node utility script (e.g., `scripts/upscale.js`) or modify `main.js` directly to orchestrate the upscaling.
    - The integration should probably wrap a command-line utility (e.g., a python AI upscaling script, or ffmpeg with specific filters if an AI plugin is present). *Note: Ensure the use of `child_process.execFile` or `spawn` to avoid shell injection vulnerabilities, as learned previously.*
    - The handler should return success/failure and the path to the newly generated file.

### Task 3: File System Updates & Symmetrical Operations
- **Goal:** Ensure the upscaled video integrates seamlessly into the Vault Explorer ecosystem.
- **Details:**
    - The new upscaled file should ideally be placed in the same directory (e.g., appending `_upscaled.mp4` to the base name).
    - If the user prefers, we might need a way to move thumbnails or trickplay folders to associate with the new upscaled file, or trigger a re-scan of that specific directory via `scan-directory`.

## Constraints & Considerations
- **Security:** Do not use `child_process.exec`. Use secure wrappers.
- **Performance:** Upscaling is a long-running, resource-intensive process. It must not block the main Electron UI thread. A queue system (similar to `ffmpegQueue`) might be necessary.
- **Resource Limits:** Given the "low budget and minimal infrastructure" constraint, prefer local, open-source AI models or simple CLI tools over expensive cloud APIs if possible.