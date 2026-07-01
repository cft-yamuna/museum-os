# Curato Power-Only Setup (Windows)
# Purpose: onboard a Windows machine to Curato for power controls only
# (power on via WOL, power off, restart) without kiosk/shell takeover.
#
# Local usage:
#   powershell -ExecutionPolicy Bypass -File .\setup-device-power-only.ps1 -DeviceSlug "kiosk-01" -Server "http://192.168.10.100:3401"
#
# The device is auto-registered in Curato (so it appears in the admin panel
# and the agent can provision). Registration uses the admin API and resolves the
# site automatically when there is a single site; otherwise pass -SiteId.
#
# One-liner usage (when script is hosted):
#   $env:CURATO_DEVICE_SLUG='kiosk-01'
#   # Optional overrides (defaults: kiosk / Light123)
#   $env:CURATO_AUTOLOGIN_USERNAME='kiosk'
#   $env:CURATO_AUTOLOGIN_PASSWORD='Light123'
#   # Optional when more than one site exists:
#   $env:CURATO_SITE_ID='e74b5c5f-dd1c-4d0a-9520-9f4cac3881b2'
#   irm 'http://192.168.10.100:3401/power.ps1' | iex

param(
    [Parameter(Mandatory=$false)]
    [string]$DeviceSlug = $env:CURATO_DEVICE_SLUG,

    [Parameter(Mandatory=$false)]
    [string]$Server = $(if ($env:CURATO_SERVER_URL) { $env:CURATO_SERVER_URL } else { '__CURATO_SERVER_URL__' }),

    [Parameter(Mandatory=$false)]
    [string]$InstallDir = 'C:\Program Files\Curato\PowerAgent',

    [Parameter(Mandatory=$false)]
    [string]$ServiceName = 'CuratoPowerAgent',

    [Parameter(Mandatory=$false)]
    [string]$LogDir = 'C:\ProgramData\Curato\logs',

    [Parameter(Mandatory=$false)]
    [string]$NssmDir = 'C:\ProgramData\Curato\nssm',

    [Parameter(Mandatory=$false)]
    [string]$Timezone = 'Asia/Kolkata',

    [Parameter(Mandatory=$false)]
    [string]$SourceAgentDir = $env:CURATO_AGENT_DIR,

    [Parameter(Mandatory=$false)]
    [string]$AdminEmail = 'admin@curato.local',

    [Parameter(Mandatory=$false)]
    [string]$AdminPassword = 'admin123',

    [Parameter(Mandatory=$false)]
    [string]$SiteId = $env:CURATO_SITE_ID,

    [Parameter(Mandatory=$false)]
    [bool]$InstallSsh = $true,

    [Parameter(Mandatory=$false)]
    [string]$EnableAutoLogin = $(if ($env:CURATO_ENABLE_AUTOLOGIN) { $env:CURATO_ENABLE_AUTOLOGIN } else { 'true' }),

    [Parameter(Mandatory=$false)]
    [string]$DisableSleep = $(if ($env:CURATO_DISABLE_SLEEP) { $env:CURATO_DISABLE_SLEEP } else { 'true' }),

    [Parameter(Mandatory=$false)]
    [string]$AutoLoginUsername = $(if ($env:CURATO_AUTOLOGIN_USERNAME) { $env:CURATO_AUTOLOGIN_USERNAME } else { 'kiosk' }),

    [Parameter(Mandatory=$false)]
    [string]$AutoLoginPassword = $(if ($env:CURATO_AUTOLOGIN_PASSWORD) { $env:CURATO_AUTOLOGIN_PASSWORD } else { 'Light123' })
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$DefaultServer = '__CURATO_SERVER_URL__'
if (-not $Server -or $Server -eq '__CURATO_SERVER_URL__') {
    $Server = $DefaultServer
}

function Require-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if (-not $isAdmin) {
        throw 'Run this script as Administrator.'
    }
}

function Convert-PreferenceStringToBool {
    param(
        [Parameter(Mandatory=$false)]
        [string]$Value,

        [Parameter(Mandatory=$true)]
        [bool]$DefaultValue
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $DefaultValue
    }

    switch ($Value.Trim().ToLowerInvariant()) {
        '1' { return $true }
        'true' { return $true }
        'yes' { return $true }
        'y' { return $true }
        'on' { return $true }
        '0' { return $false }
        'false' { return $false }
        'no' { return $false }
        'n' { return $false }
        'off' { return $false }
        default { return $DefaultValue }
    }
}

function Convert-SecureStringToPlainText {
    param([Parameter(Mandatory=$true)][Security.SecureString]$SecureString)

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

function Ensure-Node20 {
    try {
        $version = (node -v) -replace '^v', ''
        $major = [int]($version.Split('.')[0])
        if ($major -ge 20) {
            Write-Host "  Node.js v$version detected" -ForegroundColor Green
            return
        }
    } catch {
        # install below
    }

    Write-Host '  Installing Node.js v20...' -ForegroundColor Yellow
    $msiPath = Join-Path $env:TEMP 'node-v20.18.0-x64.msi'
    Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile $msiPath -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait -NoNewWindow
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue

    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js install failed.'
    }

    $installed = (node -v) -replace '^v', ''
    Write-Host "  Node.js v$installed installed" -ForegroundColor Green
}

