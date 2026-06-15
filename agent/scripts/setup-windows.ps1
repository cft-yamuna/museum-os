# Museum OS Agent - One-Shot Windows Kiosk Setup
# Usage: powershell -ep bypass -c "irm 'http://SERVER:3401/setup.ps1?slug=SLUG' | iex"
#
# The server injects $Server and $Slug automatically via query parameters.
# Safe to re-run (idempotent). Auto-reboots after setup.

$ErrorActionPreference = 'Stop'
$Server = 'http://192.168.10.100:3401'
$Slug = ''
$SetupDebugMarker = 'setup-windows.ps1 debug 2026-04-25b'

trap {
    $lineNumber = $_.InvocationInfo.ScriptLineNumber
    $lineText = $_.InvocationInfo.Line

    Write-Host ''
    Write-Host "FATAL: $($_.Exception.Message)" -ForegroundColor Red
    if ($lineNumber) {
        Write-Host "  Line: $lineNumber" -ForegroundColor DarkYellow
    }
    if ($lineText) {
        Write-Host "  Command: $($lineText.Trim())" -ForegroundColor DarkYellow
    }
    exit 1
}

Write-Host "Museum OS setup marker: $SetupDebugMarker" -ForegroundColor DarkCyan

# --- Constants ---
$InstallDir   = 'C:\Program Files\Lightman\Agent'
$DataDir      = 'C:\ProgramData\Lightman'
$LogDir       = "$DataDir\logs"
$NssmDir      = "$DataDir\nssm"
$NssmExe      = "$NssmDir\nssm.exe"
$ServiceName  = 'LightmanAgent'
$GuardianTask = 'LIGHTMAN Guardian'
$TempFile     = "$env:TEMP\lightman-update.tar.gz"
$KioskUsername = 'kiosk'
$KioskPassword = 'Light123'
$AutoLoginPassword = $KioskPassword
$PairingTimeoutSeconds = 900
$PairingPollSeconds = 5
$NodeMsiOfficialUrl = 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi'
$ChromeMsiOfficialUrl64 = 'https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi'
$ChromeMsiOfficialUrl32 = 'https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise.msi'
$NssmZipUrls = @(
    'https://nssm.cc/release/nssm-2.24.zip',
    'https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip'
)

function Refresh-ProcessPathFromRegistry {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')

    if ($machinePath -and $userPath) {
        $env:Path = "$machinePath;$userPath"
    } elseif ($machinePath) {
        $env:Path = $machinePath
    } elseif ($userPath) {
        $env:Path = $userPath
    }
}

function Resolve-NodeExePath {
    Refresh-ProcessPathFromRegistry

    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
        return $cmd.Source
    }

    $candidates = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    ) | Where-Object { $_ }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Get-NodeVersion {
    param([Parameter(Mandatory = $false)][string]$NodeExePath)

    if (-not $NodeExePath) {
        return $null
    }

    try {
        return ((& $NodeExePath -v) -replace '^v', '').Trim()
    } catch {
        return $null
    }
}

function Test-MsiPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $false)][long]$MinBytes = 1048576
    )

    if (-not (Test-Path $Path)) {
        return $false
    }

    try {
        $item = Get-Item $Path -ErrorAction Stop
        if ($item.Length -lt $MinBytes) {
            return $false
        }

        $stream = [System.IO.File]::OpenRead($Path)
        try {
            $header = New-Object byte[] 8
            $read = $stream.Read($header, 0, 8)
            if ($read -lt 8) {
                return $false
            }
            $sig = [System.BitConverter]::ToString($header)
            return $sig -eq 'D0-CF-11-E0-A1-B1-1A-E1'
        } finally {
            $stream.Dispose()
        }
    } catch {
        return $false
    }
}

function Download-ValidMsi {
    param(
        [Parameter(Mandatory = $true)][string[]]$Sources,
        [Parameter(Mandatory = $true)][string]$OutFile
    )

    foreach ($source in $Sources) {
        try {
            Invoke-WebRequest -Uri $source -OutFile $OutFile -UseBasicParsing -TimeoutSec 240 -ErrorAction Stop
        } catch {
            Write-Host "  Download failed from $source : $($_.Exception.Message)" -ForegroundColor DarkYellow
            continue
        }

        if (Test-MsiPackage -Path $OutFile) {
            return $source
        }

        Write-Host "  Download from $source is not a valid MSI package." -ForegroundColor DarkYellow
        Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
    }

    return $null
}

function Resolve-ChromeExePath {
    $candidates = @(
        'C:\Program Files\Google\Chrome\Application\chrome.exe',
        'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    ) | Where-Object { $_ }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Install-ChromeWithWinget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        return $false
    }

    Write-Host '  Trying winget install for Google Chrome...' -ForegroundColor Yellow
    & winget install --id Google.Chrome --exact --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Host
    return ($LASTEXITCODE -eq 0)
}

function Try-SetRegistryDword {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Value
    )

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
        [Parameter(Mandatory = $true)][string]$AdapterName,
        [Parameter(Mandatory = $true)][string[]]$DisplayNames,
        [Parameter(Mandatory = $true)][string[]]$Values
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

function Configure-WolSettings {
    Write-Host '  Wake-on-LAN settings...' -ForegroundColor DarkGray

    try {
        powercfg /h off | Out-Null
    } catch {
        Write-Host '    WARNING: Could not disable hibernation' -ForegroundColor DarkYellow
    }

    $fastStartupOk = Try-SetRegistryDword -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name 'HiberbootEnabled' -Value 0
    if (-not $fastStartupOk) {
        Write-Host '    WARNING: Could not disable Fast Startup registry flag' -ForegroundColor DarkYellow
    }

    $adapters = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -ne 'Disabled' }
    if (-not $adapters) {
        Write-Host '    WARNING: No physical adapters found for WOL configuration.' -ForegroundColor DarkYellow
        return
    }

    foreach ($adapter in $adapters) {
        $name = $adapter.Name
        try { powercfg -deviceenablewake "$name" 2>$null | Out-Null } catch {}

        try {
            Set-NetAdapterPowerManagement -Name $name -WakeOnMagicPacket Enabled -ErrorAction SilentlyContinue | Out-Null
            Set-NetAdapterPowerManagement -Name $name -AllowComputerToTurnOffDevice Disabled -ErrorAction SilentlyContinue | Out-Null
            Set-NetAdapterPowerManagement -Name $name -WakeOnPattern Enabled -ErrorAction SilentlyContinue | Out-Null
        } catch {}

        $null = Try-SetAdvancedProperty -AdapterName $name -DisplayNames @(
            'Wake on Magic Packet',
            'Wake on MagicPacket',
            'Wake On Magic Packet',
            'Shutdown Wake-On-Lan'
        ) -Values @('Enabled', 'Enable', 'On')

        $null = Try-SetAdvancedProperty -AdapterName $name -DisplayNames @(
            'Energy Efficient Ethernet',
            'EEE',
            'Advanced EEE'
        ) -Values @('Disabled', 'Disable', 'Off')
    }

    try {
        $wakeDevices = @(powercfg -devicequery wake_armed 2>$null)
        if ($wakeDevices.Count -gt 0) {
            Write-Host '    Wake-armed devices:' -ForegroundColor Green
            $wakeDevices | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
        } else {
            Write-Host '    WARNING: Windows reports no wake-armed adapters yet.' -ForegroundColor DarkYellow
        }
    } catch {
        Write-Host '    WARNING: Could not query wake-armed devices.' -ForegroundColor DarkYellow
    }
}

function Ensure-Nssm {
    if (Test-Path $NssmExe) {
        return $true
    }

    New-Item -ItemType Directory -Force -Path $NssmDir -ErrorAction SilentlyContinue | Out-Null

    $bundledInInstall = Join-Path $InstallDir 'nssm\nssm.exe'
    if (Test-Path $bundledInInstall) {
        Copy-Item $bundledInInstall $NssmExe -Force
        if (Test-Path $NssmExe) {
            Write-Host '  NSSM restored from extracted agent bundle.' -ForegroundColor Green
            return $true
        }
    }

    # First try server-hosted installers for offline/LAN setups.
    $serverNssmExe = "$Server/installers/nssm.exe"
    $tmpExe = Join-Path $env:TEMP 'nssm-direct.exe'
    try {
        Invoke-WebRequest -Uri $serverNssmExe -OutFile $tmpExe -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
        if ((Test-Path $tmpExe) -and (Get-Item $tmpExe).Length -gt 100000) {
            Copy-Item $tmpExe $NssmExe -Force
        }
    } catch {
        # try zip sources next
    } finally {
        Remove-Item $tmpExe -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $NssmExe) {
        Write-Host '  NSSM downloaded from server installer.' -ForegroundColor Green
        return $true
    }

    $zipSources = @("$Server/installers/nssm.zip") + $NssmZipUrls
    $zipPath = Join-Path $env:TEMP 'nssm.zip'
    $extractPath = Join-Path $env:TEMP 'nssm-extract'
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $downloaded = $false
    foreach ($url in $zipSources) {
        Write-Host "  Trying NSSM source: $url" -ForegroundColor DarkGray
        try {
            Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -TimeoutSec 90 -ErrorAction Stop
            if ((Test-Path $zipPath) -and (Get-Item $zipPath).Length -gt 10000) {
                $downloaded = $true
                break
            }
        } catch {}
    }

    if (-not $downloaded) {
        return $false
    }

    try {
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
        $candidate = Get-ChildItem $extractPath -Recurse -Filter 'nssm.exe' | Where-Object { $_.DirectoryName -like '*win64*' } | Select-Object -First 1
        if (-not $candidate) {
            $candidate = Get-ChildItem $extractPath -Recurse -Filter 'nssm.exe' | Select-Object -First 1
        }
        if ($candidate) {
            Copy-Item $candidate.FullName $NssmExe -Force
        }
    } catch {
        return $false
    } finally {
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $NssmExe) {
        Write-Host '  NSSM downloaded successfully.' -ForegroundColor Green
        return $true
    }

    return $false
}

