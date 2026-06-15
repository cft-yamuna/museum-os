# Museum OS Agent package uploader for Windows/PowerShell.
#
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\auto-deploy-agent.ps1 -Force -Platforms windows -LightmanUrl http://localhost:3401
#
# Run from admin/:
#   powershell -ExecutionPolicy Bypass -File ..\scripts\auto-deploy-agent.ps1 -Force -Platforms windows -LightmanUrl http://localhost:3401

param(
    [string]$LightmanDir = "",
    [string]$LightmanUrl = "",
    [string]$AdminEmail = "",
    [string]$AdminPassword = "",
    [string]$Platforms = "",
    [switch]$Force,
    [switch]$Pull,
    [switch]$SkipPull,
    [string]$PullBranch = ""
)

$ErrorActionPreference = "Stop"

function Resolve-Default {
    param(
        [string]$Value,
        [string]$EnvName,
        [string]$DefaultValue
    )

    if ($Value) { return $Value }
    $envValue = [Environment]::GetEnvironmentVariable($EnvName)
    if ($envValue) { return $envValue }
    return $DefaultValue
}

function Write-Log {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

function Resolve-Tool {
    param([string[]]$Names)

    foreach ($name in $Names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source) {
            return $cmd.Source
        }
    }

    throw "Required tool not found: $($Names -join ' or ')"
}

function Resolve-OptionalTool {
    param([string[]]$Names)

    foreach ($name in $Names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source) {
            return $cmd.Source
        }
    }

    return $null
}

