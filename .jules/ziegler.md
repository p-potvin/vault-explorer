## 2024-05-28 - Shell Command Injection in Electron IPC Handlers
**Vulnerability:** The Electron IPC handlers (`get-everything-size` and `generate-webm`) used `child_process.exec` to execute `es.exe` and `ffmpeg`. File paths (`targetPath`, `itemPath`) passed from the frontend were directly interpolated into string commands, creating a severe shell command injection vulnerability.
**Learning:** `child_process.exec` spawns a shell to execute commands, meaning any unescaped shell metacharacters (like `;`, `&`, `|`) in user-provided input or filenames can be parsed as subsequent commands, executing arbitrary code with the privileges of the Electron backend.
**Prevention:** Always use `child_process.execFile` (or `child_process.spawn`) instead of `child_process.exec` when handling dynamic inputs or file paths. `execFile` executes the binary directly without spawning a shell, passing arguments as a safe array, which completely mitigates shell injection risks.
## 2026-05-08 - Shell Command Injection in Ad-Hoc Scripts
**Vulnerability:** Found another instance of `child_process.exec` in an ad-hoc script (`scripts/generate_webm.js`) passing unsanitized file paths.
**Learning:** Shell command injection risks are not isolated to Electron IPC handlers; ad-hoc helper scripts or batch processors running locally often handle untrusted paths and are equally vulnerable.
**Prevention:** Always use `child_process.execFile` in node scripts, including local utility scripts, whenever passing paths or dynamic input.
## 2024-05-14 - DOM XSS in InnerHTML Assignments
**Vulnerability:** Found arbitrary script execution potential due to injecting unescaped user-controlled values (e.g. `item.name`, `theme.name`) directly into DOM elements using `.innerHTML`.
**Learning:** Even internal metadata parameters can be manipulated (e.g., via specifically crafted filenames) to execute arbitrary JavaScript in the application context if not properly escaped before DOM injection. This is critical for Electron apps where arbitrary JavaScript could bridge into IPC and lead to deeper system compromises.
**Prevention:** Always sanitize/escape dynamically injected strings (e.g., using a utility `escapeHtml` function) before assigning them to `.innerHTML` or use safer alternatives like `textContent` and `innerText` whenever injecting text content.
