const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function renderSegmentsToPng(width, height, segments, strokeWidth = 1.8) {
    const bytesPerPixel = 4;
    const rawData = Buffer.alloc(height * (1 + width * bytesPerPixel));
    const halfWidth = strokeWidth / 2;

    let offset = 0;
    for (let y = 0; y < height; y++) {
        rawData[offset++] = 0; // Filter None
        for (let x = 0; x < width; x++) {
            let minDist = Infinity;
            for (const [x1, y1, x2, y2] of segments) {
                const d = distToSegment(x + 0.5, y + 0.5, x1, y1, x2, y2);
                if (d < minDist) minDist = d;
            }

            let alpha = 0;
            if (minDist <= halfWidth) {
                alpha = 255;
            } else if (minDist <= halfWidth + 1.0) {
                alpha = Math.round(255 * (1.0 - (minDist - halfWidth)));
            }

            rawData[offset++] = 255; // R
            rawData[offset++] = 255; // G
            rawData[offset++] = 255; // B
            rawData[offset++] = Math.max(0, Math.min(255, alpha));
        }
    }

    const compressed = zlib.deflateSync(rawData);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8;
    ihdrData[9] = 6;
    ihdrData[10] = 0;
    ihdrData[11] = 0;
    ihdrData[12] = 0;

    const crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crcTable[n] = c;
    }

    function createChunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        let crc = -1;
        for (let i = 0; i < typeBuf.length; i++) crc = crcTable[(crc ^ typeBuf[i]) & 0xff] ^ (crc >>> 8);
        for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
        crc = (crc ^ -1) >>> 0;
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc, 0);
        return Buffer.concat([len, typeBuf, data, crcBuf]);
    }

    const ihdrChunk = createChunk('IHDR', ihdrData);
    const idatChunk = createChunk('IDAT', compressed);
    const iendChunk = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const targetDir = path.resolve(__dirname, '..', 'build', 'thumbar');
if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

// 1. Prev: Lucide skip-back (outlined)
// polygon: (19,20) -> (9,12) -> (19,4) -> (19,20), line: (5,19) -> (5,5)
const prevSegments = [
    [19, 4, 9, 12],
    [9, 12, 19, 20],
    [19, 20, 19, 4],
    [5, 5, 5, 19]
];
fs.writeFileSync(path.join(targetDir, 'prev.png'), renderSegmentsToPng(24, 24, prevSegments, 1.8));

// 2. Next: Lucide skip-forward (outlined)
// polygon: (5,4) -> (15,12) -> (5,20) -> (5,4), line: (19,5) -> (19,19)
const nextSegments = [
    [5, 4, 15, 12],
    [15, 12, 5, 20],
    [5, 20, 5, 4],
    [19, 5, 19, 19]
];
fs.writeFileSync(path.join(targetDir, 'next.png'), renderSegmentsToPng(24, 24, nextSegments, 1.8));

// 3. Play: Lucide play (outlined, facing right)
// polygon: (6,3) -> (20,12) -> (6,21) -> (6,3)
const playSegments = [
    [6, 3, 20, 12],
    [20, 12, 6, 21],
    [6, 21, 6, 3]
];
fs.writeFileSync(path.join(targetDir, 'play.png'), renderSegmentsToPng(24, 24, playSegments, 1.8));

// 4. Pause: Lucide pause (outlined)
const pauseSegments = [
    [7, 4, 7, 20],
    [8, 4, 8, 20],
    [16, 4, 16, 20],
    [17, 4, 17, 20]
];
fs.writeFileSync(path.join(targetDir, 'pause.png'), renderSegmentsToPng(24, 24, pauseSegments, 1.8));

// 5. Stop: Outlined square
const stopSegments = [
    [5, 5, 19, 5],
    [19, 5, 19, 19],
    [19, 19, 5, 19],
    [5, 19, 5, 5]
];
fs.writeFileSync(path.join(targetDir, 'stop.png'), renderSegmentsToPng(24, 24, stopSegments, 1.8));

// 6. Fullscreen: Outlined maximize corners
const fullscreenSegments = [
    [3, 8, 3, 4],
    [3, 4, 7, 4],
    [17, 4, 21, 4],
    [21, 4, 21, 8],
    [3, 16, 3, 20],
    [3, 20, 7, 20],
    [17, 20, 21, 20],
    [21, 20, 21, 16]
];
fs.writeFileSync(path.join(targetDir, 'fullscreen.png'), renderSegmentsToPng(24, 24, fullscreenSegments, 1.8));

console.log('✓ Successfully generated all 6 crisp, outlined Lucide taskbar icons!');
