/* ==========================================================================
   Vault Explorer — Photo Editor Modal (Canvas Operations)
   Features:
     • Windowed Filmstrip (max 15 items rendered, avoids lag/crashes with huge lists)
     • Auto-Fit to Screen by default on image load + Fit to Screen tool
     • Full Toolset: Crop, Brush/Draw, Text, Markup Arrow, Adjustments, Filters,
       Rotate 90°, Flip H/V, Undo (Ctrl+Z)
     • AI Core Enhancements: Super-Res (Real-ESRGAN 4x), Denoise, Edge Detect
     • One-click Toggle/Revert: Re-pressing an AI button restores the original photo
     • Real Visual Cues: Verified onload confirmation, glowing applied badges
     • Non-destructive export / save-as-copy IPC
   ========================================================================== */

(function () {
    const FILMSTRIP_WINDOW_SIZE = 15;
    const HISTORY_MAX = 20;

    let currentPhotos = [];
    let currentPhotoIndex = -1;
    let currentTool = 'move';
    let zoom = 1;
    let canvas = null;
    let ctx = null;
    let img = null;
    let originalImageSrc = null;
    let activeAiEffect = null; // 'ai-upscale' | 'ai-denoise' | 'ai-edge' | null
    let filmstripEl = null;

    // Undo history — dataURLs of the working image before each commit.
    let history = [];

    // Live (unbaked) adjustments
    const state = {
        rotation: 0,
        flipH: false,
        flipV: false,
        brightness: 1,
        contrast: 1,
        saturate: 1,
        grayscale: 0,
        sepia: 0,
        invert: 0,
    };

    // Tool interaction state
    let dragging = false;
    let dragStart = null;     // {x, y} canvas coords
    let dragCur = null;
    let brushColor = '#ff3355';
    let brushSize = 6;
    let strokePoints = [];

    // AI enhancement cache: originalPath:effectName -> resultPath
    const aiEnhanceCache = new Map();

    function getCanvas() {
        if (!canvas) canvas = el('photo-editor-canvas');
        return canvas;
    }

    function getCtx() {
        if (!ctx) {
            const c = getCanvas();
            if (c) ctx = c.getContext('2d');
        }
        return ctx;
    }

    function getOutputSize() {
        let w = img.width;
        let h = img.height;
        if (state.rotation === 90 || state.rotation === 270) [w, h] = [h, w];
        return { w, h };
    }

    function buildFilterString() {
        const filters = [];
        filters.push(`brightness(${state.brightness})`);
        filters.push(`contrast(${state.contrast})`);
        filters.push(`saturate(${state.saturate})`);
        if (state.grayscale > 0) filters.push(`grayscale(${state.grayscale})`);
        if (state.sepia > 0) filters.push(`sepia(${state.sepia})`);
        if (state.invert > 0) filters.push(`invert(${state.invert})`);
        return filters.join(' ');
    }

    function renderCanvas() {
        const c = getCanvas();
        const context = getCtx();
        if (!c || !context || !img) return;

        const { w, h } = getOutputSize();
        c.width = w;
        c.height = h;
        context.clearRect(0, 0, w, h);
        context.filter = buildFilterString();
        context.save();
        context.translate(w / 2, h / 2);
        context.rotate((state.rotation * Math.PI) / 180);
        context.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
        context.drawImage(img, -img.width / 2, -img.height / 2);
        context.restore();
        context.filter = 'none';
    }

    // ── History / Undo ──────────────────────────────────────────────────────
    function pushHistory() {
        const c = getCanvas();
        if (!c) return;
        try {
            history.push(c.toDataURL('image/png'));
            if (history.length > HISTORY_MAX) history.shift();
        } catch (_) { /* tainted canvas etc. */ }
    }

    function resetLiveState() {
        state.rotation = 0; state.flipH = false; state.flipV = false;
        state.brightness = 1; state.contrast = 1; state.saturate = 1;
        state.grayscale = 0; state.sepia = 0; state.invert = 0;
        const b = el('pe-brightness'), co = el('pe-contrast'), s = el('pe-saturate');
        if (b) b.value = 1;
        if (co) co.value = 1;
        if (s) s.value = 1;
        document.querySelectorAll('.pe-filter-btn').forEach(btn => {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--vault-text)';
        });
    }

    function clearAiButtonVisuals() {
        activeAiEffect = null;
        document.querySelectorAll('.pe-ai-action-btn').forEach(btn => {
            btn.classList.remove('applied');
            btn.style.boxShadow = 'none';
            btn.style.borderColor = 'rgba(168, 85, 247, 0.3)';
            btn.style.background = 'rgba(168, 85, 247, 0.15)';
            btn.style.color = '#d8b4fe';
            const badge = btn.querySelector('.ai-applied-badge');
            if (badge) badge.remove();
        });
    }

    function setAiButtonApplied(buttonId) {
        clearAiButtonVisuals();
        activeAiEffect = buttonId;
        const btn = el(buttonId);
        if (!btn) return;
        btn.classList.add('applied');
        btn.style.boxShadow = '0 0 14px rgba(176, 124, 255, 0.8)';
        btn.style.borderColor = 'var(--vault-accent, #B07CFF)';
        btn.style.background = 'rgba(176, 124, 255, 0.35)';
        btn.style.color = '#ffffff';

        if (!btn.querySelector('.ai-applied-badge')) {
            const badge = document.createElement('span');
            badge.className = 'ai-applied-badge';
            badge.textContent = '✓';
            badge.style.cssText = 'position: absolute; top: -4px; right: -4px; background: var(--vault-signal-online, #6BE675); color: #0b0813; font-size: 9px; font-weight: 900; width: 14px; height: 14px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.6);';
            btn.appendChild(badge);
        }
    }

    function undo() {
        if (!history.length) {
            if (window.showToast) window.showToast('Nothing to undo', 'info');
            return;
        }
        const url = history.pop();
        const prev = new Image();
        prev.onload = () => {
            img = prev;
            resetLiveState();
            clearAiButtonVisuals();
            renderCanvas();
            if (window.showToast) window.showToast('Undone (Ctrl+Z)', 'info');
        };
        prev.src = url;
    }

    // Bake whatever is currently visible into the working image.
    function flatten(afterLoad) {
        const c = getCanvas();
        if (!c || !img) return;
        pushHistory();
        const url = c.toDataURL('image/png');
        const next = new Image();
        next.onload = () => {
            img = next;
            resetLiveState();
            renderCanvas();
            if (afterLoad) afterLoad();
        };
        next.src = url;
    }

    // ── Coordinate mapping (screen px -> canvas px) ─────────────────────────
    function canvasPoint(ev) {
        const c = getCanvas();
        const r = c.getBoundingClientRect();
        return {
            x: (ev.clientX - r.left) * (c.width / r.width),
            y: (ev.clientY - r.top) * (c.height / r.height),
        };
    }

    // ── Fit Image to Screen Viewport ────────────────────────────────────────
    function fitImageToScreen() {
        const c = getCanvas();
        if (!c || !img) return;
        const container = c.parentElement;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const availW = Math.max(150, containerRect.width - 48);
        const availH = Math.max(150, containerRect.height - 48);

        const { w, h } = getOutputSize();
        const scaleX = availW / w;
        const scaleY = availH / h;
        const fitZoom = Math.min(scaleX, scaleY, 1);

        zoom = fitZoom;
        panOffset = { x: 0, y: 0 };

        const zoomInput = el('photo-editor-zoom');
        const zoomVal = el('photo-editor-zoom-val');
        if (zoomInput) zoomInput.value = fitZoom;
        if (zoomVal) zoomVal.innerText = Math.round(fitZoom * 100) + '%';

        applyCanvasTransform();
    }

    // ── Tool option panel (crop apply, brush controls, hints) ───────────────
    function toolOptionsHost() {
        let host = el('photo-editor-tool-options');
        if (!host) {
            host = document.createElement('div');
            host.id = 'photo-editor-tool-options';
            host.style.cssText = 'display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 10px; color: var(--vault-slate);';
            const adjustments = el('photo-editor-adjustments');
            if (adjustments && adjustments.parentElement) {
                adjustments.parentElement.insertBefore(host, adjustments);
            }
        }
        return host;
    }

    function setToolOptions(html) {
        const host = toolOptionsHost();
        host.innerHTML = html || '';
    }

    // ── Crop ────────────────────────────────────────────────────────────────
    function drawCropOverlay() {
        renderCanvas();
        if (!dragStart || !dragCur) return;
        const context = getCtx();
        const x = Math.min(dragStart.x, dragCur.x);
        const y = Math.min(dragStart.y, dragCur.y);
        const w = Math.abs(dragCur.x - dragStart.x);
        const h = Math.abs(dragCur.y - dragStart.y);
        context.save();
        context.fillStyle = 'rgba(0,0,0,0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.clearRect(x, y, w, h);
        // Redraw the selected region unshaded
        context.globalCompositeOperation = 'destination-over';
        context.filter = buildFilterString();
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate((state.rotation * Math.PI) / 180);
        context.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
        context.drawImage(img, -img.width / 2, -img.height / 2);
        context.restore();
        context.save();
        context.strokeStyle = '#B07CFF';
        context.setLineDash([6, 4]);
        context.lineWidth = Math.max(2, canvas.width / 400);
        context.strokeRect(x, y, w, h);
        context.restore();
    }

    function applyCrop() {
        if (!dragStart || !dragCur) return;
        const x = Math.max(0, Math.min(dragStart.x, dragCur.x));
        const y = Math.max(0, Math.min(dragStart.y, dragCur.y));
        const w = Math.min(canvas.width - x, Math.abs(dragCur.x - dragStart.x));
        const h = Math.min(canvas.height - y, Math.abs(dragCur.y - dragStart.y));
        if (w < 8 || h < 8) {
            if (window.showToast) window.showToast('Selection too small', 'warning');
            return;
        }

        pushHistory();
        renderCanvas();
        const off = document.createElement('canvas');
        off.width = w; off.height = h;
        off.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
        const next = new Image();
        next.onload = () => {
            img = next;
            resetLiveState();
            dragStart = dragCur = null;
            renderCanvas();
            setToolOptions('');
            fitImageToScreen();
            if (window.showToast) window.showToast('Cropped', 'success');
        };
        next.src = off.toDataURL('image/png');
    }

    function showCropControls() {
        setToolOptions('');
        const host = toolOptionsHost();
        const hint = document.createElement('span');
        hint.textContent = 'Drag on the image to select';
        const apply = document.createElement('button');
        apply.textContent = 'Apply Crop';
        apply.style.cssText = 'background: var(--vault-accent); color: var(--vt-primary); border: none; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 10px; cursor: pointer; font-family: var(--font-mono); text-transform: uppercase;';
        apply.addEventListener('click', applyCrop);
        const cancel = document.createElement('button');
        cancel.textContent = 'Cancel';
        cancel.style.cssText = 'background: transparent; color: var(--vault-slate); border: 1px solid var(--vault-border); padding: 4px 10px; border-radius: 4px; font-size: 10px; cursor: pointer; font-family: var(--font-mono);';
        cancel.addEventListener('click', () => { dragStart = dragCur = null; renderCanvas(); setActiveTool('move'); });
        host.appendChild(hint); host.appendChild(apply); host.appendChild(cancel);
    }

    // ── Draw / markup controls ──────────────────────────────────────────────
    function showBrushControls(label) {
        setToolOptions('');
        const host = toolOptionsHost();
        const hint = document.createElement('span');
        hint.textContent = label;
        const color = document.createElement('input');
        color.type = 'color';
        color.value = brushColor;
        color.style.cssText = 'width: 26px; height: 22px; border: none; background: transparent; cursor: pointer; padding: 0;';
        color.addEventListener('input', (e) => { brushColor = e.target.value; });
        const size = document.createElement('input');
        size.type = 'range';
        size.min = 2; size.max = 40; size.value = brushSize;
        size.style.cssText = 'width: 80px; accent-color: var(--vault-accent);';
        size.addEventListener('input', (e) => { brushSize = parseInt(e.target.value, 10); });
        host.appendChild(hint); host.appendChild(color); host.appendChild(size);
    }

    // ── Text tool ───────────────────────────────────────────────────────────
    function placeTextAt(pt, screenEv) {
        const c = getCanvas();
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Type text, then Enter';
        input.style.cssText = `position: fixed; left: ${screenEv.clientX}px; top: ${screenEv.clientY}px; z-index: 10500; background: rgba(11,8,19,0.95); color: #fff; border: 1px solid var(--vault-accent); border-radius: 4px; padding: 6px 10px; font-size: 13px; font-family: var(--font-body); outline: none; min-width: 180px; box-shadow: 0 4px 16px rgba(0,0,0,0.7);`;
        document.body.appendChild(input);
        setTimeout(() => input.focus(), 0);

        const commit = () => {
            const text = input.value.trim();
            input.remove();
            if (!text) return;
            const context = getCtx();
            const fontPx = Math.max(16, Math.round(c.width / 30)) + (brushSize * 2);
            context.save();
            context.font = `700 ${fontPx}px sans-serif`;
            context.fillStyle = brushColor;
            context.strokeStyle = 'rgba(0,0,0,0.65)';
            context.lineWidth = Math.max(2, fontPx / 12);
            context.strokeText(text, pt.x, pt.y);
            context.fillText(text, pt.x, pt.y);
            context.restore();
            flatten();
            if (window.showToast) window.showToast('Text added', 'success');
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') input.remove();
            e.stopPropagation();
        });
        input.addEventListener('blur', () => { if (document.body.contains(input)) commit(); });
    }

    // ── Arrow (markup) ──────────────────────────────────────────────────────
    function drawArrow(context, from, to, color, width) {
        const head = Math.max(12, width * 3.5);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        context.save();
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = width;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
        context.beginPath();
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - head * Math.cos(angle - Math.PI / 7), to.y - head * Math.sin(angle - Math.PI / 7));
        context.lineTo(to.x - head * Math.cos(angle + Math.PI / 7), to.y - head * Math.sin(angle + Math.PI / 7));
        context.closePath();
        context.fill();
        context.restore();
    }

    // ── Move (pan when zoomed) ──────────────────────────────────────────────
    let panStart = null;
    let panOffset = { x: 0, y: 0 };

    function applyCanvasTransform() {
        const c = getCanvas();
        if (c) c.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`;
    }

    // ── Pointer handling on the canvas ──────────────────────────────────────
    function onPointerDown(ev) {
        if (!img) return;
        const pt = canvasPoint(ev);
        if (currentTool === 'crop' || currentTool === 'markup') {
            dragging = true;
            dragStart = pt;
            dragCur = pt;
        } else if (currentTool === 'draw') {
            dragging = true;
            strokePoints = [pt];
            const context = getCtx();
            context.save();
            context.strokeStyle = brushColor;
            context.lineWidth = brushSize * (canvas.width / canvas.getBoundingClientRect().width);
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.beginPath();
            context.moveTo(pt.x, pt.y);
        } else if (currentTool === 'text') {
            placeTextAt(pt, ev);
        } else if (currentTool === 'move') {
            panStart = { x: ev.clientX - panOffset.x, y: ev.clientY - panOffset.y };
        }
    }

    function onPointerMove(ev) {
        if (currentTool === 'move' && panStart) {
            panOffset = { x: ev.clientX - panStart.x, y: ev.clientY - panStart.y };
            applyCanvasTransform();
            return;
        }
        if (!dragging) return;
        const pt = canvasPoint(ev);
        if (currentTool === 'crop') {
            dragCur = pt;
            drawCropOverlay();
        } else if (currentTool === 'markup') {
            dragCur = pt;
            renderCanvas();
            drawArrow(getCtx(), dragStart, dragCur, brushColor, Math.max(3, brushSize));
        } else if (currentTool === 'draw') {
            const context = getCtx();
            context.lineTo(pt.x, pt.y);
            context.stroke();
        }
    }

    function onPointerUp() {
        if (currentTool === 'move') { panStart = null; return; }
        if (!dragging) return;
        dragging = false;
        if (currentTool === 'draw') {
            getCtx().restore();
            flatten();
        } else if (currentTool === 'markup' && dragStart && dragCur) {
            const dist = Math.hypot(dragCur.x - dragStart.x, dragCur.y - dragStart.y);
            if (dist > 8) {
                flatten(() => {
                    if (window.showToast) window.showToast('Arrow added', 'success');
                });
            } else {
                renderCanvas();
            }
            dragStart = dragCur = null;
        }
    }

    // ── Photo loading & Sliding Window Filmstrip ────────────────────────────
    function loadPhoto(item) {
        const c = getCanvas();
        if (!c || !item) return;
        history = [];
        dragStart = dragCur = null;
        clearAiButtonVisuals();

        originalImageSrc = window.sanitizePath(item.path);

        img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            resetLiveState();
            renderCanvas();
            fitImageToScreen();
        };
        img.src = originalImageSrc;
        img.onerror = () => {
            if (window.showToast) window.showToast('Failed to load image: ' + item.name, 'error');
        };

        const title = document.querySelector('#photo-editor-modal h3');
        if (title) title.innerText = item.name;
    }

    function populateFilmstrip() {
        filmstripEl = el('photo-editor-filmstrip');
        if (!filmstripEl) return;
        filmstripEl.innerHTML = '';

        if (!currentPhotos.length) return;

        // Sliding window calculation: Render at most FILMSTRIP_WINDOW_SIZE items
        const total = currentPhotos.length;
        const half = Math.floor(FILMSTRIP_WINDOW_SIZE / 2);
        let startIdx = Math.max(0, currentPhotoIndex - half);
        let endIdx = Math.min(total, startIdx + FILMSTRIP_WINDOW_SIZE);

        if (endIdx - startIdx < FILMSTRIP_WINDOW_SIZE) {
            startIdx = Math.max(0, endIdx - FILMSTRIP_WINDOW_SIZE);
        }

        // Left pagination arrow if more previous photos exist
        if (startIdx > 0) {
            const leftBtn = document.createElement('button');
            leftBtn.innerHTML = '‹';
            leftBtn.title = `Previous (${startIdx} more)`;
            leftBtn.style.cssText = 'background: rgba(255,255,255,0.1); border: 1px solid var(--vault-border); color: #fff; width: 28px; height: 60px; border-radius: 4px; cursor: pointer; font-size: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;';
            leftBtn.addEventListener('click', () => {
                currentPhotoIndex = Math.max(0, currentPhotoIndex - FILMSTRIP_WINDOW_SIZE);
                loadPhoto(currentPhotos[currentPhotoIndex]);
                populateFilmstrip();
            });
            filmstripEl.appendChild(leftBtn);
        }

        for (let idx = startIdx; idx < endIdx; idx++) {
            const p = currentPhotos[idx];
            const thumb = document.createElement('img');
            thumb.src = p.thumbnail ? window.sanitizePath(p.thumbnail) : window.sanitizePath(p.path);
            thumb.loading = 'lazy';
            thumb.style.cssText = 'width: 60px; height: 60px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 2px solid transparent; flex-shrink: 0; opacity: 0.65; transition: all 0.15s;';
            if (idx === currentPhotoIndex) {
                thumb.style.borderColor = 'var(--vault-accent)';
                thumb.style.opacity = '1';
                thumb.style.transform = 'scale(1.05)';
            }
            thumb.addEventListener('click', () => {
                currentPhotoIndex = idx;
                loadPhoto(currentPhotos[idx]);
                populateFilmstrip();
            });
            filmstripEl.appendChild(thumb);
        }

        // Right pagination arrow if more upcoming photos exist
        if (endIdx < total) {
            const rightBtn = document.createElement('button');
            rightBtn.innerHTML = '›';
            rightBtn.title = `Next (${total - endIdx} more)`;
            rightBtn.style.cssText = 'background: rgba(255,255,255,0.1); border: 1px solid var(--vault-border); color: #fff; width: 28px; height: 60px; border-radius: 4px; cursor: pointer; font-size: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;';
            rightBtn.addEventListener('click', () => {
                currentPhotoIndex = Math.min(total - 1, currentPhotoIndex + FILMSTRIP_WINDOW_SIZE);
                loadPhoto(currentPhotos[currentPhotoIndex]);
                populateFilmstrip();
            });
            filmstripEl.appendChild(rightBtn);
        }
    }

    // ── AI Enhancement Actions with Toggle/Revert on Re-press ────────────────
    async function toggleAiAction(actionName, ipcFn, args, label) {
        const item = currentPhotos[currentPhotoIndex];
        if (!item || !ipcFn) return;

        const buttonId = `pe-btn-${actionName}`;
        const button = el(buttonId);

        // If ALREADY applied, re-pressing reverts to original!
        if (activeAiEffect === buttonId) {
            pushHistory();
            const prev = new Image();
            prev.crossOrigin = 'anonymous';
            prev.onload = () => {
                img = prev;
                clearAiButtonVisuals();
                renderCanvas();
                fitImageToScreen();
                if (window.showToast) window.showToast(`Reverted ${label} to original`, 'info');
            };
            prev.src = originalImageSrc;
            return;
        }

        const originalPath = item.path;
        const cacheKey = `${originalPath}:${actionName}`;

        if (aiEnhanceCache.has(cacheKey)) {
            const cachedPath = aiEnhanceCache.get(cacheKey);
            pushHistory();
            const enhancedImg = new Image();
            enhancedImg.crossOrigin = 'anonymous';
            enhancedImg.onload = () => {
                img = enhancedImg;
                setAiButtonApplied(buttonId);
                renderCanvas();
                fitImageToScreen();
                if (window.showToast) window.showToast(`Applied cached ${label} ✓`, 'success');
            };
            enhancedImg.src = window.sanitizePath(cachedPath);
            return;
        }

        if (button) button.style.opacity = '0.5';
        if (window.showToast) window.showToast(`${label}… running in background`, 'info');

        try {
            const result = await ipcFn(...args);
            if (button) button.style.opacity = '1';

            if (result && result.success && result.path) {
                aiEnhanceCache.set(cacheKey, result.path);
                pushHistory();

                const enhancedImg = new Image();
                enhancedImg.crossOrigin = 'anonymous';
                enhancedImg.onload = () => {
                    img = enhancedImg;
                    setAiButtonApplied(buttonId);
                    renderCanvas();
                    fitImageToScreen();
                    if (window.showToast) window.showToast(`${label} applied successfully! ✓`, 'success');
                };
                enhancedImg.onerror = () => {
                    if (window.showToast) window.showToast(`Failed to load enhanced image file`, 'error');
                };
                enhancedImg.src = window.sanitizePath(result.path);
            } else {
                if (window.showToast) window.showToast(`${label} failed: ${result?.error || 'Unknown error'}`, 'error');
            }
        } catch (e) {
            if (button) button.style.opacity = '1';
            if (window.showToast) window.showToast(`${label} error: ${e.message}`, 'error');
        }
    }

    // ── Tools ───────────────────────────────────────────────────────────────
    function setActiveTool(tool) {
        if (tool === 'rotate') {
            pushHistory();
            state.rotation = (state.rotation + 90) % 360;
            renderCanvas();
            fitImageToScreen();
            return;
        }
        if (tool === 'flip') {
            pushHistory();
            state.flipH = !state.flipH;
            renderCanvas();
            return;
        }
        if (tool === 'fit-screen') {
            fitImageToScreen();
            return;
        }
        if (tool === 'ai-upscale') {
            const item = currentPhotos[currentPhotoIndex];
            if (item && window.electronAPI?.enhanceImageRealESRGAN) {
                toggleAiAction('ai-upscale', window.electronAPI.enhanceImageRealESRGAN, [item.path], 'Real-ESRGAN 4x');
            }
            return;
        }
        if (tool === 'ai-denoise') {
            const item = currentPhotos[currentPhotoIndex];
            if (item && window.electronAPI?.enhanceImageMagick) {
                toggleAiAction('ai-denoise', window.electronAPI.enhanceImageMagick, [item.path, 'denoise'], 'Denoise');
            }
            return;
        }
        if (tool === 'ai-edge') {
            const item = currentPhotos[currentPhotoIndex];
            if (item && window.electronAPI?.enhanceImageMagick) {
                toggleAiAction('ai-edge', window.electronAPI.enhanceImageMagick, [item.path, 'edge'], 'Edge Detect');
            }
            return;
        }

        currentTool = tool;
        dragStart = dragCur = null;
        document.querySelectorAll('.photo-tool:not(.pe-ai-action-btn), .photo-tool-bottom').forEach(btn => {
            const isActive = btn.dataset.tool === tool;
            btn.style.background = isActive ? 'var(--vault-accent)' : 'transparent';
            btn.style.color = isActive ? 'var(--vt-primary)' : 'var(--vault-text)';
            btn.style.border = isActive ? 'none' : '1px solid var(--vault-border)';
        });

        const panel = el('photo-editor-adjustments');
        if (panel) {
            const show = tool === 'exposure' || tool === 'adjust' || tool === 'filters';
            panel.style.display = show ? 'flex' : 'none';
        }

        const c = getCanvas();
        if (c) c.style.cursor = { move: 'grab', crop: 'crosshair', draw: 'crosshair', markup: 'crosshair', text: 'text' }[tool] || 'default';

        if (tool === 'crop') showCropControls();
        else if (tool === 'draw') showBrushControls('Brush');
        else if (tool === 'markup') showBrushControls('Arrow');
        else if (tool === 'text') { showBrushControls('Text color/size'); }
        else setToolOptions('');
    }

    // ── Save ────────────────────────────────────────────────────────────────
    async function saveImage() {
        const c = getCanvas();
        if (!c || !img) return;
        renderCanvas();
        const item = currentPhotos[currentPhotoIndex];
        try {
            const res = await window.electronAPI.saveEditedImage({
                originalPath: item ? item.path : null,
                dataUrl: c.toDataURL('image/png'),
            });
            if (res && res.success) {
                if (window.showToast) window.showToast(`Saved copy: ${res.outputPath}`, 'success');
                if (typeof window.renderAlbums === 'function' && window.currentTab === 'photoalbums') {
                    window.renderAlbums();
                } else if (typeof window.applyFilters === 'function') {
                    window.applyFilters();
                }
            } else {
                if (window.showToast) window.showToast('Save failed: ' + ((res && res.error) || 'unknown'), 'error');
            }
        } catch (e) {
            if (window.showToast) window.showToast('Save failed: ' + e.message, 'error');
        }
    }

    // ── Listeners ───────────────────────────────────────────────────────────
    function setupListeners() {
        const closeBtn = el('photo-editor-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const modal = el('photo-editor-modal');
                if (modal) modal.style.display = 'none';
            });
        }

        const saveBtn = el('photo-editor-save');
        if (saveBtn) saveBtn.addEventListener('click', saveImage);

        document.querySelectorAll('.photo-tool, .photo-tool-bottom').forEach(btn => {
            btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
        });

        // Canvas pointer events
        const c = getCanvas();
        if (c) {
            c.addEventListener('mousedown', onPointerDown);
            window.addEventListener('mousemove', onPointerMove);
            window.addEventListener('mouseup', onPointerUp);
        }

        const zoomInput = el('photo-editor-zoom');
        const zoomVal = el('photo-editor-zoom-val');
        if (zoomInput) {
            zoomInput.addEventListener('input', (e) => {
                zoom = parseFloat(e.target.value);
                if (zoomVal) zoomVal.innerText = Math.round(zoom * 100) + '%';
                applyCanvasTransform();
            });
        }

        const bright = el('pe-brightness');
        const contrast = el('pe-contrast');
        const saturate = el('pe-saturate');
        if (bright) bright.addEventListener('input', (e) => { state.brightness = parseFloat(e.target.value); renderCanvas(); });
        if (contrast) contrast.addEventListener('input', (e) => { state.contrast = parseFloat(e.target.value); renderCanvas(); });
        if (saturate) saturate.addEventListener('input', (e) => { state.saturate = parseFloat(e.target.value); renderCanvas(); });

        const grayBtn = el('pe-grayscale');
        const sepiaBtn = el('pe-sepia');
        const invertBtn = el('pe-invert');
        const resetBtn = el('pe-reset');

        function toggleFilter(btn, key) {
            pushHistory();
            state[key] = state[key] > 0 ? 0 : 1;
            btn.style.background = state[key] > 0 ? 'var(--vault-accent)' : 'transparent';
            btn.style.color = state[key] > 0 ? 'var(--vt-primary)' : 'var(--vault-text)';
            renderCanvas();
        }

        if (grayBtn) grayBtn.addEventListener('click', () => toggleFilter(grayBtn, 'grayscale'));
        if (sepiaBtn) sepiaBtn.addEventListener('click', () => toggleFilter(sepiaBtn, 'sepia'));
        if (invertBtn) invertBtn.addEventListener('click', () => toggleFilter(invertBtn, 'invert'));
        if (resetBtn) resetBtn.addEventListener('click', () => { resetLiveState(); renderCanvas(); });

        // Global Ctrl+Z / Cmd+Z for Photo Editor
        window.addEventListener('keydown', (e) => {
            const modal = el('photo-editor-modal');
            const open = modal && modal.style.display === 'flex';
            if (!open) return;
            if (e.key === 'Escape') {
                modal.style.display = 'none';
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                e.stopPropagation();
                undo();
            }
        }, true);

        window.addEventListener('resize', () => {
            const modal = el('photo-editor-modal');
            if (modal && modal.style.display === 'flex') {
                renderCanvas();
            }
        });
    }

    // ── Global Entrypoint ───────────────────────────────────────────────────
    window.openPhotoEditor = function (item, allPhotos) {
        const modal = el('photo-editor-modal');
        if (!modal || !item) return;

        // Window the photo collection: If thousands of photos, keep references safe
        currentPhotos = Array.isArray(allPhotos) && allPhotos.length ? allPhotos : [item];
        currentPhotoIndex = currentPhotos.findIndex(p => p && p.path === item.path);
        if (currentPhotoIndex === -1) currentPhotoIndex = 0;

        modal.style.display = 'flex';
        loadPhoto(currentPhotos[currentPhotoIndex]);
        populateFilmstrip();
        setActiveTool('move');
    };

    setupListeners();
})();
