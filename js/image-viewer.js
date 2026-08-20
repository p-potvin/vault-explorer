/* ==========================================================================
   Vault Explorer — Modular In-App Image Viewer (Maximized Lightbox)
   Includes: Slideshow autoplay, Zoom, Pan, AI Super-Res/Denoise/Edge,
   and direct bridge into the Canvas Photo Editor.
   ========================================================================== */

(function () {
    let currentImageIndex = -1;
    let imagesInGrid = [];
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let slideshowTimer = null;

    // Inject styles dynamically to keep everything self-contained and modular
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        .image-viewer-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(11, 8, 19, 0.92);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            z-index: 99999;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            color: #ffffff;
            font-family: var(--font-body, system-ui, sans-serif);
            user-select: none;
            opacity: 0;
            transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            box-sizing: border-box;
        }

        .image-viewer-modal.active {
            opacity: 1;
            display: flex;
        }

        .iv-top-bar {
            width: 100%;
            padding: 16px 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0));
            z-index: 10;
            box-sizing: border-box;
        }

        .iv-filename {
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.03em;
            color: var(--vault-accent, #B07CFF);
            max-width: 65%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-family: var(--font-mono, monospace);
        }

        .iv-close-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255,255,255,0.15);
            color: #ffffff;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .iv-close-btn:hover {
            background: var(--vault-danger, #FF6B7A);
            border-color: transparent;
            transform: scale(1.05);
        }

        .iv-main-container {
            flex: 1;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }

        .iv-image-wrapper {
            position: relative;
            max-width: 92%;
            max-height: 85%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            transition: transform 0.1s ease-out;
        }

        .iv-image-wrapper:active {
            cursor: grabbing;
        }

        .iv-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            box-shadow: 0 25px 60px rgba(0,0,0,0.6);
            border-radius: 8px;
            pointer-events: none;
            transition: transform 0.2s ease;
        }

        .iv-nav-btn {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #ffffff;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 15;
            transition: all 0.2s ease;
            opacity: 0.7;
        }

        .iv-nav-btn:hover {
            background: var(--vault-accent);
            border-color: transparent;
            color: var(--vt-primary, #0b0813);
            opacity: 1;
            transform: translateY(-50%) scale(1.08);
        }

        .iv-prev-btn { left: 24px; }
        .iv-next-btn { right: 24px; }

        .iv-bottom-bar {
            width: 100%;
            padding: 16px 24px 20px;
            background: linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0));
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            z-index: 10;
            box-sizing: border-box;
        }

        .iv-toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(19, 16, 28, 0.85);
            border: 1px solid var(--vault-border, rgba(255, 255, 255, 0.1));
            padding: 6px 14px;
            border-radius: 30px;
            backdrop-filter: blur(12px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }

        .iv-tool-btn {
            background: transparent;
            border: none;
            color: #ffffff;
            padding: 6px 10px;
            border-radius: 16px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: all 0.15s ease;
            opacity: 0.85;
            font-family: var(--font-body);
        }

        .iv-tool-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            opacity: 1;
        }

        .iv-tool-btn.active {
            background: var(--vault-accent);
            color: var(--vt-primary, #0b0813);
            opacity: 1;
        }

        .iv-divider {
            width: 1px;
            height: 18px;
            background: rgba(255,255,255,0.15);
            margin: 0 2px;
        }

        .iv-ai-section {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .iv-ai-badge {
            background: linear-gradient(135deg, #a855f7, #6366f1);
            color: #ffffff;
            font-size: 8px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 2px 6px;
            border-radius: 4px;
            letter-spacing: 0.05em;
        }

        .iv-ai-btn {
            background: rgba(168, 85, 247, 0.15);
            border: 1px solid rgba(168, 85, 247, 0.35);
            color: #d8b4fe;
            border-radius: 16px;
            padding: 5px 11px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.2s ease;
            position: relative;
            font-family: var(--font-body);
        }

        .iv-ai-btn:hover {
            background: rgba(168, 85, 247, 0.35);
            border-color: #a855f7;
            color: #ffffff;
            box-shadow: 0 0 12px rgba(168, 85, 247, 0.4);
        }

        .iv-ai-btn.processing {
            opacity: 0.5;
            pointer-events: none;
            cursor: wait;
        }
        .iv-ai-btn.processing::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 10px;
            height: 10px;
            margin-top: -5px;
            margin-left: -5px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #ffffff;
            border-radius: 50%;
            animation: iv-spin 0.8s linear infinite;
        }
        @keyframes iv-spin {
            to { transform: rotate(360deg); }
        }

        .iv-stats {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            font-family: var(--font-mono, monospace);
        }
    `;
    document.head.appendChild(styleEl);

    // Create Modal DOM dynamically
    function createModal() {
        if (el('image-viewer-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'image-viewer-modal';
        modal.className = 'image-viewer-modal';
        modal.role = 'dialog';

        modal.innerHTML = `
            <div class="iv-top-bar">
                <div class="iv-filename" id="iv-filename-lbl">image.png</div>
                <button class="iv-close-btn" id="iv-btn-close" title="Close (Esc)">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div class="iv-main-container">
                <button class="iv-nav-btn iv-prev-btn" id="iv-btn-prev" title="Previous Image (Left Arrow)">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>

                <div class="iv-image-wrapper" id="iv-img-wrapper">
                    <img class="iv-image" id="iv-img-element" src="" alt="Viewer Content" />
                </div>

                <button class="iv-nav-btn iv-next-btn" id="iv-btn-next" title="Next Image (Right Arrow)">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
            </div>

            <div class="iv-bottom-bar">
                <div class="iv-toolbar">
                    <button class="iv-tool-btn" id="iv-btn-zoomin" title="Zoom In (+)">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                        Zoom In
                    </button>
                    <button class="iv-tool-btn" id="iv-btn-zoomout" title="Zoom Out (-)">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                        Zoom Out
                    </button>
                    <button class="iv-tool-btn" id="iv-btn-zoomreset" title="Reset View">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>
                        Reset
                    </button>

                    <div class="iv-divider"></div>

                    <button class="iv-tool-btn" id="iv-btn-slideshow" title="Toggle Auto Slideshow">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Slideshow
                    </button>

                    <button class="iv-tool-btn" id="iv-btn-open-editor" title="Open in Canvas Photo Editor">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Edit Photo
                    </button>

                    <div class="iv-divider"></div>

                    <div class="iv-ai-section">
                        <span class="iv-ai-badge">AI Core</span>
                        <button class="iv-ai-btn" id="iv-btn-ai-upscale" title="Real-ESRGAN AI Super-Resolution (4x)">Super-Res 🪄</button>
                        <button class="iv-ai-btn" id="iv-btn-ai-denoise" title="ImageMagick Median Denoise">Denoise</button>
                        <button class="iv-ai-btn" id="iv-btn-ai-edge" title="ImageMagick Edge Detection">Edge Detect</button>
                    </div>
                </div>
                <div class="iv-stats" id="iv-stats-lbl">Image size: --x-- | Zoom: 100%</div>
            </div>
        `;

        document.body.appendChild(modal);
        setupEventListeners();
    }

    // Attach modular events
    function setupEventListeners() {
        const modal = el('image-viewer-modal');
        const closeBtn = el('iv-btn-close');
        const prevBtn = el('iv-btn-prev');
        const nextBtn = el('iv-btn-next');
        const zoomInBtn = el('iv-btn-zoomin');
        const zoomOutBtn = el('iv-btn-zoomout');
        const zoomResetBtn = el('iv-btn-zoomreset');
        const slideshowBtn = el('iv-btn-slideshow');
        const editPhotoBtn = el('iv-btn-open-editor');
        const wrapper = el('iv-img-wrapper');
        const img = el('iv-img-element');

        const aiUpscale = el('iv-btn-ai-upscale');
        const aiDenoise = el('iv-btn-ai-denoise');
        const aiEdge = el('iv-btn-ai-edge');

        // AI enhancement cache: originalPath -> enhancedPath
        const _enhancedCache = new Map();

        async function runEnhancement(button, ipcFn, args, successLabel) {
            const currentObj = imagesInGrid[currentImageIndex];
            const item = currentObj ? currentObj.item : null;
            if (!item || !ipcFn) return;

            const originalPath = item.path;
            const cacheKey = `${originalPath}:${button.id}`;

            if (_enhancedCache.has(cacheKey)) {
                img.src = window.sanitizePath(_enhancedCache.get(cacheKey));
                if (window.showToast) window.showToast(`Showing cached ${successLabel}`, 'success');
                return;
            }

            button.classList.add('processing');
            if (window.showToast) window.showToast(`${successLabel}… processing in background`, 'info');

            try {
                const result = await ipcFn(...args);
                button.classList.remove('processing');

                if (result && result.success && result.path) {
                    _enhancedCache.set(cacheKey, result.path);
                    img.src = window.sanitizePath(result.path);
                    img.onload = () => {
                        updateTransform();
                        if (window.showToast) window.showToast(`${successLabel} complete!`, 'success');
                    };
                } else {
                    if (window.showToast) window.showToast(`${successLabel} failed: ${result?.error || 'Unknown'}`, 'error');
                }
            } catch (e) {
                button.classList.remove('processing');
                if (window.showToast) window.showToast(`${successLabel} error: ${e.message}`, 'error');
            }
        }

        if (aiUpscale) {
            aiUpscale.addEventListener('click', () => {
                const item = imagesInGrid[currentImageIndex]?.item;
                if (!item || !window.electronAPI?.enhanceImageRealESRGAN) return;
                runEnhancement(aiUpscale, window.electronAPI.enhanceImageRealESRGAN, [item.path], 'Real-ESRGAN 4x');
            });
        }
        if (aiDenoise) {
            aiDenoise.addEventListener('click', () => {
                const item = imagesInGrid[currentImageIndex]?.item;
                if (!item || !window.electronAPI?.enhanceImageMagick) return;
                runEnhancement(aiDenoise, window.electronAPI.enhanceImageMagick, [item.path, 'denoise'], 'Denoise');
            });
        }
        if (aiEdge) {
            aiEdge.addEventListener('click', () => {
                const item = imagesInGrid[currentImageIndex]?.item;
                if (!item || !window.electronAPI?.enhanceImageMagick) return;
                runEnhancement(aiEdge, window.electronAPI.enhanceImageMagick, [item.path, 'edge'], 'Edge detect');
            });
        }

        // Bridge to Photo Editor
        if (editPhotoBtn) {
            editPhotoBtn.addEventListener('click', () => {
                const currentObj = imagesInGrid[currentImageIndex];
                if (!currentObj || !currentObj.item) return;
                closeModal();
                if (typeof window.openPhotoEditor === 'function') {
                    const allPhotos = imagesInGrid.map(i => i.item);
                    window.openPhotoEditor(currentObj.item, allPhotos);
                }
            });
        }

        // Slideshow
        if (slideshowBtn) {
            slideshowBtn.addEventListener('click', () => {
                if (slideshowTimer) {
                    clearInterval(slideshowTimer);
                    slideshowTimer = null;
                    slideshowBtn.classList.remove('active');
                    if (window.showToast) window.showToast('Slideshow stopped', 'info');
                } else {
                    slideshowBtn.classList.add('active');
                    if (window.showToast) window.showToast('Slideshow started (3.5s per image)', 'info');
                    slideshowTimer = setInterval(() => {
                        navigateImage(1);
                    }, 3500);
                }
            });
        }

        // Close logic
        const closeModal = () => {
            if (slideshowTimer) {
                clearInterval(slideshowTimer);
                slideshowTimer = null;
                if (slideshowBtn) slideshowBtn.classList.remove('active');
            }
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 250);
            window.removeEventListener('keydown', handleKeydown);
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        // Grid Cycling
        if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateImage(-1); });
        if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateImage(1); });

        // Zoom logic
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => adjustZoom(0.2));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => adjustZoom(-0.2));
        if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => resetView());

        // Pan/Drag functionality
        if (wrapper) {
            wrapper.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                startX = e.clientX - translateX;
                startY = e.clientY - translateY;
            });
        }

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Mouse Wheel Zoom
        if (modal) {
            modal.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.15 : 0.15;
                adjustZoom(delta);
            }, { passive: false });
        }
    }

    function updateTransform() {
        const wrapper = el('iv-img-wrapper');
        const img = el('iv-img-element');
        const stats = el('iv-stats-lbl');

        if (!wrapper || !img) return;

        wrapper.style.transform = `translate(${translateX}px, ${translateY}px)`;
        img.style.transform = `scale(${scale})`;

        if (stats) {
            const nw = img.naturalWidth || 0;
            const nh = img.naturalHeight || 0;
            stats.innerText = `Image size: ${nw}x${nh} | Zoom: ${Math.round(scale * 100)}% | Image ${currentImageIndex + 1} of ${imagesInGrid.length}`;
        }
    }

    function adjustZoom(delta) {
        scale = Math.max(0.1, Math.min(6, scale + delta));
        updateTransform();
    }

    function resetView() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    }

    function navigateImage(direction) {
        if (!imagesInGrid.length) return;
        let newIndex = (currentImageIndex + direction + imagesInGrid.length) % imagesInGrid.length;
        loadImage(imagesInGrid[newIndex].item, newIndex);
    }

    function handleKeydown(e) {
        const modal = el('image-viewer-modal');
        if (!modal || !modal.classList.contains('active')) return;

        if (e.key === 'Escape') {
            const closeBtn = el('iv-btn-close');
            if (closeBtn) closeBtn.click();
        } else if (e.key === 'ArrowLeft') {
            navigateImage(-1);
        } else if (e.key === 'ArrowRight') {
            navigateImage(1);
        } else if (e.key === '+' || e.key === '=') {
            adjustZoom(0.2);
        } else if (e.key === '-') {
            adjustZoom(-0.2);
        } else if (e.key === '0') {
            resetView();
        }
    }

    // Load active image
    function loadImage(item, index) {
        currentImageIndex = index;
        const img = el('iv-img-element');
        const filename = el('iv-filename-lbl');

        if (!img || !filename) return;

        filename.innerText = item.name || 'image';

        img.style.opacity = '0';
        img.src = window.sanitizePath(item.path);

        img.onload = () => {
            img.style.opacity = '1';
            resetView();
        };

        img.onerror = () => {
            if (window.showToast) window.showToast('Failed to load image file', 'error');
            filename.innerText = 'Error loading: ' + (item.name || 'image');
        };
    }

    // Global hook to open image viewer
    window.openImageViewer = function (selectedIndex, customList) {
        createModal();
        const modal = el('image-viewer-modal');

        // Build list of image items
        imagesInGrid = [];
        if (Array.isArray(customList) && customList.length) {
            customList.forEach((item, idx) => {
                if (item && (item.type === 'image' || isImageFilename(item.path || item.name))) {
                    imagesInGrid.push({ item, index: idx });
                }
            });
        } else if (window.displayedItems) {
            window.displayedItems.forEach((item, idx) => {
                if (item.type === 'image') {
                    imagesInGrid.push({ item, index: idx });
                }
            });
        }

        if (!imagesInGrid.length) {
            if (window.showToast) window.showToast('No images available to view', 'info');
            return;
        }

        let targetIndex = 0;
        if (typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < imagesInGrid.length) {
            targetIndex = selectedIndex;
        } else if (typeof selectedIndex === 'object' && selectedIndex && selectedIndex.path) {
            const found = imagesInGrid.findIndex(i => i.item.path === selectedIndex.path);
            if (found !== -1) targetIndex = found;
        }

        modal.style.display = 'flex';
        modal.offsetHeight;
        modal.classList.add('active');

        loadImage(imagesInGrid[targetIndex].item, targetIndex);
        window.addEventListener('keydown', handleKeydown);
    };

    function isImageFilename(filename) {
        if (!filename) return false;
        return /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|tiff|tif)$/i.test(filename);
    }
})();
