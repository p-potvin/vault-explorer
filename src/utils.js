const child_process = require('child_process');
const { execFile, spawn } = child_process;
const os = require('os');

const activeSubprocesses = new Set();
const originalSpawn = child_process.spawn;
child_process.spawn = function() {
    const proc = originalSpawn.apply(this, arguments);
    activeSubprocesses.add(proc);
    const clean = () => { activeSubprocesses.delete(proc); };
    proc.on('close', clean);
    proc.on('exit', clean);
    proc.on('error', clean);
    return proc;
};

const originalExecFile = child_process.execFile;
child_process.execFile = function() {
    const proc = originalExecFile.apply(this, arguments);
    activeSubprocesses.add(proc);
    const clean = () => { activeSubprocesses.delete(proc); };
    proc.on('close', clean);
    proc.on('exit', clean);
    proc.on('error', clean);
    return proc;
};

function killAllActiveSubprocesses() {
    console.log(`[main:cleanup] Killing ${activeSubprocesses.size} active subprocesses...`);
    for (const proc of activeSubprocesses) {
        try { proc.kill('SIGKILL'); } catch (e) {}
    }
    activeSubprocesses.clear();
}

function runLowPriorityProcess(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true });
        try {
            os.setPriority(child.pid, 19);
        } catch (e) {
            console.log("Failed to set process priority:", e.message);
        }
        
        let stderr = '';
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command ${command} failed with exit code ${code}. Stderr: ${stderr}`));
        });
    });
}

function getVideoDuration(videoPath) {
    return new Promise((resolve) => {
        execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath], (err, stdout) => {
            if (err) resolve(0);
            else {
                const dur = parseFloat(stdout.trim());
                resolve(isNaN(dur) ? 0 : dur);
            }
        });
    });
}

function checkAudioStream(videoPath) {
    return new Promise((resolve) => {
        execFile('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath], (err, stdout) => {
            resolve(!!stdout.trim());
        });
    });
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

class PriorityQueue {
    constructor() {
        this.queue = [];
        this.running = false;
    }
    push(task) {
        this.queue.push(task);
        this.runNext();
    }
    async runNext() {
        if (this.running || this.queue.length === 0) return;
        this.running = true;
        const task = this.queue.shift();
        try {
            await task();
        } catch (e) {
            console.error("Queue task error:", e);
        }
        this.running = false;
        this.runNext();
    }
}

module.exports = {
    activeSubprocesses,
    killAllActiveSubprocesses,
    runLowPriorityProcess,
    getVideoDuration,
    checkAudioStream,
    formatBytes,
    PriorityQueue
};