function Ensure-Directory([string]$PathValue) {
    if (-not (Test-Path $PathValue)) {
        New-Item -Path $PathValue -ItemType Directory -Force | Out-Null
    }
}

function Get-AutoLoginConfiguration {
    $rawUsername = $AutoLoginUsername
    if ([string]::IsNullOrWhiteSpace($rawUsername)) {
        $rawUsername = 'kiosk'
    }
    if ([string]::IsNullOrWhiteSpace($rawUsername)) {
        throw 'Auto-login username is required.'
    }

    $rawUsername = $rawUsername.Trim()
    $userName = $rawUsername
    $domainName = $env:COMPUTERNAME
    $localUserName = $null

    if ($rawUsername.Contains('\')) {
        $parts = $rawUsername.Split('\', 2)
        $domainName = $parts[0]
        $userName = $parts[1]
        if ($domainName -eq '.' -or $domainName -ieq 'localhost' -or $domainName -ieq $env:COMPUTERNAME) {
            $domainName = $env:COMPUTERNAME
            $localUserName = $userName
        }
    } elseif ($rawUsername.Contains('@')) {
        $domainName = 'MicrosoftAccount'
        $userName = $rawUsername
    } else {
        $localUserName = $rawUsername
    }

    $password = $AutoLoginPassword
    if ($null -eq $password -or $password -eq '') {
        $password = 'Light123'
    }

    return @{
        RawUsername = $rawUsername
        UserName = $userName
        DefaultDomainName = $domainName
        LocalUserName = $localUserName
        Password = [string]$password
    }
}

function Ensure-AutoLogin {
    Write-Host '  Auto-login...' -NoNewline

    try {
        $config = Get-AutoLoginConfiguration
        $winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'

        if ($config.LocalUserName) {
            $existing = Get-LocalUser -Name $config.LocalUserName -ErrorAction SilentlyContinue
            if (-not $existing) {
                net user $config.LocalUserName $config.Password /add 2>$null | Out-Null
            }
            else {
                net user $config.LocalUserName $config.Password 2>$null | Out-Null
            }
            net user $config.LocalUserName /expires:never 2>$null | Out-Null
            try { Set-LocalUser -Name $config.LocalUserName -PasswordNeverExpires $true -ErrorAction SilentlyContinue } catch {}
        }

        $pwdLess = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device'
        if (Test-Path $pwdLess) {
            Set-ItemProperty -Path $pwdLess -Name 'DevicePasswordLessBuildVersion' -Value 0
        }

        $passport = 'HKLM:\SOFTWARE\Policies\Microsoft\PassportForWork'
        if (-not (Test-Path $passport)) {
            New-Item -Path $passport -Force | Out-Null
        }
        Set-ItemProperty -Path $passport -Name 'Enabled' -Value 0

        Set-ItemProperty -Path $winlogon -Name 'AutoAdminLogon' -Value '1'
        Set-ItemProperty -Path $winlogon -Name 'DefaultUserName' -Value $config.UserName
        Set-ItemProperty -Path $winlogon -Name 'DefaultPassword' -Value $config.Password
        Set-ItemProperty -Path $winlogon -Name 'DefaultDomainName' -Value $config.DefaultDomainName
        Set-ItemProperty -Path $winlogon -Name 'DisableCAD' -Value 1
        Set-ItemProperty -Path $winlogon -Name 'AutoRestartShell' -Value 1
        Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'DisableAutomaticRestartSignOn' -Value 0

        $script:ConfiguredAutoLoginUser = $config.RawUsername
        Write-Host " enabled for $($config.RawUsername)" -ForegroundColor Green
    } catch {
        Write-Host " failed: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

function Disable-SleepSettings {
    Write-Host '  Sleep/hibernate...' -NoNewline

    try {
        powercfg /change monitor-timeout-ac 0 2>&1 | Out-Null
        powercfg /change monitor-timeout-dc 0 2>&1 | Out-Null
        powercfg /change standby-timeout-ac 0 2>&1 | Out-Null
        powercfg /change standby-timeout-dc 0 2>&1 | Out-Null
        powercfg /change hibernate-timeout-ac 0 2>&1 | Out-Null
        powercfg /change hibernate-timeout-dc 0 2>&1 | Out-Null
        powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 0 2>&1 | Out-Null
        powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 0 2>&1 | Out-Null
        powercfg /SETACTIVE SCHEME_CURRENT 2>&1 | Out-Null

        Write-Host ' disabled' -ForegroundColor Green
    } catch {
        Write-Host " failed: $($_.Exception.Message)" -ForegroundColor Red
        throw
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

function Configure-WolSettings {
    Write-Host '  Applying WOL settings...' -ForegroundColor DarkGray

    try {
        powercfg /h off | Out-Null
    } catch {
        Write-Host '  WARNING: Could not disable hibernation' -ForegroundColor DarkYellow
    }

    $fastStartupOk = Try-SetRegistryDword -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name 'HiberbootEnabled' -Value 0
    if (-not $fastStartupOk) {
        Write-Host '  WARNING: Could not disable Fast Startup registry flag' -ForegroundColor DarkYellow
    }

    $adapters = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -ne 'Disabled' }
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
            Write-Host '  Wake-armed devices:' -ForegroundColor Green
            $wakeDevices | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        } else {
            Write-Host '  WARNING: Windows reports no wake-armed adapters yet.' -ForegroundColor DarkYellow
        }
    } catch {
        Write-Host '  WARNING: Could not query wake-armed devices.' -ForegroundColor DarkYellow
    }
}

function Stop-And-Remove-Service([string]$Name, [string]$NssmExePath) {
    $ErrorActionPreference = 'Continue'
    Stop-Service -Name $Name -ErrorAction SilentlyContinue
    if (Test-Path $NssmExePath) {
        & $NssmExePath stop $Name 2>$null | Out-Null
        & $NssmExePath remove $Name confirm 2>$null | Out-Null
    }
    sc.exe stop $Name 2>$null | Out-Null
    sc.exe delete $Name 2>$null | Out-Null
    $ErrorActionPreference = 'Stop'
    Start-Sleep -Seconds 2
}

function Resolve-SourceAgentDir {
    if ($SourceAgentDir -and (Test-Path (Join-Path $SourceAgentDir 'dist\index.js'))) {
        return $SourceAgentDir
    }

    if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'dist\index.js'))) {
        return $PSScriptRoot
    }

    if ($MyInvocation.MyCommand.Path) {
        $fromPath = Split-Path -Parent $MyInvocation.MyCommand.Path
        if (Test-Path (Join-Path $fromPath 'dist\index.js')) {
            return $fromPath
        }
    }

    return $null
}

