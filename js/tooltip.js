// js/tooltip.js — Centralized theme-aware tooltip system using event delegation.

document.addEventListener('DOMContentLoaded', () => {
    let tooltipEl = document.getElementById('global-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'global-tooltip';
        tooltipEl.className = 'vw-tooltip';
        document.body.appendChild(tooltipEl);
    }

    let activeTarget = null;
    let showTimeout = null;
    let hideTimeout = null;

    const showTooltip = (target) => {
        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        // Clear any pending hide or show
        if (hideTimeout) clearTimeout(hideTimeout);
        if (showTimeout) clearTimeout(showTimeout);

        // Add 50ms delay to prevent tooltip from blocking video preview instantly
        showTimeout = setTimeout(() => {
            tooltipEl.textContent = text;
            tooltipEl.classList.add('visible');
            activeTarget = target;
            positionTooltip(target);
        }, 50);
    };

    const hideTooltip = () => {
        if (showTimeout) clearTimeout(showTimeout);
        tooltipEl.classList.remove('visible');
        activeTarget = null;
    };

    const positionTooltip = (target) => {
        if (!activeTarget || !tooltipEl.classList.contains('visible')) return;

        const targetRect = target.getBoundingClientRect();
        
        // Use offsetWidth/Height to trigger layout/reflow if rect is 0 (newly visible)
        const tooltipWidth = tooltipEl.offsetWidth || 120;
        const tooltipHeight = tooltipEl.offsetHeight || 28;

        // Position tooltip centered above the target element by default
        let left = targetRect.left + (targetRect.width - tooltipWidth) / 2;
        let top = targetRect.top - tooltipHeight - 6;

        // Viewport boundary check: top edge overflow
        if (top < 8) {
            // Position below the target instead
            top = targetRect.bottom + 6;
        }

        // Viewport boundary check: left edge overflow
        if (left < 8) {
            left = 8;
        }

        // Viewport boundary check: right edge overflow
        if (left + tooltipWidth > window.innerWidth - 8) {
            left = window.innerWidth - tooltipWidth - 8;
        }

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    };

    // Event delegation for hover (mouseenter/mouseleave behavior via mouseover/mouseout)
    document.body.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target && target !== activeTarget) {
            showTooltip(target);
        }
    });

    document.body.addEventListener('mouseout', (e) => {
        if (activeTarget) {
            const relatedTarget = e.relatedTarget;
            // Hide only if the mouse left the target and isn't going into a child of the target
            if (!relatedTarget || (!activeTarget.contains(relatedTarget) && relatedTarget !== activeTarget)) {
                hideTooltip();
            }
        }
    });

    // Support keyboard focus for accessibility
    document.body.addEventListener('focusin', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target && target !== activeTarget) {
            showTooltip(target);
        }
    });

    document.body.addEventListener('focusout', (e) => {
        if (activeTarget) {
            if (showTimeout) clearTimeout(showTimeout);
            if (hideTimeout) clearTimeout(hideTimeout);
            tooltipEl.classList.remove('visible');
            activeTarget = null;
        }
    });

    // Re-position on window resize or scroll
    window.addEventListener('resize', () => {
        if (activeTarget) positionTooltip(activeTarget);
    });

    document.addEventListener('scroll', () => {
        if (activeTarget) positionTooltip(activeTarget);
    }, true); // Use capture to detect scroll events on overflow containers
});
