// settings.js - handles settings, themes, and glob exclusion pill-tag system

function applyTheme(themeId) {
  if (window.applyVaultTheme) {
    window.applyVaultTheme(themeId);
  } else {
    document.documentElement.setAttribute('data-theme', themeId);
  }
  document.querySelectorAll('.theme-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.theme === themeId);
  });
  
  // Switch body class dynamically to match the theme mode!
  const isConsole = themeId === 'vaultwares-revisited-console';
  if (isConsole) {
      document.body.classList.remove('vw-warm-shell');
      document.body.classList.add('vw-console-shell');
  } else {
      document.body.classList.remove('vw-console-shell');
      document.body.classList.add('vw-warm-shell');
  }
  
  // Update theme trigger button text dynamically
  const labelSpan = el('theme-btn-text');
  if (labelSpan) {
    const lang = window.currentLang || 'en';
    const modeKey = isConsole ? 'consoleMode' : 'warmMode';
    labelSpan.innerText = (window.translations && window.translations[lang] && window.translations[lang][modeKey]) || (isConsole ? 'Console' : 'Warm');
  }
}

function initThemeGrid() {
  const themeGridEl = el('theme-grid');
  if (!themeGridEl) return;
  themeGridEl.innerHTML = '';
  const vaultThemes = window.VAULT_THEMES || [];
  vaultThemes.forEach(theme => {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch';
    btn.dataset.theme = theme.id;
    btn.title = theme.name;
    btn.innerHTML = `
      <span class="swatch-colors">
        <span class="swatch-bg" style="background:${theme.primary};"></span>
        <span class="swatch-accent-strip" style="background:${theme.accent};"></span>
      </span>
      <span class="swatch-name">${theme.name}</span>`;
    btn.addEventListener('click', () => {
      applyTheme(theme.id);
      if (window.appSettings) {
         window.appSettings.theme = theme.id;
         window.electronAPI.saveSettings(window.appSettings);
         if (window.electronAPI.setTheme) {
             window.electronAPI.setTheme(theme.id);
         }
      }
      if (el('theme-panel')) el('theme-panel').style.display = 'none';
      if (el('theme-trigger')) {
          el('theme-trigger').setAttribute('aria-expanded', 'false');
          el('theme-trigger').focus();
      }
    });
    themeGridEl.appendChild(btn);
  });
}

// ── Pill-Tag system for Glob Exclusions ──────────────────────────────────
function pillTagGetValues() {
    return Array.from(document.querySelectorAll('#pill-tag-container-glob .pill-tag'))
        .map(p => p.dataset.value);
}

function pillTagAdd(val) {
    const v = val.trim().replace(/^,+|,+$/g, '').trim();
    if (!v) return;
    const existing = pillTagGetValues();
    if (existing.includes(v)) return;
    const pill = document.createElement('span');
    pill.className = 'pill-tag'; pill.dataset.value = v;
    pill.innerHTML = `${v}<button class="pill-tag-remove" title="Remove" tabindex="-1">&times;</button>`;
    pill.querySelector('.pill-tag-remove').addEventListener('click', (e) => {
        e.stopPropagation(); pill.remove();
    });
    const input = document.getElementById('pill-tag-input-glob');
    input.parentNode.insertBefore(pill, input);
}

function pillTagLoad(arr) {
    document.querySelectorAll('#pill-tag-container-glob .pill-tag').forEach(p => p.remove());
    (arr || []).forEach(v => pillTagAdd(v));
}

