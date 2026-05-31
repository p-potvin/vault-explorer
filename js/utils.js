var el = id => document.getElementById(id);

function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Fix for all file:// breakages (spaces, special chars)
function sanitizePath(p) {
  if (!p) return '';
  const standardized = p.replace(/\\/g, '/');
  const encoded = standardized.split('/').map(segment => encodeURIComponent(segment).replace(/'/g, "%27")).join('/');
  const decodedDrive = encoded.replace(/^([a-zA-Z])%3A\//, '$1:/'); 
  return 'file:///' + decodedDrive;
}

function showClipboardNotification(message) {
  const pill = document.createElement('div');
  pill.style.position = 'fixed';
  pill.style.bottom = '40px';
  pill.style.left = '50%';
  pill.style.transform = 'translateX(-50%) translateY(20px)';
  pill.style.background = 'linear-gradient(135deg, #10b981, #059669)'; // Beautiful emerald/green gradient
  pill.style.color = '#ffffff';
  pill.style.padding = '8px 16px';
  pill.style.borderRadius = '20px';
  pill.style.fontSize = '12px';
  pill.style.fontWeight = '700';
  pill.style.fontFamily = 'var(--font-mono)';
  pill.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.4)';
  pill.style.zIndex = '99999';
  pill.style.opacity = '0';
  pill.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
  pill.style.pointerEvents = 'none';
  pill.style.display = 'flex';
  pill.style.alignItems = 'center';
  pill.style.gap = '8px';
  
  pill.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span>${message}</span>
  `;
  
  document.body.appendChild(pill);
  
  requestAnimationFrame(() => {
      pill.style.opacity = '1';
      pill.style.transform = 'translateX(-50%) translateY(0)';
  });
  
  setTimeout(() => {
      pill.style.opacity = '0';
      pill.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => {
          pill.remove();
      }, 500);
  }, 2200);
}

function showToast(message, type = 'success') {
  const msgLower = (message || '').toLowerCase();
  const isClipboard = msgLower.includes('copied') || msgLower.includes('presse-papiers') || msgLower.includes('press-papiers') || msgLower.includes('cut ') || msgLower.includes('pasted');
  if (isClipboard && type === 'success') {
      showClipboardNotification(message);
      return;
  }

  let container = document.getElementById('toast-container');
  if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '';
  if (window.icons) {
    icon = type === 'success' ? window.icons.success() : window.icons.error();
  }
  
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
      toast.classList.add('show');
  });
  
  setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
          toast.remove();
      }, 300);
  }, 3000);
}

function attachHoverWebmToCard(card, hoverWebmPath) {
  if (!card || !hoverWebmPath) return;
  let wT;
  const mainImg = card.querySelector('.thumbnail');
  const thumbCont = card.querySelector('.thumbnail-container');
  if (!mainImg || !thumbCont) return;
  
  card.addEventListener('mouseenter', () => {
       clearTimeout(wT);
       wT = setTimeout(() => {
          if (window.hoverAudioPreview) {
              try { window.hoverAudioPreview.pause(); } catch(e) {}
              window.hoverAudioPreview = null;
          }
          if (thumbCont.querySelector('video.trickplay')) return;
          let v = document.createElement('video');
          v.src = sanitizePath(hoverWebmPath);
          const isMuted = window.appSettings && window.appSettings.mutePreviews === true;
          v.autoplay = true; v.loop = true; v.muted = isMuted; v.volume = 0.5; v.className = 'trickplay';
          v.style.display = 'block'; v.style.objectFit = 'cover';
          thumbCont.appendChild(v);
          mainImg.style.display = 'none';
       }, 300);
  });
  card.addEventListener('mouseleave', () => {
      clearTimeout(wT);
      const v = thumbCont.querySelector('video.trickplay');
      if(v) { v.pause(); v.src = ""; v.remove(); }
      if(mainImg) mainImg.style.display = 'block';
  });
}

function killAllHoverVideos() {
  document.querySelectorAll('#file-grid video.trickplay').forEach(v => {
      try { v.pause(); v.src = ''; v.remove(); } catch(e) {}
  });
  if (window.hoverAudioPreview) {
      try { window.hoverAudioPreview.pause(); } catch(e) {}
      window.hoverAudioPreview = null;
  }
}

function showConfirmDialog(message, title) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('custom-confirm-dialog');
    const msgEl = document.getElementById('confirm-message');
    const titleEl = document.getElementById('confirm-title');
    const btnCancel = document.getElementById('btn-confirm-cancel');
    const btnOk = document.getElementById('btn-confirm-ok');
    
    if (!dialog) {
      resolve(confirm(message));
      return;
    }
    
    titleEl.textContent = title || (window.currentLang === 'fr' ? 'Action système requise' : 'System Action Required');
    msgEl.textContent = message;
    dialog.style.display = 'block';
    
    let backdrop = document.getElementById('dialog-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'dialog-backdrop';
      backdrop.style.position = 'fixed';
      backdrop.style.top = '0';
      backdrop.style.left = '0';
      backdrop.style.width = '100vw';
      backdrop.style.height = '100vh';
      backdrop.style.background = 'rgba(0, 0, 0, 0.4)';
      backdrop.style.backdropFilter = 'blur(2px)';
      backdrop.style.zIndex = '3050';
      document.body.appendChild(backdrop);
    }
    backdrop.style.display = 'block';
    
    const cleanup = (value) => {
      dialog.style.display = 'none';
      if (backdrop) backdrop.style.display = 'none';
      btnCancel.removeEventListener('click', onCancel);
      btnOk.removeEventListener('click', onOk);
      resolve(value);
    };
    
    function onCancel() { cleanup(false); }
    function onOk() { cleanup(true); }
    
    btnCancel.addEventListener('click', onCancel);
    btnOk.addEventListener('click', onOk);
  });
}

// Bind globals for accessibility
window.el = el;
window.escapeHtml = escapeHtml;
window.formatBytes = formatBytes;
window.formatDuration = formatDuration;
window.sanitizePath = sanitizePath;
window.showToast = showToast;
window.showClipboardNotification = showClipboardNotification;
window.attachHoverWebmToCard = attachHoverWebmToCard;
window.killAllHoverVideos = killAllHoverVideos;
window.showConfirmDialog = showConfirmDialog;
