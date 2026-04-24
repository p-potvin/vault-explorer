const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const TARGET_DIR = 'F:\\amd';
const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.wmv'];

function findVideosSync(dir) {
    let results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.endsWith('.trickplay')) {
                    results.push(...findVideosSync(fullPath));
                }
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (VIDEO_EXTS.includes(ext) && ext !== '.webm') {
                     results.push(fullPath);
                }
            }
        }
    } catch (e) {
        console.error("Error reading dir", dir, e);
    }
    return results;
}

async function start() {
    console.log(`Scanning ${TARGET_DIR} for videos...`);
    const videos = findVideosSync(TARGET_DIR);
    console.log(`Found ${videos.length} videos. Processing...`);

    let count = 0;
    for (const vidPaths of videos) {
        const dir = path.dirname(vidPaths);
        const baseName = path.basename(vidPaths, path.extname(vidPaths));
        const outPath = path.join(dir, baseName + '_p.mp4');
        
        if (fs.existsSync(outPath) || fs.existsSync(path.join(dir, baseName + '.webm'))) {
            console.log(`Skipping (already exists): ${baseName}`);
            continue;
        }

        console.log(`Processing [${++count}/${videos.length}]: ${path.basename(vidPaths)}`);
        
        // Try hardware mapping natively
        const cmdCuda = `ffmpeg -y -hwaccel cuda -hwaccel_output_format cuda -ss 00:00:15 -i "${vidPaths}" -t 10 -vf "scale_cuda=320:-2" -c:v h264_nvenc -preset p4 -b:v 1M -c:a aac -b:a 64k "${outPath}" -loglevel error`;
        const cmdCpu = `ffmpeg -y -ss 00:00:15 -i "${vidPaths}" -t 10 -vf "scale=320:-2" -c:v libx264 -preset veryfast -b:v 1M -c:a aac -b:a 64k "${outPath}" -loglevel error`;
        
        try {
            await execPromise(cmdCuda);
        } catch (err) {
            try {
                await execPromise(cmdCpu);
            } catch (err2) {
                console.error(`ERROR on ${baseName}: `, err2.message);
            }
        }
    }
    console.log("Finished generating all webms.");
}

start();
