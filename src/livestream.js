const path = require('path');
const child_process = require('child_process');
const { spawn } = child_process;
const fs = require('fs');
const utils = require('./utils');

let currentLivestreamProcess = null;

function registerLivestreamHandlers(ipcMain) {
    ipcMain.handle('start-livestream', async (event, { streamUrl, voice, lang, threshold, volume }) => {
        if (currentLivestreamProcess) {
            try { currentLivestreamProcess.kill('SIGKILL'); } catch(e) {}
            currentLivestreamProcess = null;
        }

        console.log(`[main:livestream] Starting livestream for ${streamUrl}`);
        
        let pythonScript = path.join(__dirname, '..', 'python-scripts', 'stream_translator.py');
        if (streamUrl === 'LOOPBACK') {
            pythonScript = path.join(__dirname, '..', 'python-scripts', 'livestream_translator.py');
        }

        const pythonExe = utils.getRobustPythonExe();

        const args = ['-u', pythonScript];
        if (streamUrl !== 'LOOPBACK') {
            args.push(streamUrl);
        }
        args.push('--voice', voice);
        args.push('--lang', lang);
        args.push('--threshold', String(threshold));
        args.push('--volume', String(volume));

        console.log(`[main:livestream] Spawning: ${pythonExe} ${args.join(' ')}`);

        const env = { ...process.env };
        env.PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION = 'python';
        env.PYTHONPATH = path.join(__dirname, '..', '..', 'vaultwares-media-processing');

        const pyProc = spawn(pythonExe, args, { env, windowsHide: true });
        currentLivestreamProcess = pyProc;

        let stdoutBuffer = '';
        let stderrBuffer = '';

        const sendLog = (text) => {
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('livestream-log', text);
            }
        };

        const sendVisualizer = (vals) => {
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('livestream-visualizer', vals);
            }
        };

        const handleLine = (line) => {
            if (line.includes('[VISUALIZER]:')) {
                const data = line.substring(line.indexOf('[VISUALIZER]:') + 13).trim();
                const vals = data.split(',').map(v => parseFloat(v));
                sendVisualizer(vals);
                return;
            }
            sendLog(line);
        };

        pyProc.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            let lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop();
            for (const line of lines) {
                handleLine(line);
            }
        });

        pyProc.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
            let lines = stderrBuffer.split(/\r?\n/);
            stderrBuffer = lines.pop();
            for (const line of lines) {
                sendLog(`[ERROR] ${line}`);
            }
        });

        pyProc.on('close', (code) => {
            if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
            if (stderrBuffer.trim()) handleLine(stderrBuffer);
            console.log(`[main:livestream] Finished with code ${code}`);
            sendLog(`[System] Process terminated with code ${code}`);
            currentLivestreamProcess = null;
        });

        return { success: true };
    });

    ipcMain.handle('stop-livestream', async () => {
        if (currentLivestreamProcess) {
            try { currentLivestreamProcess.kill('SIGKILL'); } catch(e) {}
            currentLivestreamProcess = null;
            console.log('[main:livestream] Manually stopped livestream process.');
            return { success: true };
        }
        return { success: false };
    });
}

module.exports = { registerLivestreamHandlers };
