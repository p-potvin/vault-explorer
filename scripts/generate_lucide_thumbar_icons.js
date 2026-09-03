const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const icons = {
    'prev.png': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>`,
    'next.png': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`,
    'play.png': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`,
    'pause.png': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`,
    'stop.png': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`,
    'fullscreen.png': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`
};

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        show: false,
        width: 100,
        height: 100,
        webPreferences: {
            offscreen: true
        }
    });

    const targetDir = path.resolve(__dirname, '..', 'build', 'thumbar');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    for (const [filename, svg] of Object.entries(icons)) {
        const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        const pngBase64 = await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 24;
                    canvas.height = 24;
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, 24, 24);
                    ctx.drawImage(img, 0, 0, 24, 24);
                    resolve(canvas.toDataURL('image/png').split(',')[1]);
                };
                img.src = "${dataUrl}";
            });
        `);
        const filePath = path.join(targetDir, filename);
        fs.writeFileSync(filePath, Buffer.from(pngBase64, 'base64'));
        console.log(`Generated Lucide icon: ${filePath} (${fs.statSync(filePath).size} bytes)`);
    }

    app.quit();
});
