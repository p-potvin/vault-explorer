const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

console.log('=== VAULT EXPLORER: PREVIEW CANDIDATE PARTIAL ACCEPTANCE TEST ===\n');

const testDir = path.join(__dirname, 'scratch_preview_test');
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testDir, { recursive: true });

function testPromotionLogic(thumbContent, webmContent) {
    const thumbWritePath = path.join(testDir, 'test.jpg.tmp');
    const webmWritePath = path.join(testDir, 'test.webm.tmp');
    const thumbPath = path.join(testDir, 'test.jpg');
    const hoverWebmPath = path.join(testDir, 'test.webm');

    // Setup temp files
    if (thumbContent) fs.writeFileSync(thumbWritePath, thumbContent);
    if (webmContent) fs.writeFileSync(webmWritePath, webmContent);

    // Run promotion logic matching src/previews.js
    let thumbTmpOk = false;
    try {
        thumbTmpOk = fs.existsSync(thumbWritePath) && fs.statSync(thumbWritePath).size > 0;
    } catch (_) { }

    let webmTmpOk = false;
    try {
        webmTmpOk = fs.existsSync(webmWritePath) && fs.statSync(webmWritePath).size > 0;
    } catch (_) { }

    let thumbPromoted = false;
    let webmPromoted = false;

    if (thumbTmpOk) {
        try {
            fs.renameSync(thumbWritePath, thumbPath);
            thumbPromoted = true;
        } catch (e) {
            try { if (fs.existsSync(thumbWritePath)) fs.unlinkSync(thumbWritePath); } catch (_) { }
        }
    } else {
        try { if (fs.existsSync(thumbWritePath)) fs.unlinkSync(thumbWritePath); } catch (_) { }
    }

    if (webmTmpOk) {
        try {
            fs.renameSync(webmWritePath, hoverWebmPath);
            webmPromoted = true;
        } catch (e) {
            try { if (fs.existsSync(webmWritePath)) fs.unlinkSync(webmWritePath); } catch (_) { }
        }
    } else {
        try { if (fs.existsSync(webmWritePath)) fs.unlinkSync(webmWritePath); } catch (_) { }
    }

    const anyPromoted = thumbPromoted || webmPromoted || fs.existsSync(thumbPath) || fs.existsSync(hoverWebmPath);
    if (!anyPromoted) {
        throw new Error('FFmpeg produced incomplete output: neither thumbnail nor video preview was valid');
    }

    return {
        thumbPromoted,
        webmPromoted,
        finalThumb: fs.existsSync(thumbPath) ? thumbPath : null,
        finalWebm: fs.existsSync(hoverWebmPath) ? hoverWebmPath : null
    };
}

// Case 1: Both succeed
const res1 = testPromotionLogic('JPEG_DATA', 'WEBM_DATA');
assert.equal(res1.thumbPromoted, true);
assert.equal(res1.webmPromoted, true);
assert.ok(res1.finalThumb);
assert.ok(res1.finalWebm);
console.log('✓ [PASS] Case 1: Both candidates promoted successfully');

// Clean up
fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testDir, { recursive: true });

// Case 2: Only Thumbnail succeeds (FFmpeg failed webm output)
const res2 = testPromotionLogic('JPEG_DATA_ONLY', null);
assert.equal(res2.thumbPromoted, true);
assert.equal(res2.webmPromoted, false);
assert.ok(res2.finalThumb);
assert.equal(res2.finalWebm, null);
console.log('✓ [PASS] Case 2: Partial output (thumbnail only) accepted without throwing');

// Clean up
fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testDir, { recursive: true });

// Case 3: Only WebM succeeds (FFmpeg failed thumb output)
const res3 = testPromotionLogic(null, 'WEBM_DATA_ONLY');
assert.equal(res3.thumbPromoted, false);
assert.equal(res3.webmPromoted, true);
assert.equal(res3.finalThumb, null);
assert.ok(res3.finalWebm);
console.log('✓ [PASS] Case 3: Partial output (webm only) accepted without throwing');

// Clean up
fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testDir, { recursive: true });

// Case 4: Neither succeeds -> should throw
assert.throws(() => {
    testPromotionLogic(null, null);
}, /FFmpeg produced incomplete output/);
console.log('✓ [PASS] Case 4: Complete failure correctly rejected');

// Final cleanup
fs.rmSync(testDir, { recursive: true, force: true });
console.log('\n=== ALL PREVIEW CANDIDATE TESTS PASSED ===');
