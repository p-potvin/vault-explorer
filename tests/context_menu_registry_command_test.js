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
    /\$NodeExe = \(Get-Command node\.exe -CommandType Application -ErrorAction Stop\)\.Source/,
    'The registry installer must resolve the Node runtime used to execute Electron CLI.',
);
assert.match(
    installer,
    /\$ElectronCli = "\$RepoPath\\node_modules\\electron\\cli\.js"/,
    'The registry installer must target Electron CLI rather than electron.exe.',
);
assert.match(
    installer,
    /if \(\(Test-Path \$NodeExe\) -and \(Test-Path \$ElectronCli\)\) \{[\s\S]*?\$FileCommand = "`"\$NodeExe`" `"\$ElectronCli`" `"\$RepoPath`" --prioritize-player `"%1`""/,
    'Video entries must pass --prioritize-player through Node and Electron CLI.',
);
assert.match(
    installer,
    /\$FolderBgCommand = "`"\$NodeExe`" `"\$ElectronCli`" `"\$RepoPath`" `"%V`""/,
    'Folder-background entries must launch Node with the local Electron CLI.',
);
assert.match(
    installer,
    /\$FolderItemCommand = "`"\$NodeExe`" `"\$ElectronCli`" `"\$RepoPath`" `"%1`""/,
    'Directory entries must launch Node with the local Electron CLI.',
);
assert.doesNotMatch(
    installer,
    /electron\\dist\\electron\.exe/,
    'The registry installer must not launch electron.exe directly.',
);

console.log('Context-menu registry command regression checks passed.');
