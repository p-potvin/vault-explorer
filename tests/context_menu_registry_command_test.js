const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const installer = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'pwsh', 'install_context_menu.ps1'),
    'utf8',
);

assert.match(
    installer,
    /\$RepoPath = \(Resolve-Path \(Join-Path \$PSScriptRoot "\.\.\\\.\."\)\)\.Path/,
    'The registry installer must resolve the checkout path from its own location.',
);
assert.match(
    installer,
    /\$UnpackedExe = Join-Path \$RepoPath "dist\\win-unpacked\\vault-explorer\.exe"/,
    'The registry installer must resolve the unpacked executable in dist/win-unpacked.',
);
assert.match(
    installer,
    /\$FileCommand = "`"\$UnpackedExe`" --prioritize-player `"%1`""/,
    'Video entries must invoke the unpacked executable with --prioritize-player "%1".',
);
assert.match(
    installer,
    /\$FolderBgCommand = "`"\$UnpackedExe`" `"%V`""/,
    'Folder-background entries must invoke the unpacked executable with %V.',
);
assert.match(
    installer,
    /\$FolderItemCommand = "`"\$UnpackedExe`" `"%1`""/,
    'Directory entries must invoke the unpacked executable with "%1".',
);
assert.doesNotMatch(
    installer,
    /electron\\cli\.js/,
    'The registry installer must not use the Electron CLI anymore.',
);

console.log('Context-menu registry command regression checks passed.');