function Get-ActiveAdapterInfo {
    $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
        $_.Status -eq 'Up' -and $_.MacAddress
    }
    if (-not $adapters) { return $null }

    $ethernet = $adapters | Where-Object {
        $_.Name -match 'Ethernet' -or $_.InterfaceDescription -match 'Ethernet'
    } | Select-Object -First 1
    if ($ethernet) {
        return @{
            Name = $ethernet.Name
            MacAddress = $ethernet.MacAddress
            IsEthernet = $true
        }
    }

    $physical = $adapters | Where-Object { $_.HardwareInterface -eq $true } | Select-Object -First 1
    if ($physical) {
        return @{
            Name = $physical.Name
            MacAddress = $physical.MacAddress
            IsEthernet = $false
        }
    }

    $fallback = $adapters | Select-Object -First 1
    return @{
        Name = $fallback.Name
        MacAddress = $fallback.MacAddress
        IsEthernet = $false
    }
}

function Write-IdentityFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$DeviceId,
        [Parameter(Mandatory = $true)][string]$ApiKey
    )

    $identityJson = "{`"deviceId`":`"$DeviceId`",`"apiKey`":`"$ApiKey`"}"
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $identityJson, $utf8)
}

function Wait-ForServerProvisioning {
    param(
        [Parameter(Mandatory = $true)][string]$ServerUrl,
        [Parameter(Mandatory = $true)][string]$DeviceSlug,
        [Parameter(Mandatory = $false)][int]$TimeoutSeconds = 900,
        [Parameter(Mandatory = $false)][int]$PollSeconds = 5
    )

    $encodedSlug = [System.Uri]::EscapeDataString($DeviceSlug)
    $baseUrl = "$ServerUrl/api/devices/provision/$encodedSlug"

    $provision = Invoke-RestMethod -Method Get -Uri $baseUrl -TimeoutSec 10
    if ($provision.deviceId -and $provision.apiKey) {
        return @{
            deviceId = [string]$provision.deviceId
            apiKey = [string]$provision.apiKey
            mode = 'auto'
        }
    }

    if (-not ($provision.requiresPairing -and $provision.code)) {
        throw "Unexpected provisioning response: $($provision | ConvertTo-Json -Compress)"
    }

    $code = [string]$provision.code
    $statusUrl = "$baseUrl/status?code=$([System.Uri]::EscapeDataString($code))"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $attempt = 0

    Write-Host "  Pairing code: $code" -ForegroundColor Magenta
    Write-Host "  Waiting for admin approval in Museum OS (timeout ${TimeoutSeconds}s)..." -ForegroundColor Yellow

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $PollSeconds
        $attempt++
        try {
            $status = Invoke-RestMethod -Method Get -Uri $statusUrl -TimeoutSec 10
            if ($status.deviceId -and $status.apiKey) {
                return @{
                    deviceId = [string]$status.deviceId
                    apiKey = [string]$status.apiKey
                    mode = 'paired'
                }
            }
        } catch {
            Write-Host "  Pairing status check failed (attempt $attempt), retrying..." -ForegroundColor DarkYellow
        }

        if ($attempt % 6 -eq 0) {
            $remaining = [Math]::Max(0, [int](($deadline - (Get-Date)).TotalSeconds))
            Write-Host "  Still waiting for server approval... (${remaining}s left)" -ForegroundColor DarkGray
        }
    }

    throw "Pairing timed out after ${TimeoutSeconds}s. Approve the device in admin and re-run setup."
}

function Set-SshDefaultShell {
    $openSshReg = 'HKLM:\SOFTWARE\OpenSSH'
    if (-not (Test-Path $openSshReg)) {
        New-Item -Path $openSshReg -Force | Out-Null
    }

    $powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Set-ItemProperty -Path $openSshReg -Name 'DefaultShell' -Value $powerShellPath -ErrorAction SilentlyContinue
}

function Ensure-SshFirewallRule {
    $rule = Get-NetFirewallRule -DisplayName 'OpenSSH' -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -DisplayName 'OpenSSH' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 | Out-Null
    }
}

function Grant-SshPathAccess {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path $Path)) {
        return $false
    }

    try {
        $item = Get-Item -LiteralPath $Path -ErrorAction Stop
        if ($item.PSIsContainer) {
            & takeown.exe /F $item.FullName /A /R /D Y 2>$null | Out-Null
            & icacls.exe $item.FullName /inheritance:r /grant '*S-1-5-18:(OI)(CI)F' /grant '*S-1-5-32-544:(OI)(CI)F' 2>$null | Out-Null
        } else {
            try { attrib -R $item.FullName 2>$null | Out-Null } catch {}
            & takeown.exe /F $item.FullName /A 2>$null | Out-Null
            & icacls.exe $item.FullName /inheritance:r /grant '*S-1-5-18:F' /grant '*S-1-5-32-544:F' 2>$null | Out-Null
        }
        return $true
    } catch {
        return $false
    }
}

function Ensure-SshConfigWritable {
    $programDataSsh = 'C:\ProgramData\ssh'
    if (-not (Test-Path $programDataSsh)) {
        New-Item -ItemType Directory -Force -Path $programDataSsh | Out-Null
    }

    $logsDir = Join-Path $programDataSsh 'logs'
    if (-not (Test-Path $logsDir)) {
        New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
    }

    [void](Grant-SshPathAccess -Path $programDataSsh)
    [void](Grant-SshPathAccess -Path $logsDir)
    [void](Grant-SshPathAccess -Path (Join-Path $programDataSsh 'sshd_config'))
    [void](Grant-SshPathAccess -Path (Join-Path $programDataSsh 'administrators_authorized_keys'))

    return $true
}

function Set-SshdGlobalOption {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $configPath = 'C:\ProgramData\ssh\sshd_config'
    if (-not (Test-Path $configPath)) {
        return
    }

    [void](Ensure-SshConfigWritable)

    $lines = @(Get-Content $configPath -ErrorAction SilentlyContinue)
    $pattern = '^\s*#?\s*' + [regex]::Escape($Key) + '\s+'
    $updated = $false
    $next = New-Object System.Collections.Generic.List[string]

    foreach ($line in $lines) {
        if ($line -match $pattern) {
            if (-not $updated) {
                $next.Add("$Key $Value")
                $updated = $true
            }
            continue
        }

        if (-not $updated -and $line -match '^\s*Match\s+') {
            $next.Add("$Key $Value")
            $updated = $true
        }

        $next.Add($line)
    }

    if (-not $updated) {
        $next.Add("$Key $Value")
    }

    [void](Ensure-SshConfigWritable)
    Set-Content -Path $configPath -Value $next -Encoding ASCII
}

function Ensure-SshPasswordAuth {
    Set-SshdGlobalOption -Key 'PasswordAuthentication' -Value 'yes'
    Set-SshdGlobalOption -Key 'PubkeyAuthentication' -Value 'yes'
}

function Get-SshBinaryDirectory {
    $candidates = @(
        (Join-Path $env:SystemRoot 'System32\OpenSSH'),
        'C:\Program Files\OpenSSH-Win64'
    )

    foreach ($candidate in $candidates) {
        if (Test-Path (Join-Path $candidate 'sshd.exe')) {
            return $candidate
        }
    }

    return $null
}

function Ensure-SshConfigAndKeys {
    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) {
        return $false
    }

    $programDataSsh = 'C:\ProgramData\ssh'
    $configPath = Join-Path $programDataSsh 'sshd_config'
    $defaultConfigPath = Join-Path $sshDir 'sshd_config_default'
    $sshKeygen = Join-Path $sshDir 'ssh-keygen.exe'

    if (-not (Test-Path $programDataSsh)) {
        New-Item -ItemType Directory -Force -Path $programDataSsh | Out-Null
    }

    if (-not (Test-Path $configPath) -and (Test-Path $defaultConfigPath)) {
        Copy-Item $defaultConfigPath $configPath -Force
    }

    if (Test-Path $sshKeygen) {
        & $sshKeygen -A 2>&1 | Out-Null
    }

    [void](Ensure-SshConfigWritable)
    return (Test-Path $configPath)
}

function Repair-SshFilePermissions {
    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) {
        return $false
    }

    $hostFixScript = Join-Path $sshDir 'FixHostFilePermissions.ps1'
    if (Test-Path $hostFixScript) {
        try {
            & $hostFixScript -Confirm:$false 2>&1 | Out-Null
        } catch {
            Write-Host "  Host key permission repair failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }

    $programDataSsh = 'C:\ProgramData\ssh'
    if (-not (Test-Path $programDataSsh)) {
        return $false
    }

    try {
        [void](Grant-SshPathAccess -Path $programDataSsh)
        [void](Grant-SshPathAccess -Path (Join-Path $programDataSsh 'sshd_config'))
        [void](Grant-SshPathAccess -Path (Join-Path $programDataSsh 'administrators_authorized_keys'))
        Get-ChildItem $programDataSsh -Filter 'ssh_host_*_key*' -ErrorAction SilentlyContinue | ForEach-Object {
            [void](Grant-SshPathAccess -Path $_.FullName)
        }
        return $true
    } catch {
        Write-Host "  Manual SSH permission repair failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        return $false
    }
}

function Ensure-SshServiceRegistration {
    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if ($sshd) {
        return $true
    }

    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) {
        return $false
    }

    $sshdExe = Join-Path $sshDir 'sshd.exe'
    if (-not (Test-Path $sshdExe)) {
        return $false
    }

    $serviceBinary = '"' + $sshdExe + '"'
    New-Service -Name sshd -BinaryPathName $serviceBinary -DisplayName 'OpenSSH SSH Server' -StartupType Automatic -ErrorAction SilentlyContinue | Out-Null
    [void](Set-SshServiceImagePath -SshdExePath $sshdExe)
    return [bool](Get-Service sshd -ErrorAction SilentlyContinue)
}

function Set-SshServiceImagePath {
    param([Parameter(Mandatory = $true)][string]$SshdExePath)

    $serviceRegPath = 'HKLM:\SYSTEM\CurrentControlSet\Services\sshd'
    if (-not (Test-Path $serviceRegPath)) {
        return $false
    }

    $serviceBinary = '"' + $SshdExePath + '"'
    try {
        New-ItemProperty -Path $serviceRegPath -Name 'ImagePath' -PropertyType ExpandString -Value $serviceBinary -Force | Out-Null
        return $true
    } catch {
        try {
            Set-ItemProperty -Path $serviceRegPath -Name 'ImagePath' -Value $serviceBinary -ErrorAction Stop
            return $true
        } catch {
            Write-Host "  Failed to set sshd ImagePath: $($_.Exception.Message)" -ForegroundColor DarkYellow
            return $false
        }
    }
}

function Ensure-SshServiceConfiguration {
    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) {
        return $false
    }

    $sshdExe = Join-Path $sshDir 'sshd.exe'
    if (-not (Test-Path $sshdExe)) {
        return $false
    }

    [void](Set-SshServiceImagePath -SshdExePath $sshdExe)
    try { & sc.exe config sshd start= auto 2>&1 | Out-Null } catch {}
    try {
        & sc.exe privs sshd SeAssignPrimaryTokenPrivilege/SeTcbPrivilege/SeBackupPrivilege/SeRestorePrivilege/SeImpersonatePrivilege 2>&1 | Out-Null
    } catch {}

    return $true
}

function Write-SshDiagnostics {
    Write-Host '  sshd diagnostics:' -ForegroundColor DarkYellow

    $sshDir = Get-SshBinaryDirectory
    if ($sshDir) {
        $sshdExe = Join-Path $sshDir 'sshd.exe'
        if (Test-Path $sshdExe) {
            try {
                $configTest = & $sshdExe -t 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host '    config test: OK' -ForegroundColor DarkGray
                } else {
                    Write-Host "    config test failed: $($configTest -join ' ')" -ForegroundColor DarkYellow
                }
            } catch {
                Write-Host "    config test exception: $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }

    try {
        $svcDetails = Get-CimInstance Win32_Service -Filter "Name='sshd'" -ErrorAction SilentlyContinue
        if ($svcDetails) {
            Write-Host "    service state: $($svcDetails.State)" -ForegroundColor DarkGray
            Write-Host "    start mode: $($svcDetails.StartMode)" -ForegroundColor DarkGray
            Write-Host "    start name: $($svcDetails.StartName)" -ForegroundColor DarkGray
            Write-Host "    path: $($svcDetails.PathName)" -ForegroundColor DarkGray
            Write-Host "    exit code: $($svcDetails.ExitCode)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    service detail read failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    try {
        $imagePath = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\sshd' -Name 'ImagePath' -ErrorAction SilentlyContinue).ImagePath
        if ($imagePath) {
            Write-Host "    image path: $imagePath" -ForegroundColor DarkGray
            $imagePathNormalized = $imagePath.Trim('"')
            Write-Host "    image exists: $(Test-Path $imagePathNormalized)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    image path read failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    try {
        $systemEvents = Get-WinEvent -LogName System -MaxEvents 80 -ErrorAction SilentlyContinue |
            Where-Object { $_.ProviderName -eq 'Service Control Manager' -and $_.Message -match 'OpenSSH SSH Server|sshd' } |
            Select-Object -First 3
        foreach ($event in $systemEvents) {
            Write-Host "    system event: $($event.Message -replace '\r?\n', ' ')" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    system event read failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    try {
        $events = Get-WinEvent -LogName 'OpenSSH/Operational' -MaxEvents 50 -ErrorAction SilentlyContinue |
            Select-Object -First 5
        foreach ($event in $events) {
            Write-Host "    openssh event: $($event.Message -replace '\r?\n', ' ')" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    OpenSSH event read failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

function Repair-SshdService {
    Write-Host '  Repairing sshd service...' -ForegroundColor Yellow

    [void](Ensure-SshConfigAndKeys)
    [void](Repair-SshFilePermissions)
    [void](Ensure-SshServiceRegistration)
    [void](Ensure-SshServiceConfiguration)

    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if (-not $sshd) {
        Write-Host '  sshd service is still missing after repair attempt.' -ForegroundColor Yellow
        return $false
    }

    Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue
    try { Restart-Service sshd -Force -ErrorAction SilentlyContinue } catch {}
    try { Start-Service sshd -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 3

    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if ($sshd -and $sshd.Status -eq 'Running') {
        Write-Host '  sshd repair succeeded.' -ForegroundColor Green
        return $true
    }

    Write-SshDiagnostics
    return $false
}

function Ensure-SshdAdminKeyConfig {
    $configPath = 'C:\ProgramData\ssh\sshd_config'
    if (-not (Test-Path $configPath)) {
        return
    }

    [void](Ensure-SshConfigWritable)
    $raw = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
    if ($raw -notmatch 'administrators_authorized_keys') {
        Add-Content -Path $configPath -Value ''
        Add-Content -Path $configPath -Value 'Match Group administrators'
        Add-Content -Path $configPath -Value '       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys'
    }
}

function Install-ServerAuthorizedKeys {
    param([Parameter(Mandatory = $true)][string]$ServerUrl)

    $tmpKeys = Join-Path $env:TEMP 'lightman-authorized_keys'
    $destDir = 'C:\ProgramData\ssh'
    $destKeys = Join-Path $destDir 'administrators_authorized_keys'

    Remove-Item $tmpKeys -Force -ErrorAction SilentlyContinue
    try {
        Invoke-WebRequest "$ServerUrl/installers/authorized_keys" -OutFile $tmpKeys -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    } catch {
        return $false
    }

    if (-not (Test-Path $tmpKeys) -or (Get-Item $tmpKeys).Length -lt 20) {
        Remove-Item $tmpKeys -Force -ErrorAction SilentlyContinue
        return $false
    }

    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item $tmpKeys $destKeys -Force
    Remove-Item $tmpKeys -Force -ErrorAction SilentlyContinue

    [void](Ensure-SshConfigWritable)
    & icacls $destKeys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' 2>$null | Out-Null
    Ensure-SshdAdminKeyConfig
    return $true
}

function Install-OpenSshFromZip {
    param([Parameter(Mandatory = $true)][string]$ServerUrl)

    Write-Host '  Installing OpenSSH from bundled ZIP...' -ForegroundColor Yellow

    $zipPath = Join-Path $env:TEMP 'OpenSSH-Win64.zip'
    $extractRoot = Join-Path $env:TEMP ("OpenSSH-Win64-" + [guid]::NewGuid().ToString('N'))
    $targetDir = 'C:\Program Files\OpenSSH-Win64'
    $localZip = Join-Path $InstallDir 'scripts\OpenSSH-Win64.zip'

    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue

    try {
        if (Test-Path $localZip) {
            Copy-Item $localZip $zipPath -Force
        } else {
            try {
                Invoke-WebRequest "$ServerUrl/openssh.zip" -OutFile $zipPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
            } catch {
                Invoke-WebRequest "$ServerUrl/installers/openssh.zip" -OutFile $zipPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
            }
        }

        if (-not (Test-Path $zipPath) -or (Get-Item $zipPath).Length -lt 1000000) {
            Write-Host '  OpenSSH ZIP missing or too small.' -ForegroundColor Yellow
            return $false
        }

        Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force
        $sshdExe = Get-ChildItem $extractRoot -Recurse -Filter 'sshd.exe' | Select-Object -First 1
        if (-not $sshdExe) {
            Write-Host '  OpenSSH ZIP did not contain sshd.exe.' -ForegroundColor Yellow
            return $false
        }

        $sourceDir = $sshdExe.Directory.FullName
        $installScript = Join-Path $sourceDir 'install-sshd.ps1'
        if (-not (Test-Path $installScript)) {
            Write-Host '  OpenSSH ZIP did not contain install-sshd.ps1.' -ForegroundColor Yellow
            return $false
        }

        $ErrorActionPreference = 'Continue'
        Stop-Service sshd -Force -ErrorAction SilentlyContinue
        Stop-Service ssh-agent -Force -ErrorAction SilentlyContinue
        $ErrorActionPreference = 'Stop'

        if (Test-Path $targetDir) {
            Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetDir) | Out-Null
        Copy-Item $sourceDir $targetDir -Recurse -Force

        Get-ChildItem $targetDir -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

        Push-Location $targetDir
        try {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installScript
            $installExitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
            if ($installExitCode -ne 0) {
                Write-Host "  install-sshd.ps1 exited with code $installExitCode." -ForegroundColor Yellow
            }
        } finally {
            Pop-Location
        }

        $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
        if (-not $sshInstalled) {
            Write-Host '  install-sshd.ps1 did not create sshd service; creating manually.' -ForegroundColor Yellow
            $serviceBinary = '"' + (Join-Path $targetDir 'sshd.exe') + '"'
            New-Service -Name sshd -BinaryPathName $serviceBinary -DisplayName 'OpenSSH SSH Server' -StartupType Automatic -ErrorAction SilentlyContinue | Out-Null
            [void](Set-SshServiceImagePath -SshdExePath (Join-Path $targetDir 'sshd.exe'))
            try {
                & sc.exe privs sshd SeAssignPrimaryTokenPrivilege/SeTcbPrivilege/SeBackupPrivilege/SeRestorePrivilege/SeImpersonatePrivilege 2>&1 | Out-Null
            } catch {}
            $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
        }

        return [bool]$sshInstalled
    } catch {
        Write-Host "  OpenSSH ZIP install failed: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    } finally {
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ================================================================
#  PHASE 0: PRE-FLIGHT CHECKS
# ================================================================
Write-Host ''
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host '  Museum OS One-Shot Kiosk Setup' -ForegroundColor Cyan
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host ''

# 0a. Administrator check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host 'FATAL: Must run as Administrator!' -ForegroundColor Red
    Write-Host '  Right-click PowerShell -> Run as Administrator, then run the one-liner again.' -ForegroundColor Yellow
    exit 1
}

# 0b. Detect fresh install vs update. A partial install must run fresh setup again.
$idFile = Join-Path $InstallDir '.lightman-identity.json'
$configFile = Join-Path $InstallDir 'agent.config.json'
$setupCompleteFile = Join-Path $InstallDir '.lightman-setup-complete'
$agentFilesPresent = (Test-Path "$InstallDir\dist\index.js") -and (Test-Path $configFile) -and (Test-Path $idFile)
$isUpdate = $agentFilesPresent
$needsFullSetup = -not (Test-Path $setupCompleteFile)

if ($isUpdate) {
    if ($needsFullSetup) {
        Write-Host 'MODE: Repair/finish setup (agent files found, completion marker missing)' -ForegroundColor Yellow
    } else {
        Write-Host 'MODE: Update (existing completed agent found)' -ForegroundColor Green
    }
    try {
        $cfg = Get-Content (Join-Path $InstallDir 'agent.config.json') -Raw | ConvertFrom-Json
        if (-not $Slug) { $Slug = $cfg.deviceSlug }
        Write-Host "  Slug: $($cfg.deviceSlug)"
    } catch {}
} else {
    Write-Host 'MODE: Fresh Install' -ForegroundColor Yellow
}

# 0c. Detect active adapter + MAC
$deviceMac = 'AA:BB:CC:DD:EE:FF'
$adapterInfo = Get-ActiveAdapterInfo
if ($adapterInfo) {
    $deviceMac = [string]$adapterInfo.MacAddress
    if ($adapterInfo.IsEthernet) {
        Write-Host "  Ethernet MAC : $deviceMac ($($adapterInfo.Name))" -ForegroundColor Green
    } else {
        Write-Host "  Ethernet not detected; using active adapter MAC: $deviceMac ($($adapterInfo.Name))" -ForegroundColor Yellow
    }
} else {
    Write-Host "  WARNING: Could not detect active network adapter; using fallback MAC $deviceMac" -ForegroundColor Yellow
}

# 0d. Prompt slug for fresh install if missing
if (-not $isUpdate -and -not $Slug) {
    Write-Host ''
    Write-Host '  Fresh install: slug not provided in URL.' -ForegroundColor Yellow
    do {
        $Slug = Read-Host '  Enter device slug (letters, numbers, hyphens)'
        if (-not $Slug) {
            Write-Host '  Slug cannot be empty.' -ForegroundColor Red
        } elseif ($Slug -notmatch '^[a-zA-Z0-9-]+$') {
            Write-Host '  Invalid slug. Use only letters, numbers, and hyphens.' -ForegroundColor Red
            $Slug = ''
        }
    } while (-not $Slug)
}

if (-not $Slug) {
    Write-Host 'FATAL: Could not determine device slug.' -ForegroundColor Red
    exit 1
}

if ($Slug -notmatch '^[a-zA-Z0-9-]+$') {
    Write-Host 'FATAL: Invalid slug format. Use only letters, numbers, and hyphens.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '[0/9] Pre-flight checks...' -ForegroundColor Yellow

# 0d. Network connectivity
Write-Host '  Checking network...' -NoNewline
$serverHost = ([Uri]$Server).Host
$serverPort = ([Uri]$Server).Port
if (-not $serverPort) { $serverPort = 80 }
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect($serverHost, $serverPort)
    $tcp.Close()
    Write-Host ' OK' -ForegroundColor Green
} catch {
    Write-Host ' FAILED' -ForegroundColor Red
    Write-Host ''
    Write-Host "  Cannot reach server at $Server" -ForegroundColor Red
    Write-Host '  Current network config:' -ForegroundColor Yellow
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -notlike '*Loopback*' } |
        Format-Table InterfaceAlias, IPAddress, PrefixLength -AutoSize
    Write-Host '  Fix: Ensure this machine is on the same LAN as the server.' -ForegroundColor Yellow
    Write-Host "  Server: $serverHost`:$serverPort" -ForegroundColor Yellow
    exit 1
}

