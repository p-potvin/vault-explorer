const path = require('path');
const child_process = require('child_process');
const { spawn } = child_process;
const fs = require('fs');

function registerNormalizationHandlers(ipcMain) {
    ipcMain.handle('normalize-audio', async (event, { videoPath, vaultRoot, transcribe }) => {
        console.log(`[main:normalize] Starting audio normalization for ${videoPath}`);
        return new Promise((resolve) => {
            const pythonScript = path.join(__dirname, '..', 'python-scripts', 'audio_normalize.py');
            
            // Find venv python interpreter, prioritizing the fully-equipped media processing environment
            let pythonExe = 'python';
            const mediaProcessingVenv = path.join(__dirname, '..', '..', 'vaultwares-media-processing', '.venv');
            const localVenv = path.join(__dirname, '..', '.venv');
            const legacyVenv = path.join(__dirname, '..', 'venv');
            
            const searchPaths = [mediaProcessingVenv, localVenv, legacyVenv];
            for (const vPath of searchPaths) {
                if (process.platform === 'win32') {
                    const winPath = path.join(vPath, 'Scripts', 'python.exe');
                    if (fs.existsSync(winPath)) {
                        pythonExe = winPath;
                        break;
                    }
                } else {
                    const unixPath = path.join(vPath, 'bin', 'python');
                    if (fs.existsSync(unixPath)) {
                        pythonExe = unixPath;
                        break;
                    }
                }
            }

            const args = [pythonScript, videoPath];
            if (vaultRoot) {
                args.push(vaultRoot);
            }
            if (transcribe) {
                args.push('--transcribe');
            }

            console.log(`[main:normalize] Spawning: ${pythonExe} ${args.join(' ')}`);
            const pyProc = spawn(pythonExe, args, { windowsHide: true });
            
            let outputData = '';
            let errorData = '';

            pyProc.stdout.on('data', (data) => {
                const str = data.toString();
                outputData += str;
                console.log(`[normalize:stdout] ${str.trim()}`);
            });

            pyProc.stderr.on('data', (data) => {
                const str = data.toString();
                errorData += str;
                
                // Parse custom progress logs e.g. "PROGRESS: 45: Vocal Isolation running..."
                const matches = str.match(/PROGRESS:\s*(\d+):(.*)/);
                if (matches && matches.length >= 3) {
                    const percent = parseInt(matches[1], 10);
                    const label = matches[2].trim();
                    if (event.sender && !event.sender.isDestroyed()) {
                        event.sender.send('normalize-progress', { percent, label });
                    }
                } else {
                    console.log(`[normalize:stderr] ${str.trim()}`);
                }
            });

            pyProc.on('close', (code) => {
                console.log(`[main:normalize] Finished with code ${code}`);
                if (code === 0) {
                    resolve({ success: true, log: outputData });
                } else {
                    // Propagate the real error message back to the frontend
                    const cleanErr = errorData.replace(/PROGRESS:\s*\d+:.*\n?/g, '').trim();
                    resolve({ 
                        success: false, 
                        error: cleanErr || `Normalization process exited with error code ${code}` 
                    });
                }
            });
        });
    });

    ipcMain.handle('run-asr-benchmark', async (event, { forceSimulation }) => {
        console.log(`[main:benchmark] Starting ASR benchmark (forceSimulation: ${forceSimulation})`);
        return new Promise((resolve) => {
            const pythonScript = path.join(__dirname, '..', 'python-scripts', 'benchmark_asr.py');
            
            // Find venv python interpreter
            let pythonExe = 'python';
            const mediaProcessingVenv = path.join(__dirname, '..', '..', 'vaultwares-media-processing', '.venv');
            const localVenv = path.join(__dirname, '..', '.venv');
            const legacyVenv = path.join(__dirname, '..', 'venv');
            
            const searchPaths = [mediaProcessingVenv, localVenv, legacyVenv];
            for (const vPath of searchPaths) {
                if (process.platform === 'win32') {
                    const winPath = path.join(vPath, 'Scripts', 'python.exe');
                    if (fs.existsSync(winPath)) {
                        pythonExe = winPath;
                        break;
                    }
                } else {
                    const unixPath = path.join(vPath, 'bin', 'python');
                    if (fs.existsSync(unixPath)) {
                        pythonExe = unixPath;
                        break;
                    }
                }
            }

            const args = [pythonScript];
            if (forceSimulation) {
                args.push('--force-simulation');
            } else {
                args.push('--native');
            }

            console.log(`[main:benchmark] Spawning: ${pythonExe} ${args.join(' ')}`);
            
            // Set up environment so Python can load from sibling directories
            const env = { ...process.env };
            env.PYTHONPATH = path.join(__dirname, '..', '..', 'vaultwares-media-processing');

            const pyProc = spawn(pythonExe, args, { env, windowsHide: true });
            
            let outputData = '';
            let errorData = '';

            pyProc.stdout.on('data', (data) => {
                outputData += data.toString();
            });

            pyProc.stderr.on('data', (data) => {
                errorData += data.toString();
            });

            pyProc.on('close', (code) => {
                console.log(`[main:benchmark] Finished with code ${code}`);
                resolve({
                    success: code === 0,
                    output: outputData,
                    error: errorData
                });
            });
        });
    });
}

module.exports = { registerNormalizationHandlers };
