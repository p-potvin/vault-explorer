## 2024-05-28 - Shell Command Injection in Electron IPC Handlers
**Vulnerability:** The Electron IPC handlers (`get-everything-size` and `generate-webm`) used `child_process.exec` to execute `es.exe` and `ffmpeg`. File paths (`targetPath`, `itemPath`) passed from the frontend were directly interpolated into string commands, creating a severe shell command injection vulnerability.
**Learning:** `child_process.exec` spawns a shell to execute commands, meaning any unescaped shell metacharacters (like `;`, `&`, `|`) in user-provided input or filenames can be parsed as subsequent commands, executing arbitrary code with the privileges of the Electron backend.
**Prevention:** Always use `child_process.execFile` (or `child_process.spawn`) instead of `child_process.exec` when handling dynamic inputs or file paths. `execFile` executes the binary directly without spawning a shell, passing arguments as a safe array, which completely mitigates shell injection risks.
## 2026-05-08 - Shell Command Injection in Ad-Hoc Scripts
**Vulnerability:** Found another instance of `child_process.exec` in an ad-hoc script (`scripts/generate_webm.js`) passing unsanitized file paths.
**Learning:** Shell command injection risks are not isolated to Electron IPC handlers; ad-hoc helper scripts or batch processors running locally often handle untrusted paths and are equally vulnerable.
**Prevention:** Always use `child_process.execFile` in node scripts, including local utility scripts, whenever passing paths or dynamic input.
## 2024-06-01 - Web Security and DOM XSS
**Vulnerability:** Found `webSecurity: false` enabled on the main BrowserWindow in `main.js`, and an unescaped DOM XSS vulnerability in `index.html` where `item.name` was dynamically interpolated into `card.innerHTML`.
**Learning:** `webSecurity: false` disables the same-origin policy and allows the execution of insecure code, defeating Electron's security model. The XSS vulnerability allowed maliciously crafted filenames to be executed as HTML/JS.
**Prevention:** Always set `webSecurity: true`. Always sanitize dynamically injected strings when using `innerHTML`, preferably by creating a secure `escapeHtml` utility function.