# 0e. Server API health
Write-Host '  Checking server API...' -NoNewline
try {
    Invoke-RestMethod "$Server/api/health" -TimeoutSec 5 | Out-Null
    Write-Host ' OK' -ForegroundColor Green
} catch {
    Write-Host ' FAILED' -ForegroundColor Red
    Write-Host "  Server at $Server is not responding to API calls." -ForegroundColor Red
    Write-Host '  Is the Docker container running?' -ForegroundColor Yellow
    exit 1
}

# 0f. Admin login
Write-Host '  Logging in...' -NoNewline
try {
    $login = Invoke-RestMethod "$Server/api/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"admin@museumos.local","password":"admin123"}' -TimeoutSec 10
    $jwt = $login.data.token
    $authHeaders = @{ 'Authorization' = "Bearer $jwt" }
    Write-Host ' OK' -ForegroundColor Green
} catch {
    Write-Host ' FAILED' -ForegroundColor Red
    Write-Host '  Admin login failed. Check server credentials.' -ForegroundColor Red
    exit 1
}

# 0g. Agent tarball available
Write-Host '  Checking agent tarball...' -NoNewline
$currentVer = '0.0.0'
$skipAgentDownload = $false
$dlHeaders = $authHeaders.Clone()
if ($isUpdate -and (Test-Path $idFile)) {
    try {
        $id = Get-Content $idFile -Raw | ConvertFrom-Json
        $dlHeaders['Authorization'] = "Bearer $($id.apiKey)"
        $currentVer = (Get-Content (Join-Path $InstallDir 'package.json') -Raw | ConvertFrom-Json).version
    } catch {}
}
try {
    $check = Invoke-RestMethod "$Server/api/agent/check-update?current_version=$currentVer&platform=windows" -Headers $dlHeaders -TimeoutSec 10
    if (-not $check.data.update_available) {
        if ($isUpdate) {
            $skipAgentDownload = $true
            Write-Host " Already on latest (v$currentVer); continuing setup verification" -ForegroundColor Green
        } else {
            Write-Host ' FAILED' -ForegroundColor Red
            Write-Host '  No Windows agent package is available on the server.' -ForegroundColor Red
            Write-Host '  Upload one first: POST /api/agent/upload with platform=windows' -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host " v$($check.data.version) available" -ForegroundColor Green
    }
} catch {
    Write-Host ' FAILED' -ForegroundColor Red
    Write-Host '  No agent tarball uploaded for Windows. Upload one first:' -ForegroundColor Red
    Write-Host '    POST /api/agent/upload with platform=windows' -ForegroundColor Yellow
    exit 1
}

# 0h. Check prerequisites availability
$needsNode = $false
$needsChrome = $false
$nodePath = Resolve-NodeExePath
$nodeVersion = Get-NodeVersion -NodeExePath $nodePath
if ($nodeVersion) {
    try {
        if ([int]($nodeVersion.Split('.')[0]) -lt 20) {
            $needsNode = $true
        }
    } catch {
        $needsNode = $true
    }
} else {
    $needsNode = $true
}
$chromePath = Resolve-ChromeExePath
if (-not $chromePath) { $needsChrome = $true }

if ($needsNode -and -not $isUpdate) {
    Write-Host '  Checking node.msi on server...' -NoNewline
    try {
        $r = Invoke-WebRequest "$Server/installers/node.msi" -Method Head -UseBasicParsing -TimeoutSec 5
        Write-Host ' OK' -ForegroundColor Green
    } catch {
        Write-Host ' MISSING' -ForegroundColor Red
        Write-Host ''
        Write-Host '  Node.js is not installed and node.msi is not staged on the server.' -ForegroundColor Red
        Write-Host '  Download on a machine with internet:' -ForegroundColor Yellow
        Write-Host '    https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -ForegroundColor White
        Write-Host '  Then copy to server:' -ForegroundColor Yellow
        Write-Host '    scp node.msi wipro@100.124.40.69:/home/wipro/lightman-app01/server/installers/' -ForegroundColor White
        exit 1
    }
}
if ($needsChrome -and -not $isUpdate) {
    Write-Host '  Checking chrome.msi on server...' -NoNewline
    try {
        $r = Invoke-WebRequest "$Server/installers/chrome.msi" -Method Head -UseBasicParsing -TimeoutSec 5
        Write-Host ' OK' -ForegroundColor Green
    } catch {
        Write-Host ' MISSING' -ForegroundColor DarkYellow
        Write-Host '  Server chrome.msi not found; setup will try official download/winget fallback.' -ForegroundColor DarkYellow
    }
}

Write-Host ''
Write-Host '  All pre-flight checks passed!' -ForegroundColor Green
Write-Host ''

# ================================================================
#  PHASE 1: INSTALL PREREQUISITES
# ================================================================
Write-Host '[1/9] Installing prerequisites...' -ForegroundColor Yellow

if ($needsNode) {
    Write-Host '  Installing Node.js v20...' -ForegroundColor Yellow
    $msi = "$env:TEMP\node-setup.msi"
    $serverNodeMsi = "$Server/installers/node.msi"
    $downloadedFrom = Download-ValidMsi -Sources @($serverNodeMsi, $NodeMsiOfficialUrl) -OutFile $msi
    if (-not $downloadedFrom) {
        Write-Host '  FATAL: Could not download a valid Node.js MSI package.' -ForegroundColor Red
        Write-Host '  Fix server installer by replacing /server/installers/node.msi with official v20.18.0 MSI.' -ForegroundColor Yellow
        exit 1
    }

    $nodeInstall = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -NoNewWindow -PassThru
    if ($nodeInstall.ExitCode -in @(1619, 1620) -and $downloadedFrom -eq $serverNodeMsi) {
        Write-Host "  Server node.msi appears invalid (msiexec $($nodeInstall.ExitCode)); retrying with official Node MSI..." -ForegroundColor Yellow
        Remove-Item $msi -Force -ErrorAction SilentlyContinue
        $downloadedFrom = Download-ValidMsi -Sources @($NodeMsiOfficialUrl) -OutFile $msi
        if ($downloadedFrom) {
            $nodeInstall = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -NoNewWindow -PassThru
        }
    }
    Remove-Item $msi -Force -ErrorAction SilentlyContinue

    if ($nodeInstall.ExitCode -notin @(0, 3010)) {
        Write-Host "  FATAL: Node.js installer exited with code $($nodeInstall.ExitCode)." -ForegroundColor Red
        if ($nodeInstall.ExitCode -in @(1619, 1620)) {
            Write-Host '  The installer package is invalid/corrupt. Re-stage server/installers/node.msi from the official Node download.' -ForegroundColor Yellow
        }
        exit 1
    }

    $nodePath = $null
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $nodePath = Resolve-NodeExePath
        if ($nodePath) {
            break
        }
        Start-Sleep -Seconds 2
    }

    if (-not $nodePath) {
        Write-Host '  FATAL: Node.js install completed but node.exe was not found.' -ForegroundColor Red
        exit 1
    }

    $nodeVersion = Get-NodeVersion -NodeExePath $nodePath
    if (-not $nodeVersion) {
        Write-Host "  FATAL: Node.js found at $nodePath but version check failed." -ForegroundColor Red
        exit 1
    }

    Write-Host "  Node.js v$nodeVersion installed" -ForegroundColor Green
} else {
    if (-not $nodePath) { $nodePath = Resolve-NodeExePath }
    if (-not $nodeVersion) { $nodeVersion = Get-NodeVersion -NodeExePath $nodePath }
    if ($nodeVersion) {
        Write-Host "  Node.js v$nodeVersion already installed" -ForegroundColor Green
    } else {
        Write-Host '  Node.js check skipped (update mode)' -ForegroundColor DarkGray
    }
}

