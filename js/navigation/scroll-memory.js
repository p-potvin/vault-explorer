// scroll-memory.js — session-only per-folder scroll offset and rendered-count memory.
// Stored strictly in memory so all positions are forgotten when the app closes.

(function () {
    function getEl(id) {
        if (typeof el === 'function') return el(id);
        return typeof document !== 'undefined' ? document.getElementById(id) : null;
    }

    function normalizeDirKey(realPath) {
        const normalized = String(realPath || '')
            .replace(/\\/g, '/')
            .replace(/\/+$/, '')
            .toLowerCase();
        return normalized || 'root';
    }

    function getFolderScrollKey(ctx = {}) {
        const subtab = ctx.subtab !== undefined ? ctx.subtab : (window.currentFilesSubtab || 'all');
        const folderId = ctx.folderId !== undefined ? ctx.folderId : window.currentFolderId;
        const realPath = ctx.realPath !== undefined ? ctx.realPath : window.currentRealPath;

        if (subtab === 'favorites') return 'subtab:favorites';
        if (folderId) return `vf:${folderId}`;
        if (subtab === 'collections') return 'subtab:collections';
        return `dir:${normalizeDirKey(realPath)}`;
    }

    function gridHasRenderableItems(grid) {
        if (!grid || !grid.childElementCount) return false;
        if (grid.childElementCount === 1 && grid.firstElementChild?.classList?.contains('empty-state')) {
            return false;
        }
        return true;
    }

    function saveCurrentFolderScroll() {
        if (window.currentTab && window.currentTab !== 'files') return;
        if (window._isRestoringScroll) return;

        const searchBox = getEl('search-box');
        if (searchBox && String(searchBox.value || '').trim() !== '') return;

        const mainArea = getEl('main-area');
        if (!mainArea) return;

        const key = getFolderScrollKey();
        if (window._renderedScrollKey !== key) return;

        const subtab = window.currentFilesSubtab || 'all';
        const activeGrid = getEl(subtab === 'favorites' ? 'favorites-grid' : 'file-grid');
        if (!gridHasRenderableItems(activeGrid)) return;

        window.scrollPositions = window.scrollPositions || {};
        window.renderedCounts = window.renderedCounts || {};
        window.scrollPositions[key] = mainArea.scrollTop;
        window.renderedCounts[key] = Math.max(window.currentlyRendered || 0, window.PAGE_SIZE || 50);
    }

    function getSavedScrollTop(key) {
        const value = window.scrollPositions && window.scrollPositions[key];
        return (typeof value === 'number' && Number.isFinite(value) && value > 0) ? value : 0;
    }

    function getSavedRenderedCount(key) {
        const value = window.renderedCounts && window.renderedCounts[key];
        return (typeof value === 'number' && Number.isFinite(value) && value > 0) ? value : 0;
    }

    function beginFolderRender() {
        window._isRestoringScroll = true;
        window._scrollRestoreToken = (window._scrollRestoreToken || 0) + 1;
        return window._scrollRestoreToken;
    }

    function applyTargetScroll(mainArea, targetScroll, allowRenderMore) {
        mainArea.scrollTop = targetScroll;
        if (allowRenderMore && targetScroll > 0 && typeof window.renderMore === 'function') {
            let guard = 0;
            while (
                guard < 40 &&
                mainArea.scrollTop < targetScroll - 2 &&
                Array.isArray(window.displayedItems) &&
                window.currentlyRendered < window.displayedItems.length
            ) {
                const beforeRendered = window.currentlyRendered || 0;
                window.renderMore();
                mainArea.scrollTop = targetScroll;
                if ((window.currentlyRendered || 0) <= beforeRendered) break;
                guard++;
            }
        }
    }

    function finishFolderScrollRestore(key, token, options = {}) {
        const { resetToTop = false, hasItems = true } = options;
        window._renderedScrollKey = resetToTop ? null : key;

        const targetScroll = resetToTop ? 0 : getSavedScrollTop(key);
        const mainArea = getEl('main-area');
        if (!mainArea || (window.currentTab && window.currentTab !== 'files')) {
            if (token === window._scrollRestoreToken) {
                window._isRestoringScroll = false;
            }
            return;
        }

        const allowRenderMore = hasItems && !resetToTop;
        applyTargetScroll(mainArea, targetScroll, allowRenderMore);

        const schedule = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (cb) => setTimeout(cb, 0);

        schedule(() => {
            if (token !== window._scrollRestoreToken) return;
            const area = getEl('main-area');
            if (area && (!window.currentTab || window.currentTab === 'files')) {
                applyTargetScroll(area, targetScroll, allowRenderMore);
            }
            schedule(() => {
                if (token === window._scrollRestoreToken) {
                    window._isRestoringScroll = false;
                }
            });
        });
    }

    function resetSessionScrollPositions() {
        window.scrollPositions = {};
        window.renderedCounts = {};
        window._renderedScrollKey = null;
        window._isRestoringScroll = false;
        window._scrollRestoreToken = 0;
    }

    resetSessionScrollPositions();

    window.getFolderScrollKey = getFolderScrollKey;
    window.saveCurrentFolderScroll = saveCurrentFolderScroll;
    window.getSavedScrollTop = getSavedScrollTop;
    window.getSavedRenderedCount = getSavedRenderedCount;
    window.beginFolderRender = beginFolderRender;
    window.finishFolderScrollRestore = finishFolderScrollRestore;
    window.resetSessionScrollPositions = resetSessionScrollPositions;
})();