function Install-Agent-FromLocal([string]$LocalAgentDir) {
    Write-Host "  Using local agent source: $LocalAgentDir" -ForegroundColor Green

    Ensure-Directory $InstallDir

    Copy-Item (Join-Path $LocalAgentDir 'dist') (Join-Path $InstallDir 'dist') -Recurse -Force
    Copy-Item (Join-Path $LocalAgentDir 'package.json') (Join-Path $InstallDir 'package.json') -Force
    if (Test-Path (Join-Path $LocalAgentDir 'package-lock.json')) {
        Copy-Item (Join-Path $LocalAgentDir 'package-lock.json') (Join-Path $InstallDir 'package-lock.json') -Force
    }
    if (Test-Path (Join-Path $LocalAgentDir 'node_modules')) {
        Copy-Item (Join-Path $LocalAgentDir 'node_modules') (Join-Path $InstallDir 'node_modules') -Recurse -Force
    }
    if (Test-Path (Join-Path $LocalAgentDir 'scripts')) {
        Copy-Item (Join-Path $LocalAgentDir 'scripts') (Join-Path $InstallDir 'scripts') -Recurse -Force
    }
    if (Test-Path (Join-Path $LocalAgentDir 'nssm\nssm.exe')) {
        Ensure-Directory $NssmDir
        Copy-Item (Join-Path $LocalAgentDir 'nssm\nssm.exe') (Join-Path $NssmDir 'nssm.exe') -Force
    }
}

$script:AdminToken = $null

function Get-AdminToken {
    if ($script:AdminToken) {
        return $script:AdminToken
    }

    try {
        $loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
        $login = Invoke-RestMethod "$Server/api/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody
        $script:AdminToken = $login.data.token
    } catch {
        throw "Failed to login to $Server as $AdminEmail. Error: $($_.Exception.Message)"
    }

    if (-not $script:AdminToken) {
        throw 'Could not obtain admin token.'
    }

    return $script:AdminToken
}

function Resolve-SiteId {
    param([Parameter(Mandatory=$true)][string]$Token)

    if ($SiteId) {
        return $SiteId
    }

    $headers = @{ Authorization = "Bearer $Token" }
    $resp = Invoke-RestMethod "$Server/api/sites" -Headers $headers
    $sites = @($resp.data)

    if ($sites.Count -eq 0) {
        throw 'No sites found on the server. Create a site first, or pass -SiteId.'
    }
    if ($sites.Count -gt 1) {
        throw "Multiple sites found ($($sites.Count)). Re-run with -SiteId <uuid> (or set CURATO_SITE_ID)."
    }

    return $sites[0].id
}

