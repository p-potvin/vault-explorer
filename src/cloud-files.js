const { spawn } = require('child_process');

// FILE_ATTRIBUTE_OFFLINE means the file data is not immediately available.
// Reading this attribute is metadata-only; it must not hydrate a placeholder.
const OFFLINE_ATTRIBUTE_SCRIPT = `
$paths = [Console]::In.ReadToEnd() | ConvertFrom-Json
foreach ($path in $paths) {
  try {
    $attributes = [System.IO.File]::GetAttributes($path)
    if (($attributes -band [System.IO.FileAttributes]::Offline) -ne 0) {
      [Console]::Out.WriteLine($path)
    }
  } catch {
    # Fail closed: an unavailable or unreadable path must not be probed.
    [Console]::Out.WriteLine($path)
  }
}
`;

function getOfflineCloudPaths(paths) {
    const candidates = [...new Set((paths || []).filter((filePath) => typeof filePath === 'string' && filePath))];
    if (process.platform !== 'win32' || candidates.length === 0) return Promise.resolve(new Set());

    return new Promise((resolve) => {
        const child = spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-Command', OFFLINE_ATTRIBUTE_SCRIPT,
        ], { windowsHide: true });
        let output = '';
        child.stdout.on('data', (chunk) => { output += chunk.toString(); });
        child.on('error', () => resolve(new Set(candidates)));
        child.on('close', (code) => {
            if (code !== 0) return resolve(new Set(candidates));
            resolve(new Set(output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)));
        });
        child.stdin.end(JSON.stringify(candidates));
    });
}

async function isOfflineCloudFile(filePath) {
    return (await getOfflineCloudPaths([filePath])).has(filePath);
}

module.exports = { getOfflineCloudPaths, isOfflineCloudFile };
