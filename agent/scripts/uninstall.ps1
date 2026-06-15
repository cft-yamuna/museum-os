# Museum OS - Windows Uninstall / Reset
# Removes Museum OS agent and power-only installs, reverts kiosk shell/login changes,
# removes Museum OS firewall/tasks/files, and optionally removes SSH/kiosk user.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -RemoveKioskUser
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -RestoreComputerName DESKTOP-123456
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -AutoReboot:$false
#Requires -RunAsAdministrator

param(
    [bool]$RemoveAllData = $true,
    [bool]$RemoveOpenSsh = $true,
    [bool]$ResetPowerSettings = $true,
    [bool]$ResetNetworkSettings = $true,
    [bool]$AutoReboot = $true,
    [switch]$RemoveKioskUser,
    [string]$KioskUsername = 'kiosk',
    [string]$RestoreComputerName = ''
)

$ErrorActionPreference = 'Stop'

$InstallRoot = 'C:\Program Files\Lightman'
$AgentInstallDir = Join-Path $InstallRoot 'Agent'
$PowerInstallDir = Join-Path $InstallRoot 'PowerAgent'
$AgentBackupDir = "${AgentInstallDir}-backup"
$DataDir = 'C:\ProgramData\Lightman'
$NssmExe = Join-Path $DataDir 'nssm\nssm.exe'
$LightmanServices = @('LightmanAgent', 'LightmanPowerAgent')
$LightmanTasks = @('LIGHTMAN Agent', 'LIGHTMAN Kiosk Browser', 'LIGHTMAN Guardian')

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host $Text -ForegroundColor Yellow
}

function Remove-RegistryValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    try {
        if (Test-Path $Path) {
            Remove-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue
        }
    } catch {
    }
}

function Remove-RegistryKeyIfEmpty {
    param([Parameter(Mandatory = $true)][string]$Path)

    try {
        if (-not (Test-Path $Path)) {
            return
        }

        $item = Get-Item $Path -ErrorAction SilentlyContinue
        if (-not $item) {
            return
        }

        $hasChildren = @(Get-ChildItem $Path -ErrorAction SilentlyContinue).Count -gt 0
        $props = @($item.Property | Where-Object { $_ -notlike 'PS*' })
        if (-not $hasChildren -and $props.Count -eq 0) {
            Remove-Item $Path -Force -ErrorAction SilentlyContinue
        }
    } catch {
    }
}

function Stop-And-Delete-Service {
    param([Parameter(Mandatory = $true)][string]$Name)

    try { Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue } catch {}
    if (Test-Path $NssmExe) {
        try { & $NssmExe stop $Name 2>$null | Out-Null } catch {}
        try { & $NssmExe remove $Name confirm 2>$null | Out-Null } catch {}
    }
    try { sc.exe stop $Name 2>$null | Out-Null } catch {}
    try { sc.exe delete $Name 2>$null | Out-Null } catch {}
}

function Set-Or-RemoveProperty {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Value = $null
    )

    try {
        if (-not (Test-Path $Path)) {
            New-Item -Path $Path -Force | Out-Null
        }

        if ($null -eq $Value) {
            Remove-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue
        } else {
            Set-ItemProperty -Path $Path -Name $Name -Value $Value -ErrorAction SilentlyContinue
        }
    } catch {
    }
}

function Remove-PathEntry {
    param(
        [Parameter(Mandatory = $true)][string]$Entry,
        [ValidateSet('Machine', 'User')][string]$Scope = 'Machine'
    )

    try {
        $current = [Environment]::GetEnvironmentVariable('Path', $Scope)
        if (-not $current) {
            return
        }

        $parts = $current.Split(';') |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and $_ -ine $Entry }

        [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), $Scope)
    } catch {
    }
}

