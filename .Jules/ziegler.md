## 2024-05-06 - Shell Command Injection in IPC Handlers
**Vulnerability:** IPC handlers like `get-everything-size` and `generate-webm` used `child_process.exec` and concatenated unsanitized file paths directly into the command string.
**Learning:** Using `exec` with unsanitized user inputs (e.g. filenames) allows attackers to inject arbitrary shell commands. `child_process.execFile` prevents this by passing arguments separately.
**Prevention:** Always use `child_process.execFile` (or `spawn`) and pass user inputs as an array of arguments, instead of relying on string concatenation with `child_process.exec`.
