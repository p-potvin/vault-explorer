/* ==========================================================================
   Vault Explorer — Photos tab (Library, People, Albums, Folders)
   Design contract (operator, Tue 10 Nov 2026):
     • Sidebar: Library, People, My Albums (window.vf type 'album'), Folders (under the photo folders)
     • Library by date taken (vault-raggae: EXIF, else the earlier file date): Years / Months / Days / All Photos
     • Square tiles or the river (masonry), size slider (Ctrl+wheel); crops, thumbnails, training sets left out
       unless "Show all"
     • People: the KFC identities (~45k), paged and searchable; Rename / Not this person filed for KFC
     • Covers: the user's picture, else a 2x2 collage, else an abstract cover with the name (as the Music tab)
     • Selection: click, Ctrl / Shift + click, Ctrl+A, box drag; a bar with every action; full keyboard
     • Info panel on demand (I); Live / Motion Photos loop silently on hover
     • The gateway down: the photo folders scanned here, file dates, no People, a note saying so
   Data: vault-raggae's /v1/photos/* and /v1/identities (src/ipc/photos.ipc.js); tiles from its /v1/img.
   ========================================================================== */

(function () {
    const GW = (window.electronAPI && window.electronAPI.raggaeUrl) || 'http://127.0.0.1:8750';   // RAGGAE_URL
    const PAGE = 300;
    const PEOPLE_PAGE = 120;
    const GALLERIES = [{ id: 'amd', label: 'Models' }, { id: 'gallery', label: 'Gallery' }, { id: 'celebrities', label: 'Celebrities' }];
    const IMG_SIZES = [96, 160, 240, 320, 480, 640, 960, 1280];
    const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'tiff', 'tif']);
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const S = {
        built: false,
        view: 'library',            // library | people | person | album | folder
        zoom: 'days',               // years | months | days | all
        yearFilter: null,
        before: null,               // library cursor to start from (a month picked in Months)
        items: [], next: null, loading: false, offline: false, error: null, gen: 0,
        periods: null,
        sel: new Set(), anchor: -1, focus: -1,
        infoOpen: false,
        people: [], peopleOffset: 0, peopleTotal: null, peopleQ: '', gallery: 'amd',
        person: null, album: null, folder: null,
        folders: null,
    };

    const api = () => window.electronAPI || {};
    const settings = () => (window.appSettings = window.appSettings || {});
    const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'));
    const baseName = (p) => (p || '').split(/[\\/]/).pop();
    const isPhoto = (p) => PHOTO_EXTS.has((p || '').split('.').pop().toLowerCase());

    function roots() {
        const s = settings();
        if (Array.isArray(s.photoRoots) && s.photoRoots.length) return s.photoRoots;
        return s.defaultFolderAlbums ? [s.defaultFolderAlbums] : [];
    }
    function layout() { return settings().photosLayout === 'river' ? 'river' : 'tiles'; }
    function tileSize() { return Math.max(90, Math.min(420, settings().photosTileSize || 180)); }
    function showAll() { return !!settings().photosShowAll; }
    function save() {
        if (api().saveSettings) api().saveSettings(window.appSettings);
    }

    function thumb(path, px) {
        if (S.offline || !path) return window.sanitizePath(path);
        const want = Math.round(px * (window.devicePixelRatio || 1));
        const w = IMG_SIZES.find(s => s >= want) || 1280;
        return `${GW}/v1/img?path=${encodeURIComponent(path)}&w=${w}`;
    }

    async function get(route, params) {
        if (!api().photosGet) return null;
        return api().photosGet(route, params);
    }

    // ── Shell ───────────────────────────────────────────────────────────────
    function build() {
        const root = document.getElementById('albums-container');
        if (!root || S.built) return root;
        S.built = true;
        root.innerHTML = `
        <div class="pl-shell">
          <aside class="pl-side" id="pl-side"></aside>
          <section class="pl-main">
            <div class="pl-toolbar">
              <div class="pl-title"><h2 id="pl-title">Library</h2><span id="pl-sub"></span></div>
              <div class="pl-seg" id="pl-zoom">
                ${['years', 'months', 'days', 'all'].map(z => `<button data-zoom="${z}">${{ years: 'Years', months: 'Months', days: 'Days', all: 'All Photos' }[z]}</button>`).join('')}
              </div>
              <span class="pl-spacer"></span>
              <input id="pl-search" class="pl-input" type="search" placeholder="Search people…" style="display:none">
              <select id="pl-gallery" class="pl-input" style="display:none">${GALLERIES.map(g => `<option value="${g.id}">${g.label}</option>`).join('')}</select>
              <label class="pl-check" title="Also show crops, thumbnails, training sets and renders"><input type="checkbox" id="pl-all"> Show all</label>
              <div class="pl-seg" id="pl-layout"><button data-layout="tiles" title="Square tiles">▦</button><button data-layout="river" title="River">▤</button></div>
              <input id="pl-size" type="range" min="90" max="420" step="10" title="Tile size (Ctrl + wheel)">
              <button class="pl-btn" id="pl-info-btn" title="Info (I)">ⓘ</button>
            </div>
            <div class="pl-progress" id="pl-progress"></div>
            <div class="pl-note" id="pl-note" style="display:none"></div>
            <div class="pl-body">
              <div class="pl-scroll" id="pl-scroll" tabindex="-1"><div id="pl-content"></div><div class="pl-box" id="pl-box"></div></div>
              <aside class="pl-info" id="pl-info"></aside>
            </div>
            <div class="pl-selbar" id="pl-selbar"></div>
          </section>
        </div>`;
        bindShell();
        return root;
    }

    function bindShell() {
        document.getElementById('pl-zoom').addEventListener('click', (e) => {
            const z = e.target.closest('[data-zoom]');
            if (!z) return;
            S.zoom = z.dataset.zoom;
            S.yearFilter = null;
            S.before = null;
            show('library');
        });
        document.getElementById('pl-layout').addEventListener('click', (e) => {
            const b = e.target.closest('[data-layout]');
            if (!b) return;
            settings().photosLayout = b.dataset.layout;
            save();
            renderContent();
        });
        const size = document.getElementById('pl-size');
        size.value = tileSize();
        size.addEventListener('input', () => setSize(+size.value));
        const all = document.getElementById('pl-all');
        all.checked = showAll();
        all.addEventListener('change', () => { settings().photosShowAll = all.checked; save(); reload(); });
        document.getElementById('pl-info-btn').addEventListener('click', toggleInfo);
        const search = document.getElementById('pl-search');
        let t = null;
        search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.peopleQ = search.value.trim(); loadPeople(true); }, 250); });
        document.getElementById('pl-gallery').addEventListener('change', (e) => { S.gallery = e.target.value; loadPeople(true); });

        const scroll = document.getElementById('pl-scroll');
        scroll.addEventListener('scroll', () => {
            if (scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 800) return;
            if (S.view === 'people') loadPeople(false);
            else if (['library', 'folder', 'person'].includes(S.view) && S.zoom !== 'years' && S.zoom !== 'months') loadMore();
        });
        scroll.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setSize(tileSize() + (e.deltaY < 0 ? 20 : -20));
        }, { passive: false });
        bindBoxSelect(scroll);
    }

    function setSize(px) {
        settings().photosTileSize = Math.max(90, Math.min(420, px));
        document.getElementById('pl-size').value = settings().photosTileSize;
        document.getElementById('pl-content').style.setProperty('--pl-size', `${settings().photosTileSize}px`);
        clearTimeout(setSize._t);
        setSize._t = setTimeout(save, 400);
    }

    // ── Sidebar ─────────────────────────────────────────────────────────────
    async function renderSide() {
        const side = document.getElementById('pl-side');
        if (!side) return;
        if (S.folders === null) {
            S.folders = api().photosFolders ? await api().photosFolders(roots()) : [];
        }
        const albums = window.vf ? window.vf.list({ type: 'album', parentId: null }) : [];
        const item = (key, label, count, cover, active) => `
            <div class="pl-side__item${active ? ' is-active' : ''}" data-key="${esc(key)}">
              <span class="pl-side__thumb">${cover || ''}</span><span class="pl-side__name">${esc(label)}</span>
              ${count !== null && count !== undefined ? `<span class="pl-side__count">${count}</span>` : ''}</div>`;
        const icon = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
        side.innerHTML = `
            <div class="pl-side__head">Photos</div>
            ${item('library', 'Library', null, icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'), S.view === 'library')}
            ${item('people', 'People', S.peopleTotal, icon('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M21 20c0-2.6-1.6-4.8-4-5.6"/>'), S.view === 'people' || S.view === 'person')}
            <div class="pl-side__head">My Albums <button class="pl-side__add" id="pl-new-album" title="New album">+</button></div>
            ${albums.map(a => item('album:' + a.id, a.name, window.vf.itemsOf(a.id).length,
                coverHtml('album:' + a.id, window.vf.itemsOf(a.id), a.name, false), S.view === 'album' && S.album && S.album.id === a.id)).join('') || '<div class="pl-side__empty">No albums yet</div>'}
            <div class="pl-side__head">Folders</div>
            ${(S.folders || []).map(f => item('folder:' + f.path, f.name, null, icon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
                S.view === 'folder' && S.folder === f.path)).join('') || `<div class="pl-side__empty">${roots().length ? 'No subfolders' : 'Choose a photo folder in Settings'}</div>`}`;
        side.querySelectorAll('.pl-side__item').forEach(d => {
            d.addEventListener('click', () => {
                const k = d.dataset.key;
                if (k === 'library') { S.zoom = S.zoom || 'days'; show('library'); }
                else if (k === 'people') show('people');
                else if (k.startsWith('album:')) { S.album = albums.find(a => a.id === k.slice(6)); show('album'); }
                else if (k.startsWith('folder:')) { S.folder = k.slice(7); show('folder'); }
            });
            if (d.dataset.key.startsWith('album:')) d.addEventListener('contextmenu', (e) => albumMenu(e, d.dataset.key.slice(6)));
        });
        const nb = document.getElementById('pl-new-album');
        if (nb) nb.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (window.createCustomPhotoAlbum) await window.createCustomPhotoAlbum(null, selectedPaths());
            renderSide();
        });
    }

    function albumMenu(ev, id) {
        ev.preventDefault();
        menu(ev, [
            ['Rename album', async () => { const a = window.vf.list({ type: 'album' }).find(x => x.id === id); if (a && window.renameCustomPhotoAlbum) await window.renameCustomPhotoAlbum(id, a.name); renderSide(); }],
            ['Choose cover…', () => pickCover('album:' + id)],
            ['Reset cover', () => { delete (settings().albumCovers || {})['album:' + id]; save(); renderSide(); }],
            ['Delete album', async () => { const a = window.vf.list({ type: 'album' }).find(x => x.id === id); if (a && window.deleteCustomPhotoAlbum) await window.deleteCustomPhotoAlbum(id, a.name); if (S.album && S.album.id === id) show('library'); else renderSide(); }, true],
        ]);
    }

    function pickCover(key) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', () => {
            const f = input.files && input.files[0];
            if (!f || !f.path) return;
            settings().albumCovers = settings().albumCovers || {};
            settings().albumCovers[key] = f.path;
            save();
            renderSide();
            if (S.view === 'album') renderContent();
        });
        input.click();
    }

    // ── Covers (the Music tab's rules) ───────────────────────────────────────
    function hashOf(text) {
        let h = 2166136261;
        for (const ch of text || '') { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function coverHtml(key, paths, name, withName) {
        const own = (settings().albumCovers || {})[key];
        const pics = own ? [own] : (paths || []).filter(isPhoto);
        const img = (p, px) => `<img src="${esc(thumb(p, px))}" alt="" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'">`;
        if (!own && pics.length >= 4) return `<span class="pl-cover pl-cover--collage">${pics.slice(0, 4).map(p => img(p, 120)).join('')}</span>`;
        if (pics.length) return `<span class="pl-cover">${img(pics[0], 240)}</span>`;
        const hue = hashOf(name) % 360;
        return `<span class="pl-cover pl-cover--abstract" style="background:linear-gradient(180deg,hsl(${hue},45%,22%),hsl(${(hue + 25) % 360},55%,62%) 75%,hsl(${(hue + 50) % 360},60%,86%))">${withName ? `<b>${esc(name)}</b>` : ''}</span>`;
    }

    // ── Views ───────────────────────────────────────────────────────────────
    function show(view) {
        S.view = view;
        S.sel.clear();
        S.focus = -1;
        S.anchor = -1;
        renderSelBar();             // the selection belonged to the view being left
        renderSide();
        reload();
    }

    function reload() {
        S.gen++;
        S.loading = false;          // a request still in flight belongs to the old view: its answer is dropped (gen)
        S.items = [];
        S.next = null;
        S.error = null;
        S.periods = null;
        const scroll = document.getElementById('pl-scroll');
        if (scroll) scroll.scrollTop = 0;
        chrome();
        if (S.view === 'people') { loadPeople(true); return; }
        if (S.view === 'album') { loadAlbum(); return; }
        if ((S.view === 'library' || S.view === 'folder') && (S.zoom === 'years' || S.zoom === 'months')) { loadPeriods(); return; }
        loadMore();
    }

    function chrome() {
        const title = document.getElementById('pl-title');
        const sub = document.getElementById('pl-sub');
        const zoom = document.getElementById('pl-zoom');
        const libLike = S.view === 'library' || S.view === 'folder';
        zoom.style.display = libLike ? '' : 'none';
        zoom.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b.dataset.zoom === S.zoom));
        document.getElementById('pl-search').style.display = S.view === 'people' ? '' : 'none';
        document.getElementById('pl-gallery').style.display = S.view === 'people' ? '' : 'none';
        document.getElementById('pl-gallery').value = S.gallery;
        document.getElementById('pl-layout').querySelectorAll('button').forEach(b => b.classList.toggle('is-on', b.dataset.layout === layout()));
        title.textContent = S.view === 'people' ? 'People' : S.view === 'person' ? (S.person && S.person.name) || 'Person'
            : S.view === 'album' ? (S.album && S.album.name) || 'Album' : S.view === 'folder' ? baseName(S.folder) : 'Library';
        sub.textContent = '';
        if (S.view === 'person') sub.innerHTML = `<button class="pl-link" id="pl-back-people">‹ People</button> <button class="pl-link" id="pl-rename">Rename…</button>`;
        const back = document.getElementById('pl-back-people');
        if (back) back.onclick = () => show('people');
        const ren = document.getElementById('pl-rename');
        if (ren) ren.onclick = renamePerson;
        note();
    }

    function note() {
        const n = document.getElementById('pl-note');
        let text = '';
        if (S.offline) text = 'Catalog offline: photos from the folders on disk, by file date; People unavailable.';
        else if (S.error) text = S.error;
        else if (!roots().length && S.view === 'library') text = 'Choose your photo folders in Settings (Photo Albums folder).';
        n.textContent = text;
        n.style.display = text ? '' : 'none';
    }

    function progress(on) {
        const p = document.getElementById('pl-progress');
        if (p) p.classList.toggle('is-on', !!on);
    }

    // Library / folder / person pages
    async function loadMore() {
        if (S.loading || (S.items.length && !S.next)) return;
        S.loading = true;
        progress(true);
        const gen = S.gen;
        let res;
        if (S.view === 'person') {
            res = await get(`/v1/photos/person/${S.person.gallery}/${S.person.id}`, { limit: PAGE, offset: S.items.length });
            if (res && res.items) res.next = S.items.length + res.items.length < (res.total || 0) ? 'more' : null;
        } else {
            const r = S.view === 'folder' ? [S.folder] : roots();
            const before = S.next || S.before || undefined;
            res = r.length ? await get('/v1/photos/library', { roots: r.join(';'), all: showAll() ? 1 : '', before, limit: PAGE }) : { items: [] };
        }
        // clear the flag first: a page answered after the view changed must not leave the next view waiting on it
        S.loading = false;
        progress(false);
        if (gen !== S.gen) return;
        if (res === null) { offline(); return; }
        if (res.error) {
            S.error = res.status === 503 ? 'The photos\' dates are not read yet in vault-raggae (python -m app.photos exif --execute).' : `Could not load photos (${res.error}).`;
            note();
            renderContent();
            return;
        }
        S.offline = false;
        S.items.push(...res.items.map(toItem));
        S.next = res.next || null;
        note();
        renderContent(true);
    }

    function toItem(r) {
        return { ...r, name: baseName(r.path), type: 'image' };
    }

    function offline() {
        S.offline = true;
        const r = (S.view === 'folder' ? [S.folder] : roots()).map(x => x.toLowerCase().replace(/\//g, '\\'));
        const all = (window.allItems || []).filter(i => i && (i.type === 'image' || isPhoto(i.path)) &&
            (!r.length || r.some(x => (i.path || '').toLowerCase().startsWith(x))));
        const fileDate = (mt) => {
            const d = mt ? new Date(mt > 1e12 ? mt : mt * 1000) : null;
            return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 19) : '';       // a bad mtime: undated
        };
        S.items = all.map(i => ({ ...i, taken: fileDate(i.mtime), taken_from: 'file' }))
            .sort((a, b) => (a.taken < b.taken ? 1 : -1));
        S.next = null;
        S.loading = false;
        progress(false);
        chrome();
        renderContent();
    }

    async function loadPeriods() {
        progress(true);
        const gen = S.gen;
        const r = S.view === 'folder' ? [S.folder] : roots();
        const res = await get('/v1/photos/timeline', { roots: r.join(';'), all: showAll() ? 1 : '', by: S.zoom === 'years' ? 'year' : 'month' });
        if (gen !== S.gen) return;
        progress(false);
        if (res === null) { offline(); return; }
        S.periods = (res.periods || []).filter(p => !S.yearFilter || p.period.startsWith(S.yearFilter));
        renderContent();
    }

    async function loadPeople(reset) {
        if (reset) { S.people = []; S.peopleOffset = 0; S.peopleTotal = null; S.gen++; }
        if (S.loading || (S.peopleTotal !== null && S.people.length >= S.peopleTotal)) return;
        S.loading = true;
        progress(true);
        const gen = S.gen;
        const res = await get('/v1/identities', { gallery: S.gallery, q: S.peopleQ, limit: PEOPLE_PAGE, offset: S.people.length, count: 1, sort: 'crops' });
        S.loading = false;
        progress(false);
        if (gen !== S.gen) return;
        if (res === null || res.error) {
            S.offline = res === null;
            S.error = res && res.error ? `People unavailable (${res.error}).` : null;
            note();
            document.getElementById('pl-content').innerHTML = '<div class="pl-empty">People need the catalog (vault-raggae).</div>';
            return;
        }
        S.offline = false;
        S.people.push(...res.items);
        S.peopleTotal = res.count ?? S.people.length;
        renderContent(!reset);
    }

    function loadAlbum() {
        const paths = window.vf ? window.vf.itemsOf(S.album.id) : [];
        S.items = paths.map(p => ({ path: p, name: baseName(p), type: 'image' }));
        S.next = null;
        renderContent();
    }

    // ── Content ─────────────────────────────────────────────────────────────
    function renderContent(append) {
        const c = document.getElementById('pl-content');
        if (!c) return;
        c.style.setProperty('--pl-size', `${tileSize()}px`);
        c.className = `pl-content pl-content--${layout()}`;
        if (S.view === 'people') { renderPeople(c, append); return; }
        if ((S.view === 'library' || S.view === 'folder') && (S.zoom === 'years' || S.zoom === 'months')) { renderPeriods(c); return; }
        if (!S.items.length) {
            c.innerHTML = S.loading ? skeleton() : `<div class="pl-empty">${S.view === 'album' ? 'This album is empty. Select photos and use “Add to album”.' : 'No photos here.'}</div>`;
            return;
        }
        // grouped by day (Days, person, folder) or one block (All Photos, album)
        const byDay = S.view !== 'album' && S.zoom !== 'all';
        const start = append ? c.querySelectorAll('.pl-tile').length : 0;
        if (!append || start === 0) c.innerHTML = '';
        let section = c.lastElementChild && c.lastElementChild.classList.contains('pl-section') ? c.lastElementChild : null;
        let lastDay = section ? section.dataset.day : null;
        for (let i = start; i < S.items.length; i++) {
            const it = S.items[i];
            const day = byDay ? (it.taken || '').slice(0, 10) : 'all';
            if (!section || day !== lastDay) {
                section = document.createElement('div');
                section.className = 'pl-section';
                section.dataset.day = day;
                if (byDay) section.innerHTML = `<div class="pl-day">${esc(dayLabel(day))}</div>`;
                const grid = document.createElement('div');
                grid.className = 'pl-grid';
                section.appendChild(grid);
                c.appendChild(section);
                lastDay = day;
            }
            section.lastElementChild.appendChild(tile(it, i));
        }
        paintSelection();
    }

    function skeleton() {
        return `<div class="pl-grid">${'<div class="pl-tile pl-tile--skel"></div>'.repeat(24)}</div>`;
    }

    function dayLabel(day) {
        if (!day || day.length < 10) return 'Undated';
        const d = new Date(day + 'T12:00:00');
        return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function tile(it, i) {
        const d = document.createElement('div');
        d.className = 'pl-tile' + (it.live ? ' pl-tile--live' : '');
        d.dataset.i = i;
        if (layout() === 'river' && it.width && it.height) d.style.aspectRatio = `${it.width} / ${it.height}`;
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;
        img.alt = '';
        img.src = thumb(it.path, tileSize());
        img.onload = () => d.classList.add('is-loaded');
        img.onerror = () => { if (!img.dataset.fallback) { img.dataset.fallback = 1; img.src = window.sanitizePath(it.path); } else d.classList.add('is-broken'); };
        d.appendChild(img);
        if (it.live) {
            const badge = document.createElement('span');
            badge.className = 'pl-live';
            badge.textContent = 'LIVE';
            d.appendChild(badge);
            d.addEventListener('mouseenter', () => {
                const v = document.createElement('video');
                v.className = 'pl-live-video';
                v.src = window.sanitizePath(it.live);
                v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.controls = false;
                d.appendChild(v);
            });
            d.addEventListener('mouseleave', () => d.querySelectorAll('video').forEach(v => { v.pause(); v.remove(); }));
        }
        if (S.view === 'person' && it.crop_id) {
            const x = document.createElement('button');
            x.className = 'pl-tile__x';
            x.title = `Not ${S.person.name}`;
            x.textContent = '✕';
            x.addEventListener('click', (e) => { e.stopPropagation(); notThisPerson(S.person, it.crop_id, i); });
            d.appendChild(x);
        }
        if (S.view === 'album') {
            const x = document.createElement('button');
            x.className = 'pl-tile__x';
            x.title = 'Remove from album';
            x.textContent = '✕';
            x.addEventListener('click', (e) => { e.stopPropagation(); window.vf.removeItems(S.album.id, [it.path]); loadAlbum(); renderSide(); });
            d.appendChild(x);
        }
        const fav = isFav(it.path);
        if (fav) { const f = document.createElement('span'); f.className = 'pl-fav'; f.textContent = '★'; d.appendChild(f); }
        d.addEventListener('mousedown', (e) => { if (e.button === 0) e.stopPropagation(); });
        d.addEventListener('click', (e) => clickTile(e, i));
        d.addEventListener('dblclick', () => openViewer(i));
        d.addEventListener('contextmenu', (e) => { if (!S.sel.has(i)) select(i, false, false); tileMenu(e); });
        return d;
    }

    function renderPeriods(c) {
        const ps = S.periods;
        if (!ps) { c.innerHTML = skeleton(); return; }
        if (!ps.length) { c.innerHTML = '<div class="pl-empty">No photos here.</div>'; return; }
        c.className = 'pl-content pl-content--periods';
        c.innerHTML = (S.yearFilter ? `<button class="pl-link pl-crumb" id="pl-all-years">‹ All years</button>` : '') +
            `<div class="pl-periods">${ps.map(p => `
            <div class="pl-period" data-period="${esc(p.period)}">
              ${coverHtml('period:' + p.period, p.cover, p.period, false)}
              <div class="pl-period__label">${esc(periodLabel(p.period))}</div><div class="pl-period__count">${p.count.toLocaleString()} photos</div>
            </div>`).join('')}</div>`;
        c.querySelectorAll('.pl-period').forEach(el => el.addEventListener('click', () => {
            const p = el.dataset.period;
            if (S.zoom === 'years') { S.zoom = 'months'; S.yearFilter = p; }
            else { S.zoom = 'days'; S.before = monthEnd(p) + '|'; }
            reload();
        }));
        const back = document.getElementById('pl-all-years');
        if (back) back.onclick = () => { S.zoom = 'years'; S.yearFilter = null; reload(); };
    }

    function periodLabel(p) {
        if (p.length === 4) return p;
        const [y, m] = p.split('-');
        return `${MONTHS[(+m || 1) - 1]} ${y}`;
    }
    function monthEnd(p) {
        const [y, m = 12] = p.split('-').map(Number);      // a year alone: its end
        const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
        return `${ny}-${String(nm).padStart(2, '0')}-01T00:00:00`;
    }

    function renderPeople(c, append) {
        c.className = 'pl-content pl-content--people';
        if (!append) c.innerHTML = `<div class="pl-people"></div>`;
        const grid = c.querySelector('.pl-people');
        if (!grid) return;
        const start = grid.children.length;
        for (let i = start; i < S.people.length; i++) {
            const p = S.people[i];
            const d = document.createElement('div');
            d.className = 'pl-person';
            d.innerHTML = `<span class="pl-person__face">${p.cover ? `<img src="${esc(thumb(p.cover, 160))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}</span>
                <span class="pl-person__name" title="${esc(p.name)}">${esc(p.name)}</span><span class="pl-person__count">${(p.sample_count || 0).toLocaleString()}</span>`;
            d.addEventListener('click', () => { S.person = { gallery: S.gallery, id: p.id, name: p.name }; show('person'); });
            grid.appendChild(d);
        }
        if (!S.people.length && !S.loading) grid.innerHTML = '<div class="pl-empty">Nobody matches.</div>';
        const side = document.querySelector('.pl-side__item[data-key="people"] .pl-side__count');
        if (side && S.peopleTotal !== null) side.textContent = S.peopleTotal.toLocaleString();
    }

    // ── Selection ───────────────────────────────────────────────────────────
    function isFav(p) {
        return typeof window.isFavorite === 'function' ? window.isFavorite(p) : false;
    }
    function selectedPaths() { return [...S.sel].sort((a, b) => a - b).map(i => S.items[i] && S.items[i].path).filter(Boolean); }

    function clickTile(e, i) {
        select(i, e.ctrlKey || e.metaKey, e.shiftKey);
    }

    function select(i, toggle, range) {
        if (range && S.anchor >= 0) {
            if (!toggle) S.sel.clear();
            const [a, b] = [Math.min(S.anchor, i), Math.max(S.anchor, i)];
            for (let k = a; k <= b; k++) S.sel.add(k);
        } else if (toggle) {
            if (S.sel.has(i)) S.sel.delete(i); else S.sel.add(i);
            S.anchor = i;
        } else {
            S.sel.clear();
            S.sel.add(i);
            S.anchor = i;
        }
        S.focus = i;
        paintSelection();
        if (S.infoOpen) renderInfo();
    }

    function paintSelection() {
        document.querySelectorAll('#pl-content .pl-tile').forEach(t => {
            const i = +t.dataset.i;
            t.classList.toggle('is-selected', S.sel.has(i));
            t.classList.toggle('is-focus', i === S.focus);
        });
        renderSelBar();
    }

    function bindBoxSelect(scroll) {
        const box = document.getElementById('pl-box');
        let start = null, base = null;
        // window listeners only while a box is being drawn (Gemini on #70)
        const onUp = () => {
            start = null;
            box.style.display = 'none';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        scroll.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('.pl-tile, .pl-period, .pl-person, button, input')) return;
            const r = scroll.getBoundingClientRect();
            start = { x: e.clientX - r.left + scroll.scrollLeft, y: e.clientY - r.top + scroll.scrollTop };
            base = (e.ctrlKey || e.shiftKey) ? new Set(S.sel) : new Set();
            if (!e.ctrlKey && !e.shiftKey) { S.sel.clear(); paintSelection(); }
            e.preventDefault();
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
        function onMove(e) {
            if (!start) return;
            const r = scroll.getBoundingClientRect();
            const cur = { x: e.clientX - r.left + scroll.scrollLeft, y: e.clientY - r.top + scroll.scrollTop };
            const x1 = Math.min(start.x, cur.x), y1 = Math.min(start.y, cur.y), x2 = Math.max(start.x, cur.x), y2 = Math.max(start.y, cur.y);
            Object.assign(box.style, { display: 'block', left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
            S.sel = new Set(base);
            document.querySelectorAll('#pl-content .pl-tile').forEach(t => {
                const tr = t.getBoundingClientRect();
                const tx1 = tr.left - r.left + scroll.scrollLeft, ty1 = tr.top - r.top + scroll.scrollTop;
                if (tx1 < x2 && tx1 + tr.width > x1 && ty1 < y2 && ty1 + tr.height > y1) S.sel.add(+t.dataset.i);
            });
            paintSelection();
        }
    }

    // ── Actions ─────────────────────────────────────────────────────────────
    const ACTIONS = [
        { id: 'album', label: 'Add to album', key: '', run: (e) => addToAlbumMenu(e) },
        { id: 'fav', label: 'Favorite', key: 'F', run: () => favorite() },
        { id: 'edit', label: 'Edit', key: 'E', run: () => edit() },
        { id: 'upscale', label: 'Upscale', key: '', run: () => upscale() },
        { id: 'info', label: 'Info / People', key: 'I', run: () => toggleInfo() },
        { id: 'folder', label: 'Show in folder', key: '', run: () => showInFolder() },
        { id: 'delete', label: 'Delete', key: 'Del', run: () => del(), danger: true },
    ];

    function renderSelBar() {
        const bar = document.getElementById('pl-selbar');
        if (!bar) return;
        const n = S.sel.size;
        bar.classList.toggle('is-on', n > 0);
        if (!n) { bar.innerHTML = ''; return; }
        bar.innerHTML = `<span class="pl-selbar__n">${n} selected</span>` + ACTIONS.map(a =>
            `<button class="pl-btn${a.danger ? ' pl-btn--danger' : ''}" data-act="${a.id}" title="${esc(a.label)}${a.key ? ` (${a.key})` : ''}">${esc(a.label)}</button>`).join('') +
            `<button class="pl-btn" data-act="clear" title="Clear selection (Esc)">✕</button>`;
        bar.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', (e) => {
            if (b.dataset.act === 'clear') { S.sel.clear(); paintSelection(); return; }
            ACTIONS.find(a => a.id === b.dataset.act).run(e);
        }));
    }

    function selItems() { return [...S.sel].sort((a, b) => a - b).map(i => S.items[i]).filter(Boolean); }

    function favorite() {
        const items = selItems();
        if (typeof window.toggleFavorite !== 'function') return;
        const anyOff = items.some(it => !isFav(it.path));
        // all on when any is off, else all off (one toast for the batch)
        items.forEach(it => { if (isFav(it.path) !== anyOff) window.toggleFavorite(it.path, null, true); });
        if (window.showToast) window.showToast(`${anyOff ? 'Added to' : 'Removed from'} Favorites: ${items.length}`, 'info');
        renderContent();
    }
    function edit() {
        const it = selItems()[0];
        if (it && window.openPhotoEditor) window.openPhotoEditor(it, S.items);
    }
    async function upscale() {
        const items = selItems();
        if (!api().enhanceImageRealESRGAN) return;
        if (window.showToast) window.showToast(`Upscaling ${items.length} photo${items.length > 1 ? 's' : ''}…`, 'info');
        for (const it of items) await api().enhanceImageRealESRGAN(it.path);
        if (window.showToast) window.showToast('Upscale done', 'success');
    }
    function showInFolder() {
        const it = selItems()[0];
        if (it && api().showInFolder) api().showInFolder(it.path);
    }
    async function del() {
        const items = selItems();
        if (!items.length || !api().deleteItem) return;
        const ok = window.showConfirmDialog
            ? await window.showConfirmDialog(`Send ${items.length} photo${items.length > 1 ? 's' : ''} to the Recycle Bin?`, 'Delete')
            : confirm(`Send ${items.length} photo(s) to the Recycle Bin?`);
        if (!ok) return;
        // a few at a time: each one is a vault-raggae ops call (Gemini on #70 asked for parallel; unbounded would
        // start hundreds of processes for a big selection)
        for (let i = 0; i < items.length; i += 4) {
            await Promise.all(items.slice(i, i + 4).map(it => api().deleteItem(it.path)));
        }
        const gone = new Set(items.map(i => i.path));
        S.items = S.items.filter(i => !gone.has(i.path));
        S.sel.clear();
        renderContent();
    }

    function addToAlbumMenu(e) {
        const paths = selectedPaths();
        const albums = window.vf ? window.vf.list({ type: 'album', parentId: null }) : [];
        menu(e, [
            ...albums.map(a => [a.name, () => { window.vf.addItems(a.id, paths); if (window.showToast) window.showToast(`Added ${paths.length} to "${a.name}"`, 'success'); renderSide(); }]),
            ['+ New album…', async () => { if (window.createCustomPhotoAlbum) await window.createCustomPhotoAlbum(null, paths); renderSide(); }],
        ]);
    }

    function tileMenu(e) {
        e.preventDefault();
        menu(e, [
            ['Open', () => openViewer(S.focus)],
            ...ACTIONS.filter(a => a.id !== 'album').map(a => [a.label, () => a.run(e), a.danger]),
            ['Add to album…', () => addToAlbumMenu(e)],
        ]);
    }

    function menu(ev, rows) {
        document.querySelectorAll('.pl-menu').forEach(m => m.remove());
        const m = document.createElement('div');
        m.className = 'pl-menu';
        m.style.left = `${Math.min(ev.clientX, window.innerWidth - 220)}px`;
        m.style.top = `${Math.min(ev.clientY, window.innerHeight - rows.length * 30 - 16)}px`;
        // one close handler, removed whichever way the menu goes (a pick used to leave it on the document)
        const close = (e2) => {
            if (e2 && m.contains(e2.target)) return;
            m.remove();
            document.removeEventListener('mousedown', close);
        };
        rows.forEach(([label, cb, danger]) => {
            const r = document.createElement('div');
            r.className = 'pl-menu__item' + (danger ? ' is-danger' : '');
            r.textContent = label;
            r.addEventListener('click', () => { close(); cb(); });
            m.appendChild(r);
        });
        document.body.appendChild(m);
        setTimeout(() => document.addEventListener('mousedown', close), 0);
    }

    function openViewer(i) {
        if (i < 0 || !S.items[i]) return;
        if (window.openImageViewer) window.openImageViewer(i, S.items);
    }

    // ── People quick fixes (filed for ColONEL-KFC through the gateway, audited) ──
    async function renamePerson() {
        const p = S.person;
        if (!p) return;
        const name = window.showPromptDialog ? await window.showPromptDialog(`Rename ${p.name}:`, p.name, 'New name') : prompt('New name', p.name);
        if (!name || name.trim() === p.name) return;
        const res = await api().photosRequest(p.gallery, p.id, { op: 'rename', name: name.trim() });
        if (window.showToast) window.showToast(res && !res.error ? `Rename to "${name.trim()}" sent to KFC` : `Rename failed: ${res && res.error}`, res && !res.error ? 'success' : 'error');
    }
    async function notThisPerson(p, cropId, i) {
        const res = await api().photosRequest(p.gallery, p.id, { op: 'remove_crop', crop_id: cropId });
        if (res && !res.error) {
            if (window.showToast) window.showToast(`Sent to KFC: not ${p.name}`, 'success');
            if (i !== undefined && S.view === 'person') { S.items.splice(i, 1); renderContent(); }
            if (S.infoOpen) renderInfo();
        } else if (window.showToast) window.showToast(`Could not file it: ${res && res.error}`, 'error');
    }

    // ── Info panel ──────────────────────────────────────────────────────────
    function toggleInfo() {
        S.infoOpen = !S.infoOpen;
        document.getElementById('pl-info').classList.toggle('is-open', S.infoOpen);
        document.getElementById('pl-info-btn').classList.toggle('is-on', S.infoOpen);
        if (S.infoOpen) renderInfo();
    }

    async function renderInfo() {
        const box = document.getElementById('pl-info');
        const it = S.items[S.focus];
        if (!box) return;
        if (!it) { box.innerHTML = '<div class="pl-info__empty">Select a photo to see its details.</div>'; return; }
        box.innerHTML = `<div class="pl-info__name">${esc(it.name)}</div><div class="pl-info__empty">Loading…</div>`;
        let d = it;
        if (it.vw_id && !S.offline) {
            const r = await get(`/v1/photos/${it.vw_id}`);
            if (r && !r.error) d = { ...it, ...r };
        }
        if (S.items[S.focus] !== it) return;
        const row = (k, v) => (v || v === 0) ? `<div class="pl-info__row"><span>${k}</span><b>${esc(v)}</b></div>` : '';
        const cam = [d.make, d.model].filter(Boolean).join(' ');
        const shot = [d.fnumber && `ƒ/${d.fnumber}`, d.exposure && `${d.exposure} s`, d.focal && `${Math.round(d.focal)} mm`, d.iso && `ISO ${d.iso}`].filter(Boolean).join(' · ');
        const taken = d.taken ? new Date(d.taken).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }) : '';
        const people = (d.people || []).map(p => `
            <div class="pl-info__person"><span>${esc(p.name || `#${p.identity_id}`)}</span>
            ${p.identity_id ? `<button class="pl-link" data-g="${esc(p.gallery)}" data-id="${p.identity_id}" data-crop="${p.crop_id}" data-name="${esc(p.name || '')}">Not this person</button>` : ''}</div>`).join('');
        box.innerHTML = `
            <div class="pl-info__name">${esc(d.name)}</div>
            ${row('Taken', taken + (d.taken_from === 'file' ? ' (file date)' : ''))}
            ${row('Camera', cam)}${row('Lens', d.lens)}${row('Exposure', shot)}
            ${row('Size', d.width && d.height ? `${d.width} × ${d.height}` + (d.file_size ? ` · ${window.formatBytes ? window.formatBytes(d.file_size) : d.file_size}` : '') : '')}
            ${row('Place', d.lat !== undefined && d.lat !== null ? `${(+d.lat).toFixed(4)}, ${(+d.lon).toFixed(4)}` : '')}
            ${row('Live Photo', d.live ? baseName(d.live) : '')}
            ${row('Folder', (d.path || '').replace(/[\\/][^\\/]*$/, ''))}
            <div class="pl-info__head">People</div>${people || '<div class="pl-info__empty">Nobody recognised.</div>'}`;
        box.querySelectorAll('[data-crop]').forEach(b => b.addEventListener('click', () =>
            notThisPerson({ gallery: b.dataset.g, id: +b.dataset.id, name: b.dataset.name || 'this person' }, +b.dataset.crop)));
    }

    // ── Keyboard ────────────────────────────────────────────────────────────
    function columns() {
        const tiles = [...document.querySelectorAll('#pl-content .pl-tile')];
        if (tiles.length < 2) return 1;
        const top = tiles[0].getBoundingClientRect().top;
        const n = tiles.findIndex(t => t.getBoundingClientRect().top !== top);
        return n > 0 ? n : tiles.length;
    }

    document.addEventListener('keydown', (e) => {
        const c = document.getElementById('albums-container');
        if (!c || c.style.display === 'none' || !S.built) return;
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        // the viewer / editor owns the keys while it is open (its hidden modal's style says "flex-direction": test the
        // display itself, not the style text)
        const open = (id) => { const m = document.getElementById(id); return m && getComputedStyle(m).display !== 'none'; };
        if (open('image-viewer-modal') || open('photo-editor-modal')) return;
        const n = S.items.length;
        const k = e.key;
        const move = (to) => {
            if (!n) return;
            to = Math.max(0, Math.min(n - 1, to));
            select(to, false, e.shiftKey);
            const t = document.querySelector(`#pl-content .pl-tile[data-i="${to}"]`);
            if (t) t.scrollIntoView({ block: 'nearest' });
        };
        if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); S.items.forEach((_, i) => S.sel.add(i)); paintSelection(); return; }
        if (k === 'ArrowRight') { e.preventDefault(); move(S.focus + 1); }
        else if (k === 'ArrowLeft') { e.preventDefault(); move(S.focus - 1); }
        else if (k === 'ArrowDown') { e.preventDefault(); move(S.focus + columns()); }
        else if (k === 'ArrowUp') { e.preventDefault(); move(S.focus - columns()); }
        else if (k === 'Enter' || k === ' ') { if (S.focus >= 0) { e.preventDefault(); openViewer(S.focus); } }
        else if (k === 'Escape') { if (S.sel.size) { S.sel.clear(); paintSelection(); } else if (S.view === 'person') show('people'); }
        else if (k === 'Delete') { if (S.sel.size) del(); }
        else if (k.toLowerCase() === 'f' && S.sel.size) favorite();
        else if (k.toLowerCase() === 'e' && S.sel.size) edit();
        else if (k.toLowerCase() === 'i') toggleInfo();
        else if (k === '+' || k === '=') setSize(tileSize() + 20);
        else if (k === '-') setSize(tileSize() - 20);
    });

    // ── Styles (console mode tokens; quick motion, none with reduced motion) ──
    function injectStyles() {
        if (document.getElementById('pl-styles')) return;
        const st = document.createElement('style');
        st.id = 'pl-styles';
        st.textContent = `
        #albums-container { padding: 0 !important; overflow: hidden !important; }
        .pl-shell { display: flex; width: 100%; height: 100%; }
        .pl-side { flex: 0 0 230px; border-right: 1px solid var(--vault-border); padding: 14px 10px; overflow-y: auto; box-sizing: border-box; }
        .pl-side__head { display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; text-transform: uppercase;
            letter-spacing: .05em; font-weight: 700; color: var(--vault-slate); font-family: var(--font-mono); margin: 14px 6px 6px; }
        .pl-side__head:first-child { margin-top: 0; }
        .pl-side__add { background: transparent; border: 1px solid var(--vault-border); color: var(--vault-accent); border-radius: 3px; width: 18px; height: 18px; cursor: pointer; line-height: 1; padding: 0; }
        .pl-side__item { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; color: var(--vault-text); user-select: none; }
        .pl-side__item:hover { background: var(--vault-hover, rgba(255,255,255,.05)); }
        .pl-side__item.is-active { background: var(--vault-accent); color: var(--vt-primary, #0b0813); font-weight: 600; }
        .pl-side__thumb { width: 24px; height: 24px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 3px; overflow: hidden; }
        .pl-side__name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pl-side__count { font-size: 10px; font-family: var(--font-mono); opacity: .7; }
        .pl-side__empty { font-size: 11px; color: var(--vault-slate); padding: 4px 8px; }
        .pl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
        .pl-toolbar { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--vault-border); flex-wrap: wrap; }
        .pl-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
        .pl-title h2 { margin: 0; font-size: 20px; font-family: var(--font-sans); color: var(--vault-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
        .pl-spacer { flex: 1; }
        .pl-seg { display: inline-flex; border: 1px solid var(--vault-border); border-radius: 5px; overflow: hidden; }
        .pl-seg button { background: transparent; border: none; color: var(--vault-slate); padding: 5px 11px; font-size: 11px; font-family: var(--font-mono); cursor: pointer; }
        .pl-seg button.is-on { background: rgba(176,124,255,.18); color: var(--vault-accent); }
        .pl-input { background: rgba(0,0,0,.3); border: 1px solid var(--vault-border); border-radius: 4px; padding: 5px 10px; font-size: 12px; color: var(--vault-text); }
        .pl-check { font-size: 11px; color: var(--vault-slate); font-family: var(--font-mono); display: flex; gap: 5px; align-items: center; cursor: pointer; }
        #pl-size { width: 110px; accent-color: var(--vault-accent); }
        .pl-btn { background: rgba(255,255,255,.06); border: 1px solid var(--vault-border); color: var(--vault-text); padding: 5px 10px; border-radius: 4px; font-size: 11.5px; cursor: pointer; font-family: var(--font-body); }
        .pl-btn:hover, .pl-btn.is-on { border-color: var(--vault-accent); color: var(--vault-accent); }
        .pl-btn--danger:hover { border-color: var(--vault-danger, #ff4d4f); color: var(--vault-danger, #ff4d4f); }
        .pl-link { background: none; border: none; color: var(--vault-accent); cursor: pointer; font-size: 12px; padding: 0; }
        .pl-progress { height: 2px; background: transparent; position: relative; overflow: hidden; }
        .pl-progress.is-on::after { content: ''; position: absolute; inset: 0; width: 30%; background: var(--vault-accent); animation: pl-run 1s linear infinite; }
        @keyframes pl-run { from { transform: translateX(-100%); } to { transform: translateX(350%); } }
        .pl-note { font-size: 11.5px; color: var(--vault-gold, #F0B94B); padding: 6px 18px; font-family: var(--font-mono); border-bottom: 1px solid var(--vault-border); }
        .pl-body { flex: 1; display: flex; min-height: 0; }
        .pl-scroll { flex: 1; overflow-y: auto; position: relative; padding: 10px 18px 80px; outline: none; user-select: none; }
        .pl-box { position: absolute; display: none; border: 1px solid var(--vault-accent); background: rgba(176,124,255,.12); pointer-events: none; z-index: 4; }
        .pl-section { margin-bottom: 14px; }
        .pl-day { font-size: 13px; font-weight: 600; color: var(--vault-text); margin: 10px 2px 8px; font-family: var(--font-sans); }
        .pl-content--tiles .pl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--pl-size, 180px), 1fr)); gap: 3px; }
        .pl-content--tiles .pl-tile { aspect-ratio: 1 / 1; }
        .pl-content--river .pl-grid { columns: var(--pl-size, 180px); column-gap: 6px; }
        .pl-content--river .pl-tile { break-inside: avoid; margin-bottom: 6px; min-height: 60px; }
        .pl-tile { position: relative; overflow: hidden; border-radius: 3px; cursor: default; background: var(--vault-console-raised, #1d1828); }
        .pl-tile:not(.is-loaded)::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.04), transparent); animation: pl-shimmer 1.2s infinite; }
        @keyframes pl-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        .pl-tile img, .pl-live-video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .pl-content--river .pl-tile img { height: auto; }
        .pl-live-video { position: absolute; inset: 0; }
        .pl-tile--skel { aspect-ratio: 1 / 1; }
        .pl-tile.is-broken img { visibility: hidden; }
        .pl-tile.is-selected { outline: 3px solid var(--vault-accent); outline-offset: -3px; }
        .pl-tile.is-selected::after { content: '✓'; position: absolute; top: 5px; left: 5px; width: 18px; height: 18px; border-radius: 50%; background: var(--vault-accent);
            color: var(--vt-primary, #0b0813); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .pl-tile:hover img { filter: brightness(1.06); transition: filter 120ms; }
        .pl-live { position: absolute; top: 5px; right: 5px; font-size: 8.5px; font-weight: 700; letter-spacing: .08em; padding: 2px 5px; border-radius: 3px;
            background: rgba(0,0,0,.5); color: #fff; font-family: var(--font-mono); z-index: 2; }
        .pl-fav { position: absolute; bottom: 4px; left: 6px; color: var(--vault-gold, #F0B94B); font-size: 13px; text-shadow: 0 1px 3px #000; z-index: 2; }
        .pl-tile__x { position: absolute; top: 4px; right: 4px; z-index: 3; width: 20px; height: 20px; border-radius: 50%; border: none; cursor: pointer;
            background: rgba(0,0,0,.6); color: #fff; font-size: 10px; opacity: 0; transition: opacity 120ms; }
        .pl-tile:hover .pl-tile__x { opacity: 1; }
        .pl-empty { padding: 60px 0; text-align: center; color: var(--vault-slate); font-size: 13px; }
        .pl-periods { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--pl-size, 180px) * 1.4), 1fr)); gap: 16px; }
        .pl-content--periods { --pl-size: 180px; }
        .pl-period { cursor: pointer; }
        .pl-period .pl-cover { aspect-ratio: 1 / 1; border-radius: 8px; }
        .pl-period:hover .pl-cover { filter: brightness(1.08); }
        .pl-period__label { font-size: 14px; font-weight: 600; color: var(--vault-text); margin-top: 8px; font-family: var(--font-sans); }
        .pl-period__count { font-size: 11px; color: var(--vault-slate); font-family: var(--font-mono); }
        .pl-crumb { margin: 4px 0 12px; display: inline-block; }
        .pl-cover { display: block; width: 100%; height: 100%; overflow: hidden; position: relative; background: var(--vault-console-raised); }
        .pl-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .pl-cover--collage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
        .pl-cover--collage img { min-height: 0; min-width: 0; }
        .pl-period .pl-cover:not(.pl-cover--collage) img { position: absolute; inset: 0; }
        .pl-cover--abstract b { position: absolute; top: 8%; left: 8%; right: 8%; color: #fff; font-family: var(--font-sans); font-size: 15px; }
        .pl-people { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 18px 12px; }
        .pl-person { display: flex; flex-direction: column; align-items: center; gap: 5px; cursor: pointer; min-width: 0; }
        .pl-person__face { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; background: var(--vault-console-raised); }
        .pl-person__face img { width: 100%; height: 100%; object-fit: cover; }
        .pl-person:hover .pl-person__face { outline: 2px solid var(--vault-accent); }
        .pl-person__name { font-size: 12px; color: var(--vault-text); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pl-person__count { font-size: 10px; color: var(--vault-slate); font-family: var(--font-mono); }
        .pl-info { width: 0; overflow: hidden; border-left: 1px solid transparent; transition: width 140ms; box-sizing: border-box; }
        .pl-info.is-open { width: 300px; border-left-color: var(--vault-border); padding: 14px; overflow-y: auto; }
        .pl-info__name { font-weight: 600; color: var(--vault-text); margin-bottom: 10px; word-break: break-all; font-size: 13px; }
        .pl-info__row { display: flex; flex-direction: column; gap: 2px; margin-bottom: 9px; font-size: 12px; }
        .pl-info__row span { color: var(--vault-slate); font-size: 10px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .04em; }
        .pl-info__row b { color: var(--vault-text); font-weight: 500; word-break: break-word; }
        .pl-info__head { font-size: 10px; color: var(--vault-slate); font-family: var(--font-mono); text-transform: uppercase; margin: 14px 0 6px; }
        .pl-info__person { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--vault-text); padding: 4px 0; }
        .pl-info__empty { font-size: 12px; color: var(--vault-slate); }
        .pl-selbar { position: absolute; left: 50%; bottom: 14px; transform: translate(-50%, 20px); opacity: 0; pointer-events: none; transition: all 140ms;
            display: flex; gap: 6px; align-items: center; padding: 8px 10px; border-radius: 8px; background: var(--vault-console-surface, #13101c);
            border: 1px solid var(--vault-border); box-shadow: 0 12px 40px rgba(0,0,0,.6); z-index: 20; white-space: nowrap; }
        .pl-selbar.is-on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
        .pl-selbar__n { font-size: 11.5px; color: var(--vault-accent); font-family: var(--font-mono); margin-right: 4px; }
        .pl-menu { position: fixed; z-index: 5000; background: var(--vault-console-surface, #13101c); border: 1px solid var(--vault-border); border-radius: 6px;
            box-shadow: 0 12px 40px rgba(0,0,0,.6); min-width: 190px; padding: 4px; font-size: 12px; max-height: 70vh; overflow-y: auto; }
        .pl-menu__item { padding: 7px 12px; border-radius: 4px; cursor: pointer; color: var(--vault-text); }
        .pl-menu__item:hover { background: var(--vault-hover, rgba(255,255,255,.06)); }
        .pl-menu__item.is-danger { color: var(--vault-danger, #ff4d4f); }
        @media (prefers-reduced-motion: reduce) { .pl-shell *, .pl-selbar, .pl-info { transition: none !important; animation: none !important; } }
        `;
        document.head.appendChild(st);
    }

    // ── Entry ───────────────────────────────────────────────────────────────
    function render() {
        injectStyles();
        const root = build();
        if (!root) return;
        renderSide();
        if (!S.items.length && !S.loading && S.view !== 'people') reload();
        else chrome();
    }

    window.renderAlbums = render;
    window.renderPhotosLibrary = render;
    window.photosLibraryState = S;            // tests and debugging
})();