function Try-SetAdapterAdvancedProperty {
    param(
        [Parameter(Mandatory = $true)][string]$AdapterName,
        [Parameter(Mandatory = $true)][string[]]$DisplayNames,
        [Parameter(Mandatory = $true)][string[]]$Values
    )

    foreach ($displayName in $DisplayNames) {
        foreach ($value in $Values) {
            try {
                Set-NetAdapterAdvancedProperty -Name $AdapterName -DisplayName $displayName -DisplayValue $value -NoRestart -ErrorAction Stop | Out-Null
                return $true
            } catch {
            }
        }
    }

    return $false
}

function Reset-NetworkConfiguration {
    $physicalAdapters = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -ne 'Disabled' }
    foreach ($adapter in $physicalAdapters) {
        $ifIndex = $adapter.ifIndex
        $adapterName = $adapter.Name

        try {
            Get-NetIPAddress -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.PrefixOrigin -eq 'Manual' -or $_.SuffixOrigin -eq 'Manual' -or $_.IPAddress -like '169.254.*' } |
                Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
        } catch {
        }

        try { Set-NetIPInterface -InterfaceIndex $ifIndex -AddressFamily IPv4 -Dhcp Enabled -ErrorAction SilentlyContinue | Out-Null } catch {}
        try { Set-DnsClientServerAddress -InterfaceIndex $ifIndex -ResetServerAddresses -ErrorAction SilentlyContinue | Out-Null } catch {}

        try {
            $nicConfig = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "InterfaceIndex = $ifIndex" -ErrorAction SilentlyContinue
            if ($nicConfig) {
                [void](Invoke-CimMethod -InputObject $nicConfig -MethodName EnableDHCP -ErrorAction SilentlyContinue)
                [void](Invoke-CimMethod -InputObject $nicConfig -MethodName SetDNSServerSearchOrder -Arguments @{ DNSServerSearchOrder = @() } -ErrorAction SilentlyContinue)
                [void](Invoke-CimMethod -InputObject $nicConfig -MethodName ReleaseDHCPLease -ErrorAction SilentlyContinue)
                [void](Invoke-CimMethod -InputObject $nicConfig -MethodName RenewDHCPLease -ErrorAction SilentlyContinue)
            }
        } catch {
        }

        try { Set-NetAdapterPowerManagement -Name $adapterName -WakeOnMagicPacket Disabled -ErrorAction SilentlyContinue | Out-Null } catch {}
        try { Set-NetAdapterPowerManagement -Name $adapterName -WakeOnPattern Disabled -ErrorAction SilentlyContinue | Out-Null } catch {}
        try { Set-NetAdapterPowerManagement -Name $adapterName -AllowComputerToTurnOffDevice Enabled -ErrorAction SilentlyContinue | Out-Null } catch {}

        [void](Try-SetAdapterAdvancedProperty -AdapterName $adapterName `
            -DisplayNames @('Energy Efficient Ethernet', 'EEE', 'Advanced EEE') `
            -Values @('Enabled', 'Enable', 'On'))
    }
}

Write-Host ''
Write-Host '=== Museum OS - Windows Uninstall / Reset ===' -ForegroundColor Cyan
Write-Host "  Remove data       : $RemoveAllData"
Write-Host "  Remove OpenSSH    : $RemoveOpenSsh"
Write-Host "  Reset power plan  : $ResetPowerSettings"
Write-Host "  Reset network     : $ResetNetworkSettings"
Write-Host "  Auto reboot       : $AutoReboot"
Write-Host "  Remove kiosk user : $($RemoveKioskUser.IsPresent)"
if ($RestoreComputerName) {
    Write-Host "  Restore hostname  : $RestoreComputerName"
}

Write-Step '[1/9] Stopping and removing Museum OS services...'
foreach ($serviceName in $LightmanServices) {
    Stop-And-Delete-Service -Name $serviceName
}
try {
    $extraServices = Get-Service -DisplayName 'LIGHTMAN*' -ErrorAction SilentlyContinue
    foreach ($svc in $extraServices) {
        Stop-And-Delete-Service -Name $svc.Name
    }
} catch {
}