if ($needsChrome) {
    Write-Host '  Installing Chrome...' -ForegroundColor Yellow
    $msi = "$env:TEMP\chrome-setup.msi"
    $serverChromeMsi = "$Server/installers/chrome.msi"
    $officialChromeMsi = if ([Environment]::Is64BitOperatingSystem) { $ChromeMsiOfficialUrl64 } else { $ChromeMsiOfficialUrl32 }
    $downloadedFrom = Download-ValidMsi -Sources @($serverChromeMsi, $officialChromeMsi) -OutFile $msi
    $chromeInstallOk = $false

    if ($downloadedFrom) {
        $chromeInstall = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -NoNewWindow -PassThru
        if ($chromeInstall.ExitCode -in @(1619, 1620) -and $downloadedFrom -eq $serverChromeMsi) {
            Write-Host "  Server chrome.msi appears invalid (msiexec $($chromeInstall.ExitCode)); retrying with official Chrome MSI..." -ForegroundColor Yellow
            Remove-Item $msi -Force -ErrorAction SilentlyContinue
            $downloadedFrom = Download-ValidMsi -Sources @($officialChromeMsi) -OutFile $msi
            if ($downloadedFrom) {
                $chromeInstall = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -NoNewWindow -PassThru
            }
        }

        if ($chromeInstall.ExitCode -in @(0, 3010)) {
            $chromeInstallOk = $true
        } else {
            Write-Host "  Chrome MSI installer exited with code $($chromeInstall.ExitCode)." -ForegroundColor DarkYellow
        }
    } else {
        Write-Host '  Could not download a valid Chrome MSI package.' -ForegroundColor DarkYellow
    }

    Remove-Item $msi -Force -ErrorAction SilentlyContinue

    if (-not $chromeInstallOk) {
        $chromeInstallOk = Install-ChromeWithWinget
        if (-not $chromeInstallOk) {
            Write-Host '  FATAL: Chrome installation failed using both MSI and winget.' -ForegroundColor Red
            Write-Host '  Re-stage /server/installers/chrome.msi from official Chrome enterprise MSI and re-run setup.' -ForegroundColor Yellow
            exit 1
        }
    }

    $chromePath = $null
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $chromePath = Resolve-ChromeExePath
        if ($chromePath) {
            break
        }
        Start-Sleep -Seconds 2
    }

    if (-not $chromePath -or -not (Test-Path $chromePath)) {
        Write-Host '  FATAL: Chrome install failed!' -ForegroundColor Red
        exit 1
    }
    Write-Host "  Chrome installed: $chromePath" -ForegroundColor Green
} else {
    if ($chromePath) { Write-Host "  Chrome already installed" -ForegroundColor Green }
}

