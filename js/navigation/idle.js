// idle.js — tracks user inactivity (60s) to sequential preview generation triggers in the renderer

(function() {
    let idleTimeout = null;

    function resetIdleTimer() {
        clearTimeout(idleTimeout);
        idleTimeout = setTimeout(() => {
            if (window.currentTab === 'vault' && window.allItems && window.allItems.length > 0) {
                console.log('[Idle Previews] User is idle for 60s. sequential preview generation triggered...');
                window.electronAPI.scheduleIdlePreviews(window.allItems);
            }
        }, 60000); // 60 seconds
    }

    // Bind event listeners for user activity
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    
    // Initial start
    resetIdleTimer();
})();
