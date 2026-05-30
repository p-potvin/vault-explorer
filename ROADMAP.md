# Vault Explorer Roadmap

> [!NOTE]
> **Strategic Pivot: Transitioning towards a Unified Home Media Server**
> We are expanding Vault Explorer from a desktop media vault and local AI workstation into a hybrid, decentralized Home Media Server. Our objective is to bridge powerful local hardware AI workflows (Parakeet transcription, ESRGAN upscaling, custom search indexing) with frictionless, cross-platform streaming access across phones, TVs, and web browsers.

## 1. Vault Tab (Windows File Explorer)

- [x] Context menus (Open Folder, Remove Folder, Zip/Delete/Properties)
- [x] Paste-files and zip-selection IPC handlers
- [x] Popover menu for sorting
- [x] Keyboard shortcuts (F5, Ctrl+A/V, F2, Delete, Ctrl+N)
- [x] Properties modal (frontend)
- [ ] Implement missing backend IPC handler: `get-file-properties`
- [ ] Implement missing backend IPC handler: `get-folder-size-smart`
- [ ] Implement missing backend IPC handler: `schedule-idle-previews`
- [ ] FFMPEG idle timer (60s) in renderer for previews
- [ ] Arrow key grid navigation
- [ ] Escape key back navigation
- [ ] Clipboard notification pill (green upward fade)

## 2. Favorites Tab

- [ ] Fix virtual folder interaction bugs (path-based favorite toggling)
- [ ] Separate Tab Architecture: Decouple Library and Favorites into distinct tabs
- [ ] Ensure resumed media maintains exact state (stream, position, subs, language)

## 3. Streaming Tab

- [ ] Real-Debrid API Client integration for high-speed cloud streams
- [ ] Torrent selection logic audit for consistent streaming quality
- [ ] Unified Virtual Storage Model (merge local paths with active cloud torrent links)

## 4. Library Tab

- [ ] Metadata Scraper Agents (TMDB & TVDB APIs)
- [ ] Plex/Jellyfin/Kodi NFO Interoperability (read existing libraries without altering them)
- [ ] Dynamic TV/Movie Library Tabs with nested views (Seasons, Episodes)
- [ ] Enable bilingual TMDB metadata integration

## 5. Livestreams Tab

- [ ] Livestream translation integration
- [ ] Persistent mini-player "Picture-in-Picture" mode
- [ ] Strip response headers for embedded YouTube iframes
- [ ] Localize KinoCheck fallbacks for trailer playback