function Invoke-Tool {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory (Get-Location).Path `
        -NoNewWindow `
        -Wait `
        -PassThru

    if ($process.ExitCode -ne 0) {
        throw "$FilePath failed with exit code $($process.ExitCode)"
    }
}

if (-not $LightmanDir) {
    $LightmanDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$LightmanUrl = Resolve-Default $LightmanUrl "LIGHTMAN_URL" "http://localhost:3401"
$AdminEmail = Resolve-Default $AdminEmail "ADMIN_EMAIL" "admin@museumos.local"
$AdminPassword = Resolve-Default $AdminPassword "ADMIN_PASSWORD" "admin123"
$Platforms = Resolve-Default $Platforms "PLATFORMS" "windows"
$forceDeploy = $Force.IsPresent -or ([Environment]::GetEnvironmentVariable("FORCE_DEPLOY") -eq "1")

$AgentDir = Join-Path $LightmanDir "agent"
$DisplayDir = Join-Path $LightmanDir "display"
$DeployStateFile = Join-Path $LightmanDir ".agent-deploy-hash"

$git = Resolve-OptionalTool @("git.exe", "git")
$node = Resolve-Tool @("node.exe", "node")
$npm = Resolve-Tool @("npm.cmd", "npm")
$tar = Resolve-Tool @("tar.exe", "tar")
$curl = Resolve-Tool @("curl.exe")

Set-Location $LightmanDir

if ($Pull -and $git -and -not $PullBranch) {
    try {
        $PullBranch = (& $git rev-parse --abbrev-ref HEAD 2>$null).Trim()
    } catch {
        $PullBranch = "main"
    }
    if (-not $PullBranch) { $PullBranch = "main" }
}

if ($Pull -and -not $SkipPull -and $git) {
    Write-Log "Pulling latest from origin/$PullBranch..."
    $pull = Start-Process `
        -FilePath $git `
        -ArgumentList @("pull", "--ff-only", "origin", $PullBranch) `
        -WorkingDirectory $LightmanDir `
        -NoNewWindow `
        -Wait `
        -PassThru
    if ($pull.ExitCode -ne 0) {
        Write-Log "WARNING: git pull failed. Continuing with local checkout."
    }
} elseif ($Pull -and -not $git) {
    Write-Log "WARNING: -Pull was requested, but Git was not found. Continuing with local checkout."
}

$currentHash = ""
if ($Pull -and $git) {
    $currentHash = (& $git log -1 --format=%H -- agent/ 2>$null).Trim()
    if (-not $currentHash) {
        $currentHash = (& $git rev-parse HEAD 2>$null).Trim()
    }
}
if (-not $currentHash) {
    $currentHash = "manual-$(Get-Date -Format yyyyMMddHHmmss)"
}

$lastHash = ""
if (Test-Path $DeployStateFile) {
    $lastHash = (Get-Content $DeployStateFile -Raw).Trim()
}

if (-not $forceDeploy -and $currentHash -eq $lastHash) {
    Write-Log "Agent unchanged. Use -Force to upload anyway."
    exit 0
}

$agentVersion = (& $node -e "console.log(require('./agent/package.json').version)").Trim()
$versionSuffix = Get-Date -Format yyyyMMddHHmmss
if ($Pull -and $git) {
    $gitShort = (& $git rev-parse --short HEAD 2>$null).Trim()
    if ($gitShort) { $versionSuffix = $gitShort }
}
$deployVersion = "$agentVersion+$versionSuffix"

Write-Log "Building agent v$deployVersion..."

Write-Log "Building display bundle for agent package..."
Push-Location $DisplayDir
try {
    Invoke-Tool $npm @("install")
    Invoke-Tool $npm @("run", "build")
} finally {
    Pop-Location
}

Push-Location $AgentDir
try {
    Invoke-Tool $npm @("install")
    Remove-Item -LiteralPath (Join-Path $AgentDir "dist") -Recurse -Force -ErrorAction SilentlyContinue
    Invoke-Tool $npm @("run", "build:package")
    Invoke-Tool $npm @("prune", "--omit=dev", "--ignore-scripts")

    $required = @(
        "dist",
        "node_modules",
        "package.json",
        "agent.config.template.json",
        "scripts",
        "bin",
        "nssm",
        "public"
    )

    foreach ($item in $required) {
        if (-not (Test-Path (Join-Path $AgentDir $item))) {
            throw "Agent package item missing after build: $item"
        }
    }

    $safeVersion = $deployVersion -replace '[^a-zA-Z0-9._+-]', '_'
    $tarball = Join-Path $env:TEMP "lightman-agent-$safeVersion.tar.gz"
    Remove-Item -LiteralPath $tarball -Force -ErrorAction SilentlyContinue

    Write-Log "Creating tarball..."
    Invoke-Tool $tar @(
        "-czf", $tarball,
        "-C", $AgentDir,
        "dist",
        "node_modules",
        "package.json",
        "agent.config.template.json",
        "scripts",
        "bin",
        "nssm",
        "public"
    )
} finally {
    Pop-Location
}

$tarballSizeKb = [Math]::Round((Get-Item $tarball).Length / 1KB)
Write-Log "Tarball created: $tarball (${tarballSizeKb}KB)"

Write-Log "Logging in to $LightmanUrl..."
$loginBody = @{
    email = $AdminEmail
    password = $AdminPassword
} | ConvertTo-Json -Compress
$login = Invoke-RestMethod "$LightmanUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -TimeoutSec 30
$token = $login.data.token
if (-not $token) {
    throw "Could not get admin token from $LightmanUrl"
}

$uploadOk = $true
$platformList = $Platforms.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }

foreach ($platform in $platformList) {
    Write-Log "Uploading for platform: $platform..."
    $resultText = & $curl -sf "$LightmanUrl/api/agent/upload" `
        -H "Authorization: Bearer $token" `
        -F "file=@$tarball" `
        -F "version=$deployVersion" `
        -F "platform=$platform"

    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: Upload failed for $platform."
        $uploadOk = $false
        continue
    }

    try {
        $result = $resultText | ConvertFrom-Json
        if ($result.success) {
            Write-Log "Upload successful for $platform."
        } else {
            Write-Log "ERROR: Upload failed for ${platform}: $resultText"
            $uploadOk = $false
        }
    } catch {
        Write-Log "ERROR: Upload returned non-JSON response for ${platform}: $resultText"
        $uploadOk = $false
    }
}

Remove-Item -LiteralPath $tarball -Force -ErrorAction SilentlyContinue

if (-not $uploadOk) {
    throw "One or more uploads failed."
}

Set-Content -Path $DeployStateFile -Value $currentHash -NoNewline
Write-Log "Done. Uploaded agent v$deployVersion for: $($platformList -join ', ')"