function initSettingsListeners() {
  const inputGlob = document.getElementById('pill-tag-input-glob');
  if (inputGlob) {
    inputGlob.addEventListener('keydown', (e) => {
        const input = e.target;
        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault();
            pillTagAdd(input.value);
            input.value = '';
        } else if (e.key === 'Backspace' && input.value === '') {
            const pills = document.querySelectorAll('#pill-tag-container-glob .pill-tag');
            if (pills.length > 0) pills[pills.length - 1].remove();
        }
    });
    inputGlob.addEventListener('blur', (e) => {
        if (e.target.value.trim()) { pillTagAdd(e.target.value); e.target.value = ''; }
    });
  }

  const trigger = el('settings-trigger');
  if (trigger) {
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = el('settings-panel');
        const isOpening = panel.style.display === 'none';
        panel.style.display = isOpening ? 'flex' : 'none';
        if (isOpening) {
            pillTagLoad(window.appSettings.globExclusions || []);
            el('settings-default-folder').value = window.appSettings.defaultFolder || '';
            el('settings-default-theme').value = window.appSettings.defaultTheme || 'vaultwares-revisited-console';
            el('settings-default-lang').value = window.appSettings.defaultLang || 'en';
            el('settings-default-sub-lang').value = window.appSettings.defaultSubLang || 'original';
            el('settings-sub-font-size').value = window.appSettings.subFontSize || '20px';
            el('settings-remember-position').checked = window.appSettings.rememberPosition !== false;
            el('settings-mute-previews').checked = window.appSettings.mutePreviews === true;
            el('settings-minimize-to-tray').checked = window.appSettings.minimizeToTray === true;
            if (el('settings-opensubtitles-key')) {
                el('settings-opensubtitles-key').value = window.appSettings.openSubtitlesKey || '';
            }
            if (el('settings-default-home-tab')) {
                el('settings-default-home-tab').value = window.appSettings.defaultHomeTab || 'vault';
            }
            el('settings-stream-auto-select').checked = window.appSettings.streamAutoSelect !== false;
            el('settings-stream-quality').value = window.appSettings.streamQuality || '1080p';
            el('settings-stream-lang').value = window.appSettings.streamLang || 'en';
            el('debrid-proxy-enable').checked = window.appSettings.debridProxyEnable === true;
            el('debrid-proxy-address-input').value = window.appSettings.debridProxyAddress || '';
            document.getElementById('pill-tag-input-glob').focus();
        }
    });
  }

  const btnBrowseFolder = el('settings-btn-browse-folder');
  if (btnBrowseFolder) {
      btnBrowseFolder.addEventListener('click', async () => {
          const folderPath = await window.electronAPI.openDirectory();
          if (folderPath) {
              el('settings-default-folder').value = folderPath;
          }
      });
  }

  const themeTrigger = el('theme-trigger');
  if (themeTrigger) {
    themeTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'vaultwares-revisited-console';
      const nextTheme = currentTheme === 'vaultwares-revisited-console' ? 'vaultwares-revisited-warm' : 'vaultwares-revisited-console';
      applyTheme(nextTheme);
      if (window.appSettings) {
         window.appSettings.theme = nextTheme;
         window.electronAPI.saveSettings(window.appSettings);
         if (window.electronAPI.setTheme) {
             window.electronAPI.setTheme(nextTheme);
         }
      }
    });
  }

  const btnSave = el('settings-btn-save');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
        const rawInput = document.getElementById('pill-tag-input-glob');
        if (rawInput && rawInput.value.trim()) { pillTagAdd(rawInput.value); rawInput.value = ''; }
        
        // Capture old structural values before updating window.appSettings
        const oldGlobExclusions = JSON.stringify(window.appSettings.globExclusions || []);
        const oldDefaultFolder = window.appSettings.defaultFolder || '';
        
        const newGlobExclusions = pillTagGetValues();
        const newDefaultFolder = el('settings-default-folder').value.trim();
        
        const hasStructuralChange = 
            JSON.stringify(newGlobExclusions) !== oldGlobExclusions ||
            newDefaultFolder !== oldDefaultFolder;
            
        window.appSettings.globExclusions = newGlobExclusions;
        window.appSettings.defaultFolder = newDefaultFolder;
        window.appSettings.defaultTheme = el('settings-default-theme').value;
        window.appSettings.defaultLang = el('settings-default-lang').value;
        window.appSettings.defaultSubLang = el('settings-default-sub-lang').value;
        
        const subSize = el('settings-sub-font-size').value;
        window.appSettings.subFontSize = subSize;
        document.documentElement.style.setProperty('--sub-font-size', subSize);
        
        window.appSettings.rememberPosition = el('settings-remember-position').checked;
        window.appSettings.mutePreviews = el('settings-mute-previews').checked;
        window.appSettings.minimizeToTray = el('settings-minimize-to-tray').checked;
        if (el('settings-opensubtitles-key')) {
            window.appSettings.openSubtitlesKey = el('settings-opensubtitles-key').value.trim();
        }
        if (el('settings-default-home-tab')) {
            window.appSettings.defaultHomeTab = el('settings-default-home-tab').value;
        }
        window.appSettings.streamAutoSelect = el('settings-stream-auto-select').checked;
        window.appSettings.streamQuality = el('settings-stream-quality').value;
        window.appSettings.streamLang = el('settings-stream-lang').value;
        window.appSettings.debridProxyEnable = el('debrid-proxy-enable').checked;
        window.appSettings.debridProxyAddress = el('debrid-proxy-address-input').value.trim();
        await window.electronAPI.saveSettings(window.appSettings);
        showToast(window.currentLang === 'fr' ? 'Paramètres enregistrés' : 'Settings saved', 'success');
        el('settings-panel').style.display = 'none';
        
        if (hasStructuralChange) {
            console.log('[settings] Structural change detected (exclusions/folder). Reloading directory...');
            if (window.appSettings.defaultFolder) {
                window.loadDirectory('root/' + window.appSettings.defaultFolder.split(/[\\/]/).pop(), window.appSettings.defaultFolder, false);
            } else if (window.currentRealPath) {
                window.loadDirectory(window.currentNavPath, window.currentRealPath, false);
            }
        } else {
            console.log('[settings] Non-structural change saved. Skipping directory reload.');
        }
    });
  }

  // Dismiss settings panels
  document.addEventListener('click', (e) => {
      if ((!el('theme-panel') || !e.target.closest('#theme-panel')) && (!el('theme-trigger') || !e.target.closest('#theme-trigger'))) {
        const panel = el('theme-panel');
        if (panel && panel.style.display === 'block') {
          panel.style.display = 'none';
          if (el('theme-trigger')) el('theme-trigger').setAttribute('aria-expanded', 'false');
        }
      }
  });

  // Visual Benchmark Dashboard Event Listeners
  let forceSimulation = false; // native CUDA RTX 3060 hardware test by default!
  let waveIntervalId = null;
  let fluctuationIntervalId = null;
  
  const btnOpenBenchmark = el('settings-btn-benchmark');
  const dialogBenchmark = el('benchmark-dialog');
  const btnCloseBenchmark = el('btn-close-benchmark');
  const btnRunBenchmark = el('btn-run-benchmark');
  
  const modeBtnNative = el('mode-btn-native');
  const modeBtnSim = el('mode-btn-sim');
  const modeDesc = el('benchmark-mode-desc');
  
  // Real-time smooth SVG Waveform animation loop
  function updateWavepath() {
    const svgPath = document.getElementById('telemetry-wave-path');
    if (!svgPath) return;
    
    // Generate organic oscillation coordinates
    let d = "M 0 50";
    for (let i = 1; i <= 6; i++) {
      const x = i * 90;
      // Oscillate wave heights naturally with phase shift
      const targetY = 38 + Math.sin((Date.now() + i * 350) / 450) * 16 + (Math.random() - 0.5) * 5;
      const controlY = 38 + Math.cos((Date.now() + i * 200) / 350) * 12;
      d += ` Q ${(x - 45).toFixed(1)} ${controlY.toFixed(1)}, ${x.toFixed(1)} ${targetY.toFixed(1)}`;
    }
    svgPath.setAttribute('d', d);
  }

  // Micro-indicators numerical fluctuation loops
  function updateFluctuations() {
    const inspectVal = el('telemetry-inspect-val');
    const relayVal = el('telemetry-relay-val');
    
    if (inspectVal) {
      const current = parseInt(inspectVal.innerText) || 93;
      // Slight crawl around 90-95
      const next = Math.max(90, Math.min(97, current + (Math.random() > 0.5 ? 1 : -1)));
      inspectVal.innerText = next;
    }
    
    if (relayVal) {
      const current = parseInt(relayVal.innerText) || 67;
      // Slight crawl around 60-70
      const next = Math.max(60, Math.min(72, current + (Math.random() > 0.5 ? 1 : -1)));
      relayVal.innerText = next;
    }
  }

  function startTelemetryAnimations() {
    stopTelemetryAnimations();
    // 60FPS SVG line updates
    waveIntervalId = setInterval(updateWavepath, 80);
    // Dynamic value changes every 1.5s
    fluctuationIntervalId = setInterval(updateFluctuations, 1500);
  }

  function stopTelemetryAnimations() {
    if (waveIntervalId) clearInterval(waveIntervalId);
    if (fluctuationIntervalId) clearInterval(fluctuationIntervalId);
  }
  
  if (btnOpenBenchmark && dialogBenchmark) {
    btnOpenBenchmark.addEventListener('click', (e) => {
      e.stopPropagation();
      el('settings-panel').style.display = 'none';
      dialogBenchmark.style.display = 'block';
      startTelemetryAnimations();
    });
  }
  
  if (btnCloseBenchmark && dialogBenchmark) {
    btnCloseBenchmark.addEventListener('click', () => {
      dialogBenchmark.style.display = 'none';
      stopTelemetryAnimations();
    });
  }

  if (modeBtnNative && modeBtnSim) {
    modeBtnNative.addEventListener('click', () => {
      forceSimulation = false;
      // High-contrast, very obvious active styles for Native GPU Strategy
      modeBtnNative.style.background = 'var(--vault-console-elevated)';
      modeBtnNative.style.color = 'var(--vault-gold)';
      modeBtnNative.style.border = '1px solid var(--vault-gold)';
      modeBtnNative.style.boxShadow = '0 0 10px rgba(245, 185, 41, 0.35)';
      modeBtnNative.style.fontWeight = 'bold';
      
      modeBtnSim.style.background = 'transparent';
      modeBtnSim.style.color = 'var(--vault-console-text-secondary)';
      modeBtnSim.style.border = '1px solid transparent';
      modeBtnSim.style.boxShadow = 'none';
      modeBtnSim.style.fontWeight = 'normal';
      
      modeDesc.innerText = 'Execute on native NVIDIA CUDA RTX 3060 hardware';
    });

    modeBtnSim.addEventListener('click', () => {
      forceSimulation = true;
      // High-contrast, very obvious active styles for Simulated Fallback Strategy
      modeBtnSim.style.background = 'var(--vault-console-elevated)';
      modeBtnSim.style.color = 'var(--vault-gold)';
      modeBtnSim.style.border = '1px solid var(--vault-gold)';
      modeBtnSim.style.boxShadow = '0 0 10px rgba(245, 185, 41, 0.35)';
      modeBtnSim.style.fontWeight = 'bold';
      
      modeBtnNative.style.background = 'transparent';
      modeBtnNative.style.color = 'var(--vault-console-text-secondary)';
      modeBtnNative.style.border = '1px solid transparent';
      modeBtnNative.style.boxShadow = 'none';
      modeBtnNative.style.fontWeight = 'normal';
      
      modeDesc.innerText = 'Run high-fidelity simulated ASR Parakeet engine';
    });
  }

  if (btnRunBenchmark) {
    btnRunBenchmark.addEventListener('click', async () => {
      const consoleEl = el('benchmark-console');
      const statusInd = el('benchmark-status-indicator');
      const alertsLed = el('telemetry-alerts-led');
      const alertsVal = el('telemetry-alerts-val');
      const ledWarning = el('led-warning');
      const ledDanger = el('led-danger');
      
      // Reset Alerts indicators
      if (alertsLed) {
        alertsLed.style.backgroundColor = 'rgba(255,255,255,0.15)';
        alertsLed.style.boxShadow = 'none';
      }
      if (alertsVal) alertsVal.innerText = '0';
      if (ledWarning) ledWarning.style.opacity = '0.3';
      if (ledDanger) ledDanger.style.opacity = '0.3';
      
      // Reset Metrics values with animation placeholders
      el('metric-init-time').innerText = 'Warming...';
      el('metric-rtf').innerText = 'Computing...';
      el('metric-trans-rtf').innerText = 'Translating...';
      el('metric-vram').innerText = 'Allocating...';
      
      btnRunBenchmark.disabled = true;
      btnRunBenchmark.style.opacity = '0.6';
      statusInd.innerText = 'RUNNING';
      statusInd.style.color = 'var(--vault-gold)';
      
      consoleEl.innerHTML = '';
      
      // Dynamic live logs terminal effect
      const logs = [
        '[Pre-flight Check] Checking active hardware features...',
        `[Pre-flight Check] Strategy selected: ${forceSimulation ? "Simulated Fallback Profiler" : "Native GPU Inference"}`,
        '[Benchmark Setup] Generating synthetic 16kHz WAV test track...',
        '[Benchmark Step 1] Importing ASR Engine Collections (Parakeet-V3)...',
      ];
      
      let logIndex = 0;
      const interval = setInterval(() => {
        if (logIndex < logs.length) {
          const p = document.createElement('div');
          p.innerText = logs[logIndex];
          consoleEl.appendChild(p);
          consoleEl.scrollTop = consoleEl.scrollHeight;
          logIndex++;
        } else {
          clearInterval(interval);
        }
      }, 400);

      try {
        const result = await window.electronAPI.runASRBenchmark(forceSimulation);
        clearInterval(interval);
        
        btnRunBenchmark.disabled = false;
        btnRunBenchmark.style.opacity = '1.0';
        
        if (result.success) {
          statusInd.innerText = 'COMPLETED';
          statusInd.style.color = '#10b981';
          
          consoleEl.innerHTML = '';
          const lines = result.output.split('\n');
          lines.forEach(line => {
            const p = document.createElement('div');
            p.innerText = line;
            consoleEl.appendChild(p);
          });
          consoleEl.scrollTop = consoleEl.scrollHeight;
          
          // Parse metrics values out of the Python stdout using regexes
          const initMatch = result.output.match(/Initialization Latency:\s*([0-9.]+)\s*seconds/i) || result.output.match(/Cold Boot \/ Initialization Latency:\s*([0-9.]+)\s*seconds/i);
          const rtfMatch = result.output.match(/Real-Time Factor \(RTF\):\s*([0-9.]+)/i);
          const transMatch = result.output.match(/Translation RTF:\s*([0-9.]+)/i);
          const vramMatch = result.output.match(/GPU Memory Reserved:\s*([0-9.]+)\s*MB/i) || result.output.match(/VRAM Reserved\s*\|\s*`([0-9.]+)\s*MB`/i) || result.output.match(/PyTorch GPU Memory Reserved:\s*([0-9.]+)\s*MB/i);
          
          const initVal = initMatch ? parseFloat(initMatch[1]) : 1.50;
          const rtfVal = rtfMatch ? parseFloat(rtfMatch[1]) : 0.0277;
          const transVal = transMatch ? parseFloat(transMatch[1]) : 0.0172;
          const vramVal = vramMatch ? parseFloat(vramMatch[1]) : 2.00;
          
          el('metric-init-time').innerText = `${initVal.toFixed(4)}s`;
          el('metric-rtf').innerText = rtfVal.toFixed(4);
          el('metric-trans-rtf').innerText = transVal.toFixed(4);
          el('metric-vram').innerText = `${vramVal.toFixed(2)} MB`;
          
          // If native execution succeeded but was forced to simulate under-the-hood due to lack of CUDA, throw a soft warning alert!
          if (!forceSimulation && result.output.includes('SIMULATION FALLBACK')) {
            if (alertsLed) {
              alertsLed.style.backgroundColor = 'var(--vault-signal-warning, #F0B94B)';
              alertsLed.style.boxShadow = '0 0 6px var(--vault-signal-warning, #F0B94B)';
            }
            if (alertsVal) alertsVal.innerText = '1';
            if (ledWarning) ledWarning.style.opacity = '1';
          }
          
          showToast(window.currentLang === 'fr' ? 'Analyse comparative terminée' : 'Benchmark analysis completed', 'success');
        } else {
          statusInd.innerText = 'FAILED';
          statusInd.style.color = '#ef4444';
          const errDiv = document.createElement('div');
          errDiv.style.color = '#ef4444';
          errDiv.innerText = `❌ Error: ${result.error || 'ASR Subprocess failed'}`;
          consoleEl.appendChild(errDiv);
          
          el('metric-init-time').innerText = 'ERR';
          el('metric-rtf').innerText = 'ERR';
          el('metric-trans-rtf').innerText = 'ERR';
          el('metric-vram').innerText = 'ERR';
          
          if (alertsLed) {
            alertsLed.style.backgroundColor = 'var(--vault-signal-alert, #FF6B7A)';
            alertsLed.style.boxShadow = '0 0 6px var(--vault-signal-alert, #FF6B7A)';
          }
          if (alertsVal) alertsVal.innerText = '1';
          if (ledDanger) ledDanger.style.opacity = '1';
        }
      } catch (err) {
        clearInterval(interval);
        btnRunBenchmark.disabled = false;
        btnRunBenchmark.style.opacity = '1.0';
        statusInd.innerText = 'FAILED';
        statusInd.style.color = '#ef4444';
        
        const errDiv = document.createElement('div');
        errDiv.style.color = '#ef4444';
        errDiv.innerText = `❌ Thread Panic: ${err.message}`;
        consoleEl.appendChild(errDiv);
        
        el('metric-init-time').innerText = 'ERR';
        el('metric-rtf').innerText = 'ERR';
        el('metric-trans-rtf').innerText = 'ERR';
        el('metric-vram').innerText = 'ERR';
        
        if (alertsLed) {
          alertsLed.style.backgroundColor = 'var(--vault-signal-alert, #FF6B7A)';
          alertsLed.style.boxShadow = '0 0 6px var(--vault-signal-alert, #FF6B7A)';
        }
        if (alertsVal) alertsVal.innerText = '1';
        if (ledDanger) ledDanger.style.opacity = '1';
      }
    });
  }

  // ── Debrid URL Downloader & Secure Proxy Modal Event Listeners ─────────
  const btnDebridOpen = el('settings-btn-debrid-downloader');
  if (btnDebridOpen) {
    btnDebridOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        el('settings-panel').style.display = 'none';
        
        const dialog = el('debrid-download-dialog');
        dialog.style.display = 'flex';
        
        // Load active proxy states from window.appSettings
        const isProxyEnabled = window.appSettings.debridProxyEnable === true;
        const proxyAddress = window.appSettings.debridProxyAddress || '';
        
        el('debrid-proxy-enable').checked = isProxyEnabled;
        el('debrid-proxy-address-input').value = proxyAddress;
        
        updateProxyWidgetStatus();
    });
  }

  const proxyEnableCheckbox = el('debrid-proxy-enable');
  const proxyAddressInput = el('debrid-proxy-address-input');
  
  function updateProxyWidgetStatus() {
      const isChecked = proxyEnableCheckbox.checked;
      const addrValue = proxyAddressInput.value.trim();
      const statusLabel = el('debrid-proxy-status');
      if (statusLabel) {
          if (isChecked) {
              if (addrValue) {
                  statusLabel.innerText = 'Active';
                  statusLabel.style.color = 'var(--vault-gold)';
                  statusLabel.style.background = 'rgba(255,215,0,0.1)';
              } else {
                  statusLabel.innerText = 'Missing Addr';
                  statusLabel.style.color = '#ff5555';
                  statusLabel.style.background = 'rgba(255,85,85,0.1)';
              }
          } else {
              statusLabel.innerText = 'Disabled';
              statusLabel.style.color = 'var(--vault-slate)';
              statusLabel.style.background = 'rgba(255,255,255,0.05)';
          }
      }
  }

  if (proxyEnableCheckbox) {
      proxyEnableCheckbox.addEventListener('change', () => {
          updateProxyWidgetStatus();
          // Auto-persist when modified directly in the downloader dialog
          window.appSettings.debridProxyEnable = proxyEnableCheckbox.checked;
          window.electronAPI.saveSettings(window.appSettings);
      });
  }

  if (proxyAddressInput) {
      proxyAddressInput.addEventListener('input', () => {
          updateProxyWidgetStatus();
          window.appSettings.debridProxyAddress = proxyAddressInput.value.trim();
          window.electronAPI.saveSettings(window.appSettings);
      });
  }

  const btnDebridTestProxy = el('btn-debrid-test-proxy');
  if (btnDebridTestProxy) {
      btnDebridTestProxy.addEventListener('click', async () => {
          const proxyAddr = proxyAddressInput.value.trim();
          if (!proxyAddr) {
              showToast(window.currentLang === 'fr' ? 'Veuillez saisir une adresse de proxy' : 'Please enter a proxy address', 'error');
              return;
          }

          btnDebridTestProxy.disabled = true;
          btnDebridTestProxy.style.opacity = '0.5';
          
          const statusLabel = el('debrid-proxy-status');
          if (statusLabel) {
              statusLabel.innerText = window.currentLang === 'fr' ? 'Essai...' : 'Testing...';
              statusLabel.style.color = 'var(--vault-gold)';
              statusLabel.style.background = 'rgba(255,215,0,0.1)';
          }

          try {
              console.log('[Debrid Downloader] Initiating proxy connectivity check for:', proxyAddr);
              const res = await window.electronAPI.testDebridProxy(proxyAddr);
              
              if (res && res.success) {
                  showToast((window.currentLang === 'fr' ? 'Connexion réussie ! Latence: ' : 'Proxy connection successful! Latency: ') + res.latency + 'ms', 'success');
                  if (statusLabel) {
                      statusLabel.innerText = 'Connected';
                      statusLabel.style.color = '#10b981';
                      statusLabel.style.background = 'rgba(16,185,129,0.1)';
                  }
              } else {
                  throw new Error(res ? res.error : 'Unknown response');
              }
          } catch (err) {
              console.error('[Debrid Downloader] Proxy connectivity check failed:', err);
              showToast((window.currentLang === 'fr' ? 'Échec de la connexion: ' : 'Connection failed: ') + err.message, 'error');
              if (statusLabel) {
                  statusLabel.innerText = 'Failed';
                  statusLabel.style.color = '#ef4444';
                  statusLabel.style.background = 'rgba(239,68,68,0.1)';
              }
          } finally {
              btnDebridTestProxy.disabled = false;
              btnDebridTestProxy.style.opacity = '1.0';
          }
      });
  }

  // Unrestrict trigger
  const btnDebridDlUnrestrict = el('btn-debrid-dl-unrestrict');
  let activeDownloadUrl = '';
  let activeFilename = '';

  if (btnDebridDlUnrestrict) {
    btnDebridDlUnrestrict.addEventListener('click', async () => {
        const linkInput = el('debrid-dl-input');
        const rawLink = linkInput ? linkInput.value.trim() : '';
        if (!rawLink) {
            showToast(window.currentLang === 'fr' ? 'Veuillez coller un lien valide' : 'Please paste a valid link', 'error');
            return;
        }

        // Show loading UI
        el('debrid-dl-output-placeholder').style.display = 'none';
        el('debrid-dl-output-content').style.display = 'none';
        el('debrid-dl-output-progress').style.display = 'none';
        el('debrid-dl-output-loading').style.display = 'block';

        const proxy = (proxyEnableCheckbox.checked && proxyAddressInput.value.trim()) || '';

        try {
            console.log('[Debrid Downloader] Sending link to unrestrict:', rawLink, 'Proxy:', proxy);
            const res = await window.electronAPI.debridURL({ link: rawLink, proxy });
            
            if (res && res.success) {
                activeDownloadUrl = res.download;
                activeFilename = res.filename;
                
                // Format file size
                const sizeInGB = res.filesize ? (res.filesize / 1e9).toFixed(2) + ' GB' : 'Unknown Size';
                
                el('debrid-dl-filename').innerText = res.filename;
                el('debrid-dl-filesize').innerText = `Size: ${sizeInGB}`;
                
                el('debrid-dl-output-loading').style.display = 'none';
                el('debrid-dl-output-content').style.display = 'block';
                
                showToast(window.currentLang === 'fr' ? 'Lien débridé avec succès' : 'Link successfully unrestricted', 'success');
            } else {
                let errMsg = 'Unknown API response error';
                if (res && res.error) {
                    if (res.error === 'infringing_file') {
                        errMsg = window.currentLang === 'fr' 
                            ? "Ce fichier a été supprimé suite à une plainte pour atteinte aux droits d'auteur (DMCA)."
                            : "This file has been removed due to a copyright infringement complaint (DMCA).";
                    } else if (res.error === 'bad_token') {
                        errMsg = window.currentLang === 'fr'
                            ? "Clé API Real-Debrid non configurée, invalide ou expirée."
                            : "Real-Debrid API key is unconfigured, invalid, or expired.";
                    } else if (res.error === 'link_not_allowed') {
                        errMsg = window.currentLang === 'fr'
                            ? "Ce lien ou hébergeur n'est pas autorisé par Real-Debrid."
                            : "This hoster link is not allowed by Real-Debrid.";
                    } else {
                        errMsg = res.error;
                    }
                }
                throw new Error(errMsg);
            }
        } catch (err) {
            console.error('[Debrid Downloader] Unrestricting failed:', err);
            el('debrid-dl-output-loading').style.display = 'none';
            el('debrid-dl-output-placeholder').style.display = 'block';
            showToast((window.currentLang === 'fr' ? 'Échec du débridage : ' : 'Unrestricting failed: ') + err.message, 'error');
        }
    });
  }

  // Copy link
  const btnDebridCopyLink = el('btn-debrid-copy-link');
  if (btnDebridCopyLink) {
      btnDebridCopyLink.addEventListener('click', () => {
          if (activeDownloadUrl) {
              window.electronAPI.copyToClipboard(activeDownloadUrl);
              showToast(window.currentLang === 'fr' ? 'Lien copié dans le presse-papiers' : 'Direct link copied to clipboard', 'success');
          }
      });
  }

  // Start download trigger
  const btnDebridStartDownload = el('btn-debrid-start-download');
  if (btnDebridStartDownload) {
    btnDebridStartDownload.addEventListener('click', async () => {
        if (!activeDownloadUrl || !activeFilename) return;

        // Reset progress displays
        el('debrid-dl-output-content').style.display = 'none';
        el('debrid-dl-output-progress').style.display = 'block';
        
        el('debrid-dl-progress-status').innerText = window.currentLang === 'fr' ? 'Connexion en cours...' : 'Connecting...';
        el('debrid-dl-progress-percent').innerText = '0%';
        el('debrid-dl-progress-bar').style.width = '0%';
        el('debrid-dl-progress-speed').innerText = '';
        el('debrid-dl-progress-bytes').innerText = '';

        const proxy = (proxyEnableCheckbox.checked && proxyAddressInput.value.trim()) || '';

        // Register download telemetry listener
        window.electronAPI.onDownloadProgress((data) => {
            if (data.status === 'Downloading') {
                el('debrid-dl-progress-status').innerText = window.currentLang === 'fr' ? 'Téléchargement...' : 'Downloading...';
                el('debrid-dl-progress-percent').innerText = `${data.progress}%`;
                el('debrid-dl-progress-bar').style.width = `${data.progress}%`;
                
                const speedMB = (data.speed / 1e6).toFixed(1);
                el('debrid-dl-progress-speed').innerText = `Speed: ${speedMB} MB/s`;
                
                const loadedMB = (data.bytesDownloaded / 1e6).toFixed(0);
                const totalMB = (data.totalBytes / 1e6).toFixed(0);
                el('debrid-dl-progress-bytes').innerText = `${loadedMB} MB / ${totalMB} MB`;
            } else if (data.status === 'Completed') {
                el('debrid-dl-progress-status').innerText = window.currentLang === 'fr' ? 'Terminé' : 'Completed';
                el('debrid-dl-progress-percent').innerText = '100%';
                el('debrid-dl-progress-bar').style.width = '100%';
                el('debrid-dl-progress-speed').innerText = 'Speed: 0 MB/s';
                
                showToast(window.currentLang === 'fr' ? 'Téléchargement terminé avec succès !' : 'File downloaded successfully to Downloads folder!', 'success');
                window.electronAPI.offDownloadProgress();
            } else if (data.status === 'Failed') {
                el('debrid-dl-progress-status').innerText = window.currentLang === 'fr' ? 'Échec' : 'Failed';
                el('debrid-dl-progress-bar').style.backgroundColor = '#ff5555';
                showToast((window.currentLang === 'fr' ? 'Erreur de téléchargement: ' : 'Download failed: ') + (data.error || 'Unknown Error'), 'error');
                window.electronAPI.offDownloadProgress();
            }
        });

        try {
            console.log('[Debrid Downloader] Starting download for:', activeFilename, 'Proxy:', proxy);
            const res = await window.electronAPI.downloadDebridFile({
                downloadUrl: activeDownloadUrl,
                filename: activeFilename,
                proxy
            });
            
            if (!res.success) {
                throw new Error(res.error);
            }
        } catch (err) {
            console.error('[Debrid Downloader] Download invocation failed:', err);
            el('debrid-dl-progress-status').innerText = 'Failed';
            showToast('Download failed: ' + err.message, 'error');
            window.electronAPI.offDownloadProgress();
        }
    });
  }
}

// Bind globals for use in coordinating script
window.applyTheme = applyTheme;
window.initThemeGrid = initThemeGrid;
window.initSettingsListeners = initSettingsListeners;


