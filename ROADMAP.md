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
- [x] Implement missing backend IPC handler: `get-file-properties`
- [x] Implement missing backend IPC handler: `get-folder-size-smart`
- [x] Implement missing backend IPC handler: `schedule-idle-previews`
- [x] FFMPEG idle timer (60s) in renderer for previews
- [x] Arrow key grid navigation
- [x] Escape key back navigation
- [x] Clipboard notification pill (green upward fade)
- [x] Add the ability to rename a video while it is playing. Also re-add the rename function in the context menu.
- [x] Add a way to generate subtitles while watching a video.
- [ ] Add an image viewer with zoom, crop, pan, resize, basic photo manipulation, gallery view, slideshow view.
- [ ] Add a minimal audio player (could fit in the bottom bar),a playlist system, a queue system with random shuffle, and loop.
- [ ] It should have a "playlist" view mode with 1 song per line showing name, artist, album, duration, etc. At the top left is top name of the playlist with an image (taken from an open API or local files),on the right we could toggle the audio visualizer. Think very much like apple music on windows.
- [ ] Add an "editing" view mode, for images only. Picture in the middle, toolbars at the top and bottom and other pictures on each side to allow quick switching between images or batch editing. Something different than the millions of photo viewer but still usable i suppose.
- [ ] Add ML-KEM PQC Encryption for any file type with the ability to decrypt in the video player, the photo viewer and the music player. Low priority for now.

## 1.5 Virtual Folders Transformation

- [x] Instead of having virtual folders, we should have 3 categories; Collections for videos, Playlists for music and Albums for photos. They cannot be mix and matched. We can still browse the Vault as usual but we also have the option of browsing our own custom "Folders"

## 2. Favorites Tab

- [x] Fix virtual folder interaction bugs (path-based favorite toggling)
- [x] Separate Tab Architecture: Decouple Library and Favorites into distinct tabs (favorites migrated to sub-nav capsule pill, library migrated under Streaming)
- [x] Ensure resumed media maintains exact state (stream, position, subs, language)
- [x] Add ability to remove movies and tv shows from Library
- [x] Add ability to download movies and tv shows to a Collection from the Library. With a dialog to choose which collection.
- [ ] Show the actual favorites videos, not the whole collection.
- [ ] Once this is done, lock the files in the tab. Unless the user clicks on the star button, no files should ever move from there. Virtual folders are disabled. Moving becomes copying, etc. No other new functionality is necessary unless it is also done in the Vault tab.
