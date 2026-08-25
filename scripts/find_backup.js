const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain';
if (fs.existsSync(brainDir)) {
    const convs = fs.readdirSync(brainDir);
    for (const conv of convs) {
        const fullConv = path.join(brainDir, conv);
        if (!fs.statSync(fullConv).isDirectory()) continue;
        const logFile = path.join(fullConv, '.system_generated', 'logs', 'transcript_full.jsonl');
        if (fs.existsSync(logFile)) {
            console.log('Checking transcript in:', conv);
            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('virtualFolders') && (line.includes('collection') || line.includes('folders'))) {
                    // Extract json snippets
                    console.log(`[Conv ${conv} L${i}] Match:`, line.substring(0, 300));
                }
            }
        }
    }
}
