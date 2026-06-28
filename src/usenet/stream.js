// src/usenet/stream.js - Integrates NzbDAV WebDAV streaming bridge
const fs = require('fs');
const path = require('path');
const { fetchWithTimeout } = require("./client");

// We read configuration
let envConfig = {};
try {
    const envPaths = [
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '..', '..', '.env')
    ];
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split(/\r?\n/).forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    if (key) {
                        if (!process.env[key]) {
                            process.env[key] = value;
                        }
                        envConfig[key] = process.env[key];
                    }
                }
            });
        }
    }
} catch (e) {}

const NZBDAV_URL = process.env.NZBDAV_URL || envConfig.NZBDAV_URL || '';
const NZBDAV_API_KEY = process.env.NZBDAV_API_KEY || envConfig.NZBDAV_API_KEY || '';
const NZBDAV_USER = process.env.NZBDAV_USER || envConfig.NZBDAV_USER || '';
const NZBDAV_PASS = process.env.NZBDAV_PASS || envConfig.NZBDAV_PASS || '';

/**
 * Initiates streaming for a Usenet NZB result using the NzbDAV bridge.
 */
async function streamUsenetNzb(event, { downloadUrl, title }) {
    if (!NZBDAV_URL) {
        return { success: false, error: 'NZBDAV_URL is not configured in .env' };
    }

    try {
        console.log(`[Usenet-Stream] Adding NZB to NzbDAV: ${title} (${downloadUrl})`);
        
        // 1. Add URL to SABnzbd API of NzbDAV
        let apiBase = NZBDAV_URL.replace(/\/$/, '');
        let addUrl = `${apiBase}/api?mode=addurl&name=${encodeURIComponent(downloadUrl)}&output=json`;
        if (NZBDAV_API_KEY) {
            addUrl += `&apikey=${NZBDAV_API_KEY}`;
        }
        
        let response = await fetchWithTimeout(addUrl, { method: 'GET' }, 10000);
        if (!response.ok) {
            // Try with /sabnzbd/api
            addUrl = `${apiBase}/sabnzbd/api?mode=addurl&name=${encodeURIComponent(downloadUrl)}&output=json`;
            if (NZBDAV_API_KEY) addUrl += `&apikey=${NZBDAV_API_KEY}`;
            response = await fetchWithTimeout(addUrl, { method: 'GET' }, 10000);
        }

        if (!response.ok) {
            throw new Error(`NzbDAV API returned HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data || (!data.status && !data.nzo_ids)) {
            throw new Error('NzbDAV API returned invalid addurl response');
        }

        const nzoId = data.nzo_ids && data.nzo_ids[0];
        console.log(`[Usenet-Stream] Added NZB to NzbDAV, NZO ID: ${nzoId}`);

        // 2. Poll the queue to find the folder name (filename) matching the NZO ID
        let folderName = null;
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            attempts++;
            console.log(`[Usenet-Stream] Polling queue for NZO ID ${nzoId} (attempt ${attempts}/${maxAttempts})`);
            
            let queueUrl = `${apiBase}/api?mode=queue&output=json`;
            if (NZBDAV_API_KEY) queueUrl += `&apikey=${NZBDAV_API_KEY}`;
            
            let qRes = await fetchWithTimeout(queueUrl, {}, 5000);
            if (!qRes.ok) {
                queueUrl = `${apiBase}/sabnzbd/api?mode=queue&output=json`;
                if (NZBDAV_API_KEY) queueUrl += `&apikey=${NZBDAV_API_KEY}`;
                qRes = await fetchWithTimeout(queueUrl, {}, 5000);
            }

            if (qRes.ok) {
                const qData = await qRes.json();
                const queue = qData.queue || {};
                const slots = queue.slots || [];
                const matchedSlot = slots.find(slot => slot.nzo_id === nzoId);
                if (matchedSlot && matchedSlot.filename) {
                    folderName = matchedSlot.filename;
                    break;
                }
            }
            
            // Check history as well in case it completed instantly
            let historyUrl = `${apiBase}/api?mode=history&output=json`;
            if (NZBDAV_API_KEY) historyUrl += `&apikey=${NZBDAV_API_KEY}`;
            let hRes = await fetchWithTimeout(historyUrl, {}, 5000);
            if (!hRes.ok) {
                historyUrl = `${apiBase}/sabnzbd/api?mode=history&output=json`;
                if (NZBDAV_API_KEY) historyUrl += `&apikey=${NZBDAV_API_KEY}`;
                hRes = await fetchWithTimeout(historyUrl, {}, 5000);
            }
            
            if (hRes.ok) {
                const hData = await hRes.json();
                const history = hData.history || {};
                const slots = history.slots || [];
                const matchedSlot = slots.find(slot => slot.nzo_id === nzoId);
                if (matchedSlot && matchedSlot.name) {
                    folderName = matchedSlot.name;
                    break;
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!folderName) {
            // Fallback: use title of NZB or title parameter as the folder name
            folderName = title || 'Unknown';
            console.log(`[Usenet-Stream] Could not match NZO ID in queue, falling back to title: ${folderName}`);
        }

        console.log(`[Usenet-Stream] Folder name in WebDAV: ${folderName}`);

        // 3. Perform PROPFIND on the WebDAV directory to find files
        // WebDAV URL configuration
        const webdavBase = NZBDAV_URL;
        let webdavFolderUrl = `${webdavBase}/${encodeURIComponent(folderName)}`;
        
        // Add authentication headers if configured
        const headers = {
            'Depth': '1',
            'Content-Type': 'application/xml'
        };
        if (NZBDAV_USER && NZBDAV_PASS) {
            const auth = Buffer.from(`${NZBDAV_USER}:${NZBDAV_PASS}`).toString('base64');
            headers['Authorization'] = `Basic ${auth}`;
        }

        let propfindRes = await fetchWithTimeout(webdavFolderUrl, {
            method: 'PROPFIND',
            headers
        }, 10000);

        if (!propfindRes.ok) {
            // Try with /dav prefix
            webdavFolderUrl = `${webdavBase}/dav/${encodeURIComponent(folderName)}`;
            propfindRes = await fetchWithTimeout(webdavFolderUrl, {
                method: 'PROPFIND',
                headers
            }, 10000);
        }

        if (!propfindRes.ok) {
            throw new Error(`WebDAV PROPFIND failed: HTTP ${propfindRes.status}`);
        }

        const xmlText = await propfindRes.text();
        
        // Extract all file paths from the XML response
        const hrefs = [];
        const hrefRegex = /<[a-zA-Z0-9:]*href[^>]*>([^<]+)<\/[a-zA-Z0-9:]*href>/g;
        let match;
        while ((match = hrefRegex.exec(xmlText)) !== null) {
            hrefs.push(decodeURIComponent(match[1]));
        }

        // Find the largest video file
        const videoExtensions = ['.mkv', '.mp4', '.avi', '.ts', '.mov', '.m4v'];
        const videoFiles = hrefs.filter(href => {
            const lower = href.toLowerCase();
            return videoExtensions.some(ext => lower.endsWith(ext));
        });

        if (videoFiles.length === 0) {
            throw new Error('No video files found inside the NZB folder');
        }

        // Sort video files or pick the first one (usually the main file)
        // If there are multiple, choose the one containing the folder name or the largest
        // Since we don't have sizes directly without parsing full XML nodes, we can pick the first video file
        // or one that doesn't look like a sample.
        const mainVideo = videoFiles.find(href => !href.toLowerCase().includes('sample')) || videoFiles[0];
        
        // Construct stream URL
        // If the href is absolute or relative, resolve it
        let streamUrl = '';
        if (mainVideo.startsWith('http://') || mainVideo.startsWith('https://')) {
            streamUrl = mainVideo;
        } else {
            // Build absolute URL from webdavFolderUrl
            const parsedBase = new URL(webdavBase);
            streamUrl = `${parsedBase.protocol}//${parsedBase.host}${mainVideo}`;
        }

        // Inject username and password into the stream URL if present
        if (NZBDAV_USER && NZBDAV_PASS) {
            const urlObj = new URL(streamUrl);
            urlObj.username = NZBDAV_USER;
            urlObj.password = NZBDAV_PASS;
            streamUrl = urlObj.toString();
        }

        console.log(`[Usenet-Stream] Successfully resolved stream URL: ${streamUrl}`);
        return {
            success: true,
            streamUrl,
            title
        };

    } catch (err) {
        console.error('[Usenet-Stream] Error generating stream:', err);
        return {
            success: false,
            error: err.message || 'Failed to generate Usenet stream URL'
        };
    }
}

function registerUsenetStreamHandlers(ipcMain) {
    ipcMain.handle('stream-usenet-nzb', async (event, params) => {
        return await streamUsenetNzb(event, params);
    });
}

module.exports = {
    streamUsenetNzb,
    registerUsenetStreamHandlers
};
