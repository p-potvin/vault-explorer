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
## 2024-06-03 - Insecure WebSecurity Setting
**Vulnerability:** The application was configured with `webSecurity: false` in `BrowserWindow` `webPreferences` in `main.js`.
**Learning:** Setting `webSecurity: false` disables the same-origin policy, making the Electron application extremely vulnerable to arbitrary code execution if any malicious content or script is loaded or injected.
**Prevention:** Always ensure `webSecurity: true` (which is the default) is set or left untouched on BrowserWindow webPreferences.

## 2024-06-03 - Regex Injection in File Renaming
**Vulnerability:** In the `rename-file` IPC handler in `main.js`, a user-provided string (`oldBase`) was passed directly into `new RegExp('^' + oldBase)` without escaping regex metacharacters.
**Learning:** If a file name contains regex metacharacters like `.`, `*`, `?`, or `(`, it alters the regex structure. This could lead to a Regular Expression Denial of Service (ReDoS) or an unintended mass-rename where files matching the manipulated regex are incorrectly modified.
**Prevention:** Always escape user-provided strings before using them in dynamic Regular Expressions. A utility function to escape regex metacharacters (e.g., `str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`) should be used.
