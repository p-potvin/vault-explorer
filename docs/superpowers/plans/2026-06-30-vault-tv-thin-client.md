# Vault TV Thin Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate streaming-only TV client for Amazon Fire TV / Android TV class devices that calls the VaultWares media stack instead of porting the Electron desktop app.

**Architecture:** Keep Vault Explorer as the desktop media workstation and create a new app named `vault-tv` for lean playback. The TV client is a remote-control-first web app wrapped for Android TV when packaging is needed; all provider lookups, debrid handling, Usenet/NzbDAV coordination, auth, and stream URL resolution stay server-side behind a VaultWares media API.

**Tech Stack:** React + TypeScript + Vite for the UI, Vitest + Testing Library for unit tests, Playwright for browser/remote-navigation smoke tests, Capacitor Android or Trusted Web Activity for optional APK packaging, and a small server contract adapter that talks only to VaultWares-controlled endpoints.

**Created:** Tue, 30 Jun 2026 19:43

---

## Governing Rules

- Treat this as a new app, not a Vault Explorer Android port.
- Do not import Electron, Node filesystem APIs, Python scripts, FFmpeg binaries, PowerShell scripts, RealESRGAN binaries, or local Vault Explorer IPC handlers into the TV app.
- Do not call Real-Debrid, AllDebrid, Premiumize, Torrentio, Jackett, Prowlarr, Bitmagnet, MediaFusion, YTS, EZTV, or provider mirrors directly from the TV app.
- All torrent and debrid lookup, magnet resolution, stream URL fetch, and cache checks must go through server-side VaultWares media endpoints. Comet remains the torrent/debrid aggregation path.
- Do not log secrets, debrid tokens, stream URLs with embedded credentials, NzbDAV credentials, or signed playback URLs.
- The TV client must work with a D-pad remote: Arrow keys, Enter, Back/Escape, media play/pause, and long-press/context-menu equivalents.
- The first release should support browsing/search/playback/watch progress only. Leave local file management, clipping, transcoding controls, upscaling, subtitle generation, image editing, and desktop admin tooling in Vault Explorer or server-side services.

## Source Context

Read these files before implementation:

- `C:\Users\Administrator\Desktop\Github Repos\vault-explorer\README.md`
- `C:\Users\Administrator\Desktop\Github Repos\vault-explorer\ROADMAP.md`
- `C:\Users\Administrator\Desktop\Github Repos\vault-explorer\src\realdebrid\search.js`
- `C:\Users\Administrator\Desktop\Github Repos\vault-explorer\src\realdebrid\stream.js`
- `C:\Users\Administrator\Desktop\Github Repos\vault-explorer\src\usenet\stream.js`
- `C:\Users\Administrator\Desktop\Github Repos\vault-explorer\js\streaming\details-modal.js`
- `C:\Users\Administrator\Desktop\Github Repos\vault-explorer\js\streaming\rd-flow.js`
- `C:\Users\Administrator\Desktop\Github Repos\vault-explorer\js\player\player.js`
- `C:\Users\Administrator\Desktop\Github Repos\vaultwares-docs\instructions\ROUTER.md`
- `C:\Users\Administrator\Desktop\Github Repos\vaultwares-docs\instructions\summaries\NETWORK_INFRASTRUCTURE.md`
- `C:\Users\Administrator\Desktop\Github Repos\vaultwares-docs\instructions\summaries\REQUEST_RATE_LIMITING.md`
- `C:\Users\Administrator\Desktop\Github Repos\vaultwares-themes\AGENTS.md`
- `C:\Users\Administrator\Desktop\Github Repos\vaultwares-themes\vaultwares-revisited\README.md`

## Target App Boundary

Create the separate app at:

- `C:\Users\Administrator\Desktop\Github Repos\vault-tv`

Recommended app shape:

```text
vault-tv/
  AGENTS.md
  README.md
  package.json
  pnpm-lock.yaml
  index.html
  vite.config.ts
  tsconfig.json
  src/
    app/App.tsx
    app/routes.tsx
    app/tvInput.ts
    api/mediaClient.ts
    api/mediaTypes.ts
    api/mockMediaClient.ts
    auth/pairing.ts
    components/FocusBoundary.tsx
    components/MediaCard.tsx
    components/MediaGrid.tsx
    components/PlayerOverlay.tsx
    components/Shell.tsx
    features/home/HomeScreen.tsx
    features/search/SearchScreen.tsx
    features/details/DetailsScreen.tsx
    features/player/PlayerScreen.tsx
    features/settings/SettingsScreen.tsx
    styles/tokens.css
    styles/tv.css
    test/setup.ts
  tests/
    focus-navigation.test.tsx
    media-client.test.ts
    player-state.test.tsx
  e2e/
    tv-navigation.spec.ts
    playback.spec.ts
```

