[CmdletBinding()]
param(
    [string]$TaskName = 'VaultExplorer-OnnTiviMateSync'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot 'Sync-OnnTiviMate.ps1'
$userId = "{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME
$arguments = "--headless pwsh.exe -NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File `"$syncScript`""

$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At '12:00AM'
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew -StartWhenAvailable:$false

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
