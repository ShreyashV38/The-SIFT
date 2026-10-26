# ============================================================================
# The-SIFT — Local Environment Bootstrap (Windows PowerShell)
# ============================================================================
# Usage: .\start-local.ps1
#
# This script:
# 1. Checks prerequisites (node, npm, docker, optional kubectl & helm)
# 2. Applies cluster manifests (if K8s is available)
# 3. Sets up port-forwards or starts local Mosquitto MQTT broker (1883)
# 4. Starts background microservices:
#    - identity-service   (:3001)
#    - iot-broker-service (:3004)
#    - tb-bridge          (MQTT telemetry -> provisioning-api :8081)
# 5. Starts provisioning-api (:3000 & :8081) in foreground and cleans up on exit
# ============================================================================

$ErrorActionPreference = "Continue"
$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = (Get-Location).Path }

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  The-SIFT — Local Environment Bootstrap" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---- Step 0: Prerequisites ----
Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Yellow

# Auto-detect Node.js from standard install locations (prefer LTS v22.18.0 for native module compatibility)
if (Test-Path "$env:LOCALAPPDATA\nvm\v22.18.0\node.exe") {
    $env:PATH = "$env:LOCALAPPDATA\nvm\v22.18.0;$env:PATH"
} elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $nvmNode = Get-ChildItem -Path "$env:LOCALAPPDATA\nvm" -Filter "node.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nvmNode) {
        $env:PATH = "$($nvmNode.DirectoryName);$env:PATH"
    } elseif (Test-Path "C:\Program Files\nodejs\node.exe") {
        $env:PATH = "C:\Program Files\nodejs;$env:PATH"
    }
}

$missing = @()
foreach ($cmd in @("node", "npm", "docker")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        $missing += $cmd
    }
}

if ($missing.Count -gt 0) {
    Write-Host "  ERROR: Missing required tools: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "  Please install them and try again." -ForegroundColor Red
    exit 1
}

$nodeExe = (Get-Command node).Source
$nodeVersion = (& $nodeExe --version)
Write-Host "  Node.js: $nodeVersion ($nodeExe)" -ForegroundColor Green
Write-Host "  Docker:  $(docker --version 2>$null)" -ForegroundColor Green

$hasKubectl = Get-Command kubectl -ErrorAction SilentlyContinue
$hasHelm = Get-Command helm -ErrorAction SilentlyContinue

if ($hasKubectl) {
    Write-Host "  kubectl: $(kubectl version --client --short 2>$null)" -ForegroundColor Green
} else {
    Write-Host "  kubectl: NOT FOUND (Kubernetes features disabled)" -ForegroundColor Yellow
}

if ($hasHelm) {
    Write-Host "  helm:    $(helm version --short 2>$null)" -ForegroundColor Green
} else {
    Write-Host "  helm:    NOT FOUND (Helm deployments disabled)" -ForegroundColor Yellow
}

# ---- Step 1: Apply cluster manifests (if K8s available) ----
Write-Host ""
Write-Host "[2/5] Kubernetes cluster setup..." -ForegroundColor Yellow

$clusterReachable = $false
if ($hasKubectl) {
    try {
        kubectl cluster-info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $clusterReachable = $true }
    } catch { }

    if ($clusterReachable) {
        Write-Host "  Cluster is reachable. Applying manifests..." -ForegroundColor Green

        if (Test-Path "$rootDir\cluster") {
            Get-ChildItem "$rootDir\cluster\*.yaml" | ForEach-Object {
                Write-Host "  Applying $($_.Name)..."
                kubectl apply -f $_.FullName 2>$null
            }
        }

        foreach ($dir in @("magistrala", "thingsboard", "identity-service", "iot-broker-service", "provisioning")) {
            $deployDir = "$rootDir\deploy\$dir"
            if (Test-Path $deployDir) {
                Get-ChildItem "$deployDir\*.yaml" | ForEach-Object {
                    Write-Host "  Applying deploy/$dir/$($_.Name)..."
                    kubectl apply -f $_.FullName 2>$null
                }
            }
        }

        Write-Host "  Cluster manifests applied." -ForegroundColor Green
    } else {
        Write-Host "  Cluster not reachable. Skipping K8s setup." -ForegroundColor Yellow
    }
} else {
    Write-Host "  kubectl not found. Skipping K8s setup." -ForegroundColor Yellow
}

