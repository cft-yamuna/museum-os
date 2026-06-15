# Museum OS - Windows Uninstall wrapper
# Kept for backwards compatibility; delegates to uninstall.ps1.
#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetScript = Join-Path $scriptDir 'uninstall.ps1'

if (-not (Test-Path $targetScript)) {
    throw "uninstall.ps1 not found at $targetScript"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $targetScript @args
exit $LASTEXITCODE