## API Contract

The app should call one VaultWares-controlled media API base URL, configured as `VITE_VAULT_MEDIA_API_BASE`.

Required endpoints for the first release:

```http
GET /api/tv/catalog/home
GET /api/tv/search?query={query}&kind={movie|series}
GET /api/tv/media/{id}
GET /api/tv/media/{id}/episodes?season={seasonNumber}
POST /api/tv/media/{id}/resolve
POST /api/tv/watch/progress
GET /api/tv/watch/continue
POST /api/tv/auth/pairing/start
POST /api/tv/auth/pairing/confirm
```

`POST /api/tv/media/{id}/resolve` is the only endpoint that may initiate provider lookup. Server-side implementation must route provider lookup through Comet and other approved internal media services. The TV app only receives a playable response.

Example resolve response:

```json
{
  "playbackId": "vw-playback-01J2Z7A8E9F0",
  "title": "Example Movie",
  "mediaType": "movie",
  "stream": {
    "url": "https://media.vaultwares.ca/session/vw-playback-01J2Z7A8E9F0/master.m3u8",
    "mimeType": "application/vnd.apple.mpegurl",
    "expiresAt": "Tue, 30 Jun 2026 21:43"
  },
  "subtitles": [
    {
      "label": "English",
      "srclang": "en",
      "url": "https://media.vaultwares.ca/session/vw-playback-01J2Z7A8E9F0/subs/en.vtt"
    }
  ],
  "resume": {
    "positionSeconds": 812,
    "durationSeconds": 5940
  }
}
```

## Implementation Tasks

### Task 1: Create the New App Shell

**Files:**
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\package.json`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\vite.config.ts`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\tsconfig.json`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\index.html`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\app\App.tsx`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\app\routes.tsx`

- [ ] **Step 1: Create the Vite React TypeScript app**

Run:

```powershell
Set-Location 'C:\Users\Administrator\Desktop\Github Repos'
pnpm create vite vault-tv --template react-ts
Set-Location '.\vault-tv'
pnpm install
```

Expected: `vault-tv` contains a working React + TypeScript Vite app.

- [ ] **Step 2: Replace default app content with TV routes**

Use these first routes:

```tsx
export type TvRoute = 'home' | 'search' | 'details' | 'player' | 'settings';

export interface RouteState {
  route: TvRoute;
  mediaId?: string;
}

export const initialRoute: RouteState = { route: 'home' };
```

Expected: The app launches directly into the TV home surface, not a marketing page.

- [ ] **Step 3: Verify the app shell**

Run:

```powershell
pnpm dev --host 0.0.0.0
```

Expected: Vite starts and prints a local URL. Open it in a browser and confirm the first screen is the TV home shell.

### Task 2: Define the Media API Client

**Files:**
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\api\mediaTypes.ts`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\api\mediaClient.ts`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\api\mockMediaClient.ts`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\tests\media-client.test.ts`

- [ ] **Step 1: Define stable TypeScript types**

Create media types with these names:

```ts
export type MediaKind = 'movie' | 'series';

export interface MediaSummary {
  id: string;
  kind: MediaKind;
  title: string;
  year?: number;
  posterUrl?: string;
  backdropUrl?: string;
  progressSeconds?: number;
  durationSeconds?: number;
}

export interface MediaDetails extends MediaSummary {
  overview?: string;
  seasons?: Array<{ seasonNumber: number; episodeCount: number }>;
}

export interface PlaybackStream {
  url: string;
  mimeType: string;
  expiresAt: string;
}

export interface ResolvePlaybackResponse {
  playbackId: string;
  title: string;
  mediaType: MediaKind;
  stream: PlaybackStream;
  subtitles: Array<{ label: string; srclang: string; url: string }>;
  resume?: { positionSeconds: number; durationSeconds: number };
}
```

- [ ] **Step 2: Write tests for forbidden direct providers**

Test that the client rejects non-VaultWares API bases:

