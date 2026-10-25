# ============================================================================
# The SIFT — Local Environment Teardown (Windows PowerShell)
# ============================================================================
# Usage: .\stop-local.ps1
#
# This script:
# 1. Stops PowerShell background jobs (microservices, port-forwards)
# 2. Terminates Node.js microservices (identity, iot-broker, provisioning, bridge)
# 3. Releases all listening ports (3000, 3001, 3002, 3004, 8080, 8081, 1883, 8123)
# 4. Stops and removes local Docker containers (sift-mqtt, sift-thingsboard, sift-ha, etc.)
# 5. Verifies all ports are released cleanly
# ============================================================================

$ErrorActionPreference = 'Continue'

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  The SIFT — Stopping Local Environment' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

# ---- Step 1: Stop PowerShell background jobs ----
Write-Host '[1/4] Stopping background jobs...' -ForegroundColor Yellow
$jobs = Get-Job -ErrorAction SilentlyContinue
if ($jobs) {
    $jobs | Stop-Job -ErrorAction SilentlyContinue
    $jobs | Remove-Job -ErrorAction SilentlyContinue
    Write-Host '  Background jobs cleared.' -ForegroundColor Green
} else {
    Write-Host '  No background jobs running.' -ForegroundColor Gray
}

# ---- Step 2: Stop Node processes running from this workspace ----
Write-Host ''
Write-Host '[2/4] Stopping SIFT Node.js microservices...' -ForegroundColor Yellow

$stoppedProcs = 0
try {
    $nodeProcs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $nodeProcs) {
        $cmd = $p.CommandLine
        if ($cmd -and (
            $cmd -match 'provisioning-api' -or 
            $cmd -match 'identity-service' -or 
            $cmd -match 'iot-broker-service' -or 
            $cmd -match 'tb-bridge' -or 
            $cmd -match 'one-device\.js' -or 
            $cmd -match 'simulator\.js' -or 
            $cmd -match 'test_suite\.js'
        )) {
            Write-Host "  Stopping node process (PID: $($p.ProcessId))..." -ForegroundColor Yellow
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            $stoppedProcs++
        }
    }
} catch { }

# Also terminate anything holding the SIFT service ports
$portsToCheck = @(3000, 3001, 3002, 3004, 8081, 9090, 8123)
foreach ($port in $portsToCheck) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        if ($procId -gt 4) {
            Write-Host "  Freeing port $port (stopping PID: $procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            $stoppedProcs++
        }
    }
}

if ($stoppedProcs -eq 0) {
    Write-Host '  No active SIFT Node.js processes found.' -ForegroundColor Gray
} else {
    Write-Host "  SIFT Node.js processes stopped: $stoppedProcs processes." -ForegroundColor Green
}

# ---- Step 3: Stop and remove Docker containers ----
Write-Host ''
Write-Host '[3/4] Stopping Docker containers...' -ForegroundColor Yellow

$hasDocker = Get-Command docker -ErrorAction SilentlyContinue
if ($hasDocker) {
    $containersToStop = @('sift-mqtt', 'cloudnest-mqtt', 'sift-thingsboard', 'sift-ha')
    foreach ($name in $containersToStop) {
        $found = docker ps -a -q -f "name=^/${name}$" 2>$null
        if ($found) {
            Write-Host "  Removing container: $name" -ForegroundColor Yellow
            docker rm -f $name 2>$null | Out-Null
        }
    }

    # Clean up any per-tenant ha-* test containers
    $haList = docker ps -a --format '{{.Names}}' 2>$null | Where-Object { $_ -match '^ha-' }
    foreach ($ha in $haList) {
        Write-Host "  Removing tenant container: $ha" -ForegroundColor Yellow
        docker rm -f $ha 2>$null | Out-Null
    }
    Write-Host '  Docker containers cleaned up.' -ForegroundColor Green
} else {
    Write-Host '  Docker not found. Skipping container cleanup.' -ForegroundColor Gray
}

# ---- Step 4: Verification ----
Write-Host ''
Write-Host '[4/4] Verifying ports...' -ForegroundColor Yellow

Start-Sleep -Milliseconds 500

$ports = @(
    @{ Name = 'Port 3000 (Provisioning API and Portal)'; Port = 3000 },
    @{ Name = 'Port 3001 (Identity Service)'; Port = 3001 },
    @{ Name = 'Port 3002 (TB Telemetry Bridge)'; Port = 3002 },
    @{ Name = 'Port 3004 (IoT Broker Service)'; Port = 3004 },
    @{ Name = 'Port 9090 (ThingsBoard)'; Port = 9090 },
    @{ Name = 'Port 8081 (Internal API)'; Port = 8081 },
    @{ Name = 'Port 1883 (MQTT Broker)'; Port = 1883 },
    @{ Name = 'Port 8123 (Home Assistant)'; Port = 8123 }
)

foreach ($item in $ports) {
    $inUse = Get-NetTCPConnection -LocalPort $item.Port -State Listen -ErrorAction SilentlyContinue
    if ($inUse) {
        Write-Host "  $($item.Name): IN USE (PID: $($inUse[0].OwningProcess))" -ForegroundColor Red
    } else {
        Write-Host "  $($item.Name): Free" -ForegroundColor Green
    }
}

Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Write-Host '  All SIFT services stopped successfully.' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Green
Write-Host ''
