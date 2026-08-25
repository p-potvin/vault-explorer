/**
 * nvencc.js — Hardware-accelerated NVIDIA NVEnc AI Video Enhancement Engine.
 *
 * Utilizes NVEncC64 (rigaya) with RTX Video Super Resolution (NGX-VSR),
 * RTX TrueHDR, Optical Flow Frame Rate Up Conversion (FRUC),
 * Contrast Adaptive Sharpening (CAS), Unsharp Masking, and Debanding.
 */

const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const utils = require('./utils');

const DEFAULT_NVENCC_PATHS = [
    'C:\\Users\\Administrator\\Desktop\\Executables\\nvencc64\\NVEncC64.exe',
    'C:\\Tools\\nvencc64\\NVEncC64.exe',
    'C:\\Program Files\\nvencc64\\NVEncC64.exe'
];

let _cachedNvenccPath = null;

function resolveNvenccPath() {
    if (_cachedNvenccPath && fs.existsSync(_cachedNvenccPath)) {
        return _cachedNvenccPath;
    }

    if (process.env.NVENCC_PATH && fs.existsSync(process.env.NVENCC_PATH)) {
        _cachedNvenccPath = process.env.NVENCC_PATH;
        return _cachedNvenccPath;
    }

    for (const p of DEFAULT_NVENCC_PATHS) {
        if (fs.existsSync(p)) {
            _cachedNvenccPath = p;
            return _cachedNvenccPath;
        }
    }

    // Try system PATH
    try {
        const out = require('child_process').execSync('where NVEncC64.exe 2>nul || where nvencc.exe 2>nul', { encoding: 'utf8' });
        const firstLine = out.trim().split(/\r?\n/)[0];
        if (firstLine && fs.existsSync(firstLine)) {
            _cachedNvenccPath = firstLine;
            return _cachedNvenccPath;
        }
    } catch (_) {}

    return null;
}

function isNvenccAvailable() {
    return !!resolveNvenccPath();
}

/**
 * Build NVEncC command line arguments from options.
 */
function buildNvenccArgs(inputPath, outputPath, options = {}) {
    const args = [
        '-i', inputPath,
        '-o', outputPath,
        '--codec', options.codec || 'hevc',
        '--preset', options.preset || 'default',
        '--audio-copy'
    ];

    // Rate control / Bitrate
    if (options.cqp !== undefined) {
        args.push('--cqp', String(options.cqp));
    } else {
        args.push('--vbr', '0', '--max-bitrate', String(options.maxBitrate || 25000), '--vbr-quality', String(options.vbrQuality || 24));
    }

    // 1. Super Resolution (VSR / Scaling)
    const vsrEnabled = options.vsr !== false && (options.vsr || options.scale || options.res || options.algo);
    if (vsrEnabled) {
        const algo = options.algo || 'ngx-vsr';
        const quality = options.quality !== undefined ? options.quality : 3;

        let resizeParam = `algo=${algo}`;
        if (algo === 'ngx-vsr') {
            resizeParam += `,vsr-quality=${quality}`;
        }
        args.push('--vpp-resize', resizeParam);

        if (options.res) {
            args.push('--output-res', String(options.res));
        } else if (options.scale && options.scale !== 1) {
            args.push('--output-res', `${options.scale}x`);
        }
    }

    // 2. RTX TrueHDR
    if (options.truehdr) {
        const contrast = options.hdrContrast !== undefined ? options.hdrContrast : 125;
        const saturation = options.hdrSaturation !== undefined ? options.hdrSaturation : 75;
        const middlegray = options.hdrMiddlegray !== undefined ? options.hdrMiddlegray : 44;
        const maxluminance = options.hdrMaxLuminance !== undefined ? options.hdrMaxLuminance : 1000;
        args.push('--vpp-ngx-truehdr', `contrast=${contrast},saturation=${saturation},middlegray=${middlegray},maxluminance=${maxluminance}`);
    }

    // 3. Detail & Edge Sharpening
    if (options.sharpen) {
        const mode = options.sharpenMode || 'unsharp';
        if (mode === 'unsharp') {
            const radius = options.unsharpRadius || 3;
            const weight = options.unsharpWeight || 0.5;
            const threshold = options.unsharpThreshold || 10;
            args.push('--vpp-unsharp', `radius=${radius},weight=${weight},threshold=${threshold}`);
        } else if (mode === 'edgelevel') {
            const strength = options.edgeStrength || 5.0;
            args.push('--vpp-edgelevel', `strength=${strength}`);
        } else if (mode === 'cas') {
            args.push('--vpp-cas');
        } else if (mode === 'warpsharp') {
            const threshold = options.warpThreshold || 128;
            args.push('--vpp-warpsharp', `threshold=${threshold}`);
        }
    }

    // 4. Debanding
    if (options.deband) {
        const mode = options.debandMode || 'libplacebo';
        if (mode === 'libplacebo') {
            const iterations = options.debandIterations || 2;
            const threshold = options.debandThreshold || 4.0;
            args.push('--vpp-libplacebo-deband', `iterations=${iterations},threshold=${threshold}`);
        } else {
            const range = options.debandRange || 15;
            args.push('--vpp-deband', `range=${range}`);
        }
    }

    // 5. Denoising
    if (options.denoise) {
        const mode = options.denoiseMode || 'fft3d';
        if (mode === 'fft3d') {
            const sigma = options.denoiseSigma || 1.5;
            args.push('--vpp-fft3d', `sigma=${sigma}`);
        } else if (mode === 'hqdn3d') {
            args.push('--vpp-hqdn3d');
        }
    }

    // 6. Motion Smoothing (Optical Flow Frame Interpolation)
    if (options.fruc) {
        args.push('--vpp-fruc');
    }

    // 7. Color & Lighting Tweaks
    if (options.tweak) {
        const b = options.brightness || 0.0;
        const c = options.contrast || 1.0;
        const g = options.gamma || 1.0;
        const s = options.saturation || 1.0;
        const h = options.hue || 0.0;
        args.push('--vpp-tweak', `brightness=${b},contrast=${c},gamma=${g},saturation=${s},hue=${h}`);
    }

    return args;
}