# ================================================================
#  PHASE 2: DOWNLOAD + EXTRACT AGENT
# ================================================================
Write-Host ''
Write-Host '[2/9] Downloading agent...' -ForegroundColor Yellow

if ($skipAgentDownload) {
    $ver = $currentVer
    Write-Host "  Agent already installed at v$ver; skipping download" -ForegroundColor Green

    if (-not (Test-Path (Join-Path $InstallDir 'dist\index.js'))) {
        Write-Host '  FATAL: Existing agent install is missing dist\\index.js. Remove C:\\Program Files\\Lightman\\Agent and re-run setup.' -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Path $NssmExe)) {
        $bundledNssm = Join-Path $InstallDir 'nssm\nssm.exe'
        if (Test-Path $bundledNssm) {
            Copy-Item $bundledNssm $NssmExe -Force
            Write-Host '  NSSM restored from installed agent bundle' -ForegroundColor Green
        } else {
            Write-Host '  NSSM missing; attempting fallback download...' -ForegroundColor Yellow
            [void](Ensure-Nssm)
        }
    }
} else {
    $ver = $check.data.version
    $dlUrl = "$Server$($check.data.download_url)"
    if (-not $ver -or -not $check.data.download_url) {
        Write-Host '  FATAL: Server returned invalid update data.' -ForegroundColor Red
        exit 1
    }
    Write-Host "  Version: $ver"
    Invoke-WebRequest -Uri $dlUrl -OutFile $TempFile -Headers $dlHeaders -UseBasicParsing
    Write-Host '  Downloaded' -ForegroundColor Green

    # Stop existing service
    $ErrorActionPreference = 'Continue'
    Stop-Service $ServiceName -ErrorAction SilentlyContinue
    if (Test-Path $NssmExe) { & $NssmExe stop $ServiceName 2>$null }
    Start-Sleep 2
    $ErrorActionPreference = 'Stop'

    # Prepare directories
    foreach ($d in @($InstallDir, $LogDir, $NssmDir, "$DataDir\chrome-kiosk")) {
        New-Item -ItemType Directory -Force -Path $d -ErrorAction SilentlyContinue | Out-Null
    }

    # Backup on update
    if ($isUpdate) {
        $backup = "$InstallDir-backup"
        if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
        Copy-Item $InstallDir $backup -Recurse -Force
        Write-Host '  Backup created'
    }

    # Extract
    Write-Host '  Extracting...' -ForegroundColor Yellow
    try {
        tar -xzf $TempFile -C $InstallDir
    } catch {
        Write-Host '  FATAL: Could not extract agent tarball (archive may be corrupt).' -ForegroundColor Red
        Write-Host "  Download URL: $dlUrl" -ForegroundColor Yellow
        exit 1
    }
    Remove-Item $TempFile -Force -ErrorAction SilentlyContinue

    # Copy NSSM from bundled tarball
    $bundledNssm = Join-Path $InstallDir 'nssm\nssm.exe'
    if (Test-Path $bundledNssm) {
        Copy-Item $bundledNssm $NssmExe -Force
        Write-Host '  NSSM copied' -ForegroundColor Green
    }

    if (-not (Test-Path (Join-Path $InstallDir 'dist\index.js'))) {
        Write-Host '  FATAL: Agent package extracted but dist\\index.js is missing (tarball incomplete/corrupt).' -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Path (Join-Path $InstallDir 'public\index.html'))) {
        Write-Host '  FATAL: Agent package extracted but public\\index.html is missing (display bundle missing from tarball).' -ForegroundColor Red
        Write-Host '  Rebuild the display, run sync-display, and upload a new agent package.' -ForegroundColor Yellow
        exit 1
    }

    if (-not (Test-Path $NssmExe)) {
        Write-Host '  NSSM not bundled in tarball; attempting fallback download...' -ForegroundColor Yellow
        [void](Ensure-Nssm)
    }

    # Copy shell bat
    $shellSrc = Join-Path $InstallDir 'scripts\lightman-shell.bat'
    $shellDst = Join-Path $InstallDir 'lightman-shell.bat'
    if (Test-Path $shellSrc) { Copy-Item $shellSrc $shellDst -Force }

    Write-Host '  Agent extracted' -ForegroundColor Green
}

# ================================================================
#  PHASE 3: REGISTER DEVICE + WRITE CONFIG
# ================================================================
Write-Host ''
Write-Host '[3/9] Configuring device...' -ForegroundColor Yellow

if (-not $isUpdate) {
    # --- Register device on server ---
    Write-Host "  Device MAC: $deviceMac" -ForegroundColor DarkGray

    $sites = Invoke-RestMethod "$Server/api/sites" -Headers $authHeaders -TimeoutSec 10
    $siteId = $sites.data[0].id

    $deviceBody = @{
        site_id = $siteId
        slug = $Slug
        display_name = $Slug
        mac_address = $deviceMac
        type = 'display'
    } | ConvertTo-Json

    $deviceId = $null
    $apiKey = $null

    try {
        $device = Invoke-RestMethod "$Server/api/devices" -Method Post -Headers $authHeaders -ContentType 'application/json' -Body $deviceBody -TimeoutSec 10
        $deviceId = $device.data.id
        $apiKey = $device.data.config.apiKey
        Write-Host "  Device registered: $deviceId" -ForegroundColor Green
    } catch {
        Write-Host '  Device may already exist, trying provision...' -ForegroundColor Yellow
        try {
            $prov = Invoke-RestMethod "$Server/api/devices/provision/$Slug" -TimeoutSec 10
            $deviceId = $prov.deviceId
            $apiKey = $prov.apiKey
            Write-Host "  Provisioned: $deviceId" -ForegroundColor Green
        } catch {
            Write-Host '  Auto-registration did not return credentials; starting provisioning/pairing wait...' -ForegroundColor Yellow
        }
    }

    if (-not ($deviceId -and $apiKey)) {
        try {
            $provisioned = Wait-ForServerProvisioning `
                -ServerUrl $Server `
                -DeviceSlug $Slug `
                -TimeoutSeconds $PairingTimeoutSeconds `
                -PollSeconds $PairingPollSeconds
            $deviceId = $provisioned.deviceId
            $apiKey = $provisioned.apiKey
            if ($provisioned.mode -eq 'paired') {
                Write-Host "  Pairing approved: $deviceId" -ForegroundColor Green
            } else {
                Write-Host "  Provisioned automatically: $deviceId" -ForegroundColor Green
            }
        } catch {
            Write-Host "  FATAL: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }

    # --- Write identity file ---
    if (-not ($deviceId -and $apiKey)) {
        Write-Host '  FATAL: Provisioning did not produce valid credentials.' -ForegroundColor Red
        exit 1
    }
    Write-IdentityFile -Path (Join-Path $InstallDir '.lightman-identity.json') -DeviceId $deviceId -ApiKey $apiKey
    Write-Host '  Identity written' -ForegroundColor Green

    # --- Find Chrome path ---
    if (-not $chromePath) {
        foreach ($p in @('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')) {
            if (Test-Path $p) { $chromePath = $p; break }
        }
    }

    # --- Write config ---
    $configJson = @"
{
  "serverUrl": "$Server",
  "deviceSlug": "$Slug",
  "healthIntervalMs": 60000,
  "logLevel": "info",
  "logFile": "agent.log",
  "identityFile": ".lightman-identity.json",
  "localServices": false,
  "kiosk": {
    "browserPath": "$($chromePath -replace '\\','\\')",
    "defaultUrl": "http://localhost:3403/display/$Slug",
    "extraArgs": ["--kiosk","--disable-translate","--disable-extensions","--disable-pinch","--overscroll-history-navigation=disabled","--disable-pull-to-refresh-effect","--autoplay-policy=no-user-gesture-required","--remote-debugging-address=127.0.0.1","--remote-debugging-port=9222","--enable-gpu-rasterization","--enable-zero-copy","--ignore-gpu-blocklist","--enable-features=TouchpadAndWheelScrollLatching,OverlayScrollbar","--user-data-dir=C:\\ProgramData\\Lightman\\chrome-kiosk"],
    "pollIntervalMs": 10000,
    "maxCrashesInWindow": 10,
    "crashWindowMs": 300000,
    "shellMode": true
  },
  "powerSchedule": {
    "enableLocalCron": false,
    "timezone": "Asia/Kolkata",
    "shutdownWarningSeconds": 60
  }
}
"@
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $InstallDir 'agent.config.json'), $configJson, $utf8)
    Write-Host '  Config written' -ForegroundColor Green
} else {
    # Update mode: ensure shellMode is true
    $cfgPath = Join-Path $InstallDir 'agent.config.json'
    if (Test-Path $cfgPath) {
        try {
            $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
            if ($cfg.kiosk) {
                $cfg.kiosk | Add-Member -NotePropertyName shellMode -NotePropertyValue $true -Force
                $json = $cfg | ConvertTo-Json -Depth 5
                $utf8 = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($cfgPath, $json, $utf8)
            }
        } catch {
            Write-Host "  WARNING: Could not update config: $_" -ForegroundColor Yellow
        }
    }
    Write-Host '  Config preserved (shellMode ensured)' -ForegroundColor Green
}

