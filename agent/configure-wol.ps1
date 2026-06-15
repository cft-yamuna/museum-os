# Museum OS Wake-on-LAN Configuration (Windows)
# Run as Administrator.
# This script only applies WOL-related power settings.

$ErrorActionPreference = 'Stop'

function Require-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if (-not $isAdmin) {
        throw 'Run this script as Administrator.'
    }
}

function Try-SetRegistryDword([string]$Path, [string]$Name, [int]$Value) {
    try {
        if (-not (Test-Path $Path)) {
            New-Item -Path $Path -Force | Out-Null
        }
        Set-ItemProperty -Path $Path -Name $Name -Value $Value -Type DWord
        return $true
    } catch {
        return $false
    }
}

function Try-SetAdvancedProperty {
    param(
        [Parameter(Mandatory=$true)] [string]$AdapterName,
        [Parameter(Mandatory=$true)] [string[]]$DisplayNames,
        [Parameter(Mandatory=$true)] [string[]]$Values
    )

    foreach ($propName in $DisplayNames) {
        foreach ($propValue in $Values) {
            try {
                Set-NetAdapterAdvancedProperty -Name $AdapterName -DisplayName $propName -DisplayValue $propValue -NoRestart -ErrorAction Stop | Out-Null
                return "$propName=$propValue"
            } catch {
                # try next combination
            }
        }
    }

    return $null
}

Require-Admin

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  Museum OS Wake-on-LAN Configuration' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

Write-Host '[1/3] Disabling hibernation / fast startup...' -ForegroundColor Yellow
try {
    powercfg /h off | Out-Null
    Write-Host '  Hibernation disabled' -ForegroundColor Green
} catch {
    Write-Host '  WARNING: Could not disable hibernation' -ForegroundColor DarkYellow
}

$fastStartupOk = Try-SetRegistryDword -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name 'HiberbootEnabled' -Value 0
if ($fastStartupOk) {
    Write-Host '  Fast Startup disabled' -ForegroundColor Green
} else {
    Write-Host '  WARNING: Could not update Fast Startup registry setting' -ForegroundColor DarkYellow
}

Write-Host '[2/3] Applying NIC wake settings...' -ForegroundColor Yellow
$adapters = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -ne 'Disabled' }
if (-not $adapters -or $adapters.Count -eq 0) {
    Write-Host '  WARNING: No physical adapters found.' -ForegroundColor DarkYellow
} else {
    foreach ($adapter in $adapters) {
        $name = $adapter.Name
        Write-Host "  Adapter: $name" -ForegroundColor DarkGray

        try {
            powercfg -deviceenablewake "$name" 2>$null | Out-Null
        } catch {
            # best effort
        }

        try {
            Set-NetAdapterPowerManagement -Name $name -WakeOnMagicPacket Enabled -ErrorAction SilentlyContinue | Out-Null
            Set-NetAdapterPowerManagement -Name $name -AllowComputerToTurnOffDevice Disabled -ErrorAction SilentlyContinue | Out-Null
            Set-NetAdapterPowerManagement -Name $name -WakeOnPattern Enabled -ErrorAction SilentlyContinue | Out-Null
        } catch {
            # best effort
        }

        $magicSet = Try-SetAdvancedProperty -AdapterName $name -DisplayNames @(
            'Wake on Magic Packet',
            'Wake on MagicPacket',
            'Wake On Magic Packet',
            'Shutdown Wake-On-Lan'
        ) -Values @('Enabled', 'Enable', 'On')

        if ($magicSet) {
            Write-Host "    Magic packet: $magicSet" -ForegroundColor Green
        } else {
            Write-Host '    Magic packet property not found (driver-specific)' -ForegroundColor DarkGray
        }

        $eeeSet = Try-SetAdvancedProperty -AdapterName $name -DisplayNames @(
            'Energy Efficient Ethernet',
            'EEE',
            'Advanced EEE'
        ) -Values @('Disabled', 'Disable', 'Off')

        if ($eeeSet) {
            Write-Host "    Energy Efficient Ethernet: $eeeSet" -ForegroundColor Green
        } else {
            Write-Host '    Energy Efficient Ethernet property not found (driver-specific)' -ForegroundColor DarkGray
        }
    }
}

Write-Host '[3/3] Final check...' -ForegroundColor Yellow
try {
    $wakeDevices = powercfg -devicequery wake_armed
    if ($wakeDevices) {
        Write-Host '  Wake-armed devices:' -ForegroundColor Green
        $wakeDevices | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    } else {
        Write-Host '  No wake-armed devices reported yet.' -ForegroundColor DarkYellow
    }
} catch {
    Write-Host '  Could not query wake-armed devices' -ForegroundColor DarkYellow
}

Write-Host ''
Write-Host 'WOL configuration complete.' -ForegroundColor Cyan
Write-Host 'BIOS still must have Wake-on-LAN enabled and AC Recovery set to Power On.' -ForegroundColor DarkGray
Write-Host ''