# Primary NIC MAC + IPv4 so the registered device is immediately usable for
# Wake-on-LAN power-on and so provisioning auto-matches by IP (no pairing code).
function Get-PrimaryNetworkInfo {
    $info = @{ Mac = $null; Ip = $null }
    try {
        # Prefer the adapter that carries the default route (the LAN-facing NIC),
        # so the captured IP matches what the server sees during provisioning.
        $adapter = $null
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
            Sort-Object -Property RouteMetric |
            Select-Object -First 1
        if ($route) {
            $adapter = Get-NetAdapter -InterfaceIndex $route.ifIndex -ErrorAction SilentlyContinue |
                Where-Object { $_.Status -eq 'Up' } |
                Select-Object -First 1
        }
        if (-not $adapter) {
            $adapter = Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
                Where-Object { $_.Status -eq 'Up' } |
                Select-Object -First 1
        }
        if ($adapter) {
            $info.Mac = $adapter.MacAddress
            $ipObj = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
                Select-Object -First 1
            if ($ipObj) { $info.Ip = $ipObj.IPAddress }
        }
    } catch {
        # Best-effort only — registration still works without MAC/IP.
    }
    return $info
}

# Create the device row in Curato so it appears in the admin panel and the
# agent can provision. Idempotent: skips if a device with this slug exists.
function Register-DeviceRecord {
    $token = Get-AdminToken
    $headers = @{ Authorization = "Bearer $token" }
    $resolvedSiteId = Resolve-SiteId -Token $token

    $existing = $null
    try {
        $listUrl = "$Server/api/devices?site_id=$([uri]::EscapeDataString($resolvedSiteId))"
        $list = Invoke-RestMethod $listUrl -Headers $headers
        $existing = @($list.data) |
            Where-Object { $_.slug -and ($_.slug.ToLower() -eq $DeviceSlug.ToLower()) } |
            Select-Object -First 1
    } catch {
        Write-Host "  Could not list existing devices: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    if ($existing) {
        Write-Host "  Device '$DeviceSlug' already registered (id $($existing.id)) - leaving as-is" -ForegroundColor Green
        $script:RegisteredDeviceId = $existing.id
        return $existing.id
    }

    $net = Get-PrimaryNetworkInfo
    $body = @{
        site_id      = $resolvedSiteId
        slug         = $DeviceSlug
        display_name = $DeviceSlug
        type         = 'windows_pc'
        config       = @{ powerOnly = $true }
    }
    if ($net.Mac) { $body.mac_address = $net.Mac }
    if ($net.Ip)  { $body.ip_address  = $net.Ip }

    $json = $body | ConvertTo-Json -Depth 5
    $created = Invoke-RestMethod "$Server/api/devices" -Method Post -ContentType 'application/json' -Headers $headers -Body $json
    $deviceId = $created.data.id
    $script:RegisteredDeviceId = $deviceId

    Write-Host "  Registered device '$DeviceSlug' (id $deviceId)" -ForegroundColor Green
    if ($net.Mac) {
        Write-Host "    MAC $($net.Mac) captured for Wake-on-LAN" -ForegroundColor DarkGray
    } else {
        Write-Host '    WARNING: no MAC detected - set it in admin for Wake-on-LAN power-on' -ForegroundColor DarkYellow
    }
    return $deviceId
}

function Install-Agent-FromServer {
    Write-Host '  Local agent source not found; downloading latest agent package from server...' -ForegroundColor Yellow

    $token = Get-AdminToken
    $headers = @{ Authorization = "Bearer $token" }
    $check = Invoke-RestMethod "$Server/api/agent/check-update?current_version=0.0.0&platform=windows" -Headers $headers
    if (-not $check.data -or -not $check.data.download_url) {
        throw 'Server did not return a downloadable agent package.'
    }

    $tempTar = Join-Path $env:TEMP 'curato-power-agent.tar.gz'
    $downloadUrl = "$Server$($check.data.download_url)"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempTar -Headers $headers -UseBasicParsing

    Ensure-Directory $InstallDir
    tar -xzf $tempTar -C $InstallDir
    Remove-Item $tempTar -Force -ErrorAction SilentlyContinue
}

function Ensure-Dependencies {
    if (Test-Path (Join-Path $InstallDir 'node_modules')) {
        Write-Host '  Runtime dependencies already present' -ForegroundColor Green
        return
    }

    Write-Host '  Installing runtime dependencies...' -ForegroundColor Yellow
    Push-Location $InstallDir
    try {
        $ErrorActionPreference = 'Continue'
        npm ci --omit=dev --ignore-scripts 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            npm install --omit=dev --ignore-scripts 2>&1 | Out-Host
        }
        $ErrorActionPreference = 'Stop'
    } finally {
        Pop-Location
    }

    if (-not (Test-Path (Join-Path $InstallDir 'node_modules'))) {
        throw 'Dependency installation failed.'
    }
}