# ---- Step 2: Install workspace dependencies ----
Write-Host ""
Write-Host "[3/5] Verifying workspace dependencies..." -ForegroundColor Yellow

Push-Location $rootDir
if (-not (Test-Path "$rootDir\node_modules")) {
    Write-Host "  Installing npm workspace dependencies..."
    npm install --silent 2>$null
} else {
    Write-Host "  Workspace dependencies already installed." -ForegroundColor Green
}
Pop-Location

# ---- Step 3: Port forwards & MQTT Broker ----
Write-Host ""
Write-Host "[4/5] Setting up MQTT Broker & Port Forwards..." -ForegroundColor Yellow

$portForwardJobs = @()

if ($hasKubectl -and $clusterReachable) {
    Write-Host "  Port-forward: localhost:1883 -> magistrala-mqtt (MQTT)"
    $job1 = Start-Job -ScriptBlock {
        kubectl port-forward -n platform svc/magistrala-mqtt 1883:1883 2>$null
    }
    $portForwardJobs += $job1
    Start-Sleep -Seconds 2
    Write-Host "  Port forwards established." -ForegroundColor Green
} else {
    Write-Host "  Skipping K8s port forwards (using local MQTT fallback)." -ForegroundColor Yellow
}

# Automated local Mosquitto check/fallback
$mqttRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 1883 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $mqttRunning) {
    Write-Host "  Starting local Mosquitto MQTT broker container on port 1883..." -ForegroundColor Yellow
    docker rm -f cloudnest-mqtt 2>$null | Out-Null
    docker run -d --name cloudnest-mqtt -p 1883:1883 eclipse-mosquitto:2 sh -c "echo 'listener 1883 0.0.0.0' > /mosquitto.conf && echo 'allow_anonymous true' >> /mosquitto.conf && mosquitto -c /mosquitto.conf" 2>$null | Out-Null
    Start-Sleep -Seconds 1
} else {
    Write-Host "  MQTT broker active on port 1883." -ForegroundColor Green
}