# ================================================================
#  PHASE 4: INSTALL NSSM SERVICE
# ================================================================
Write-Host ''
Write-Host '[4/9] Installing Windows service...' -ForegroundColor Yellow

if (-not (Test-Path $NssmExe)) {
    Write-Host '  NSSM missing; attempting fallback installation...' -ForegroundColor Yellow
    [void](Ensure-Nssm)
}
if (-not (Test-Path $NssmExe)) {
    Write-Host '  FATAL: NSSM not found. Agent tarball is missing nssm and fallback download failed.' -ForegroundColor Red
    Write-Host "  Manual fix: place nssm.exe at $NssmExe and re-run setup." -ForegroundColor Yellow
    exit 1
}

# Clean up existing service
$ErrorActionPreference = 'Continue'
& $NssmExe stop $ServiceName 2>$null
& $NssmExe remove $ServiceName confirm 2>$null
sc.exe delete $ServiceName 2>$null
Start-Sleep 2
$ErrorActionPreference = 'Stop'

# Install service
$nodePath = Resolve-NodeExePath
if (-not $nodePath) {
    Write-Host '  FATAL: node.exe not found in PATH or standard install locations.' -ForegroundColor Red
    exit 1
}
& $NssmExe install $ServiceName $nodePath 'dist\index.js'
& $NssmExe set $ServiceName AppDirectory $InstallDir
& $NssmExe set $ServiceName DisplayName 'Museum OS Agent'
& $NssmExe set $ServiceName Description 'Museum OS kiosk display agent'
& $NssmExe set $ServiceName Start SERVICE_AUTO_START
& $NssmExe set $ServiceName AppStdout "$LogDir\service-stdout.log"
& $NssmExe set $ServiceName AppStderr "$LogDir\service-stderr.log"
& $NssmExe set $ServiceName AppStdoutCreationDisposition 4
& $NssmExe set $ServiceName AppStderrCreationDisposition 4
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateBytes 5242880
& $NssmExe set $ServiceName AppRestartDelay 10000
& $NssmExe set $ServiceName AppExit Default Restart

$ErrorActionPreference = 'Continue'
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 2>$null
$ErrorActionPreference = 'Stop'

# Verify service created
$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host '  FATAL: Service creation failed!' -ForegroundColor Red
    exit 1
}
Write-Host '  Service installed' -ForegroundColor Green

# ================================================================
#  PHASE 5: SET HOSTNAME
# ================================================================
Write-Host ''
Write-Host '[5/9] Setting hostname...' -ForegroundColor Yellow

$targetHostname = "LM-$($Slug.ToUpper())"
# Windows hostnames max 15 chars
if ($targetHostname.Length -gt 15) { $targetHostname = $targetHostname.Substring(0, 15) }

if ($env:COMPUTERNAME -ne $targetHostname) {
    $ErrorActionPreference = 'Continue'
    Rename-Computer -NewName $targetHostname -Force 2>$null
    $ErrorActionPreference = 'Stop'
    Write-Host "  Hostname: $env:COMPUTERNAME -> $targetHostname (after reboot)" -ForegroundColor Green
} else {
    Write-Host "  Hostname: $targetHostname (already set)" -ForegroundColor Green
}

Configure-WolSettings

# ================================================================
#  PHASE 6: KIOSK HARDENING (fresh install only)
# ================================================================
Write-Host ''
Write-Host '[6/9] Kiosk hardening...' -ForegroundColor Yellow

