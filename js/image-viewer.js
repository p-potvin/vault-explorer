/* ==========================================================================
   Vault Explorer — Modular In-App Image Viewer
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

    // Inject styles dynamically to keep everything self-contained and modular
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        .image-viewer-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(8, 6, 16, 0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            z-index: 99999;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            color: #ffffff;
            font-family: var(--font-body, system-ui, sans-serif);
            user-select: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .image-viewer-modal.active {
            opacity: 1;
            display: flex;
        }

        .iv-top-bar {
            width: 100%;
            padding: 16px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0));
            z-index: 10;
        }

        .iv-filename {
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.05em;
            color: var(--vault-gold, #E5A93B);
            max-width: 70%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
            background: var(--vault-signal-alert, #FF6B7A);
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
            max-width: 90%;
            max-height: 80%;
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
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            border-radius: 6px;
            pointer-events: none;
            transition: transform 0.2s ease;
        }

        .iv-nav-btn {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.1);
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
            opacity: 0.6;
        }

        .iv-nav-btn:hover {
            background: rgba(229, 169, 59, 0.3);
            border-color: var(--vault-gold);
            color: var(--vault-gold);
            opacity: 1;
            transform: translateY(-50%) scale(1.08);
        }

        .iv-prev-btn { left: 24px; }
        .iv-next-btn { right: 24px; }

        .iv-bottom-bar {
            width: 100%;
            padding: 24px;
            background: linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0));
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            z-index: 10;
        }

        .iv-toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(20, 16, 35, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 8px 16px;
            border-radius: 30px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }

        .iv-tool-btn {
            background: transparent;
            border: none;
            color: #ffffff;
            padding: 6px 12px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
            opacity: 0.8;
        }

        .iv-tool-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            opacity: 1;
        }

        .iv-divider {
            width: 1px;
            height: 18px;
            background: rgba(255,255,255,0.15);
        }

        .iv-ai-section {
            display: flex;
            align-items: center;
            gap: 8px;
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
            border: 1px solid rgba(168, 85, 247, 0.3);
            color: #d8b4fe;
            border-radius: 20px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.2s ease;
            position: relative;
        }

        .iv-ai-btn:hover {
            background: rgba(168, 85, 247, 0.3);
            border-color: #a855f7;
            color: #ffffff;
            box-shadow: 0 0 12px rgba(168, 85, 247, 0.4);
        }

        .iv-ai-btn::after {
            content: 'Roadmap';
            position: absolute;
            top: -12px;
            right: -8px;
            background: #e11d48;
            color: #ffffff;
            font-size: 7px;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: 800;
            letter-spacing: 0.02em;
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

                    <div class="iv-ai-section">
                        <span class="iv-ai-badge">AI Core</span>
                        <button class="iv-ai-btn" id="iv-btn-ai-upscale" title="AI Super-Resolution Roadmap">Super-Res</button>
                        <button class="iv-ai-btn" id="iv-btn-ai-denoise" title="AI Wavelet Denoising Roadmap">Denoise</button>
                        <button class="iv-ai-btn" id="iv-btn-ai-edge" title="Canny Edge Detection Roadmap">Edge Detect</button>
                    </div>
                </div>
                <div class="iv-stats" id="iv-stats-lbl">Image size: 1920x1080 | Zoom: 100%</div>
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
        const wrapper = el('iv-img-wrapper');
        const img = el('iv-img-element');

        const aiUpscale = el('iv-btn-ai-upscale');
        const aiDenoise = el('iv-btn-ai-denoise');
        const aiEdge = el('iv-btn-ai-edge');

        // Roadmap click handles
        const showRoadmapToast = (feature) => {
            if (window.showToast) {
                window.showToast(`Roadmap Idea: Modular ${feature} via client-side WebGPU/WASM pipeline under active design!`, 'info');
            }
        };

        aiUpscale.addEventListener('click', () => showRoadmapToast('Real-ESRGAN Image Upscaling'));
        aiDenoise.addEventListener('click', () => showRoadmapToast('Bilateral Image Denoising'));
        aiEdge.addEventListener('click', () => showRoadmapToast('Canny Edge Detection filter'));

        // Close logic
        const closeModal = () => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
            window.removeEventListener('keydown', handleKeydown);
        };

        closeBtn.addEventListener('click', closeModal);

        // Grid Cycling
        prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateImage(-1); });
        nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigateImage(1); });

        // Zoom logic
        zoomInBtn.addEventListener('click', () => adjustZoom(0.2));
        zoomOutBtn.addEventListener('click', () => adjustZoom(-0.2));
        zoomResetBtn.addEventListener('click', () => resetView());

        // Pan/Drag functionality
        wrapper.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Double click resets view
        wrapper.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            resetView();
        });

        // Wheel Zoom
        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            adjustZoom(delta);
        }, { passive: false });
    }

    function adjustZoom(amount) {
        scale = Math.max(0.2, Math.min(6, scale + amount));
        updateTransform();
    }

    function resetView() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    }

    function updateTransform() {
        const wrapper = el('iv-img-wrapper');
        const stats = el('iv-stats-lbl');
        const img = el('iv-img-element');

        if (wrapper) {
            wrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        }

        if (stats && img) {
            const pct = Math.round(scale * 100);
            stats.innerText = `Source: ${img.naturalWidth}x${img.naturalHeight} | Zoom: ${pct}%`;
        }
    }

    // Navigate to next or previous image inside the current grid/folder
    function navigateImage(direction) {
        if (imagesInGrid.length <= 1) return;

        let currentIndexInFilter = imagesInGrid.findIndex(item => item.index === currentImageIndex);
        if (currentIndexInFilter === -1) return;

        let nextIndexInFilter = (currentIndexInFilter + direction + imagesInGrid.length) % imagesInGrid.length;
        const targetItem = imagesInGrid[nextIndexInFilter];

        if (targetItem) {
            loadImage(targetItem.item, targetItem.index);
        }
    }

    // Keyboard handlers
    function handleKeydown(e) {
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
        }
    }

    // Load active image
    function loadImage(item, index) {
        currentImageIndex = index;
        const img = el('iv-img-element');
        const filename = el('iv-filename-lbl');

        if (!img || !filename) return;

        img.src = '';
        filename.innerText = item.name;
        
        // Premium fade/loading effect
        img.style.opacity = '0';
        img.src = window.sanitizePath(item.path);

        img.onload = () => {
            img.style.opacity = '1';
            resetView();
        };

        img.onerror = () => {
            if (window.showToast) window.showToast('Failed to load image file', 'error');
            filename.innerText = 'Error loading: ' + item.name;
        };
    }

    // Global hook to open image viewer
    window.openImageViewer = function (selectedIndex) {
        let modal = el('image-viewer-modal');
        if (!modal) {
            createModal();
            modal = el('image-viewer-modal');
        }

        // Build list of all image items in the active grid
        imagesInGrid = [];
        if (window.displayedItems) {
            window.displayedItems.forEach((item, idx) => {
                if (item.type === 'image') {
                    imagesInGrid.push({ item, index: idx });
                }
            });
        }

        const selectedItem = window.displayedItems[selectedIndex];
        if (!selectedItem || selectedItem.type !== 'image') return;

        modal.style.display = 'flex';
        // Force reflow/render before adding class to trigger slide/fade transition
        modal.offsetHeight;
        modal.classList.add('active');

        loadImage(selectedItem, selectedIndex);

        // Bind global keydown listeners
        window.addEventListener('keydown', handleKeydown);
    };

})();