```ts
import { describe, expect, it } from 'vitest';
import { createMediaClient } from '../src/api/mediaClient';

describe('mediaClient', () => {
  it('rejects direct debrid and provider URLs', () => {
    expect(() => createMediaClient('https://api.real-debrid.com')).toThrow(/VaultWares media API/);
    expect(() => createMediaClient('https://torrentio.strem.fun')).toThrow(/VaultWares media API/);
  });
});
```

- [ ] **Step 3: Implement the client guard**

Allowed bases must be VaultWares-controlled origins or tailnet development URLs:

```ts
const forbiddenHosts = [
  'api.real-debrid.com',
  'torrentio.strem.fun',
  'yts.mx',
  'eztv.re',
  'eztv.wf',
  'eztv.tf',
  'eztv.yt',
];

export function createMediaClient(baseUrl: string) {
  const parsed = new URL(baseUrl);
  if (forbiddenHosts.includes(parsed.hostname)) {
    throw new Error('TV client must use the VaultWares media API, not direct provider URLs.');
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, parsed).toString(), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Media API ${response.status} for ${path}`);
    }
    return response.json() as Promise<T>;
  }

  return {
    home: () => requestJson('/api/tv/catalog/home'),
    search: (query: string, kind: 'movie' | 'series') =>
      requestJson(`/api/tv/search?query=${encodeURIComponent(query)}&kind=${kind}`),
    details: (id: string) => requestJson(`/api/tv/media/${encodeURIComponent(id)}`),
    resolve: (id: string) =>
      requestJson(`/api/tv/media/${encodeURIComponent(id)}/resolve`, { method: 'POST' }),
  };
}
```

- [ ] **Step 4: Run the API client tests**

Run:

```powershell
pnpm vitest run tests/media-client.test.ts
```

Expected: The direct-provider guard test passes.

### Task 3: Build D-Pad Focus Navigation

**Files:**
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\app\tvInput.ts`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\components\FocusBoundary.tsx`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\tests\focus-navigation.test.tsx`

- [ ] **Step 1: Define the TV key map**

Map these keys:

```ts
export const tvKeys = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  select: ['Enter', ' '],
  back: ['Escape', 'Backspace', 'BrowserBack'],
  playPause: ['MediaPlayPause', 'k'],
};
```

- [ ] **Step 2: Implement roving focus**

Use one active index per grid and update it on arrow input. Every focusable card must expose `tabIndex={active ? 0 : -1}` and call `.focus()` after active index changes.

- [ ] **Step 3: Test focus movement**

Write tests that render four cards, press ArrowRight, ArrowDown, ArrowLeft, and Enter, then assert the active card and selected item.

Run:

```powershell
pnpm vitest run tests/focus-navigation.test.tsx
```

Expected: Focus movement works without mouse events.

### Task 4: Build the TV Home and Search Screens

**Files:**
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\features\home\HomeScreen.tsx`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\features\search\SearchScreen.tsx`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\components\MediaGrid.tsx`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\components\MediaCard.tsx`

- [ ] **Step 1: Implement Home sections**

Show these rails:

- Continue Watching
- Movies
- Series
- Recently Resolved

Each rail uses the same `MediaGrid` focus model.

- [ ] **Step 2: Implement TV search**

Start with plain text input that works in a browser and with Fire TV’s software keyboard. Keep search request submission explicit via Enter/select; do not fire a request per keystroke.

- [ ] **Step 3: Add bounded request behavior**

Search must debounce to user submission only. No polling loops. No request batches without a future explicit approval step.

### Task 5: Build Details and Playback Resolution

**Files:**
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\features\details\DetailsScreen.tsx`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\features\player\PlayerScreen.tsx`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\components\PlayerOverlay.tsx`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\tests\player-state.test.tsx`

- [ ] **Step 1: Add Details screen**

Details must show poster, title, year, overview, seasons/episodes for series, and one primary Play button.

- [ ] **Step 2: Resolve playback through server**

The Play button calls `mediaClient.resolve(mediaId)`. It must never receive or construct a magnet URI. It must never call a debrid provider directly.

- [ ] **Step 3: Play HLS or MP4**

Use native `<video>` first. Add `hls.js` only if Fire TV WebView testing proves native HLS is insufficient.

- [ ] **Step 4: Persist progress**

Send progress every 30 seconds and on pause/exit:

```json
{
  "playbackId": "vw-playback-01J2Z7A8E9F0",
  "positionSeconds": 840,
  "durationSeconds": 5940,
  "state": "playing"
}
```

The server endpoint is `POST /api/tv/watch/progress`.

### Task 6: Add Pairing-Based Auth