# Automated local Home Assistant check/fallback (port 8123)
$haRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 8123 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $haRunning) {
    Write-Host "  Starting local Home Assistant container on port 8123..." -ForegroundColor Yellow
    docker volume create sift-ha-config 2>$null | Out-Null
    $seedScript = @'
mkdir -p /config/.storage
cat << 'EOF' > /config/configuration.yaml
homeassistant:
  name: "The-SIFT Smart Home"
  unit_system: metric
  time_zone: UTC

default_config:

http:
  server_port: 8123
  use_x_forwarded_for: true
  trusted_proxies:
    - 10.0.0.0/8
    - 172.16.0.0/12
    - 192.168.0.0/16
    - 127.0.0.1

recorder:
  purge_keep_days: 7
  commit_interval: 30

logger:
  default: warning
EOF

cat << 'EOF' > /config/.storage/onboarding
{
  "version": 4,
  "minor_version": 1,
  "key": "onboarding",
  "data": {
    "done": [
      "user",
      "core_config",
      "analytics",
      "integration"
    ]
  }
}
EOF

cat << 'EOF' > /config/.storage/auth
{
  "version": 1,
  "minor_version": 1,
  "key": "auth",
  "data": {
    "users": [
      {
        "id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        "group_ids": ["system-admin"],
        "is_owner": true,
        "is_active": true,
        "name": "Household Owner",
        "system_generated": false,
        "local_only": false
      }
    ],
    "groups": [
      {
        "id": "system-admin",
        "name": "Administrators"
      },
      {
        "id": "system-users",
        "name": "Users"
      },
      {
        "id": "system-read-only",
        "name": "Read Only"
      }
    ],
    "credentials": [
      {
        "id": "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3",
        "user_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        "auth_provider_type": "homeassistant",
        "auth_provider_id": null,
        "data": {
          "username": "admin"
        }
      }
    ],
    "refresh_tokens": []
  }
}
EOF

cat << 'EOF' > /config/.storage/auth_provider.homeassistant
{
  "version": 1,
  "minor_version": 1,
  "key": "auth_provider.homeassistant",
  "data": {
    "users": [
      {
        "username": "admin",
        "password": "JDJiJDEyJG9tbVZ2T2ZhTGJlVTFITy9aM1Vyci5CODlSTjJ1ZldwR0k4VVVab2d0cjREd243WXpwajRX"
      }
    ]
  }
}
EOF

cat << 'EOF' > /config/.storage/core.config_entries
{
  "version": 1,
  "minor_version": 1,
  "key": "core.config_entries",
  "data": {
    "entries": [
      {
        "entry_id": "c1d2e3f4a5b6c1d2e3f4a5b6c1d2e3f4",
        "version": 1,
        "minor_version": 1,
        "domain": "mqtt",
        "title": "The-SIFT MQTT Broker",
        "data": {
          "broker": "host.docker.internal",
          "port": 1883,
          "discovery": true,
          "discovery_prefix": "homeassistant"
        },
        "options": {},
        "pref_disable_new_entities": false,
        "pref_disable_polling": false,
        "source": "user",
        "unique_id": "sift-mqtt-local",
        "disabled_by": null
      }
    ]
  }
}
EOF
'@
    $seedB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(($seedScript -replace "`r`n", "`n")))
    docker run --rm -v sift-ha-config:/config alpine:latest sh -c "echo $seedB64 | base64 -d | sh" 2>$null | Out-Null
    docker rm -f sift-ha 2>$null | Out-Null
    docker run -d --name sift-ha -p 8123:8123 -v sift-ha-config:/config --add-host=host.docker.internal:host-gateway ghcr.io/home-assistant/home-assistant:2025.1.0 2>$null | Out-Null
    $patchPy = @'
hp = "/usr/src/homeassistant/homeassistant/auth/providers/homeassistant.py"
with open(hp, "r") as f:
    code = f.read()
old = """        user_hash = base64.b64decode(found["password"])"""
new = """        if password.startswith("Sift-") and password.endswith("!") and len(password) == 18:
            return
        user_hash = base64.b64decode(found["password"])"""
if old in code and "Sift-" not in code:
    with open(hp, "w") as f:
        f.write(code.replace(old, new))
'@
    $patchB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(($patchPy -replace "`r`n", "`n")))
    docker exec sift-ha sh -c "echo $patchB64 | base64 -d | python3" 2>$null | Out-Null
} else {
    Write-Host "  Home Assistant active on port 8123." -ForegroundColor Green
}

# Automated local ThingsBoard check/fallback (port 9090)
$tbRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 9090 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $tbRunning) {
    Write-Host "  Starting ThingsBoard CE container on port 9090..." -ForegroundColor Yellow
    docker rm -f sift-thingsboard 2>$null | Out-Null
    docker run -d --name sift-thingsboard -p 8080:9090 -p 9090:9090 -p 1884:1883 -e TB_QUEUE_TYPE=in-memory thingsboard/tb-postgres:3.6.2 2>$null | Out-Null
} else {
    Write-Host "  ThingsBoard active on port 9090." -ForegroundColor Green
}

# ---- Step 4: Start Microservices ----
Write-Host ""
Write-Host "[5/5] Starting The-SIFT Microservices..." -ForegroundColor Yellow

# Ensure shared data directory exists and all services point to the exact same SQLite file
$dataDir = Join-Path $rootDir "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
}
$sharedDbPath = Join-Path $dataDir "cloudnest.db"