function Ensure-Nssm {
    $nssmExe = Join-Path $NssmDir 'nssm.exe'
    if (Test-Path $nssmExe) {
        return $nssmExe
    }

    Ensure-Directory $NssmDir

    if (Test-Path (Join-Path $InstallDir 'nssm\nssm.exe')) {
        Copy-Item (Join-Path $InstallDir 'nssm\nssm.exe') $nssmExe -Force
        return $nssmExe
    }

    Write-Host '  NSSM not found locally; downloading...' -ForegroundColor Yellow
    $zipPath = Join-Path $env:TEMP 'nssm.zip'
    $extractPath = Join-Path $env:TEMP 'nssm-extract'

    $downloaded = $false
    foreach ($url in @('https://nssm.cc/release/nssm-2.24.zip', 'https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip')) {
        try {
            Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -TimeoutSec 60
            if ((Test-Path $zipPath) -and ((Get-Item $zipPath).Length -gt 10000)) {
                $downloaded = $true
                break
            }
        } catch {
            # try next URL
        }
    }

    if (-not $downloaded) {
        throw 'Unable to download NSSM. Please place nssm.exe manually at C:\ProgramData\Curato\nssm\nssm.exe'
    }

    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    $candidate = Get-ChildItem $extractPath -Recurse -Filter 'nssm.exe' | Where-Object { $_.DirectoryName -like '*win64*' } | Select-Object -First 1
    if (-not $candidate) {
        $candidate = Get-ChildItem $extractPath -Recurse -Filter 'nssm.exe' | Select-Object -First 1
    }

    if (-not $candidate) {
        throw 'NSSM archive downloaded but nssm.exe not found.'
    }

    Copy-Item $candidate.FullName $nssmExe -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue

    return $nssmExe
}

function Write-PowerOnlyConfig {
    $configPath = Join-Path $InstallDir 'agent.config.json'
    $config = @{
        serverUrl = $Server
        deviceSlug = $DeviceSlug
        healthIntervalMs = 60000
        logLevel = 'info'
        logFile = 'agent.log'
        identityFile = '.curato-identity.json'
        localServices = $false
        powerSchedule = @{
            enableLocalCron = $false
            timezone = $Timezone
            shutdownWarningSeconds = 60
        }
    }

    $json = $config | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($configPath, $json, [System.Text.UTF8Encoding]::new($false))

    $identityPath = Join-Path $InstallDir '.curato-identity.json'
    if (Test-Path $identityPath) {
        Remove-Item $identityPath -Force
    }
}

function Install-PowerService([string]$NssmExePath) {
    $nodePath = (Get-Command node).Source

    & $NssmExePath install $ServiceName $nodePath 'dist\index.js' | Out-Null
    & $NssmExePath set $ServiceName AppDirectory $InstallDir | Out-Null
    & $NssmExePath set $ServiceName DisplayName 'Curato Power Agent' | Out-Null
    & $NssmExePath set $ServiceName Description 'Curato power-only agent (no kiosk takeover)' | Out-Null
    & $NssmExePath set $ServiceName Start SERVICE_AUTO_START | Out-Null
    & $NssmExePath set $ServiceName AppStdout (Join-Path $LogDir 'power-agent-stdout.log') | Out-Null
    & $NssmExePath set $ServiceName AppStderr (Join-Path $LogDir 'power-agent-stderr.log') | Out-Null
    & $NssmExePath set $ServiceName AppStdoutCreationDisposition 4 | Out-Null
    & $NssmExePath set $ServiceName AppStderrCreationDisposition 4 | Out-Null
    & $NssmExePath set $ServiceName AppRotateFiles 1 | Out-Null
    & $NssmExePath set $ServiceName AppRotateBytes 5242880 | Out-Null
    & $NssmExePath set $ServiceName AppRestartDelay 10000 | Out-Null
    & $NssmExePath set $ServiceName AppExit Default Restart | Out-Null

    sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 2>$null | Out-Null

    Start-Service $ServiceName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    $svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        throw "Service '$ServiceName' was not created."
    }

    return $svc
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

    if (-not (Test-Path $Path)) { return $false }

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
}

function Set-SshdGlobalOption {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $configPath = 'C:\ProgramData\ssh\sshd_config'
    if (-not (Test-Path $configPath)) { return }

    Ensure-SshConfigWritable
    $lines = @(Get-Content $configPath -ErrorAction SilentlyContinue)
    $pattern = '^\s*#?\s*' + [regex]::Escape($Key) + '\s+'
    $updated = $false
    $next = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        if ($line -match $pattern) {
            $next.Add("$Key $Value")
            $updated = $true
        } else {
            $next.Add($line)
        }
    }
    if (-not $updated) {
        $next.Add("$Key $Value")
    }

    Ensure-SshConfigWritable
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
    if (-not $sshDir) { return $false }

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

    Ensure-SshConfigWritable
    return (Test-Path $configPath)
}