Write-Step '[2/9] Removing Museum OS scheduled tasks...'
foreach ($taskName in $LightmanTasks) {
    try {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) {
            Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        }
    } catch {
    }
}

Write-Step '[3/9] Stopping Museum OS-related processes...'
foreach ($procName in @('chrome', 'node', 'wscript')) {
    try {
        Get-Process -Name $procName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    } catch {
    }
}

Write-Step '[4/9] Restoring shell, login, and Windows policies...'
$HKLMWinlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
$HKCUWinlogon = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon'
$currentShell = (Get-ItemProperty -Path $HKLMWinlogon -Name 'Shell' -ErrorAction SilentlyContinue).Shell
$originalShell = (Get-ItemProperty -Path $HKLMWinlogon -Name 'Shell_Original' -ErrorAction SilentlyContinue).Shell_Original

if ($currentShell -and $currentShell -like '*lightman*') {
    Set-ItemProperty -Path $HKLMWinlogon -Name 'Shell' -Value $(if ($originalShell) { $originalShell } else { 'explorer.exe' })
} elseif ($originalShell) {
    Set-ItemProperty -Path $HKLMWinlogon -Name 'Shell' -Value $originalShell
}
Remove-RegistryValue -Path $HKLMWinlogon -Name 'Shell_Original'
Remove-RegistryValue -Path $HKCUWinlogon -Name 'Shell'

Set-Or-RemoveProperty -Path $HKLMWinlogon -Name 'AutoAdminLogon' -Value '0'
Remove-RegistryValue -Path $HKLMWinlogon -Name 'DefaultUserName'
Remove-RegistryValue -Path $HKLMWinlogon -Name 'DefaultPassword'
Remove-RegistryValue -Path $HKLMWinlogon -Name 'DefaultDomainName'
Remove-RegistryValue -Path $HKLMWinlogon -Name 'AutoLogonSID'
Remove-RegistryValue -Path $HKLMWinlogon -Name 'AutoRestartShell'

Remove-RegistryValue -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'DisableAutomaticRestartSignOn'
Remove-RegistryValue -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'EnableFirstLogonAnimation'
Remove-RegistryValue -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'DisableLockWorkstation'
Remove-RegistryValue -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'HideFastUserSwitching'
Remove-RegistryValue -Path $HKLMWinlogon -Name 'DisableCAD'
Remove-RegistryValue -Path $HKCUWinlogon -Name 'EnableGoodbye'

$userListPath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\SpecialAccounts\UserList'
if (Test-Path $userListPath) {
    try {
        $props = (Get-ItemProperty -Path $userListPath -ErrorAction SilentlyContinue).PSObject.Properties |
            Where-Object { $_.Name -notlike 'PS*' }
        foreach ($prop in $props) {
            if ($prop.Value -eq 0 -or $prop.Name -eq $KioskUsername) {
                Remove-RegistryValue -Path $userListPath -Name $prop.Name
            }
        }
    } catch {
    }
    Remove-RegistryKeyIfEmpty -Path $userListPath
}

