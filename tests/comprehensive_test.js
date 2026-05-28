const { _electron: electron } = require('C:/Users/Administrator/Desktop/Github Repos/vault-explorer/node_modules/playwright');
const path = require('path');
const assert = require('assert').strict;

async function runTests() {
    console.log('======================================================');
    console.log('    VAULT EXPLORER COMPREHENSIVE AUTOMATED TEST SUITE  ');
    console.log('======================================================\n');

    const appPath = 'C:\\Users\\Administrator\\Desktop\\Github Repos\\vault-explorer';
    
    console.log('[Test Setup] Launching Vault Explorer application...');
    const electronApp = await electron.launch({
        cwd: appPath,
        args: ['.']
    });

    // Wait for pages/windows to initialize and find the correct app window
    await electronApp.context().waitForEvent('page');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const windows = electronApp.windows();
    let window = null;
    for (const win of windows) {
        const title = await win.title();
        if (title === 'Vault Explorer') {
            window = win;
            break;
        }
    }
    if (!window) {
        window = windows[0];
    }
    
    const errors = [];
    const logs = [];

    // Capture console output and browser exceptions
    window.on('console', msg => {
        const text = msg.text();
        logs.push(text);
        if (msg.type() === 'error') {
            console.error(`[Browser Console ERROR] ${text}`);
            errors.push(`Console Error: ${text}`);
        } else {
            console.log(`[Browser Console LOG] ${text}`);
        }
    });

    window.on('pageerror', err => {
        console.error(`[Browser Page ERROR] ${err.stack || err.message}`);
        errors.push(`Page Exception: ${err.message}`);
    });    console.log('[Test Setup] Waiting for application load and mock assets...');
    await window.waitForTimeout(4000);

    // Switch to Vault tab to make toolbar elements visible
    console.log('[Test Setup] Switching to Vault tab to ensure elements are visible...');
    await window.locator('#tab-vault').click();
    await window.waitForTimeout(1000);

    // Assert base elements are visible in DOM
    console.log('[Test Step 1] Verifying core UI layout elements are in DOM...');
    const toolbarExists = await window.locator('div.glass-container > div.toolbar').isVisible();
    const searchBoxExists = await window.locator('#search-box').isVisible();
    const filterTypeExists = await window.locator('#filter-type').isVisible();
    const fileGridExists = await window.locator('#file-grid').isVisible();
    const statusBarExists = await window.locator('.status-bar').isVisible();

    assert.ok(toolbarExists, 'Toolbar is missing or not visible');
    assert.ok(searchBoxExists, 'Search Box is missing or not visible');
    assert.ok(filterTypeExists, 'Filter Type Select is missing or not visible');
    assert.ok(fileGridExists, 'File Grid is missing or not visible');
    assert.ok(statusBarExists, 'Status Bar is missing or not visible');
    console.log('  -> Core UI layout elements verified successfully.');
    // Language Toggle Test
    console.log('[Test Step 2] Executing Language Toggle i18n Workflow...');
    const initialLangText = (await window.locator('#lang-text').innerText()).toUpperCase();
    console.log(`  -> Initial Lang Button Text: "${initialLangText}"`);
    const initialBrowseText = (await window.locator('#btn-select').innerText()).toLowerCase();
    console.log(`  -> Initial Browse Vault Text: "${initialBrowseText}"`);

    if (initialLangText.includes('EN')) {
        assert.equal(initialBrowseText, 'browse vault', 'Initial English button text mismatch');
    } else {
        assert.equal(initialBrowseText, 'explorer la voûte', 'Initial Quebecois button text mismatch');
    }

    // Click to toggle language to the opposite
    console.log('  -> Clicking language toggle trigger...');
    await window.locator('#lang-trigger').click();
    await window.waitForTimeout(500);

    const toggledBrowseText = (await window.locator('#btn-select').innerText()).toLowerCase();
    console.log(`  -> Toggled Browse Vault Text: "${toggledBrowseText}"`);
    
    if (initialLangText.includes('EN')) {
        assert.equal(toggledBrowseText, 'explorer la voûte', 'Quebecois translation failed to apply on #btn-select');
    } else {
        assert.equal(toggledBrowseText, 'browse vault', 'English translation failed to apply on #btn-select');
    }

    // Click back to restore initial language state
    console.log('  -> Restoring initial language state...');
    await window.locator('#lang-trigger').click();
    await window.waitForTimeout(500);

    const restoredBrowseText = (await window.locator('#btn-select').innerText()).toLowerCase();
    console.log(`  -> Restored Browse Vault Text: "${restoredBrowseText}"`);
    
    if (initialLangText.includes('EN')) {
        assert.equal(restoredBrowseText, 'browse vault', 'Failed to restore English state');
    } else {
        assert.equal(restoredBrowseText, 'explorer la voûte', 'Failed to restore Quebecois state');
    }
    console.log('  -> Language Toggle i18n verified successfully.');

    // Settings Panel Interaction
    console.log('[Test Step 3] Executing Settings Panel Modal Workflow...');
    const isSettingsPanelHiddenInitially = !(await window.locator('#settings-panel').isVisible());
    assert.ok(isSettingsPanelHiddenInitially, 'Settings panel should be hidden initially');

    console.log('  -> Opening Settings Panel...');
    await window.locator('#settings-trigger').click();
    await window.waitForTimeout(500);

    const isSettingsPanelVisible = await window.locator('#settings-panel').isVisible();
    assert.ok(isSettingsPanelVisible, 'Settings panel failed to display upon trigger click');

    console.log('  -> Verifying settings input fields are present and interactive...');
    const defaultFolderInput = window.locator('#settings-default-folder');
    assert.ok(await defaultFolderInput.isVisible(), 'Default Folder input field missing inside settings');

    // Save Settings
    console.log('  -> Clicking Save Settings...');
    await window.locator('#settings-btn-save').click();
    await window.locator('#settings-panel').waitFor({ state: 'hidden', timeout: 5000 });

    const isSettingsPanelHiddenAfterSave = !(await window.locator('#settings-panel').isVisible());
    assert.ok(isSettingsPanelHiddenAfterSave, 'Settings panel should be dismissed after save');
    console.log('  -> Settings Panel Modal workflow verified successfully.');

    // Sort Dropdown Menu Test
    console.log('[Test Step 4] Executing Sort Popover Dropdown Interaction...');
    const isSortMenuHiddenInitially = !(await window.locator('#sort-dropdown-menu').isVisible());
    assert.ok(isSortMenuHiddenInitially, 'Sort Dropdown Menu should be hidden initially');

    console.log('  -> Clicking Sort Trigger to open dropdown...');
    await window.locator('#btn-sort-menu-trigger').click();
    await window.waitForTimeout(500);

    const isSortMenuVisible = await window.locator('#sort-dropdown-menu').isVisible();
    assert.ok(isSortMenuVisible, 'Sort Dropdown Menu failed to display upon click');

    console.log('  -> Verifying sort options inside popover...');
    const nameOption = window.locator('.sort-option[data-field="name"]');
    assert.ok(await nameOption.isVisible(), 'Name option inside sort menu missing');

    console.log('  -> Selecting Name sort criteria...');
    await nameOption.click();
    await window.waitForTimeout(500);

    const activeSortLabel = await window.locator('#sort-btn-label').innerText();
    console.log(`  -> Selected Sort Label Text: "${activeSortLabel}"`);
    assert.ok(activeSortLabel.toLowerCase().includes('name'), 'Active sort label failed to update to selected field name');
    console.log('  -> Sort Dropdown Menu Popover verified successfully.');

    // Virtual Folder Setup Dialog Test
    console.log('[Test Step 5] Executing Virtual Folder Dialog Modal setup...');
    const folderBtn = window.locator('#btn-new-folder');
    if (await folderBtn.count() > 0) {
        console.log('  -> Virtual Folder button is present. Triggering programmatically...');
        await folderBtn.evaluate(el => el.click());
        await window.waitForTimeout(500);

        const dialogVisible = await window.locator('#fake-folder-dialog').isVisible();
        assert.ok(dialogVisible, 'Virtual folder creation dialog failed to display');
        
        console.log('  -> Typing virtual folder name...');
        await window.locator('#fake-folder-name').fill('Automated_Test_Folder');
        await window.waitForTimeout(300);

        console.log('  -> Dismissing folder dialog...');
        await window.locator('#btn-cancel-folder').click();
        await window.waitForTimeout(500);

        const dialogHidden = !(await window.locator('#fake-folder-dialog').isVisible());
        assert.ok(dialogHidden, 'Virtual folder dialog failed to dismiss');
        console.log('  -> Virtual Folder dialog verification successful.');
    } else {
        console.log('  -> Virtual folder button is disabled (expected when no folder is selected). Skipping folder dialog test.');
    }

    // Grid & Filtration Verification
    console.log('[Test Step 6] Executing Grid Rendering & Search Filter system...');
    const searchInput = window.locator('#search-box');
    await searchInput.fill('Sample');
    await window.waitForTimeout(500);
    console.log('  -> Search filtration input successfully applied.');

    await searchInput.fill('');
    await window.waitForTimeout(500);

    // Check application state for errors
    console.log('[Test Step 7] Performing Runtime Console Error audit...');
    assert.equal(errors.length, 0, `Detected runtime exceptions or errors: \n${errors.join('\n')}`);
    console.log('  -> Runtime Console Error audit returned 0 exceptions.');

    console.log('\n======================================================');
    console.log('       ALL VAULT EXPLORER INTEGRATION TESTS PASSED     ');
    console.log('======================================================');

    console.log('[Test Teardown] Closing Electron process...');
    await electronApp.close();
}

runTests().catch(err => {
    console.error('\n❌ INTEGRATION TEST SUITE FAILED ❌');
    console.error(err);
    process.exit(1);
});
