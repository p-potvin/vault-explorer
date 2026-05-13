## 2024-05-28 - Shell Command Injection in Electron IPC Handlers
**Vulnerability:** The Electron IPC handlers (`get-everything-size` and `generate-webm`) used `child_process.exec` to execute `es.exe` and `ffmpeg`. File paths (`targetPath`, `itemPath`) passed from the frontend were directly interpolated into string commands, creating a severe shell command injection vulnerability.
**Learning:** `child_process.exec` spawns a shell to execute commands, meaning any unescaped shell metacharacters (like `;`, `&`, `|`) in user-provided input or filenames can be parsed as subsequent commands, executing arbitrary code with the privileges of the Electron backend.
**Prevention:** Always use `child_process.execFile` (or `child_process.spawn`) instead of `child_process.exec` when handling dynamic inputs or file paths. `execFile` executes the binary directly without spawning a shell, passing arguments as a safe array, which completely mitigates shell injection risks.
## 2026-05-08 - Shell Command Injection in Ad-Hoc Scripts
**Vulnerability:** Found another instance of `child_process.exec` in an ad-hoc script (`scripts/generate_webm.js`) passing unsanitized file paths.
**Learning:** Shell command injection risks are not isolated to Electron IPC handlers; ad-hoc helper scripts or batch processors running locally often handle untrusted paths and are equally vulnerable.
**Prevention:** Always use `child_process.execFile` in node scripts, including local utility scripts, whenever passing paths or dynamic input.
## 2024-06-01 - DOM XSS via Unescaped File Names
**Vulnerability:** Unescaped file names (`item.name`) were directly injected into `innerHTML` within `index.html` when generating file cards.
**Learning:** Even local file names can be vectors for DOM XSS in Electron applications. Developers often trust local system state, forgetting that users can create maliciously crafted file names (e.g., `<img src=x onerror=alert(1)>`).
**Prevention:** Always sanitize dynamically injected strings by building and using an `escapeHtml` utility function before assigning them to `innerHTML`.
## 2024-06-01 - DOM XSS via Unescaped File Names
**Vulnerability:** Unescaped file names (`item.name`) were directly injected into `innerHTML` within `index.html` when generating file cards.
**Learning:** Even local file names can be vectors for DOM XSS in Electron applications. Developers often trust local system state, forgetting that users can create maliciously crafted file names (e.g., `<img src=x onerror=alert(1)>`).
**Prevention:** Always sanitize dynamically injected strings by building and using an `escapeHtml` utility function before assigning them to `innerHTML`.
