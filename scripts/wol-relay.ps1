# Curato - Wake-on-LAN host relay (Windows)
# ============================================================================
# WHY: On Docker Desktop for Windows the server runs in a bridge-networked
# container (so port 3401 is reachable). Bridge networking means the server's
# WoL magic-packet broadcasts never escape the docker network onto the physical
# LAN, so Wake-on-LAN does nothing.
#
# This relay runs ON the Windows host (which IS on the LAN). It tails the
# curato-app container logs; whenever the server logs "[WOL] Target MAC: <mac>"
# it re-sends the magic packet as a real broadcast.
#
# IMPORTANT: a WoL magic packet is layer-2. If the host has multiple interfaces
# on the same subnet (e.g. Ethernet + Wi-Fi both on 192.168.0.x), an unbound
# broadcast may egress the wrong interface (Wi-Fi) and never reach a *wired*
# kiosk. So we BIND the send to each physical interface's local IP and send the
# subnet broadcast from every one — guaranteeing the Ethernet path is covered.
#
# Install: copy scripts\wol-relay-launch.vbs into the user's Startup folder.
# Run directly: powershell -ExecutionPolicy Bypass -File scripts\wol-relay.ps1
# ============================================================================

param(
    [string]$Container = 'curato-app',
    [int[]]$Ports = @(9, 7),
    [string]$LogFile = 'C:\ProgramData\Curato-WolRelay\relay.log'
)

$ErrorActionPreference = 'Continue'

$logDir = Split-Path -Parent $LogFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

function Write-Log([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line
}

function Get-MagicPacket([string]$mac) {
    $hex = ($mac -replace '[^0-9A-Fa-f]', '')
    if ($hex.Length -ne 12) { return $null }
    $macBytes = New-Object byte[] 6
    for ($i = 0; $i -lt 6; $i++) { $macBytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16) }
    $packet = New-Object byte[] 102
    for ($i = 0; $i -lt 6; $i++) { $packet[$i] = 0xFF }
    for ($i = 0; $i -lt 16; $i++) { [Array]::Copy($macBytes, 0, $packet, 6 + ($i * 6), 6) }
    return , $packet
}

# Returns physical IPv4 interfaces as objects: @{ IP=<local ip>; Broadcast=<subnet bcast> }
# Skips docker bridge, WSL, Hyper-V virtual switches, loopback and link-local.
function Get-LanInterfaces {
    $out = @()
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object {
        $ip = $_.IPAddress
        $alias = $_.InterfaceAlias
        $plen = $_.PrefixLength
        if ($ip -like '127.*' -or $ip -like '169.254.*') { return }
        if ($alias -match 'vEthernet|WSL|Loopback|Docker|Hyper-V') { return }
        if ($ip -like '172.*' -and $plen -le 16) { return }   # docker bridge ranges
        try {
            $addr = [System.Net.IPAddress]::Parse($ip).GetAddressBytes(); [Array]::Reverse($addr)
            $ipu = [BitConverter]::ToUInt32($addr, 0)
            $hostmask = if ($plen -ge 32) { [uint32]0 } else { [uint32](([int64]1 -shl (32 - $plen)) - 1) }
            $b = [BitConverter]::GetBytes([uint32]($ipu -bor $hostmask)); [Array]::Reverse($b)
            $bcast = ([System.Net.IPAddress]::new($b)).ToString()
            $out += [pscustomobject]@{ IP = $ip; Broadcast = $bcast }
        } catch {}
    }
    return $out
}

# Send the magic packet OUT EACH physical interface (bound to its local IP), to
# that interface's subnet broadcast and to the limited broadcast, on all ports.
function Send-MagicPacket([byte[]]$packet, $ifaces) {
    foreach ($if in $ifaces) {
        foreach ($target in @($if.Broadcast, '255.255.255.255')) {
            foreach ($pt in $Ports) {
                try {
                    $localEp = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($if.IP), 0)
                    $u = New-Object System.Net.Sockets.UdpClient($localEp)
                    $u.EnableBroadcast = $true
                    for ($n = 0; $n -lt 5; $n++) { [void]$u.Send($packet, $packet.Length, $target, $pt) }
                    $u.Close()
                } catch {
                    Write-Log ("  send fail {0} -> {1}:{2} : {3}" -f $if.IP, $target, $pt, $_.Exception.Message)
                }
            }
        }
    }
}

Write-Log "===== WoL relay starting (container=$Container ports=$($Ports -join ',')) ====="
Write-Log ("LAN interfaces: " + ((Get-LanInterfaces | ForEach-Object { $_.IP + '->' + $_.Broadcast }) -join ', '))

while ($true) {
    try {
        docker logs -f --tail 0 $Container 2>&1 | ForEach-Object {
            $line = [string]$_
            $m = [regex]::Match($line, '\[WOL\]\s*Target MAC:\s*([0-9A-Fa-f][0-9A-Fa-f:\.\-]{10,16})')
            if ($m.Success) {
                $mac = $m.Groups[1].Value
                $pkt = Get-MagicPacket $mac
                if ($pkt) {
                    $ifaces = Get-LanInterfaces
                    Send-MagicPacket $pkt $ifaces
                    Write-Log ("Relayed WoL for {0} via interfaces: {1}" -f $mac, (($ifaces | ForEach-Object { $_.IP + '->' + $_.Broadcast }) -join ', '))
                } else {
                    Write-Log ("Ignored malformed MAC in log: {0}" -f $mac)
                }
            }
        }
        Write-Log "docker logs stream ended; reconnecting in 3s..."
    } catch {
        Write-Log ("docker logs error: {0}; retry in 3s" -f $_.Exception.Message)
    }
    Start-Sleep -Seconds 3
}
