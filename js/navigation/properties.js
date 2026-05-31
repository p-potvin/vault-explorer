// properties.js — showPropertiesDialog, showLanguageModal, showVideoEnhancementDialog

async function showPropertiesDialog(item) {
    const res = await window.electronAPI.getFileProperties(item.path);
    if (!res || !res.success) { window.showToast('Failed to get properties', 'error'); return; }
    const stats = res.properties;

    let modal = document.getElementById('properties-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'properties-modal';
        modal.style.cssText = 'display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:10005; align-items:center; justify-content:center; font-family:var(--font-body); backdrop-filter:blur(4px);';
        modal.innerHTML = `
            <div style="background:var(--vt-surface); border:1px solid var(--vault-border); border-radius:6px; width:420px; padding:24px; box-shadow:0 10px 30px rgba(0,0,0,0.3); color:var(--vault-text);">
                <h3 style="font-family:var(--font-display); font-size:12px; font-weight:700; color:var(--vault-gold); text-transform:uppercase; margin:0 0 16px 0; border-bottom:1px solid var(--vault-border); padding-bottom:8px; letter-spacing:0.08em;">File Properties</h3>
                <div id="properties-details" style="font-size:12px; display:flex; flex-direction:column; gap:8px; font-family:var(--font-body);"></div>
                <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                    <button id="close-properties" style="background:var(--vt-surface-alt); border:1px solid var(--vault-border); color:var(--vault-text); padding:6px 12px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer; text-transform:uppercase;">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('close-properties').addEventListener('click', () => { modal.style.display = 'none'; });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    const details = document.getElementById('properties-details');
    let rows = `<div><strong>Name:</strong> ${window.escapeHtml(stats.name)}</div>
        <div><strong>Path:</strong> ${window.escapeHtml(stats.path)}</div>
        <div><strong>Size:</strong> ${window.formatBytes(stats.size)}</div>
        <div><strong>Created:</strong> ${window.escapeHtml(String(stats.created))}</div>
        <div><strong>Modified:</strong> ${window.escapeHtml(String(stats.modified))}</div>`;
    if (stats.width && stats.height) rows += `<div><strong>Resolution:</strong> ${stats.width}x${stats.height}</div>`;
    if (stats.duration) rows += `<div><strong>Duration:</strong> ${window.formatDuration(stats.duration)}</div>`;
    if (stats.codec) rows += `<div><strong>Video Codec:</strong> ${window.escapeHtml(stats.codec)}</div>`;
    if (stats.fps) rows += `<div><strong>Frame Rate:</strong> ${stats.fps} FPS</div>`;
    if (stats.audioCodec) rows += `<div><strong>Audio Codec:</strong> ${window.escapeHtml(stats.audioCodec)}</div>`;
    if (stats.channels) rows += `<div><strong>Audio Channels:</strong> ${stats.channels} ch</div>`;
    if (stats.sampleRate) rows += `<div><strong>Sample Rate:</strong> ${stats.sampleRate} Hz</div>`;
    if (stats.bitrate) rows += `<div><strong>Bitrate:</strong> ${window.formatBytes(stats.bitrate)}/s</div>`;

    if (item.nfoMeta) {
        rows += `<div style="height:1px; background:var(--vault-border); margin:8px 0;"></div>
            <div style="color:var(--vault-accent); font-weight:700; margin-bottom:4px;">NFO Metadata (Plex/Jellyfin/Kodi)</div>`;
        if (item.nfoMeta.title) rows += `<div><strong>NFO Title:</strong> ${window.escapeHtml(item.nfoMeta.title)}</div>`;
        if (item.nfoMeta.year) rows += `<div><strong>NFO Year:</strong> ${item.nfoMeta.year}</div>`;
        if (item.nfoMeta.rating) rows += `<div><strong>NFO Rating:</strong> ★ ${item.nfoMeta.rating}</div>`;
        if (item.nfoMeta.plot) rows += `<div style="margin-top:4px;"><strong>NFO Plot:</strong> <span style="opacity:0.85;">${window.escapeHtml(item.nfoMeta.plot)}</span></div>`;
    }

    details.innerHTML = rows;
    modal.style.display = 'flex';
}

window.showLanguageModal = function(title, allowMultiple = true, selectedLanguages = []) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'vw-dynamic-modal-backdrop';
        backdrop.style = `
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(7, 8, 10, 0.85);
            backdrop-filter: blur(4px);
            z-index: 15000;
            display: flex; align-items: center; justify-content: center;
            font-family: var(--font-sans), system-ui;
        `;

        const modal = document.createElement('div');
        modal.className = 'vw-warm-card';
        modal.style = `
            width: 380px;
            padding: 24px;
            border: 1px solid var(--vault-border);
            box-shadow: 0 20px 50px rgba(0,0,0,0.3);
            border-radius: 8px;
            color: var(--vault-text);
            background: var(--vault-card-bg);
        `;

        const header = document.createElement('h3');
        header.style = `
            margin: 0 0 16px 0;
            font-size: 15px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--vault-gold);
            border-bottom: 1px solid var(--vault-warm-border-subtle);
            padding-bottom: 10px;
        `;
        header.innerText = title;
        modal.appendChild(header);

        const desc = document.createElement('p');
        desc.style = 'font-size:12px; opacity:0.8; margin-bottom:16px; line-height:1.4;';
        desc.innerText = allowMultiple
            ? 'Select target subtitle languages to extract and write (.srt):'
            : 'Select the target spoken translation audio synthesis track language:';
        modal.appendChild(desc);

        const listContainer = document.createElement('div');
        listContainer.style = 'display:flex; flex-direction:column; gap:8px; margin-bottom:20px; max-height:260px; overflow-y:auto; padding-right:6px;';

        const languages = [
            { code: 'en', name: 'English (EN)' },
            { code: 'fr', name: 'French / Québécois (FR)' },
            { code: 'es', name: 'Spanish (ES)' },
            { code: 'de', name: 'German (DE)' },
            { code: 'it', name: 'Italian (IT)' },
            { code: 'pt', name: 'Portuguese (PT)' },
            { code: 'nl', name: 'Dutch (NL)' },
            { code: 'ru', name: 'Russian (RU)' },
            { code: 'zh', name: 'Chinese (ZH)' },
            { code: 'ja', name: 'Japanese (JA)' },
            { code: 'ko', name: 'Korean (KO)' },
            { code: 'ar', name: 'Arabic (AR)' },
            { code: 'hi', name: 'Hindi (HI)' },
            { code: 'bn', name: 'Bengali (BN)' },
            { code: 'tr', name: 'Turkish (TR)' },
            { code: 'pl', name: 'Polish (PL)' },
            { code: 'sv', name: 'Swedish (SV)' },
            { code: 'no', name: 'Norwegian (NO)' },
            { code: 'da', name: 'Danish (DA)' },
            { code: 'fi', name: 'Finnish (FI)' },
            { code: 'cs', name: 'Czech (CS)' },
            { code: 'el', name: 'Greek (EL)' },
            { code: 'he', name: 'Hebrew (HE)' },
            { code: 'id', name: 'Indonesian (ID)' },
            { code: 'vi', name: 'Vietnamese (VI)' },
            { code: 'uk', name: 'Ukrainian (UK)' }
        ];

        const selections = new Set(selectedLanguages);

        languages.forEach(lang => {
            const row = document.createElement('label');
            row.style = `
                display: flex; align-items: center; gap: 10px;
                padding: 10px 12px;
                background: rgba(255,255,255,0.03);
                border: 1px solid var(--vault-border);
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s ease;
            `;

            const input = document.createElement('input');
            input.type = allowMultiple ? 'checkbox' : 'radio';
            input.name = 'lang-select-group';
            input.value = lang.code;
            input.checked = selections.has(lang.code) || (!allowMultiple && selections.size === 0 && lang.code === 'en');
            input.style = `
                accent-color: var(--vault-accent);
                width: 16px; height: 16px;
            `;

            row.appendChild(input);
            const textSpan = document.createElement('span');
            textSpan.innerText = lang.name;
            row.appendChild(textSpan);

            row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.06)'; });
            row.addEventListener('mouseleave', () => { row.style.background = 'rgba(255,255,255,0.03)'; });

            listContainer.appendChild(row);
        });
        modal.appendChild(listContainer);

        const btnRow = document.createElement('div');
        btnRow.style = 'display:flex; justify-content:flex-end; gap:10px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.style = `background: transparent; border: 1px solid var(--vault-border); padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--vault-text); cursor: pointer; transition: all 0.2s;`;
        cancelBtn.innerText = 'Cancel';

        const confirmBtn = document.createElement('button');
        confirmBtn.style = `background: var(--vault-accent); color: var(--vault-accent-text); border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;`;
        confirmBtn.innerText = 'Apply';

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        modal.appendChild(btnRow);

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        cancelBtn.addEventListener('click', () => { backdrop.remove(); resolve(null); });
        confirmBtn.addEventListener('click', () => {
            const chosen = [];
            modal.querySelectorAll('input').forEach(inp => { if (inp.checked) chosen.push(inp.value); });
            backdrop.remove();
            resolve(chosen);
        });
    });
};

window.showVideoEnhancementDialog = function(item) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'vw-dynamic-modal-backdrop';
        backdrop.style = `
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(7, 8, 10, 0.85);
            backdrop-filter: blur(4px);
            z-index: 15000;
            display: flex; align-items: center; justify-content: center;
            font-family: var(--font-sans), system-ui;
        `;

        const modal = document.createElement('div');
        modal.className = 'vw-warm-card';
        modal.style = `
            width: 440px; padding: 24px; border: 1px solid var(--vault-border);
            box-shadow: 0 25px 60px rgba(0,0,0,0.35); border-radius: 8px;
            color: var(--vault-text); background: var(--vault-card-bg);
        `;

        const header = document.createElement('h3');
        header.style = `
            margin: 0 0 16px 0; font-size: 15px; font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.05em; color: var(--vault-gold);
            display: flex; align-items: center; gap: 8px;
            border-bottom: 1px solid var(--vault-warm-border-subtle); padding-bottom: 10px;
        `;
        const t = window.translations[window.currentLang === 'fr' ? 'fr' : 'en'] || {};
        const svgIcon = window.icons ? window.icons.magic('', 'color:var(--vault-gold); margin-right:4px; width:16px; height:16px;') : '';
        const magicIcon = window.icons ? window.icons.magic('', 'width: 14px; height: 14px; margin-left: 6px; display: inline-block; vertical-align: middle;') : '';
        header.innerHTML = `${svgIcon}<span style="vertical-align: middle;">${t.aiVideoCenter || 'AI Video Optimization Center'}</span>${magicIcon}`;
        modal.appendChild(header);

        const desc = document.createElement('p');
        desc.style = 'font-size:12px; opacity:0.8; margin-bottom:16px; line-height:1.4;';
        desc.innerText = t.aiVideoCenterDesc || 'Deploy high-performance ML models for super-resolution, denoising, and temporal reconstruction:';
        modal.appendChild(desc);

        const optionsContainer = document.createElement('div');
        optionsContainer.style = 'display:flex; flex-direction:column; gap:12px; margin-bottom:20px;';

        const options = [
            { id: 'cuda_tile', name: 'CUDA Tiling splits Super-Resolution (x4)', desc: 'Ultimate quality using localized tiles on Nvidia GPUs. Maximizes temporal detail.', badge: 'NVIDIA ONLY' },
            { id: 'realesrgan', name: 'Real-ESRGAN Vulkan (x2)', desc: 'Balanced upscaling using Vulkan APIs. Multi-platform hardware accelerated.', badge: 'BALANCED', checked: true },
            { id: 'denoise', name: 'Original Size Restoration & Denoise', desc: 'No upscale. Removes grain, compression artifacts, and fixes lighting issues.', badge: 'STABILIZE' }
        ];

        options.forEach(opt => {
            const card = document.createElement('label');
            card.style = `display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; background: rgba(255,255,255,0.02); border: 1px solid var(--vault-border); border-radius: 6px; cursor: pointer; transition: all 0.2s ease;`;

            const firstRow = document.createElement('div');
            firstRow.style = 'display:flex; align-items:center; justify-content:space-between; width:100%;';

            const leftPart = document.createElement('div');
            leftPart.style = 'display:flex; align-items:center; gap:8px;';

            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'vsr-option-group'; radio.value = opt.id;
            radio.checked = !!opt.checked;
            radio.style = 'accent-color: var(--vault-accent); width:16px; height:16px;';
            leftPart.appendChild(radio);

            const nameText = document.createElement('span');
            nameText.style = 'font-size:13px; font-weight:600;'; nameText.innerText = opt.name;
            leftPart.appendChild(nameText);
            firstRow.appendChild(leftPart);

            const badge = document.createElement('span');
            badge.style = `font-size: 8.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(245,185,41,0.1); color: var(--vault-gold); border: 1px solid rgba(245,185,41,0.2);`;
            badge.innerText = opt.badge;
            firstRow.appendChild(badge);
            card.appendChild(firstRow);

            const detail = document.createElement('span');
            detail.style = 'font-size:11px; opacity:0.65; margin-left:24px; line-height:1.3;'; detail.innerText = opt.desc;
            card.appendChild(detail);

            card.addEventListener('mouseenter', () => { card.style.background = 'rgba(255,255,255,0.05)'; card.style.borderColor = 'var(--vault-accent)'; });
            card.addEventListener('mouseleave', () => { card.style.background = 'rgba(255,255,255,0.02)'; card.style.borderColor = 'var(--vault-border)'; });

            optionsContainer.appendChild(card);
        });
        modal.appendChild(optionsContainer);

        const btnRow = document.createElement('div');
        btnRow.style = 'display:flex; justify-content:flex-end; gap:10px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.style = `background: transparent; border: 1px solid var(--vault-border); padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--vault-text); cursor: pointer; transition: all 0.2s;`;
        cancelBtn.innerText = 'Abort';

        const confirmBtn = document.createElement('button');
        confirmBtn.style = `background: var(--vault-accent); color: var(--vault-accent-text); border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;`;
        const magicBtnIcon = window.icons ? window.icons.magic('', 'width:12px; height:12px; display:block;') : '';
        confirmBtn.innerHTML = `<span>Execute Enhancement</span>${magicBtnIcon}`;

        btnRow.appendChild(cancelBtn); btnRow.appendChild(confirmBtn);
        modal.appendChild(btnRow);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        cancelBtn.addEventListener('click', () => { backdrop.remove(); resolve(null); });
        confirmBtn.addEventListener('click', () => {
            let selectedId = 'realesrgan';
            modal.querySelectorAll('input').forEach(inp => { if (inp.checked) selectedId = inp.value; });
            backdrop.remove();
            resolve({ execute: true, method: selectedId });
        });
    });
};

window.showPropertiesDialog = showPropertiesDialog;
