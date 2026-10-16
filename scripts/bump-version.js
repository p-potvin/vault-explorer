const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const infoPath = path.join(root, 'build-info.json');

const git = (cmd) => {
    try { return execSync(`git ${cmd}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { return ''; }
};

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
pkg.version = `${major}.${minor}.${patch + 1}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const sha = git('rev-parse --short HEAD') || 'unknown';
const dirty = git('status --porcelain') ? '-dirty' : '';
const info = {
    version: pkg.version,
    commit: sha + dirty,
    branch: git('rev-parse --abbrev-ref HEAD') || 'unknown',
    builtAt: new Date().toISOString(),
};
fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + '\n', 'utf8');

console.log(`[build] version ${info.version} (${info.commit}) on ${info.branch}`);
