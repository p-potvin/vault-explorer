#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const testSuites = [
    { name: 'Music & Photos Full Feature Suite', script: 'tests/music_photos_suite_test.js' },
    { name: 'Favorites & Virtual Folders Persistence', script: 'tests/favorites_and_virtual_folders_persistence_test.js' },
    { name: 'AI Action Paths Regression', script: 'tests/ai_paths_regression_test.js' },
    { name: 'Cloud Files Placeholder Safety', script: 'tests/cloud_files_regression_test.js' },
    { name: 'Local Subtitles Detection & Formats', script: 'tests/local_subtitles_test.js' },
    { name: 'Preview Validity Regression', script: 'tests/preview_validity_regression_test.js' },
    { name: 'Preview Candidate Acceptance', script: 'tests/preview_candidate_acceptance_test.js' },
    { name: 'Settings Modal & Player Error E2E Suite', script: 'tests/settings_and_error_handling_test.js' },
    { name: 'Video Double Click & Playback E2E', script: 'tests/video_double_click_and_playback_test.js' },
    { name: 'Playlist & Album Prompts, Volume, and Perf E2E', script: 'tests/playlist_album_prompt_and_player_perf_test.js' },
    { name: 'Player Controls & Upscale Button E2E', script: 'tests/player_upscale_btn_test.js' },
    { name: 'Category Isolation & Self-Containment', script: 'tests/category_isolation_test.js' },
    { name: 'Music & Photos Button-By-Button E2E Suite', script: 'tests/music_photos_buttons_e2e_test.js' },
    { name: 'Refactor Smoke & DOM E2E Suite', script: 'tests/refactor_smoke_test.js' }
];

console.log('===============================================================');
console.log('       VAULT EXPLORER - SEQUENTIAL TEST RUNNER SUITE           ');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;
const startTime = Date.now();

for (let i = 0; i < testSuites.length; i++) {
    const suite = testSuites[i];
    console.log(`[${i + 1}/${testSuites.length}] Running: ${suite.name} (${suite.script})...`);
    try {
        execFileSync(process.execPath, [path.join(rootDir, suite.script)], {
            cwd: rootDir,
            stdio: 'inherit',
            env: {
                ...process.env,
                VAULT_EXPLORER_E2E: '1',
                NODE_ENV: 'test'
            }
        });
        passed++;
        console.log(`✓ [PASS] ${suite.name}\n`);
    } catch (err) {
        failed++;
        console.error(`✗ [FAIL] ${suite.name} failed with exit code ${err.status}\n`);
        break;
    }
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
console.log('===============================================================');
if (failed === 0) {
    console.log(` ALL TEST SUITES PASSED! (${passed}/${testSuites.length} in ${totalTime}s)`);
    console.log('===============================================================');
    process.exit(0);
} else {
    console.error(` TEST SUITE FAILED: ${passed} passed, ${failed} failed in ${totalTime}s`);
    console.log('===============================================================');
    process.exit(1);
}
