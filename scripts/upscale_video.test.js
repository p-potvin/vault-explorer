const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);

const scriptPath = path.join(__dirname, 'upscale_video.js');
const tempDir = path.join(__dirname, '..', 'temp_test');

async function setup() {
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
}

async function teardown() {
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

async function runTests() {
    console.log("Running upscale_video.js tests...");
    await setup();

    try {
        // Test 1: Calling without arguments should fail
        console.log("Test 1: No arguments");
        try {
            await execFilePromise('node', [scriptPath]);
            assert.fail("Should have thrown an error due to missing arguments.");
        } catch (error) {
            assert.ok(error.code !== 0, "Process should exit with non-zero code.");
        }

        // Test 2: Calling with non-existent file should fail
        console.log("Test 2: Non-existent file");
        const fakeFile = path.join(tempDir, 'does_not_exist.mp4');
        try {
            await execFilePromise('node', [scriptPath, fakeFile]);
            assert.fail("Should have thrown an error due to missing file.");
        } catch (error) {
            assert.ok(error.code !== 0, "Process should exit with non-zero code.");
            assert.ok(error.stderr.includes("does not exist"), "Error output should mention non-existent file.");
        }

        // Test 3: Happy path (mock ffmpeg execution failure if ffmpeg is missing, but script logic itself)
        // Since we cannot guarantee ffmpeg is available in the test environment, we expect it to either
        // succeed (if ffmpeg is present) or fail gracefully with the full stack trace logged to stderr.
        console.log("Test 3: File exists (ffmpeg logic)");
        const realFile = path.join(tempDir, 'test_input.mp4');
        fs.writeFileSync(realFile, "mock video content"); // Just an empty file for the script to find

        try {
            const { stdout, stderr } = await execFilePromise('node', [scriptPath, realFile]);
            // If it succeeds (e.g. ffmpeg actually works on this mock file somehow, which is unlikely)
            assert.ok(stdout.includes('Successfully "upscaled"'), "Should indicate success if ffmpeg passes");
        } catch (error) {
            // Expected if ffmpeg fails on the bad input or is missing
            assert.ok(error.stderr.includes("Full Stack Trace:"), "Should log full stack trace on ffmpeg error");
        }

        console.log("All tests passed!");
    } catch (e) {
        console.error("Test failed:", e);
        process.exit(1);
    } finally {
        await teardown();
    }
}

runTests();
