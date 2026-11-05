const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const { cleanupDist, compareSemver } = require('../scripts/cleanup-dist');

console.log('=== CLEANUP DIST UNIT & REGRESSION TEST ===\n');

// 1. Test semver comparison helper
assert.ok(compareSemver('4.1.18', '4.1.19') < 0, '4.1.18 should be less than 4.1.19');
assert.ok(compareSemver('4.1.20', '4.1.19') > 0, '4.1.20 should be greater than 4.1.19');
assert.equal(compareSemver('4.1.21', '4.1.21'), 0, 'identical versions should return 0');
console.log('✓ [PASS] Semver comparison logic verified.');

// 2. Test dummy file cleanup in dist
const distDir = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
    const dummyOldExe = path.join(distDir, 'vault-explorer-setup-0.0.99.exe');
    const dummyOldBlockmap = path.join(distDir, 'vault-explorer-setup-0.0.99.exe.blockmap');

    fs.writeFileSync(dummyOldExe, 'dummy older installer content', 'utf8');
    fs.writeFileSync(dummyOldBlockmap, 'dummy older blockmap content', 'utf8');

    assert.ok(fs.existsSync(dummyOldExe), 'Dummy old installer must exist before cleanup');
    assert.ok(fs.existsSync(dummyOldBlockmap), 'Dummy old blockmap must exist before cleanup');

    const result = cleanupDist();

    assert.ok(!fs.existsSync(dummyOldExe), 'Dummy old installer should be deleted');
    assert.ok(!fs.existsSync(dummyOldBlockmap), 'Dummy old blockmap should be deleted');
    assert.ok(result.removedCount >= 2, 'Should report at least 2 files removed');

    console.log('✓ [PASS] Dummy older versions cleaned up successfully.');
}

console.log('\n=== ALL CLEANUP DIST TESTS PASSED ===');