$policyValues = @(
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization'; Name = 'NoLockScreen' },
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\LogonUI\SessionData'; Name = 'AllowLockScreen' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'; Name = 'DisableWindowsConsumerFeatures' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'; Name = 'DisableCloudOptimizedContent' },
    @{ Path = 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'; Name = 'DisableWindowsSpotlightFeatures' },
    @{ Path = 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'; Name = 'DisableTailoredExperiencesWithDiagnosticData' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OOBE'; Name = 'DisablePrivacyExperience' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'; Name = 'NoAutoRebootWithLoggedOnUsers' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'; Name = 'AUOptions' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'; Name = 'SetAutoRestartNotificationDisable' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'; Name = 'SetActiveHours' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'; Name = 'ActiveHoursStart' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'; Name = 'ActiveHoursEnd' },
    @{ Path = 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\Explorer'; Name = 'DisableNotificationCenter' },
    @{ Path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications'; Name = 'ToastEnabled' },
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting'; Name = 'DontShowUI' },
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting'; Name = 'Disabled' },
    @{ Path = 'HKLM:\SYSTEM\CurrentControlSet\Control\Windows'; Name = 'ErrorMode' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search'; Name = 'AllowCortana' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\PassportForWork'; Name = 'Enabled' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\0e796bdb-100d-47d6-a2d5-f7d2daa51f51'; Name = 'ACSettingIndex' },
    @{ Path = 'HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\0e796bdb-100d-47d6-a2d5-f7d2daa51f51'; Name = 'DCSettingIndex' },
    @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device'; Name = 'DevicePasswordLessBuildVersion' },
    @{ Path = 'HKCU:\Control Panel\Desktop'; Name = 'ScreenSaverIsSecure' },
    @{ Path = 'HKCU:\Control Panel\Desktop'; Name = 'ScreenSaveActive' }
)
foreach ($item in $policyValues) {
    Remove-RegistryValue -Path $item.Path -Name $item.Name
}

Write-Step '[5/9] Restoring power/network defaults and re-enabling Windows tasks...'
try { Enable-ScheduledTask -TaskPath '\Microsoft\Windows\Shell\' -TaskName 'CreateObjectTask' -ErrorAction SilentlyContinue | Out-Null } catch {}
try { Enable-ScheduledTask -TaskPath '\Microsoft\Windows\UpdateOrchestrator\' -TaskName 'Reboot' -ErrorAction SilentlyContinue | Out-Null } catch {}
try { Enable-ScheduledTask -TaskPath '\Microsoft\Windows\UpdateOrchestrator\' -TaskName 'Schedule Retry Scan' -ErrorAction SilentlyContinue | Out-Null } catch {}
try { Enable-ScheduledTask -TaskPath '\Microsoft\Windows\WindowsUpdate\' -TaskName 'Scheduled Start' -ErrorAction SilentlyContinue | Out-Null } catch {}

if ($ResetPowerSettings) {
    try { powercfg -restoredefaultschemes 2>&1 | Out-Null } catch {}
    try { powercfg /hibernate on 2>&1 | Out-Null } catch {}
    try {
        $powerPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power'
        if (Test-Path $powerPath) {
            Set-ItemProperty -Path $powerPath -Name 'HiberbootEnabled' -Value 1 -ErrorAction SilentlyContinue
        }
    } catch {
    }
}

if ($ResetNetworkSettings) {
    try { Reset-NetworkConfiguration } catch {}
}

Write-Step '[6/9] Removing Museum OS firewall rules and SSH (optional)...'
try { Remove-NetFirewallRule -DisplayName 'LIGHTMAN Agent WebSocket' -ErrorAction SilentlyContinue | Out-Null } catch {}
try {
    Get-NetFirewallRule -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'LIGHTMAN*' } |
        Remove-NetFirewallRule -ErrorAction SilentlyContinue | Out-Null
} catch {
}

if ($RemoveOpenSsh) {
    foreach ($sshService in @('sshd', 'ssh-agent')) {
        try { Stop-Service $sshService -Force -ErrorAction SilentlyContinue } catch {}
        try { sc.exe stop $sshService 2>$null | Out-Null } catch {}
        try { sc.exe delete $sshService 2>$null | Out-Null } catch {}
    }

    try { Remove-NetFirewallRule -DisplayName 'OpenSSH' -ErrorAction SilentlyContinue | Out-Null } catch {}
    Remove-RegistryValue -Path 'HKLM:\SOFTWARE\OpenSSH' -Name 'DefaultShell'
    Remove-PathEntry -Entry 'C:\Program Files\OpenSSH-Win64' -Scope 'Machine'
    Remove-PathEntry -Entry 'C:\Program Files\OpenSSH-Win64' -Scope 'User'

    try {
        if (Test-Path 'C:\ProgramData\ssh') {
            Remove-Item 'C:\ProgramData\ssh' -Recurse -Force -ErrorAction SilentlyContinue
        }
    } catch {
    }

    try { Remove-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction SilentlyContinue | Out-Null } catch {}
    try { dism /online /Remove-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0 /NoRestart 2>$null | Out-Null } catch {}
    try { Remove-Item 'C:\Program Files\OpenSSH-Win64' -Recurse -Force -ErrorAction SilentlyContinue } catch {}
}

Write-Step '[7/9] Removing Museum OS files and data...'
foreach ($path in @($AgentInstallDir, $PowerInstallDir, $AgentBackupDir)) {
    try {
        if (Test-Path $path) {
            Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
        }
    } catch {
    }
}

try {
    if (Test-Path $InstallRoot) {
        Remove-Item $InstallRoot -Force -ErrorAction SilentlyContinue
    }
} catch {
}

if ($RemoveAllData) {
    try {
        if (Test-Path $DataDir) {
            Remove-Item $DataDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    } catch {
    }
}

Write-Step '[8/9] Removing kiosk user (optional) and restoring hostname (optional)...'
if ($RemoveKioskUser.IsPresent) {
    if ($env:USERNAME -ieq $KioskUsername) {
        Write-Host "  Skipped removing '$KioskUsername' because the current session is using that account." -ForegroundColor DarkYellow
    } else {
        try {
            $kioskUser = Get-LocalUser -Name $KioskUsername -ErrorAction SilentlyContinue
            if ($kioskUser) {
                Remove-LocalUser -Name $KioskUsername -ErrorAction SilentlyContinue
                Write-Host "  Removed local user '$KioskUsername'" -ForegroundColor Green
            }
        } catch {
            Write-Host "  WARNING: Could not remove '$KioskUsername': $($_.Exception.Message)" -ForegroundColor DarkYellow
        }

        try {
            $profilePath = Join-Path 'C:\Users' $KioskUsername
            if (Test-Path $profilePath) {
                Remove-Item $profilePath -Recurse -Force -ErrorAction SilentlyContinue
            }
        } catch {
        }
    }
}

if ($RestoreComputerName) {
    try {
        Rename-Computer -NewName $RestoreComputerName -Force -ErrorAction Stop
        Write-Host "  Hostname will change to $RestoreComputerName after reboot" -ForegroundColor Green
    } catch {
        Write-Host "  WARNING: Could not rename computer: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

Write-Step '[9/9] Final cleanup summary...'
Write-Host "  Current computer name : $env:COMPUTERNAME"
Write-Host "  Museum OS install root : removed"
Write-Host "  Museum OS data         : $(if($RemoveAllData){'removed'}else{'kept'})"
Write-Host "  OpenSSH               : $(if($RemoveOpenSsh){'removed'}else{'kept'})"
Write-Host "  Network config        : $(if($ResetNetworkSettings){'reset to DHCP defaults'}else{'kept'})"
Write-Host "  Kiosk user            : $(if($RemoveKioskUser.IsPresent){'remove requested'}else{'kept'})"
Write-Host ''
Write-Host 'Shared apps intentionally left alone:' -ForegroundColor DarkGray
Write-Host '  - Google Chrome' -ForegroundColor DarkGray
Write-Host '  - Node.js' -ForegroundColor DarkGray
Write-Host ''
if ($AutoReboot) {
    Write-Host 'Rebooting in 15 seconds...' -ForegroundColor Yellow
    Write-Host '  Press Ctrl+C now to cancel.' -ForegroundColor Yellow
    Write-Host ''
    Start-Sleep -Seconds 15
    Restart-Computer -Force
} else {
    Write-Host 'A reboot is recommended now:' -ForegroundColor Yellow
    Write-Host '  Restart-Computer' -ForegroundColor Yellow
    Write-Host ''
}
