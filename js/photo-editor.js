/* ==========================================================================
   Vault Explorer — Photo Editor Modal (Canvas Operations)
   ========================================================================== */

(function () {
    let currentPhotos = [];
    let currentPhotoIndex = -1;
    let currentTool = 'move';
    let zoom = 1;
    let canvas = null;
    let ctx = null;
    let img = null;
    let filmstripEl = null;

    // Transformation state
    const state = {
        rotation: 0,    // 0, 90, 180, 270
        flipH: false,
        flipV: false,
        brightness: 1,
        contrast: 1,
        saturate: 1,
        grayscale: 0,
        sepia: 0,
        invert: 0,
    };

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

    function renderCanvas() {
        const c = getCanvas();
        const context = getCtx();
        if (!c || !context || !img) return;

        const { w, h } = getOutputSize();
        c.width = w;
        c.height = h;

        // Clear
        context.clearRect(0, 0, w, h);

        // Build filter string
        const filters = [];
        filters.push(`brightness(${state.brightness})`);
        filters.push(`contrast(${state.contrast})`);
        filters.push(`saturate(${state.saturate})`);
        if (state.grayscale > 0) filters.push(`grayscale(${state.grayscale})`);
        if (state.sepia > 0) filters.push(`sepia(${state.sepia})`);
        if (state.invert > 0) filters.push(`invert(${state.invert})`);
        context.filter = filters.join(' ');

        // Apply flips and rotation
        context.save();
        context.translate(w / 2, h / 2);
        context.rotate((state.rotation * Math.PI) / 180);
        context.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
        context.drawImage(img, -img.width / 2, -img.height / 2);
        context.restore();
    }

    function resetAdjustments() {
        state.rotation = 0;
        state.flipH = false;
        state.flipV = false;
        state.brightness = 1;
        state.contrast = 1;
        state.saturate = 1;
        state.grayscale = 0;
        state.sepia = 0;
        state.invert = 0;

        // Reset UI controls
        const bright = el('pe-brightness');
        const contrast = el('pe-contrast');
        const saturate = el('pe-saturate');
        if (bright) bright.value = 1;
        if (contrast) contrast.value = 1;
        if (saturate) saturate.value = 1;
        document.querySelectorAll('.pe-filter-btn').forEach(btn => {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--vault-text)';
        });
    }

    function loadPhoto(item) {
        const c = getCanvas();
        if (!c) return;
        img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            resetAdjustments();
            renderCanvas();
        };
        img.src = window.sanitizePath(item.path);
        img.onerror = () => window.showToast('Failed to load image', 'error');

        const title = document.querySelector('#photo-editor-modal h3');
        if (title) title.innerText = item.name;
    }

    function populateFilmstrip() {
        filmstripEl = el('photo-editor-filmstrip');
        if (!filmstripEl) return;
        filmstripEl.innerHTML = '';

        currentPhotos.forEach((p, idx) => {
            const thumb = document.createElement('img');
            thumb.src = p.thumbnail ? window.sanitizePath(p.thumbnail) : window.sanitizePath(p.path);
            thumb.style.cssText = 'width: 64px; height: 64px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 2px solid transparent; flex-shrink: 0; opacity: 0.7; transition: all 0.15s;';
            if (idx === currentPhotoIndex) {
                thumb.style.borderColor = 'var(--vault-accent)';
                thumb.style.opacity = '1';
            }
            thumb.addEventListener('click', () => {
                currentPhotoIndex = idx;
                loadPhoto(currentPhotos[idx]);
                populateFilmstrip();
            });
            thumb.addEventListener('dblclick', (e) => e.stopPropagation());
            filmstripEl.appendChild(thumb);
        });
    }

    function setActiveTool(tool) {
        currentTool = tool;
        document.querySelectorAll('.photo-tool').forEach(btn => {
            const isActive = btn.dataset.tool === tool;
            btn.style.background = isActive ? 'var(--vault-accent)' : 'transparent';
            btn.style.color = isActive ? 'var(--vt-primary)' : 'var(--vault-text)';
            btn.style.border = isActive ? 'none' : '1px solid var(--vault-border)';
        });
        document.querySelectorAll('.photo-tool-bottom').forEach(btn => {
            const isActive = btn.dataset.tool === tool;
            btn.style.background = isActive ? 'var(--vault-accent)' : 'transparent';
            btn.style.color = isActive ? 'var(--vt-primary)' : 'var(--vault-text)';
            btn.style.border = isActive ? 'none' : '1px solid var(--vault-border)';
        });

        // Show/hide adjustment panel
        const panel = el('photo-editor-adjustments');
        if (panel) {
            const show = tool === 'exposure' || tool === 'adjust' || tool === 'filters';
            panel.style.display = show ? 'flex' : 'none';
        }
    }

    function handleToolAction(tool) {
        if (tool === 'rotate') {
            state.rotation = (state.rotation + 90) % 360;
            renderCanvas();
        } else if (tool === 'flip') {
            state.flipH = !state.flipH;
            renderCanvas();
        } else if (tool === 'crop') {
            window.showToast('Crop tool coming in the next iteration', 'info');
        } else if (tool === 'draw') {
            window.showToast('Draw tool coming in the next iteration', 'info');
        } else if (tool === 'text') {
            window.showToast('Text tool coming in the next iteration', 'info');
        } else if (tool === 'markup') {
            window.showToast('Markup tool coming in the next iteration', 'info');
        }
    }

    function saveImage() {
        const c = getCanvas();
        if (!c || !img) return;
        const link = document.createElement('a');
        link.download = currentPhotos[currentPhotoIndex]?.name || 'edited.png';
        link.href = c.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.showToast('Image downloaded', 'success');
    }

    function setupListeners() {
        // Close
        const closeBtn = el('photo-editor-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const modal = el('photo-editor-modal');
                if (modal) modal.style.display = 'none';
            });
        }

        // Save
        const saveBtn = el('photo-editor-save');
        if (saveBtn) saveBtn.addEventListener('click', saveImage);

        // Tools (left toolbar)
        document.querySelectorAll('.photo-tool').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                setActiveTool(tool);
                handleToolAction(tool);
            });
        });

        // Tools (bottom toolbar)
        document.querySelectorAll('.photo-tool-bottom').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                setActiveTool(tool);
                handleToolAction(tool);
            });
        });

        // Zoom
        const zoomInput = el('photo-editor-zoom');
        const zoomVal = el('photo-editor-zoom-val');
        if (zoomInput) {
            zoomInput.addEventListener('input', (e) => {
                zoom = parseFloat(e.target.value);
                if (zoomVal) zoomVal.innerText = Math.round(zoom * 100) + '%';
                const c = getCanvas();
                if (c) c.style.transform = `scale(${zoom})`;
            });
        }

        // Adjustment sliders
        const bright = el('pe-brightness');
        const contrast = el('pe-contrast');
        const saturate = el('pe-saturate');
        if (bright) bright.addEventListener('input', (e) => { state.brightness = parseFloat(e.target.value); renderCanvas(); });
        if (contrast) contrast.addEventListener('input', (e) => { state.contrast = parseFloat(e.target.value); renderCanvas(); });
        if (saturate) saturate.addEventListener('input', (e) => { state.saturate = parseFloat(e.target.value); renderCanvas(); });

        // Filter buttons
        const grayBtn = el('pe-grayscale');
        const sepiaBtn = el('pe-sepia');
        const invertBtn = el('pe-invert');
        const resetBtn = el('pe-reset');

        function toggleFilter(btn, key) {
            state[key] = state[key] > 0 ? 0 : 1;
            btn.style.background = state[key] > 0 ? 'var(--vault-accent)' : 'transparent';
            btn.style.color = state[key] > 0 ? 'var(--vt-primary)' : 'var(--vault-text)';
            renderCanvas();
        }

        if (grayBtn) grayBtn.addEventListener('click', () => toggleFilter(grayBtn, 'grayscale'));
        if (sepiaBtn) sepiaBtn.addEventListener('click', () => toggleFilter(sepiaBtn, 'sepia'));
        if (invertBtn) invertBtn.addEventListener('click', () => toggleFilter(invertBtn, 'invert'));
        if (resetBtn) resetBtn.addEventListener('click', () => { resetAdjustments(); renderCanvas(); });

        // Escape to close
        window.addEventListener('keydown', (e) => {
            const modal = el('photo-editor-modal');
            if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });

        // Resize canvas on window resize
        window.addEventListener('resize', () => {
            const modal = el('photo-editor-modal');
            if (modal && modal.style.display === 'flex') {
                renderCanvas();
            }
        });
    }

    window.openPhotoEditor = function (item, allPhotos) {
        const modal = el('photo-editor-modal');
        if (!modal) return;

        currentPhotos = allPhotos || [item];
        currentPhotoIndex = currentPhotos.findIndex(p => p.path === item.path);
        if (currentPhotoIndex === -1) currentPhotoIndex = 0;

        modal.style.display = 'flex';
        loadPhoto(currentPhotos[currentPhotoIndex]);
        populateFilmstrip();
        setActiveTool('move');

        // Reset zoom
        const zoomInput = el('photo-editor-zoom');
        const zoomVal = el('photo-editor-zoom-val');
        const c = getCanvas();
        if (zoomInput) { zoomInput.value = 1; zoom = 1; }
        if (zoomVal) zoomVal.innerText = '100%';
        if (c) c.style.transform = 'scale(1)';
    };

    setupListeners();
})();