**Files:**
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\auth\pairing.ts`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\src\features\settings\SettingsScreen.tsx`

- [ ] **Step 1: Start pairing**

The TV app calls `POST /api/tv/auth/pairing/start` and displays a short code.

- [ ] **Step 2: Confirm pairing**

The TV app polls only after user approval during implementation because polling loops are request-rate-limited by VaultWares policy. For first implementation, use a manual "Check pairing" button instead of automatic polling.

- [ ] **Step 3: Store a device token**

Store the opaque device token in local storage. Do not store provider tokens, debrid tokens, NzbDAV credentials, SSH keys, or stream service secrets on the device.

### Task 7: Package for Fire TV / Android TV

**Files:**
- Create after web app passes browser QA: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\android\`

- [ ] **Step 1: Decide packaging target**

Use one of these:

- Trusted Web Activity if the app is hosted and HTTPS is stable.
- Capacitor Android if local APK sideloading and device storage integration are needed.

Recommended first target: hosted web app plus Fire TV browser/manual sideload test. Package only after the TV UI and playback are verified.

- [ ] **Step 2: Add Android TV manifest support**

When packaging, the Android app must declare TV leanback support and a landscape orientation.

- [ ] **Step 3: Verify on device**

Use a real Fire Stick or Android TV emulator:

```powershell
adb connect <device-ip>
adb install .\android\app\build\outputs\apk\debug\app-debug.apk
adb logcat
```

Expected: App launches, remote navigation works, playback starts from a server-resolved stream, and Back exits player/details correctly.

### Task 8: Verification Matrix

**Files:**
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\e2e\tv-navigation.spec.ts`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\e2e\playback.spec.ts`

- [ ] **Step 1: Run static checks**

```powershell
pnpm typecheck
pnpm lint
pnpm vitest run
```

Expected: All pass.

- [ ] **Step 2: Run browser smoke tests**

```powershell
pnpm playwright test e2e/tv-navigation.spec.ts e2e/playback.spec.ts
```

Expected: Navigation reaches Home -> Details -> Player -> Back to Details -> Back to Home.

- [ ] **Step 3: Run network inspection**

In Playwright or browser DevTools, verify requests only target:

- `VITE_VAULT_MEDIA_API_BASE`
- static asset URLs from the same hosted app
- media playback URLs returned by the VaultWares media API

No direct requests to debrid providers or torrent indexers are acceptable.

### Task 9: Deployment Handoff

**Files:**
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\README.md`
- Create: `C:\Users\Administrator\Desktop\Github Repos\vault-tv\AGENTS.md`

- [ ] **Step 1: Document the app purpose**

README first paragraph:

```md
# Vault TV

Vault TV is a streaming-only, remote-control-first client for Fire TV and Android TV devices. It does not perform provider lookup, debrid resolution, local file management, transcoding, or AI processing locally; those responsibilities stay behind VaultWares media services.
```

- [ ] **Step 2: Document required environment variables**

```env
VITE_VAULT_MEDIA_API_BASE=https://media.vaultwares.ca
```

Use a tailnet/internal URL during local development when appropriate. Do not commit real device tokens or service credentials.

- [ ] **Step 3: Record deployment proof**

Before calling the app ready, capture:

- Build command and result.
- Browser URL tested.
- Fire TV or Android TV device tested.
- Routes visited.
- DevTools/network check proving no direct provider calls.
- Playback proof using one server-resolved test stream.
- Agent-ledger event path.

## Recommended First Milestone

Milestone 1 should be web-only:

- Home rail with mock data.
- Search with explicit submit.
- Details screen.
- Player screen with a known server-provided HLS/MP4 URL.
- Remote-control navigation.
- No APK packaging.
- No automatic pairing polling.
- No direct provider/debrid/indexer calls.

This milestone proves the product shape without getting stuck in Android packaging, device permissions, or media-stack deployment work.

## Self-Review

- Spec coverage: The plan covers the separate app boundary, media API contract, Comet/server-side requirement, remote navigation, playback, auth, packaging, and verification.
- Placeholder scan: No incomplete placeholder sections are intentionally left in this plan.
- Scope check: This is one app plan plus a server contract. If the server endpoints do not already exist, implement the server contract as a separate plan before integrating live playback.
- Risk check: The highest-risk areas are direct provider leakage, TV remote ergonomics, Fire TV codec/HLS behavior, and auth/device pairing. The plan adds explicit tests or verification for each.
