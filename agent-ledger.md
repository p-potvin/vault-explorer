# Agent Ledger

## 2024-05-28
- **Goal:** Secure the application against shell command injection vulnerabilities.
- **Decision:** Replaced all instances of `child_process.exec` in `main.js` with `child_process.execFile`.
- **Context:** The `exec` function spawns a shell, which interprets shell metacharacters. If unvalidated file paths are interpolated into the string command, they could be crafted to execute arbitrary commands. Using `execFile` passes arguments safely in an array directly to the executable, avoiding the shell interpreter entirely.
- **Affected Components:** `get-everything-size` IPC handler and `ffmpeg` queue execution (`generate-webm` handler, `processFfmpegQueue`, and `runPreviewFfmpeg`).
