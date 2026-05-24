# Vault Explorer Roadmap

> [!NOTE]
> **Strategic Pivot: Transitioning towards a Unified Home Media Server**
> We are expanding Vault Explorer from a desktop media vault and local AI workstation into a hybrid, decentralized Home Media Server. Our objective is to bridge powerful local hardware AI workflows (Whisper/NeMo transcription, ESRGAN upscaling, custom search indexing) with frictionless, cross-platform streaming access across phones, TVs, and web browsers.

---

## Milestone 1: Core Vault Modernization (COMPLETED)

- [x] **UI Styling & Theme Parity**: Standardized shadcn and Tailscale-inspired flat console-raised themes across Warm and Console configurations.
- [x] **Video Preview Pipeline**: Dynamic, multi-segment FFmpeg-based WebM preview generation (10x2s concat) with thumbnail integration.
- [x] **Diagnostic Telemetry**: Integrated the dynamic GPU ASR/Translation benchmark dashboard with live SVG waveform visualization.
- [x] **Localization**: Persistent English/Quebecois bilingual support across all panels and toast structures.

---

## Milestone 2: Transitioning to a Local Home Media Server (In Progress)

To make local library sharing as effortless as possible, we are building a lightweight embedded media streaming node directly within the application:

1. **Embedded HLS/DASH Streaming Server**:
   - Embed an lightweight Express-based streaming service running in the Electron background process.
   - On-the-fly dynamic transcoding using local FFmpeg instances to downscale and segment high-bitrate video streams into standard HLS streams for mobile and browser compatibility.
2. **Simplified Peer Authentication & Quick-Pair**:
   - Direct local network device pairing using a unique 6-digit PIN or generated QR Code.
   - Lightweight browser-based web player (`vault-web-client`) optimized for Safari iOS and Chrome Android, removing the need to install native apps.
3. **Database Model Upgrade (SQLite Integration)**:
   - Transition from the current in-memory JS array system to a persistent SQLite database using `better-sqlite3`.
   - Maintain tables for `media_items`, `watch_history`, `user_accounts`, and `indexing_metadata` to support multi-user playheads and resume status.

---

## Milestone 3: TV/Movie Scrapers & Plex/Jellyfin Plugin Interoperability

Making metadata rich, beautiful, and fully aligned with industry standard media centers:

1. **Metadata Scraper Agents (TMDB & TVDB)**:
   - Automated detection of standard show/movie naming conventions (e.g. `Show.S01E02.1080p`).
   - Scrape metadata from TheMovieDB (TMDB) and TVDB APIs to pull rich cover arts, backdrops, episode plot lines, and casting info.
2. **Plex/Jellyfin/Kodi NFO Interoperability**:
   - Parse and write `.nfo` XML files and standard directory poster tags (`poster.jpg`, `fanart.jpg`).
   - Allow Vault Explorer to read existing Plex/Jellyfin libraries without altering or corrupting existing directories.
3. **Dynamic TV/Movie Library Tabs**:
   - Add native TV Shows and Movies dashboard sections in Vault Explorer, allowing nested views (Seasons, Episodes) and dedicated library categories.

---

## Milestone 4: Hybrid Cloud Integration via Real-Debrid

Enabling serverless high-speed cloud streams alongside local home media collections:

1. **Real-Debrid API Client**:
   - Provide an integrated configurations tab to securely store user-provided Real-Debrid API keys.
   - Query cached torrent search indexes and directly stream high-speed unrestricted premium hoster links directly into the unified video player.
2. **Unified Virtual Storage Model**:
   - Merge local storage paths with active Real-Debrid cloud torrent links into a single, cohesive navigation interface.
   - Automatically offload AI resource tasks (like generating localized subtitle tracks or performing upscaling) by queuing cloud-cached links to local processing pipelines.
