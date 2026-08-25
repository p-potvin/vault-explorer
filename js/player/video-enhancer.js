/**
 * video-enhancer.js — Experimental NVEnc AI Video Studio & Enhancement Modal.
 *
 * Provides a granular, modular video editing & AI enhancement space:
 * - Super Resolution (RTX NGX-VSR, Libplacebo Spline36, FSR1, NIS) with quality level 1-4
 * - RTX Video TrueHDR (Tensor Core AI dynamic range expansion)
 * - Detail & Edge Sharpening (CUDA Unsharp Mask, CAS, EdgeLevel, WarpSharp)
 * - Artifact Cleanup (Libplacebo Deband, FFT3D Denoise)
 * - Motion Smoothing (Optical Flow Frame Rate Up Conversion)
 * - Granular sidecar state tracking & reversible effects
 */

(function () {
    let currentVideoPath = null;
    let isEnhancing = false;

    function el(id) {
        return document.getElementById(id);
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function generatePreviewCommand() {
        const parts = ['NVEncC64.exe', '-i "<input>"', '-o "<output>"'];
        
        const codec = el('enh-codec') ? el('enh-codec').value : 'hevc';
        parts.push(`--codec ${codec}`);
        parts.push('--preset default --audio-copy');

        const rateControl = el('enh-rate-control') ? el('enh-rate-control').value : 'vbr';
        if (rateControl === 'cqp') {
            parts.push('--cqp 22');
        } else {
            parts.push('--vbr 0 --max-bitrate 25000 --vbr-quality 24');
        }

        // 1. Super Resolution
        const vsrActive = el('enh-vsr-toggle') && el('enh-vsr-toggle').checked;
        if (vsrActive) {
            const algo = el('enh-vsr-algo').value;
            const quality = el('enh-vsr-quality').value;
            const res = el('enh-vsr-res').value;

            if (algo === 'ngx-vsr') {
                parts.push(`--vpp-resize algo=ngx-vsr,vsr-quality=${quality}`);
            } else {
                parts.push(`--vpp-resize algo=${algo}`);
            }

            if (res && res !== 'none') {
                parts.push(`--output-res ${res}`);
            }
        }

        // 2. TrueHDR
        const hdrActive = el('enh-hdr-toggle') && el('enh-hdr-toggle').checked;
        if (hdrActive) {
            const contrast = el('enh-hdr-contrast').value;
            const sat = el('enh-hdr-sat').value;
            const nits = el('enh-hdr-nits').value;
            parts.push(`--vpp-ngx-truehdr contrast=${contrast},saturation=${sat},middlegray=44,maxluminance=${nits}`);
        }

        // 3. Sharpening
        const sharpActive = el('enh-sharp-toggle') && el('enh-sharp-toggle').checked;
        if (sharpActive) {
            const mode = el('enh-sharp-mode').value;
            if (mode === 'unsharp') {
                const radius = el('enh-unsharp-radius').value;
                const weight = el('enh-unsharp-weight').value;
                parts.push(`--vpp-unsharp radius=${radius},weight=${weight},threshold=10`);
            } else if (mode === 'edgelevel') {
                const strength = el('enh-edge-strength').value;
                parts.push(`--vpp-edgelevel strength=${strength}`);
            } else if (mode === 'cas') {
                parts.push('--vpp-cas');
            } else if (mode === 'warpsharp') {
                parts.push('--vpp-warpsharp threshold=128,blur=2,depth=4');
            }
        }

        // 4. Deband
        const debandActive = el('enh-deband-toggle') && el('enh-deband-toggle').checked;
        if (debandActive) {
            const mode = el('enh-deband-mode').value;
            if (mode === 'libplacebo') {
                parts.push('--vpp-libplacebo-deband iterations=2,threshold=4.0');
            } else {
                parts.push('--vpp-deband range=15,thre_y=15,thre_cb=15,thre_cr=15');
            }
        }

        // 5. Denoise
        const denoiseActive = el('enh-denoise-toggle') && el('enh-denoise-toggle').checked;
        if (denoiseActive) {
            const mode = el('enh-denoise-mode').value;
            if (mode === 'fft3d') {
                const sigma = el('enh-denoise-sigma').value;
                parts.push(`--vpp-fft3d sigma=${sigma}`);
            } else {
                parts.push('--vpp-hqdn3d');
            }
        }

        // 6. FRUC
        const frucActive = el('enh-fruc-toggle') && el('enh-fruc-toggle').checked;
        if (frucActive) {
            parts.push('--vpp-fruc');
        }

        const cmdBox = el('enh-cmd-preview');
        if (cmdBox) {
            cmdBox.textContent = parts.join(' \\\n  ');
        }
    }

    async function refreshSidecarStatus(filePath) {
        if (!filePath) return;
        const statusBox = el('enh-sidecar-status-list');
        if (!statusBox) return;

        try {
            const data = await window.electronAPI.getVideoEnhancementDetails(filePath);
            if (!data || !data.success) {
                statusBox.innerHTML = '<div style="color:var(--vault-slate); font-size:11px;">No sidecar metadata found.</div>';
                return;
            }

            const { enhancements, details, enhancedPath } = data;
            const items = [];

            if (enhancedPath) {
                items.push(`
                    <div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:4px; padding:6px 8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; font-weight:600; color:#4ade80;">Active Enhanced File</span>
                        <button class="enh-revert-btn" data-action="video" style="background:#ef4444; color:#fff; border:none; border-radius:3px; padding:2px 8px; font-size:10px; font-weight:600; cursor:pointer;">Revert All</button>
                    </div>
                `);
            }

            const vDetails = details.video || {};
            if (vDetails.vsr) {
                items.push(`
                    <div class="enh-detail-pill">
                        <span><strong>VSR:</strong> ${vDetails.vsr.algo} (Level ${vDetails.vsr.quality}${vDetails.vsr.res ? ', ' + vDetails.vsr.res : ''})</span>
                    </div>
                `);
            }
            if (vDetails.truehdr) {
                items.push(`
                    <div class="enh-detail-pill">
                        <span><strong>TrueHDR:</strong> Contrast ${vDetails.truehdr.contrast}, Max ${vDetails.truehdr.maxluminance} nits</span>
                    </div>
                `);
            }
            if (vDetails.sharpen) {
                items.push(`
                    <div class="enh-detail-pill">
                        <span><strong>Sharpen:</strong> ${vDetails.sharpen.mode}</span>
                    </div>
                `);
            }
            if (vDetails.deband) {
                items.push(`
                    <div class="enh-detail-pill">
                        <span><strong>Deband:</strong> ${vDetails.deband.mode}</span>
                    </div>
                `);
            }
            if (vDetails.denoise) {
                items.push(`
                    <div class="enh-detail-pill">
                        <span><strong>Denoise:</strong> ${vDetails.denoise.mode}</span>
                    </div>
                `);
            }
            if (vDetails.fruc) {
                items.push(`
                    <div class="enh-detail-pill">
                        <span><strong>Motion Smoothing:</strong> Optical Flow FRUC</span>
                    </div>
                `);
            }

            if (items.length === 0) {
                statusBox.innerHTML = '<div style="color:var(--vault-slate); font-size:11px; font-style:italic;">Original source file (no enhancements baked in yet).</div>';
            } else {
                statusBox.innerHTML = items.join('');
                statusBox.querySelectorAll('.enh-revert-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const action = btn.dataset.action;
                        btn.disabled = true;
                        btn.textContent = 'Reverting…';
                        await window.electronAPI.revertEnhancements(currentVideoPath, action);
                        window.showToast('Enhancement reverted to original source', 'info');
                        await refreshSidecarStatus(currentVideoPath);
                    });
                });
            }
        } catch (err) {
            statusBox.innerHTML = `<div style="color:#ef4444; font-size:11px;">Error reading status: ${err.message}</div>`;
        }
    }

    async function openVideoEnhancerModal(filePath) {
        currentVideoPath = filePath || (window.currentPlayingItem && window.currentPlayingItem.path);
        if (!currentVideoPath) {
            window.showToast('No video selected to enhance.', 'error');
            return;
        }

        const modal = el('video-enhancer-modal');
        const backdrop = el('video-enhancer-backdrop');
        if (!modal) return;

        // Set title and info
        const titleEl = el('enh-file-name');
        if (titleEl) {
            const name = currentVideoPath.split(/[/\\]/).pop();
            titleEl.textContent = name;
            titleEl.title = currentVideoPath;
        }

        // Check NVEncC status
        try {
            const status = await window.electronAPI.getNvenccStatus();
            const gpuBadge = el('enh-gpu-badge');
            if (gpuBadge) {
                if (status && status.available) {
                    gpuBadge.textContent = 'NVIDIA RTX NVENC READY';
                    gpuBadge.style.background = '#10b981';
                } else {
                    gpuBadge.textContent = 'NVEncC Not Found (Check Path)';
                    gpuBadge.style.background = '#ef4444';
                }
            }
        } catch (_) {}

        // Populate / sync sidecar status
        await refreshSidecarStatus(currentVideoPath);
        generatePreviewCommand();

        modal.style.display = 'flex';
        if (backdrop) backdrop.style.display = 'block';
    }

    function closeVideoEnhancerModal() {
        const modal = el('video-enhancer-modal');
        const backdrop = el('video-enhancer-backdrop');
        if (modal) modal.style.display = 'none';
        if (backdrop) backdrop.style.display = 'none';
    }

    async function applyEnhancementPipeline() {
        if (!currentVideoPath || isEnhancing) return;
        isEnhancing = true;

        const applyBtn = el('enh-btn-apply');
        const cancelBtn = el('enh-btn-revert');
        const progressBox = el('enh-progress-box');
        const progressBar = el('enh-progress-bar');
        const progressLabel = el('enh-progress-label');

        if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Processing Pipeline…'; }
        if (progressBox) progressBox.style.display = 'block';
        if (progressBar) progressBar.style.width = '5%';
        if (progressLabel) progressLabel.textContent = 'Launching NVIDIA NVEncC hardware pipeline…';

        const vsrActive = el('enh-vsr-toggle') && el('enh-vsr-toggle').checked;
        const hdrActive = el('enh-hdr-toggle') && el('enh-hdr-toggle').checked;
        const sharpActive = el('enh-sharp-toggle') && el('enh-sharp-toggle').checked;
        const debandActive = el('enh-deband-toggle') && el('enh-deband-toggle').checked;
        const denoiseActive = el('enh-denoise-toggle') && el('enh-denoise-toggle').checked;
        const frucActive = el('enh-fruc-toggle') && el('enh-fruc-toggle').checked;

        const options = {
            videoPath: currentVideoPath,
            codec: el('enh-codec') ? el('enh-codec').value : 'hevc',
            vsr: vsrActive,
            algo: el('enh-vsr-algo') ? el('enh-vsr-algo').value : 'ngx-vsr',
            quality: el('enh-vsr-quality') ? parseInt(el('enh-vsr-quality').value, 10) : 3,
            res: el('enh-vsr-res') && el('enh-vsr-res').value !== 'none' ? el('enh-vsr-res').value : null,
            truehdr: hdrActive,
            hdrContrast: el('enh-hdr-contrast') ? parseInt(el('enh-hdr-contrast').value, 10) : 125,
            hdrSaturation: el('enh-hdr-sat') ? parseInt(el('enh-hdr-sat').value, 10) : 75,
            hdrMaxLuminance: el('enh-hdr-nits') ? parseInt(el('enh-hdr-nits').value, 10) : 1000,
            sharpen: sharpActive,
            sharpenMode: el('enh-sharp-mode') ? el('enh-sharp-mode').value : 'unsharp',
            unsharpRadius: el('enh-unsharp-radius') ? parseInt(el('enh-unsharp-radius').value, 10) : 3,
            unsharpWeight: el('enh-unsharp-weight') ? parseFloat(el('enh-unsharp-weight').value) : 0.5,
            edgeStrength: el('enh-edge-strength') ? parseFloat(el('enh-edge-strength').value) : 5.0,
            deband: debandActive,
            debandMode: el('enh-deband-mode') ? el('enh-deband-mode').value : 'libplacebo',
            denoise: denoiseActive,
            denoiseMode: el('enh-denoise-mode') ? el('enh-denoise-mode').value : 'fft3d',
            denoiseSigma: el('enh-denoise-sigma') ? parseFloat(el('enh-denoise-sigma').value) : 1.5,
            fruc: frucActive,
        };

        const onProgress = (data) => {
            if (data && data.videoPath === currentVideoPath && data.action === 'enhance-video') {
                if (progressBar && data.percent !== undefined) {
                    progressBar.style.width = `${Math.max(5, Math.min(100, data.percent))}%`;
                }
                if (progressLabel && data.label) {
                    progressLabel.textContent = data.label;
                }
            }
        };

        window.electronAPI.onNormalizeProgress(onProgress);

        try {
            const res = await window.electronAPI.enhanceVideoCustom(options);
            if (res && res.success) {
                if (progressBar) progressBar.style.width = '100%';
                if (progressLabel) progressLabel.textContent = '✨ Complete! Enhanced video saved.';
                window.showToast('AI Video Enhancement completed successfully!', 'success');
                await refreshSidecarStatus(currentVideoPath);

                // If currently playing in player, switch seamlessly to enhanced copy
                const vp = el('video-player');
                if (vp && window.currentPlayingItem && window.currentPlayingItem.path === currentVideoPath) {
                    if (res.path) {
                        const curTime = vp.currentTime || 0;
                        vp.src = `file://${res.path.replace(/\\/g, '/')}`;
                        vp.currentTime = curTime;
                        vp.play().catch(() => {});
                    }
                }
            } else {
                window.showToast(`Enhancement failed: ${(res && res.error) || 'Unknown error'}`, 'error');
                if (progressLabel) progressLabel.textContent = `Failed: ${(res && res.error) || 'Unknown error'}`;
            }
        } catch (err) {
            window.showToast(`Enhancement error: ${err.message}`, 'error');
            if (progressLabel) progressLabel.textContent = `Error: ${err.message}`;
        } finally {
            isEnhancing = false;
            window.electronAPI.offNormalizeProgress();
            if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = '🪄 Apply Enhancement Pipeline'; }
        }
    }

    function initVideoEnhancerEvents() {
        const closeBtn = el('enh-modal-close');
        const backdrop = el('video-enhancer-backdrop');
        const cancelBtn = el('enh-btn-close-footer');
        const applyBtn = el('enh-btn-apply');
        const revertAllBtn = el('enh-btn-revert');

        if (closeBtn) closeBtn.addEventListener('click', closeVideoEnhancerModal);
        if (backdrop) backdrop.addEventListener('click', closeVideoEnhancerModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeVideoEnhancerModal);
        if (applyBtn) applyBtn.addEventListener('click', applyEnhancementPipeline);
        if (revertAllBtn) {
            revertAllBtn.addEventListener('click', async () => {
                if (!currentVideoPath) return;
                await window.electronAPI.revertEnhancements(currentVideoPath, 'video');
                window.showToast('All video enhancements reverted', 'info');
                await refreshSidecarStatus(currentVideoPath);
            });
        }

        // Live value labels and command preview updates
        const inputs = [
            'enh-codec', 'enh-rate-control',
            'enh-vsr-toggle', 'enh-vsr-algo', 'enh-vsr-quality', 'enh-vsr-res',
            'enh-hdr-toggle', 'enh-hdr-contrast', 'enh-hdr-sat', 'enh-hdr-nits',
            'enh-sharp-toggle', 'enh-sharp-mode', 'enh-unsharp-radius', 'enh-unsharp-weight', 'enh-edge-strength',
            'enh-deband-toggle', 'enh-deband-mode',
            'enh-denoise-toggle', 'enh-denoise-mode', 'enh-denoise-sigma',
            'enh-fruc-toggle'
        ];

        inputs.forEach(id => {
            const input = el(id);
            if (!input) return;
            input.addEventListener('input', () => {
                // Update slider labels
                if (id === 'enh-hdr-contrast' && el('enh-hdr-contrast-val')) el('enh-hdr-contrast-val').textContent = input.value;
                if (id === 'enh-hdr-sat' && el('enh-hdr-sat-val')) el('enh-hdr-sat-val').textContent = input.value;
                if (id === 'enh-hdr-nits' && el('enh-hdr-nits-val')) el('enh-hdr-nits-val').textContent = `${input.value} nits`;
                if (id === 'enh-unsharp-radius' && el('enh-unsharp-radius-val')) el('enh-unsharp-radius-val').textContent = input.value;
                if (id === 'enh-unsharp-weight' && el('enh-unsharp-weight-val')) el('enh-unsharp-weight-val').textContent = input.value;
                if (id === 'enh-edge-strength' && el('enh-edge-strength-val')) el('enh-edge-strength-val').textContent = input.value;
                if (id === 'enh-denoise-sigma' && el('enh-denoise-sigma-val')) el('enh-denoise-sigma-val').textContent = input.value;

                generatePreviewCommand();
            });
            input.addEventListener('change', generatePreviewCommand);
        });

        // Also connect the player Upscale button to open the Studio or run preset!
        const btnUpscale = el('btn-upscale');
        if (btnUpscale) {
            // Right click or shift-click or normal click can open Video Studio
            btnUpscale.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openVideoEnhancerModal();
            });
        }
    }

    window.openVideoEnhancerModal = openVideoEnhancerModal;
    window.closeVideoEnhancerModal = closeVideoEnhancerModal;

    document.addEventListener('DOMContentLoaded', initVideoEnhancerEvents);
})();
