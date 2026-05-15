## 2024-05-28 - Shell Command Injection in Electron IPC Handlers
**Vulnerability:** The Electron IPC handlers (`get-everything-size` and `generate-webm`) used `child_process.exec` to execute `es.exe` and `ffmpeg`. File paths (`targetPath`, `itemPath`) passed from the frontend were directly interpolated into string commands, creating a severe shell command injection vulnerability.
**Learning:** `child_process.exec` spawns a shell to execute commands, meaning any unescaped shell metacharacters (like `;`, `&`, `|`) in user-provided input or filenames can be parsed as subsequent commands, executing arbitrary code with the privileges of the Electron backend.
**Prevention:** Always use `child_process.execFile` (or `child_process.spawn`) instead of `child_process.exec` when handling dynamic inputs or file paths. `execFile` executes the binary directly without spawning a shell, passing arguments as a safe array, which completely mitigates shell injection risks.
## 2026-05-08 - Shell Command Injection in Ad-Hoc Scripts
**Vulnerability:** Found another instance of `child_process.exec` in an ad-hoc script (`scripts/generate_webm.js`) passing unsanitized file paths.
**Learning:** Shell command injection risks are not isolated to Electron IPC handlers; ad-hoc helper scripts or batch processors running locally often handle untrusted paths and are equally vulnerable.
**Prevention:** Always use `child_process.execFile` in node scripts, including local utility scripts, whenever passing paths or dynamic input.
## 2024-05-30 - Fix DOM-based XSS vulnerability in index.html
**Vulnerability:** In `index.html`, within the `createCardElement` function, the `item.name` was being rendered directly into the DOM using template literals (`card.innerHTML = ...`). This allowed for arbitrary DOM-based Cross-Site Scripting (XSS) if a file was named maliciously.
**Learning:** Even internal desktop applications using Electron are vulnerable to DOM-based XSS when user-controlled data (such as filenames from the local filesystem) is rendered unescaped into HTML.
**Prevention:** Always escape user-controlled data before inserting it into HTML. In `index.html`, an `escapeHTML` function was implemented and applied to `item.name` inside `card.innerHTML` rendering to sanitize special characters (`&`, `<`, `>`, `"`, `'`).