/**
 * Execute NVEncC enhancement pipeline with streaming progress callbacks.
 */
function runNvenccPipeline(inputPath, outputPath, options = {}, progressCb = null) {
    return new Promise((resolve, reject) => {
        const nvenccExe = resolveNvenccPath();
        if (!nvenccExe) {
            return reject(new Error('NVEncC64.exe not found on system. Ensure it is located in Desktop/Executables/nvencc64.'));
        }

        const args = buildNvenccArgs(inputPath, outputPath, options);
        console.log(`[NVEncC] Spawning: "${nvenccExe}" ${args.join(' ')}`);

        const child = spawn(nvenccExe, args, { windowsHide: true });
        let stderrData = '';
        let stdoutData = '';

        child.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        child.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderrData += chunk;

            // Parse progress: "125 frames: 34.20 fps, 1200 kbps" or "[45.2%]"
            if (progressCb) {
                const frameMatch = chunk.match(/(\d+)\s+frames:\s+([\d.]+)\s+fps/i);
                const pctMatch = chunk.match(/\[([\d.]+)%\]/);

                let pct = null;
                let message = 'Enhancing video with NVEncC...';

                if (pctMatch) {
                    pct = parseFloat(pctMatch[1]);
                    message = `Enhancing... ${pct.toFixed(1)}%`;
                } else if (frameMatch) {
                    const frames = parseInt(frameMatch[1], 10);
                    const fps = parseFloat(frameMatch[2]);
                    message = `Processed ${frames} frames (${fps.toFixed(1)} fps)`;
                }

                if (pct !== null || frameMatch) {
                    progressCb({ percent: pct, message, raw: chunk.trim() });
                }
            }
        });

        child.on('error', (err) => {
            reject(err);
        });

        child.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
                resolve({
                    success: true,
                    outputPath,
                    size: fs.statSync(outputPath).size,
                    stdout: stdoutData,
                    stderr: stderrData
                });
            } else {
                reject(new Error(`NVEncC exited with code ${code}. Error: ${stderrData.slice(-500) || stdoutData.slice(-500)}`));
            }
        });
    });
}

module.exports = {
    resolveNvenccPath,
    isNvenccAvailable,
    buildNvenccArgs,
    runNvenccPipeline
};
