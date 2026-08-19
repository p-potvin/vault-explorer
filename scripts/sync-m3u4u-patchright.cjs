/**
 * Runs one m3u4u playlist sync through the authenticated Chrome profile.
 *
 * No API tokens, cookies, or account credentials are read or stored here.
 * The signed-in Chrome profile is the only authentication surface.
 */

const os = require('node:os');
const path = require('node:path');

const patchrightPath = process.env.PATCHRIGHT_PATH
  || 'C:/Users/Administrator/Desktop/Prom-King/qa-automation/node_modules/patchright';
const { chromium } = require(patchrightPath);

const chromeUserDataDir = process.env.M3U4U_CHROME_USER_DATA_DIR
  || path.join(os.homedir(), 'AppData', 'Local', 'VaultWares', 'M3U4UAutomation', 'ChromeProfile');
const profileDirectory = process.env.M3U4U_CHROME_PROFILE || 'Default';
const playlistName = process.env.M3U4U_PLAYLIST_NAME || 'Notre Playlist';
const timeoutMs = Number.parseInt(process.env.M3U4U_TIMEOUT_MS || '120000', 10);
const chromeExecutable = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function log(message) {
  process.stdout.write(`${new Date().toISOString()} ${message}\n`);
}

async function main() {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 120_000) {
    throw new Error('M3U4U_TIMEOUT_MS must be between 10000 and 120000');
  }

  let context;
  try {
    log(`opening Chrome profile ${profileDirectory}`);
    context = await chromium.launchPersistentContext(chromeUserDataDir, {
      executablePath: chromeExecutable,
      headless: false,
      args: [`--profile-directory=${profileDirectory}`],
      viewport: null,
      timeout: timeoutMs,
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://m3u4u.com/playlists', {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    if (page.url().includes('/login')) {
      throw new Error('m3u4u session is signed out; sign in manually in the Chrome profile');
    }

    const row = page.getByRole('row', { name: new RegExp(playlistName, 'i') });
    await row.waitFor({ state: 'visible', timeout: timeoutMs });
    const checkbox = row.getByRole('checkbox');
    await checkbox.check({ timeout: timeoutMs });

    if (process.env.M3U4U_DRY_RUN === '1') {
      log(`dry run passed; ${playlistName} is selectable`);
      return;
    }

    const syncResponse = page.waitForResponse(
      response => response.url().includes('/api/playlists/bulk-sync') && response.request().method() === 'POST',
      { timeout: timeoutMs },
    );
    await page.getByRole('button', { name: 'Sync Selected Playlists' }).click({ timeout: timeoutMs });
    const response = await syncResponse;
    if (!response.ok()) {
      throw new Error(`m3u4u bulk sync returned HTTP ${response.status()}`);
    }
    log(`sync accepted for ${playlistName} (HTTP ${response.status()})`);
  } finally {
    if (context) {
      await context.close();
    }
  }
}

main().catch(error => {
  process.stderr.write(`${new Date().toISOString()} sync failed: ${error.message}\n`);
  process.exitCode = 1;
});