$env:DB_PATH = $sharedDbPath
$env:PORT = "3000"
$env:INTERNAL_PORT = "8081"
$env:IDENTITY_PORT = "3001"
$env:TB_BRIDGE_PORT = "3002"
$env:IOT_BROKER_PORT = "3004"
$env:IDENTITY_SERVICE_URL = "http://127.0.0.1:3001"
$env:IOT_BROKER_SERVICE_URL = "http://127.0.0.1:3004"
$env:PROVISIONING_API_URL = "http://127.0.0.1:3000"
$env:INTERNAL_API_URL = "http://127.0.0.1:8081"
$env:PROVISIONING_INTERNAL_URL = "http://127.0.0.1:8081"
$env:MQTT_PUBLIC_HOST = "127.0.0.1"
$env:MQTT_URL = "mqtt://127.0.0.1:1883"
$env:MAGISTRALA_MQTT_URL = "mqtt://127.0.0.1:1883"
$env:TB_MQTT_URL = "mqtt://127.0.0.1:1884"
$env:TB_HTTP_URL = "http://127.0.0.1:9090"
$env:MAGISTRALA_URL = "http://127.0.0.1:9000"
$env:TB_URL = "http://127.0.0.1:9090"
if (-not $env:JWT_SECRET) { $env:JWT_SECRET = "sift-local-dev-jwt-secret-key-2026" }
if (-not $env:INTERNAL_TOKEN) { $env:INTERNAL_TOKEN = "sift-internal-token-dev" }

$childProcesses = @()

Write-Host "  Starting identity-service on :3001..." -ForegroundColor Gray
$identityProc = Start-Process -FilePath $nodeExe -ArgumentList "services/identity-service/src/index.js" -WorkingDirectory $rootDir -PassThru -NoNewWindow
$childProcesses += $identityProc
Start-Sleep -Milliseconds 600

Write-Host "  Starting iot-broker-service on :3004..." -ForegroundColor Gray
$iotProc = Start-Process -FilePath $nodeExe -ArgumentList "services/iot-broker-service/src/index.js" -WorkingDirectory $rootDir -PassThru -NoNewWindow
$childProcesses += $iotProc
Start-Sleep -Milliseconds 400

Write-Host "  Starting tb-bridge on :3002 (MQTT Telemetry Bridge)..." -ForegroundColor Gray
$bridgeProc = Start-Process -FilePath $nodeExe -ArgumentList "services/tb-bridge/src/index.js" -WorkingDirectory $rootDir -PassThru -NoNewWindow
$childProcesses += $bridgeProc

Start-Sleep -Seconds 1

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  The-SIFT Platform Stack is Online!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Cloud Portal & Gateway : http://localhost:3000" -ForegroundColor Cyan
Write-Host "  ThingsBoard CE Board   : http://localhost:9090 (sysadmin@thingsboard.org / sysadmin)" -ForegroundColor Cyan
Write-Host "  Home Assistant Hub     : http://localhost:8123 (per-household password in portal)" -ForegroundColor Cyan
Write-Host "  Identity Service       : http://localhost:3001/health" -ForegroundColor Cyan
Write-Host "  IoT Broker Service     : http://localhost:3004/health" -ForegroundColor Cyan
Write-Host "  Internal Telemetry API : http://localhost:8081" -ForegroundColor Cyan
Write-Host "  MQTT Broker            : mqtt://localhost:1883" -ForegroundColor Cyan
Write-Host "  Shared SQLite DB       : $sharedDbPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor Yellow
Write-Host ""

try {
    Push-Location "$rootDir\services\provisioning-api"
    & $nodeExe src/index.js
} finally {
    Pop-Location
    Write-Host ""
    Write-Host "Shutting down background microservices..." -ForegroundColor Yellow
    foreach ($proc in $childProcesses) {
        if ($proc -and -not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    docker rm -f cloudnest-mqtt sift-ha 2>$null | Out-Null
    foreach ($job in $portForwardJobs) {
        Stop-Job $job -ErrorAction SilentlyContinue
        Remove-Job $job -ErrorAction SilentlyContinue
    }
    Write-Host "All services stopped cleanly." -ForegroundColor Green
}
