const { _electron: electron } = require('C:/Users/Administrator/Desktop/Github Repos/vault-explorer/node_modules/playwright');
const assert = require('assert').strict;

async function run() {
    console.log('=== VAULT EXPLORER TOOLTIP BEHAVIOR TEST ===\n');

    const electronApp = await electron.launch({
        cwd: 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer',
        args: ['.'],
    });

    try {
        let win = await electronApp.firstWindow();
        await win.waitForTimeout(3000);

        for (const candidate of electronApp.windows()) {
            const title = await candidate.title();
            if (title.includes('Vault Explorer')) {
                win = candidate;
                break;
            }
        }

        const errors = [];
        win.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        win.on('pageerror', (err) => errors.push(err.message));

        await win.evaluate(() => {
            const target = document.createElement('button');
            target.id = 'tooltip-test-target';
            target.type = 'button';
            target.dataset.tooltip = 'Windows tooltip text';
            target.textContent = 'Tooltip target';
            target.style.position = 'fixed';
            target.style.left = '160px';
            target.style.top = '160px';
            target.style.width = '140px';
            target.style.height = '36px';
            document.body.appendChild(target);
        });

        const target = win.locator('#tooltip-test-target');
        await target.hover();
        await win.waitForFunction(() => {
            const tooltip = document.getElementById('win-tooltip');
            return tooltip?.classList.contains('win-tooltip-visible');
        }, { timeout: 1000 });

        let tooltipState = await win.evaluate(() => {
            const tooltip = document.getElementById('win-tooltip');
            return {
                exists: !!tooltip,
                text: tooltip?.textContent,
                visible: tooltip?.classList.contains('win-tooltip-visible'),
                hidden: tooltip?.classList.contains('win-tooltip-hidden'),
                pointerEvents: tooltip ? getComputedStyle(tooltip).pointerEvents : null,
                activeElementId: document.activeElement?.id || '',
            };
        });

        assert.equal(tooltipState.exists, true, 'Windows tooltip element is created');
        assert.equal(tooltipState.text, 'Windows tooltip text', 'Tooltip text is copied from data-tooltip');
        assert.equal(tooltipState.visible, true, 'Tooltip becomes visible on hover');
        assert.equal(tooltipState.hidden, false, 'Visible tooltip is not marked hidden');
        assert.equal(tooltipState.pointerEvents, 'none', 'Tooltip never receives pointer interaction');
        assert.notEqual(tooltipState.activeElementId, 'win-tooltip', 'Tooltip never becomes active focus');

        await win.mouse.move(20, 20);
        await win.waitForTimeout(20);

        tooltipState = await win.evaluate(() => {
            const tooltip = document.getElementById('win-tooltip');
            return {
                visible: tooltip?.classList.contains('win-tooltip-visible'),
                hidden: tooltip?.classList.contains('win-tooltip-hidden'),
            };
        });

        assert.equal(tooltipState.visible, true, 'Tooltip remains visible during the 50ms mouse-move debounce');
        assert.equal(tooltipState.hidden, false, 'Tooltip is not marked hidden during the debounce window');

        await win.waitForTimeout(70);

        tooltipState = await win.evaluate(() => {
            const tooltip = document.getElementById('win-tooltip');
            return {
                visible: tooltip?.classList.contains('win-tooltip-visible'),
                hidden: tooltip?.classList.contains('win-tooltip-hidden'),
            };
        });

        assert.equal(tooltipState.visible, false, 'Tooltip disappears when mouse moves away');
        assert.equal(tooltipState.hidden, true, 'Tooltip is marked hidden after mouse movement');

        await target.focus();
        await win.waitForTimeout(120);

        tooltipState = await win.evaluate(() => {
            const tooltip = document.getElementById('win-tooltip');
            return {
                visible: tooltip?.classList.contains('win-tooltip-visible'),
                activeElementId: document.activeElement?.id || '',
            };
        });

        assert.equal(tooltipState.visible, false, 'Tooltip does not show from keyboard focus alone');
        assert.equal(tooltipState.activeElementId, 'tooltip-test-target', 'Focus remains on the target control');

        await win.evaluate(() => {
            const target = document.getElementById('tooltip-test-target');
            target.blur();
            target.setAttribute('title', 'Native title restored');
        });
        await target.hover();
        await win.mouse.move(20, 20);
        await win.waitForTimeout(500);

        tooltipState = await win.evaluate(() => {
            const target = document.getElementById('tooltip-test-target');
            const tooltip = document.getElementById('win-tooltip');
            return {
                visible: tooltip?.classList.contains('win-tooltip-visible'),
                title: target.getAttribute('title'),
            };
        });

        assert.equal(tooltipState.visible, false, 'Pending tooltip is cancelled when mouse leaves before delay');
        assert.equal(tooltipState.title, 'Native title restored', 'Native title is restored when pending tooltip is cancelled');

        assert.deepEqual(errors, [], 'No renderer console errors were emitted');
        console.log('[PASS] Windows-style tooltip behavior verified');
    } finally {
        await electronApp.close();
    }
}

run().catch((err) => {
    console.error('[FAIL] Tooltip behavior test failed:', err);
    process.exit(1);
});
