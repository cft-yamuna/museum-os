# Curato - Power-only setup wrapper
# Kept for backwards compatibility; delegates to scripts/setup-device-power-only.ps1.
#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetScript = Join-Path $scriptDir 'scripts\setup-device-power-only.ps1'

if (-not (Test-Path $targetScript)) {
    throw "setup-device-power-only.ps1 not found at $targetScript"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $targetScript @args
exit $LASTEXITCODE
