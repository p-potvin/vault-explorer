// idle.js — tracks user inactivity (60s) to crawl the current folder for videos
// missing hover WebM previews and queues them in batches of 10 every 30s while idle.

(function() {
    const IDLE_MS = 60000;
    const BATCH_INTERVAL_MS = 30000;
    const BATCH_SIZE = 10;

    let idleTimeout = null;
    let runnerInterval = null;
    let isIdle = false;

    function stopRunner() {
        if (runnerInterval) {
            clearInterval(runnerInterval);
            runnerInterval = null;
        }
        isIdle = false;
    }

    function findMissingPreviews() {
        const all = Array.isArray(window.allItems) ? window.allItems : [];
        return all
            .filter(item => item && item.type === 'video' && !item.hoverWebm && item.path)
            .sort((a, b) => {
                const ta = a.modified ? new Date(a.modified).getTime() : 0;
                const tb = b.modified ? new Date(b.modified).getTime() : 0;
                return tb - ta; // newest first
            });
    }

    function queueBatch(missing) {
        const batch = missing.slice(0, BATCH_SIZE);
        if (batch.length === 0) return false;
        console.log(`[Idle Previews] Queueing batch of ${batch.length} video(s) for preview generation.`);
        window.electronAPI.scheduleIdlePreviews(batch);
        return true;
    }

    function startRunner() {
        stopRunner();
        isIdle = true;

        // Immediate first batch after 60s of inactivity
        let missing = findMissingPreviews();
        if (missing.length === 0) {
            console.log('[Idle Previews] No videos missing previews. Idle runner stopped.');
            stopRunner();
            return;
        }
        queueBatch(missing);

        // Continue queuing every 30s while idle until no missing previews remain
        runnerInterval = setInterval(() => {
            if (!isIdle) { stopRunner(); return; }
            missing = findMissingPreviews();
            if (missing.length === 0) {
                console.log('[Idle Previews] All videos have previews. Idle runner stopped.');
                stopRunner();
                return;
            }
            queueBatch(missing);
        }, BATCH_INTERVAL_MS);
    }

    function resetIdleTimer() {
        clearTimeout(idleTimeout);
        stopRunner();
        idleTimeout = setTimeout(() => {
            if (window.currentTab === 'files') {
                console.log('[Idle Previews] User is idle for 60s. Starting folder crawl for missing previews.');
                startRunner();
            }
        }, IDLE_MS);
    }

    // Bind event listeners for user activity
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    window.addEventListener('scroll', resetIdleTimer);

    // Initial start
    resetIdleTimer();
})();