function Repair-SshFilePermissions {
    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) { return $false }

    $hostFixScript = Join-Path $sshDir 'FixHostFilePermissions.ps1'
    if (Test-Path $hostFixScript) {
        try {
            & $hostFixScript -Confirm:$false 2>&1 | Out-Null
        } catch {
            Write-Host "  Host key permission repair failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }

    $programDataSsh = 'C:\ProgramData\ssh'
    if (-not (Test-Path $programDataSsh)) { return $false }

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
    if ($sshd) { return $true }

    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) { return $false }

    $sshdExe = Join-Path $sshDir 'sshd.exe'
    if (-not (Test-Path $sshdExe)) { return $false }

    $serviceBinary = '"' + $sshdExe + '"'
    New-Service -Name sshd -BinaryPathName $serviceBinary -DisplayName 'OpenSSH SSH Server' -StartupType Automatic -ErrorAction SilentlyContinue | Out-Null
    [void](Set-SshServiceImagePath -SshdExePath $sshdExe)
    return [bool](Get-Service sshd -ErrorAction SilentlyContinue)
}

function Set-SshServiceImagePath {
    param([Parameter(Mandatory = $true)][string]$SshdExePath)

    $serviceRegPath = 'HKLM:\SYSTEM\CurrentControlSet\Services\sshd'
    if (-not (Test-Path $serviceRegPath)) { return $false }

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
    if (-not $sshDir) { return $false }

    $sshdExe = Join-Path $sshDir 'sshd.exe'
    if (-not (Test-Path $sshdExe)) { return $false }

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

function Invoke-OpenSshInstallStep {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Command,
        [int]$TimeoutSeconds = 90
    )

    Write-Host "  $Label (max $($TimeoutSeconds)s)..." -ForegroundColor DarkGray
    try {
        $process = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $Command) -WindowStyle Hidden -PassThru
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

function Ensure-SshdAdminKeyConfig {
    $configPath = 'C:\ProgramData\ssh\sshd_config'
    if (-not (Test-Path $configPath)) { return }

    Ensure-SshConfigWritable
    $raw = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
    if ($raw -notmatch 'administrators_authorized_keys') {
        Add-Content -Path $configPath -Value ''
        Add-Content -Path $configPath -Value 'Match Group administrators'
        Add-Content -Path $configPath -Value '       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys'
    }
}

function Install-ServerAuthorizedKeys {
    $tmpKeys = Join-Path $env:TEMP 'curato-authorized_keys'
    $destDir = 'C:\ProgramData\ssh'
    $destKeys = Join-Path $destDir 'administrators_authorized_keys'
    Remove-Item $tmpKeys -Force -ErrorAction SilentlyContinue
    try {
        Invoke-WebRequest "$Server/installers/authorized_keys" -OutFile $tmpKeys -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
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
    Ensure-SshConfigWritable
    & icacls $destKeys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' 2>$null | Out-Null
    Ensure-SshdAdminKeyConfig
    return $true
}

function Install-OpenSshFromZip {
    Write-Host '  Installing OpenSSH from bundled ZIP...' -ForegroundColor Yellow

    $zipPath = Join-Path $env:TEMP 'OpenSSH-Win64.zip'
    $extractRoot = Join-Path $env:TEMP ('OpenSSH-Win64-' + [guid]::NewGuid().ToString('N'))
    $targetDir = 'C:\Program Files\OpenSSH-Win64'
    $localZipCandidates = @(
        (Join-Path $InstallDir 'scripts\OpenSSH-Win64.zip'),
        $(if ($PSScriptRoot) { Join-Path $PSScriptRoot 'OpenSSH-Win64.zip' } else { $null }),
        'C:\Program Files\Curato\Agent\scripts\OpenSSH-Win64.zip'
    ) | Where-Object { $_ -and (Test-Path $_) }
    $localZip = $localZipCandidates | Select-Object -First 1

    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue

    try {
        if ($localZip) {
            Copy-Item $localZip $zipPath -Force
        } else {
            try {
                Invoke-WebRequest "$Server/openssh.zip" -OutFile $zipPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
            } catch {
                Invoke-WebRequest "$Server/installers/openssh.zip" -OutFile $zipPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
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

function Ensure-SshServer {
    Write-Host '  Installing OpenSSH...' -ForegroundColor DarkGray
    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if ($sshd) {
        Write-Host '  OpenSSH already installed' -ForegroundColor Green
    } else {
        [void](Invoke-OpenSshInstallStep -Label 'Windows OpenSSH capability install' -Command "Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction SilentlyContinue | Out-Null" -TimeoutSeconds 90)
        $sshd = Get-Service sshd -ErrorAction SilentlyContinue
        if (-not $sshd) {
            [void](Invoke-OpenSshInstallStep -Label 'DISM OpenSSH fallback' -Command "dism /online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0 /NoRestart | Out-Null" -TimeoutSeconds 90)
            $sshd = Get-Service sshd -ErrorAction SilentlyContinue
        }
        if (-not $sshd) {
            [void](Install-OpenSshFromZip)
            $sshd = Get-Service sshd -ErrorAction SilentlyContinue
        }
    }

    if (-not $sshd) {
        Write-Host '  SSH FAILED - OpenSSH Server could not be installed' -ForegroundColor Red
        return $false
    }

    [void](Ensure-SshConfigAndKeys)
    [void](Repair-SshFilePermissions)
    [void](Ensure-SshServiceRegistration)
    [void](Ensure-SshServiceConfiguration)

    Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue
    Set-SshDefaultShell
    Ensure-SshFirewallRule
    Ensure-SshPasswordAuth
    $keysInstalled = Install-ServerAuthorizedKeys

    try { Restart-Service sshd -Force -ErrorAction SilentlyContinue } catch {}
    try { Start-Service sshd -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 2

    $s = Get-Service sshd -ErrorAction SilentlyContinue
    if (-not ($s -and $s.Status -eq 'Running')) {
        Write-Host '  Repairing sshd service...' -ForegroundColor Yellow
        [void](Ensure-SshConfigAndKeys)
        [void](Repair-SshFilePermissions)
        [void](Ensure-SshServiceRegistration)
        [void](Ensure-SshServiceConfiguration)
        try { Restart-Service sshd -Force -ErrorAction SilentlyContinue } catch {}
        try { Start-Service sshd -ErrorAction SilentlyContinue } catch {}
        Start-Sleep -Seconds 3
        $s = Get-Service sshd -ErrorAction SilentlyContinue
    }

    if (-not ($s -and $s.Status -eq 'Running')) {
        Write-Host '  sshd still not running; reinstalling from bundled ZIP...' -ForegroundColor Yellow
        if (Install-OpenSshFromZip) {
            Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue
            Set-SshDefaultShell
            Ensure-SshFirewallRule
            Ensure-SshPasswordAuth
            try { Restart-Service sshd -Force -ErrorAction SilentlyContinue } catch {}
            try { Start-Service sshd -ErrorAction SilentlyContinue } catch {}
            Start-Sleep -Seconds 2
            [void](Ensure-SshConfigAndKeys)
            [void](Repair-SshFilePermissions)
            [void](Ensure-SshServiceConfiguration)
            $s = Get-Service sshd -ErrorAction SilentlyContinue
        }
    }

    if ($s -and $s.Status -eq 'Running') {
        Write-Host '  SSH READY' -ForegroundColor Green
        Write-Host '  SSH uses existing Windows accounts' -ForegroundColor Cyan
        if ($keysInstalled) {
            Write-Host '  authorized_keys installed for local Administrators' -ForegroundColor Green
        } else {
            Write-Host '  No server authorized_keys found; normal Windows auth remains in use' -ForegroundColor DarkYellow
        }
        return $true
    }

    Write-SshDiagnostics
    Write-Host '  SSH FAILED - service not running after repair' -ForegroundColor Red
    return $false
}

if (-not $DeviceSlug) {
    $DeviceSlug = Read-Host 'Enter device slug (e.g. kiosk-01)'
}
if (-not $DeviceSlug) {
    throw 'DeviceSlug is required.'
}

$EnableAutoLoginFlag = Convert-PreferenceStringToBool -Value $EnableAutoLogin -DefaultValue $true
$DisableSleepFlag = Convert-PreferenceStringToBool -Value $DisableSleep -DefaultValue $true
$script:ConfiguredAutoLoginUser = $null
$autoLoginDisplay = if ($EnableAutoLoginFlag) {
    if ($AutoLoginUsername) { "$AutoLoginUsername / Light123" } else { 'kiosk / Light123' }
} else {
    'skip'
}

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  Curato Power-Only Device Setup' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host "  Device slug : $DeviceSlug"
Write-Host "  Server URL  : $Server"
Write-Host "  Install dir : $InstallDir"
Write-Host "  Service     : $ServiceName"
Write-Host "  SSH         : $(if ($InstallSsh) { 'enable' } else { 'skip' })"
Write-Host "  Auto-login  : $autoLoginDisplay"
Write-Host "  Sleep       : $(if ($DisableSleepFlag) { 'disable' } else { 'leave normal' })"
Write-Host ''

Require-Admin

Write-Host '[1/12] Checking Node.js...' -ForegroundColor Yellow
Ensure-Node20

Write-Host '[2/12] Configuring Wake-on-LAN settings...' -ForegroundColor Yellow
Configure-WolSettings

Write-Host '[3/12] Configuring auto-login...' -ForegroundColor Yellow
if ($EnableAutoLoginFlag) {
    Ensure-AutoLogin
} else {
    Write-Host '  Auto-login skipped' -ForegroundColor DarkGray
}

Write-Host '[4/12] Disabling sleep/hibernate...' -ForegroundColor Yellow
if ($DisableSleepFlag) {
    Disable-SleepSettings
} else {
    Write-Host '  Sleep changes skipped' -ForegroundColor DarkGray
}

Write-Host '[5/12] Preparing directories...' -ForegroundColor Yellow
Ensure-Directory $InstallDir
Ensure-Directory $LogDir
Ensure-Directory $NssmDir

$nssmExe = Join-Path $NssmDir 'nssm.exe'
Write-Host '[6/12] Cleaning existing power-agent service (if any)...' -ForegroundColor Yellow
Stop-And-Remove-Service -Name $ServiceName -NssmExePath $nssmExe

Write-Host '[7/12] Installing agent runtime...' -ForegroundColor Yellow
$localSource = Resolve-SourceAgentDir
if ($localSource) {
    Install-Agent-FromLocal -LocalAgentDir $localSource
} else {
    Install-Agent-FromServer
}

Write-Host '[8/12] Ensuring dependencies and NSSM...' -ForegroundColor Yellow
Ensure-Dependencies
$nssmExe = Ensure-Nssm

Write-Host '[9/12] Writing power-only agent config...' -ForegroundColor Yellow
Write-PowerOnlyConfig

Write-Host '[10/12] Registering device in Curato...' -ForegroundColor Yellow
$script:RegisteredDeviceId = $null
$registrationOk = $false
try {
    [void](Register-DeviceRecord)
    $registrationOk = $true
} catch {
    Write-Host "  Device registration failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '  Setup will continue; the agent keeps retrying provisioning.' -ForegroundColor DarkYellow
    Write-Host '  Create the device manually in admin (or re-run this script) so it can connect.' -ForegroundColor DarkYellow
}

Write-Host '[11/12] Installing and starting Windows service...' -ForegroundColor Yellow
$svc = Install-PowerService -NssmExePath $nssmExe

Write-Host '[12/12] Enabling SSH access...' -ForegroundColor Yellow
$sshReady = $true
if ($InstallSsh) {
    $sshReady = Ensure-SshServer
    if (-not $sshReady) {
        throw 'SSH setup failed.'
    }
} else {
    Write-Host '  SSH setup skipped (InstallSsh=false)' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Write-Host '  POWER-ONLY SETUP COMPLETE' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Green
Write-Host "  Device slug : $DeviceSlug"
Write-Host "  Server URL  : $Server"
Write-Host "  Registered  : $(if ($registrationOk) { "YES$(if ($script:RegisteredDeviceId) { " ($script:RegisteredDeviceId)" })" } else { 'FAILED - add device in admin' })"
Write-Host "  Service     : $($svc.Status)"
Write-Host "  SSH         : $(if ($InstallSsh -and $sshReady) { 'READY' } elseif ($InstallSsh) { 'FAILED' } else { 'SKIPPED' })"
Write-Host "  Auto-login  : $(if ($EnableAutoLoginFlag) { "ENABLED ($script:ConfiguredAutoLoginUser)" } else { 'SKIPPED' })"
Write-Host "  Sleep       : $(if ($DisableSleepFlag) { 'DISABLED' } else { 'UNCHANGED' })"
Write-Host "  Logs        : $LogDir"
Write-Host ''
Write-Host 'What this script changed:' -ForegroundColor DarkGray
Write-Host '  - Applied WOL-ready network/power settings' -ForegroundColor DarkGray
Write-Host "  - Enabled Windows auto-login$(if ($EnableAutoLoginFlag -and $script:ConfiguredAutoLoginUser) { " for $script:ConfiguredAutoLoginUser" } elseif ($EnableAutoLoginFlag) { '' } else { ' (skipped)' })" -ForegroundColor DarkGray
Write-Host "  - Disabled sleep/hibernate timeouts$(if ($DisableSleepFlag) { '' } else { ' (skipped)' })" -ForegroundColor DarkGray
Write-Host '  - Installed a separate Curato power agent service' -ForegroundColor DarkGray
Write-Host '  - Enabled OpenSSH for normal remote access' -ForegroundColor DarkGray
Write-Host "  - Registered this device in Curato$(if ($registrationOk) { ' (visible in admin)' } else { ' (FAILED - add it manually)' })" -ForegroundColor DarkGray
Write-Host '  - Enabled provisioning/connection for power commands' -ForegroundColor DarkGray
Write-Host '  - Did NOT enable kiosk shell replacement or full hardening' -ForegroundColor DarkGray
Write-Host '  - Did NOT remove passwords or lock down the desktop' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Next:' -ForegroundColor DarkGray
Write-Host '  1) In Curato admin, confirm device appears as connected.' -ForegroundColor DarkGray
Write-Host '  2) (Slave) In Device Detail, set its master (parent) to wire up the power cascade.' -ForegroundColor DarkGray
Write-Host '  3) Use Power On / Power Off / Restart from Device Detail.' -ForegroundColor DarkGray
Write-Host '  4) Connect over SSH with an existing Windows admin account or installed admin key.' -ForegroundColor DarkGray
Write-Host "  5) Reboot once to verify auto-login for $(if ($script:ConfiguredAutoLoginUser) { $script:ConfiguredAutoLoginUser } else { 'the selected account' })." -ForegroundColor DarkGray
Write-Host ''