if ($isUpdate -and -not $needsFullSetup) {
    Write-Host '  Skipped (update mode)' -ForegroundColor DarkGray
} else {
    $ErrorActionPreference = 'Continue'

    function Invoke-Phase6Step {
        param(
            [Parameter(Mandatory = $true)][string]$Label,
            [Parameter(Mandatory = $true)][scriptblock]$Action
        )

        Write-Host "  $Label..." -NoNewline
        try {
            $result = & $Action
            if ($result -is [string] -and $result.StartsWith('skip:')) {
                Write-Host " $($result.Substring(5))" -ForegroundColor Yellow
            } else {
                Write-Host ' done' -ForegroundColor Green
            }
        } catch {
            Write-Host " failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    # --- 6a. Auto-login ---
    Write-Host '  Auto-login...' -NoNewline
    try {
        $OriginalUsername = $env:USERNAME
        $Username = $KioskUsername
        $RegPath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'

        # Always use a predictable local kiosk account for auto-login and SSH.
        $existing = Get-LocalUser -Name $Username -ErrorAction SilentlyContinue
        if (-not $existing) {
            net user $Username $AutoLoginPassword /add 2>$null | Out-Null
        } else {
            net user $Username $AutoLoginPassword 2>$null | Out-Null
        }
        net user $Username /expires:never 2>$null | Out-Null
        try { Set-LocalUser -Name $Username -PasswordNeverExpires $true -ErrorAction SilentlyContinue } catch {}
        net localgroup Administrators $Username /add 2>$null | Out-Null

        # Hide original Microsoft account from the login screen, if setup ran from one.
        $targetUser = Get-LocalUser -Name $OriginalUsername -ErrorAction SilentlyContinue
        if ($OriginalUsername -ne $Username -and $targetUser -and $targetUser.PrincipalSource -eq 'MicrosoftAccount') {
            $HidePath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\SpecialAccounts\UserList'
            if (-not (Test-Path $HidePath)) { New-Item -Path $HidePath -Force | Out-Null }
            Set-ItemProperty -Path $HidePath -Name $OriginalUsername -Value 0
        }

        # Disable passwordless sign-in requirement
        $PwdLess = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device'
        if (Test-Path $PwdLess) { Set-ItemProperty -Path $PwdLess -Name 'DevicePasswordLessBuildVersion' -Value 0 }
        $Passport = 'HKLM:\SOFTWARE\Policies\Microsoft\PassportForWork'
        if (-not (Test-Path $Passport)) { New-Item -Path $Passport -Force | Out-Null }
        Set-ItemProperty -Path $Passport -Name 'Enabled' -Value 0

        # Set auto-login registry
        Set-ItemProperty -Path $RegPath -Name 'AutoAdminLogon' -Value '1'
        Set-ItemProperty -Path $RegPath -Name 'DefaultUserName' -Value $Username
        Set-ItemProperty -Path $RegPath -Name 'DefaultPassword' -Value $AutoLoginPassword
        Set-ItemProperty -Path $RegPath -Name 'DefaultDomainName' -Value $env:COMPUTERNAME
        Set-ItemProperty -Path $RegPath -Name 'DisableCAD' -Value 1
        Set-ItemProperty -Path $RegPath -Name 'AutoRestartShell' -Value 1
        Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'DisableAutomaticRestartSignOn' -Value 0
        $OOBE = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OOBE'
        if (-not (Test-Path $OOBE)) { New-Item -Path $OOBE -Force | Out-Null }
        Set-ItemProperty -Path $OOBE -Name 'DisablePrivacyExperience' -Value 1
        Write-Host ' done' -ForegroundColor Green
    } catch {
        Write-Host " failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # --- 6b. Lock screen removal ---
    Invoke-Phase6Step -Label 'Lock screen' -Action {
        $LP = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization'
        if (-not (Test-Path $LP)) { New-Item -Path $LP -Force | Out-Null }
        Set-ItemProperty -Path $LP -Name 'NoLockScreen' -Value 1

        $SD = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\LogonUI\SessionData'
        if (Test-Path $SD) { Set-ItemProperty -Path $SD -Name 'AllowLockScreen' -Value 0 -ErrorAction SilentlyContinue }

        $CC = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'
        if (-not (Test-Path $CC)) { New-Item -Path $CC -Force | Out-Null }
        Set-ItemProperty -Path $CC -Name 'DisableWindowsConsumerFeatures' -Value 1
        Set-ItemProperty -Path $CC -Name 'DisableCloudOptimizedContent' -Value 1
        $CCU = 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'
        if (-not (Test-Path $CCU)) { New-Item -Path $CCU -Force | Out-Null }
        Set-ItemProperty -Path $CCU -Name 'DisableWindowsSpotlightFeatures' -Value 1
        Set-ItemProperty -Path $CCU -Name 'DisableTailoredExperiencesWithDiagnosticData' -Value 1

        Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'EnableFirstLogonAnimation' -Value 0
        $SP = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
        Set-ItemProperty -Path $SP -Name 'DisableLockWorkstation' -Value 1
        Set-ItemProperty -Path $SP -Name 'HideFastUserSwitching' -Value 1

        $DL = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
        if (-not (Test-Path $DL)) { New-Item -Path $DL -Force | Out-Null }
        Set-ItemProperty -Path $DL -Name 'EnableGoodbye' -Value 0

        $PS = 'HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\0e796bdb-100d-47d6-a2d5-f7d2daa51f51'
        if (-not (Test-Path $PS)) { New-Item -Path $PS -Force | Out-Null }
        Set-ItemProperty -Path $PS -Name 'ACSettingIndex' -Value 0
        Set-ItemProperty -Path $PS -Name 'DCSettingIndex' -Value 0
        powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 0 2>&1 | Out-Null
        powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 0 2>&1 | Out-Null
        powercfg /SETACTIVE SCHEME_CURRENT 2>&1 | Out-Null

        Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name 'ScreenSaverIsSecure' -Value '0'
        Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name 'ScreenSaveActive' -Value '0'
        Set-ItemProperty -Path $SP -Name 'InactivityTimeoutSecs' -Value 0 -ErrorAction SilentlyContinue
        try { Disable-ScheduledTask -TaskName '\Microsoft\Windows\Shell\CreateObjectTask' -ErrorAction SilentlyContinue | Out-Null } catch { }
    }

    # --- 6c. Sleep / hibernate off ---
    Invoke-Phase6Step -Label 'Sleep/hibernate' -Action {
        powercfg /change monitor-timeout-ac 0 2>&1 | Out-Null
        powercfg /change standby-timeout-ac 0 2>&1 | Out-Null
        powercfg /change hibernate-timeout-ac 0 2>&1 | Out-Null
    }

    # --- 6d. Display extend mode ---
    Invoke-Phase6Step -Label 'Display extend' -Action {
        if (Test-Path "$env:SystemRoot\System32\DisplaySwitch.exe") {
            & "$env:SystemRoot\System32\DisplaySwitch.exe" /extend 2>&1 | Out-Null
            Start-Sleep 2
        } else {
            return 'skip:skipped (DisplaySwitch.exe not found)'
        }
    }

    # --- 6e. Windows Update suppression ---
    Invoke-Phase6Step -Label 'Windows Update' -Action {
        $WU = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
        if (-not (Test-Path $WU)) { New-Item -Path $WU -Force | Out-Null }
        Set-ItemProperty -Path $WU -Name 'NoAutoRebootWithLoggedOnUsers' -Value 1
        Set-ItemProperty -Path $WU -Name 'AUOptions' -Value 2
        $WUM = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
        if (-not (Test-Path $WUM)) { New-Item -Path $WUM -Force | Out-Null }
        Set-ItemProperty -Path $WUM -Name 'SetAutoRestartNotificationDisable' -Value 1
        Set-ItemProperty -Path $WUM -Name 'SetActiveHours' -Value 1
        Set-ItemProperty -Path $WUM -Name 'ActiveHoursStart' -Value 0
        Set-ItemProperty -Path $WUM -Name 'ActiveHoursEnd' -Value 23
        foreach ($task in @('\Microsoft\Windows\UpdateOrchestrator\Reboot','\Microsoft\Windows\UpdateOrchestrator\Schedule Retry Scan','\Microsoft\Windows\WindowsUpdate\Scheduled Start')) {
            try { Disable-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue | Out-Null } catch { }
        }
    }

    # --- 6f. Notifications off ---
    Invoke-Phase6Step -Label 'Notifications' -Action {
        $NP = 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\Explorer'
        if (-not (Test-Path $NP)) { New-Item -Path $NP -Force | Out-Null }
        Set-ItemProperty -Path $NP -Name 'DisableNotificationCenter' -Value 1
        $TP = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications'
        if (-not (Test-Path $TP)) { New-Item -Path $TP -Force | Out-Null }
        Set-ItemProperty -Path $TP -Name 'ToastEnabled' -Value 0
    }

    # --- 6g. Error reporting off ---
    Invoke-Phase6Step -Label 'Error reporting' -Action {
        $WER = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting'
        if (-not (Test-Path $WER)) { New-Item -Path $WER -Force | Out-Null }
        Set-ItemProperty -Path $WER -Name 'DontShowUI' -Value 1
        Set-ItemProperty -Path $WER -Name 'Disabled' -Value 1
        Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Windows' -Name 'ErrorMode' -Value 2 -ErrorAction SilentlyContinue
    }

    # --- 6h. Cortana / Search off ---
    Invoke-Phase6Step -Label 'Cortana/Search' -Action {
        $SR = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search'
        if (-not (Test-Path $SR)) { New-Item -Path $SR -Force | Out-Null }
        Set-ItemProperty -Path $SR -Name 'AllowCortana' -Value 0
    }

    # --- 6i. DPI 100% ---
    Invoke-Phase6Step -Label 'DPI 100%' -Action {
        Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name 'AppliedDPI' -Value 96
        Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name 'LogPixels' -Value 96 -Type DWord -Force -ErrorAction SilentlyContinue
    }

    # --- 6j. Shell replacement ---
    Invoke-Phase6Step -Label 'Shell replacement' -Action {
        $shellBat = Join-Path $InstallDir 'lightman-shell.bat'
        if (-not (Test-Path $shellBat)) {
            return 'skip:skipped (shell bat not found)'
        }

        $HKCUShell = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon'
        if (-not (Test-Path $HKCUShell)) { New-Item -Path $HKCUShell -Force | Out-Null }
        Set-ItemProperty -Path $HKCUShell -Name 'Shell' -Value "`"$shellBat`""

        $HKLMShell = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
        $origShell = (Get-ItemProperty -Path $HKLMShell -Name 'Shell' -ErrorAction SilentlyContinue).Shell
        if ($origShell -and $origShell -notlike '*lightman*') {
            Set-ItemProperty -Path $HKLMShell -Name 'Shell_Original' -Value $origShell
        }
        Set-ItemProperty -Path $HKLMShell -Name 'Shell' -Value "`"$shellBat`""
    }

    # --- 6k. Guardian scheduled task ---
    Invoke-Phase6Step -Label 'Guardian task' -Action {
        $gSrc = Join-Path $InstallDir 'scripts\guardian.ps1'
        $gDst = Join-Path $InstallDir 'guardian.ps1'
        if (Test-Path $gSrc) { Copy-Item $gSrc $gDst -Force }
        if (-not (Test-Path $gDst)) {
            return 'skip:skipped (guardian.ps1 not found)'
        }

        $gt = Get-ScheduledTask -TaskName $GuardianTask -ErrorAction SilentlyContinue
        if ($gt) { Unregister-ScheduledTask -TaskName $GuardianTask -Confirm:$false }

        $gA = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$gDst`"" -WorkingDirectory $InstallDir
        $gT = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365)
        $gS = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
        $gP = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        Register-ScheduledTask -TaskName $GuardianTask -Action $gA -Trigger $gT -Settings $gS -Principal $gP -Description 'Museum OS health check every 5 min' -Force | Out-Null
    }

    # --- 6l. Firewall ---
    Invoke-Phase6Step -Label 'Firewall' -Action {
        if (-not (Get-NetFirewallRule -DisplayName 'LIGHTMAN Agent WebSocket' -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName 'Museum OS Agent WebSocket' -Direction Outbound -Action Allow -Protocol TCP -RemotePort 3001 -Description 'Museum OS Agent' | Out-Null
        }
    }

    $ErrorActionPreference = 'Stop'
    Write-Host '  All hardening applied' -ForegroundColor Green
}

# ================================================================
#  PHASE 7: OPENSSH
# ================================================================
Write-Host ''
Write-Host '[7/9] Installing SSH...' -ForegroundColor Yellow

function Invoke-RemotePowerShellScriptStep {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$DownloadTimeoutSeconds = 30,
        [int]$ExecutionTimeoutSeconds = 240
    )

    Write-Host "  $Label..." -ForegroundColor DarkGray

    $tempScript = Join-Path $env:TEMP ("lightman-remote-" + [guid]::NewGuid().ToString('N') + '.ps1')
    try {
        Invoke-WebRequest $Url -OutFile $tempScript -UseBasicParsing -TimeoutSec $DownloadTimeoutSeconds -ErrorAction Stop
        if (-not (Test-Path $tempScript) -or (Get-Item $tempScript).Length -lt 100) {
            Write-Host "  $Label returned an invalid script." -ForegroundColor Yellow
            return $false
        }

        $process = Start-Process powershell.exe `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $tempScript) `
            -WindowStyle Hidden `
            -PassThru

        if (-not $process.WaitForExit($ExecutionTimeoutSeconds * 1000)) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  $Label timed out." -ForegroundColor Yellow
            return $false
        }

        return $process.ExitCode -eq 0
    } catch {
        Write-Host "  $Label failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        return $false
    } finally {
        Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-OpenSshInstallStep {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Command,
        [int]$TimeoutSeconds = 90
    )

    Write-Host "  $Label (max ${TimeoutSeconds}s)..." -ForegroundColor DarkGray
    try {
        $process = Start-Process powershell.exe `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $Command) `
            -WindowStyle Hidden `
            -PassThru

        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  $Label timed out." -ForegroundColor Yellow
            return $false
        }

        return $process.ExitCode -eq 0
    } catch {
        Write-Host "  $Label failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        return $false
    }
}

$ErrorActionPreference = 'Continue'
$sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue

if (-not $sshInstalled) {
    # Tier 1: Windows capability. This can hang on offline Windows Update, so it is timed.
    [void](Invoke-OpenSshInstallStep `
        -Label 'Windows OpenSSH capability install' `
        -Command "Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction SilentlyContinue | Out-Null" `
        -TimeoutSeconds 90)
    $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
}

if (-not $sshInstalled) {
    # Tier 2: DISM fallback, also timed for offline machines.
    [void](Invoke-OpenSshInstallStep `
        -Label 'DISM OpenSSH fallback' `
        -Command "dism /online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0 /NoRestart | Out-Null" `
        -TimeoutSeconds 90)
    $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
}

if (-not $sshInstalled) {
    # Tier 3: MSI from server
    Write-Host '  Downloading OpenSSH from server...' -ForegroundColor Yellow
    $sshMsi = "$env:TEMP\openssh-setup.msi"
    try {
        Invoke-WebRequest "$Server/installers/openssh.msi" -OutFile $sshMsi -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        $msi = Start-Process msiexec.exe -ArgumentList "/i `"$sshMsi`" /qn /norestart" -PassThru -NoNewWindow
        if (-not $msi.WaitForExit(120000)) {
            Stop-Process -Id $msi.Id -Force -ErrorAction SilentlyContinue
            Write-Host '  OpenSSH MSI install timed out.' -ForegroundColor Yellow
        }
        Remove-Item $sshMsi -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  OpenSSH MSI install failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
}

if (-not $sshInstalled) {
    # Tier 4: Bundled ZIP fallback, available from the agent package/server.
    [void](Install-OpenSshFromZip -ServerUrl $Server)
    $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
}

if (-not $sshInstalled) {
    # Final fallback: the dedicated ssh.ps1 route, retained for older devices.
    [void](Invoke-RemotePowerShellScriptStep `
        -Label 'Legacy ssh.ps1 installer' `
        -Url "$Server/ssh.ps1" `
        -DownloadTimeoutSeconds 30 `
        -ExecutionTimeoutSeconds 240)
    $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
}

if (-not $sshInstalled) {
    Write-Host '  FATAL: OpenSSH Server could not be installed.' -ForegroundColor Red
    Write-Host '  Fix Windows Optional Features or provide server/installers/openssh.msi/openssh.zip, then run setup.' -ForegroundColor Yellow
    exit 1
}

Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue
Set-SshDefaultShell
Ensure-SshFirewallRule
Ensure-SshPasswordAuth
$keysInstalled = Install-ServerAuthorizedKeys -ServerUrl $Server
Restart-Service sshd -Force -ErrorAction SilentlyContinue
Start-Service sshd -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$sshService = Get-Service sshd -ErrorAction SilentlyContinue
if (-not ($sshService -and $sshService.Status -eq 'Running')) {
    if (Repair-SshdService) {
        $sshService = Get-Service sshd -ErrorAction SilentlyContinue
    }
}
if (-not ($sshService -and $sshService.Status -eq 'Running')) {
    Write-Host '  sshd still not running; reinstalling from bundled ZIP...' -ForegroundColor Yellow
    if (Install-OpenSshFromZip -ServerUrl $Server) {
        Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue
        Set-SshDefaultShell
        Ensure-SshFirewallRule
        Ensure-SshPasswordAuth
        try { Restart-Service sshd -Force -ErrorAction SilentlyContinue } catch {}
        try { Start-Service sshd -ErrorAction SilentlyContinue } catch {}
        Start-Sleep -Seconds 2
        if (Repair-SshdService) {
            $sshService = Get-Service sshd -ErrorAction SilentlyContinue
        }
    }
}
if ($sshService -and $sshService.Status -eq 'Running') {
    Write-Host '  SSH enabled' -ForegroundColor Green
} else {
    Write-Host '  FATAL: OpenSSH Server installed but sshd is not running after repair.' -ForegroundColor Red
    exit 1
}

if ($keysInstalled) {
    Write-Host '  SSH authorized_keys installed from server' -ForegroundColor Green
} else {
    Write-Host '  No server authorized_keys found; SSH will use normal Windows auth' -ForegroundColor DarkYellow
}
$ErrorActionPreference = 'Stop'

# ================================================================
#  PHASE 8: START SERVICE + VERIFICATION
# ================================================================
Write-Host ''
Write-Host '[8/9] Starting agent and verifying...' -ForegroundColor Yellow

Start-Service $ServiceName -ErrorAction SilentlyContinue

# Wait for port 3403
Write-Host '  Waiting for agent to start...' -NoNewline
$portReady = $false
for ($i = 0; $i -lt 30; $i++) {
    $tcp = $null
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect('127.0.0.1', 3403)
        $tcp.Close()
        $portReady = $true
        break
    } catch {
        Start-Sleep 1
    } finally {
        if ($tcp) { $tcp.Dispose() }
    }
}
if ($portReady) { Write-Host ' ready' -ForegroundColor Green }
else { Write-Host ' timeout (may still be starting)' -ForegroundColor Yellow }

# --- Verification ---
Write-Host ''
Write-Host '  ============================================' -ForegroundColor Cyan
Write-Host '  VERIFICATION' -ForegroundColor Cyan
Write-Host '  ============================================' -ForegroundColor Cyan

$allOk = $true

# Service
$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
$svcOk = $svc -and $svc.Status -eq 'Running'
Write-Host "  Service      : $(if($svcOk){'RUNNING'}else{'NOT RUNNING'})" -ForegroundColor $(if($svcOk){'Green'}else{'Red'})
if (-not $svcOk) { $allOk = $false }

# Port 3403
Write-Host "  Port 3403    : $(if($portReady){'LISTENING'}else{'NOT READY'})" -ForegroundColor $(if($portReady){'Green'}else{'Yellow'})
if (-not $portReady) { $allOk = $false }

# HTTP check
$httpOk = $false
try { Invoke-WebRequest 'http://127.0.0.1:3403/' -UseBasicParsing -TimeoutSec 5 | Out-Null; $httpOk = $true } catch {}
Write-Host "  HTTP 200     : $(if($httpOk){'YES'}else{'NO'})" -ForegroundColor $(if($httpOk){'Green'}else{'Yellow'})
if (-not $httpOk) { $allOk = $false }

# Server connection
$serverOk = $false
try { Invoke-RestMethod "$Server/api/health" -TimeoutSec 5 | Out-Null; $serverOk = $true } catch {}
Write-Host "  Server       : $(if($serverOk){'CONNECTED'}else{'UNREACHABLE'})" -ForegroundColor $(if($serverOk){'Green'}else{'Red'})
if (-not $serverOk) { $allOk = $false }

# Identity
$idOk = $false
$idPath = Join-Path $InstallDir '.lightman-identity.json'
if (Test-Path $idPath) {
    try { $id = Get-Content $idPath -Raw | ConvertFrom-Json; if ($id.deviceId) { $idOk = $true } } catch {}
}
Write-Host "  Identity     : $(if($idOk){'VALID'}else{'MISSING'})" -ForegroundColor $(if($idOk){'Green'}else{'Red'})
if (-not $idOk) { $allOk = $false }

# Chrome
$chromeOk = $false
foreach ($p in @('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')) {
    if (Test-Path $p) { $chromeOk = $true; break }
}
Write-Host "  Chrome       : $(if($chromeOk){'FOUND'}else{'MISSING'})" -ForegroundColor $(if($chromeOk){'Green'}else{'Red'})
if (-not $chromeOk) { $allOk = $false }

# Display bundle
$displayBundleOk = Test-Path (Join-Path $InstallDir 'public\index.html')
Write-Host "  Display app  : $(if($displayBundleOk){'FOUND'}else{'MISSING'})" -ForegroundColor $(if($displayBundleOk){'Green'}else{'Red'})
if (-not $displayBundleOk) { $allOk = $false }

# SSH
$sshOk = $false
$sshSvc = Get-Service sshd -ErrorAction SilentlyContinue
if ($sshSvc -and $sshSvc.Status -eq 'Running') { $sshOk = $true }
Write-Host "  SSH          : $(if($sshOk){'RUNNING'}else{'NOT AVAILABLE'})" -ForegroundColor $(if($sshOk){'Green'}else{'Red'})
if (-not $sshOk) { $allOk = $false }

# Config slug
$slugOk = $false
$cfgPath = Join-Path $InstallDir 'agent.config.json'
if (Test-Path $cfgPath) {
    try { $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json; if ($cfg.deviceSlug -eq $Slug) { $slugOk = $true } } catch {}
}
Write-Host "  Config slug  : $(if($slugOk){$Slug}else{'MISMATCH'})" -ForegroundColor $(if($slugOk){'Green'}else{'Red'})
if (-not $slugOk) { $allOk = $false }

# Hostname
Write-Host "  Hostname     : $targetHostname" -ForegroundColor $(if($env:COMPUTERNAME -eq $targetHostname){'Green'}else{'Yellow'})

Write-Host '  ============================================' -ForegroundColor Cyan
Write-Host ''

if (-not $allOk) {
    Write-Host '  FATAL: Setup verification failed. Fix the failed item above and re-run setup.' -ForegroundColor Red
    exit 1
}

Set-Content -Path $setupCompleteFile -Value (Get-Date).ToString('o') -Encoding ASCII

# Summary
if ($isUpdate -and -not $needsFullSetup) {
    Write-Host "  UPDATED to v$ver" -ForegroundColor Green
} elseif ($isUpdate -and $needsFullSetup) {
    Write-Host "  COMPLETED setup for v$ver" -ForegroundColor Green
    Write-Host "  Slug: $Slug" -ForegroundColor Green
    Write-Host "  User: $KioskUsername" -ForegroundColor Green
    Write-Host "  Password: $KioskPassword" -ForegroundColor Green
    Write-Host "  Auto-login: enabled" -ForegroundColor Green
} else {
    Write-Host "  INSTALLED v$ver" -ForegroundColor Green
    Write-Host "  Slug: $Slug" -ForegroundColor Green
    Write-Host "  User: $Username" -ForegroundColor Green
    Write-Host "  Password: $KioskPassword" -ForegroundColor Green
    Write-Host "  Auto-login: enabled" -ForegroundColor Green
}

Write-Host ''
Write-Host '  BIOS (manual, one-time):' -ForegroundColor Red
Write-Host '    After Power Loss = Power On' -ForegroundColor Red
Write-Host '    Wake-on-LAN = Enabled' -ForegroundColor Red
Write-Host ''

# ================================================================
#  PHASE 9: AUTO-REBOOT
# ================================================================
if ($needsFullSetup) {
    Write-Host '[9/9] Rebooting in 15 seconds... (Ctrl+C to cancel)' -ForegroundColor Yellow
    Start-Sleep 15
    Restart-Computer -Force
} else {
    Write-Host '[9/9] Update complete. Service restarted.' -ForegroundColor Green
    Write-Host ''
}
