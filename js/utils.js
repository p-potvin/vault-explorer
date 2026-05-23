const el = id => document.getElementById(id);

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

function showToast(message, type = 'success') {
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
  if (type === 'success') {
      icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vt-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else {
      icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--vt-error)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
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
          if (thumbCont.querySelector('video.trickplay')) return;
          let v = document.createElement('video');
          v.src = sanitizePath(hoverWebmPath);
          v.autoplay = true; v.loop = true; v.muted = false; v.volume = 0.5; v.className = 'trickplay';
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
}

function showConfirmDialog(message, title = 'System Action Required') {
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
    
    titleEl.textContent = title;
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
window.attachHoverWebmToCard = attachHoverWebmToCard;
window.killAllHoverVideos = killAllHoverVideos;
window.showConfirmDialog = showConfirmDialog;
