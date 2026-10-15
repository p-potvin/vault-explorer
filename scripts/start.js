const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const electron = require('electron');

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const settingsPath = path.join(appData, 'vault-explorer', 'vault-settings.json');

function defaultFolder() {
    try {
        const folder = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).defaultFolder;
        return folder && fs.statSync(folder).isDirectory() ? folder : null;
    } catch (_) {
        return null;
    }
}

const folder = defaultFolder();
const args = ['.', ...(folder ? [folder] : [])];

spawn(electron, args, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') })
    .on('exit', (code) => process.exit(code ?? 0));
