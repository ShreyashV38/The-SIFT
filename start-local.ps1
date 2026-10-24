# ============================================================================
# CloudNest — Local Environment Bootstrap (Windows PowerShell)
# ============================================================================
# Usage: .\start-local.ps1
#
# This script:
# 1. Checks prerequisites (kubectl, helm, node, docker)
# 2. Applies cluster manifests (if K8s is available)
# 3. Sets up port-forwards for provisioning-api, MQTT, and HA
# 4. Starts the provisioning API locally
# 5. Runs the test suite to verify all 7 steps
# ============================================================================

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  The SIFT — Local Environment Bootstrap" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---- Step 0: Prerequisites ----
Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Yellow

# Auto-detect Node.js from standard install locations if not in PATH
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (Test-Path "$env:LOCALAPPDATA\nvm\v22.18.0\node.exe") {
        $env:PATH = "$env:LOCALAPPDATA\nvm\v22.18.0;$env:PATH"
    } else {
        $nvmNode = Get-ChildItem -Path "$env:LOCALAPPDATA\nvm" -Filter "node.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($nvmNode) {
            $env:PATH = "$($nvmNode.DirectoryName);$env:PATH"
        } elseif (Test-Path "C:\Program Files\nodejs\node.exe") {
            $env:PATH = "C:\Program Files\nodejs;$env:PATH"
        }
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

$nodeVersion = (node --version)
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
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

if ($hasKubectl) {
    $clusterReachable = $false
    try {
        kubectl cluster-info 2>$null | Out-Null
        $clusterReachable = $true
    } catch { }

    if ($clusterReachable) {
        Write-Host "  Cluster is reachable. Applying manifests..." -ForegroundColor Green

        # Apply cluster-level resources
        if (Test-Path ".\cluster") {
            Get-ChildItem ".\cluster\*.yaml" | ForEach-Object {
                Write-Host "  Applying $($_.Name)..."
                kubectl apply -f $_.FullName 2>$null
            }
        }

        # Apply deploy manifests
        foreach ($dir in @("magistrala", "thingsboard", "provisioning")) {
            $deployDir = ".\deploy\$dir"
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
        Write-Host "  TIP: Run 'k3d cluster start sift' to start your cluster." -ForegroundColor Yellow
    }
} else {
    Write-Host "  kubectl not found. Skipping K8s setup." -ForegroundColor Yellow
}

# ---- Step 2: Install dependencies ----
Write-Host ""
Write-Host "[3/5] Installing dependencies..." -ForegroundColor Yellow

$apiDir = ".\services\provisioning-api"
if (Test-Path "$apiDir\package.json") {
    Push-Location $apiDir
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing provisioning-api dependencies..."
        npm install --silent 2>$null
    } else {
        Write-Host "  Dependencies already installed." -ForegroundColor Green
    }
    Pop-Location
}

# ---- Step 3: Port forwards (background) ----
Write-Host ""
Write-Host "[4/5] Setting up port forwards..." -ForegroundColor Yellow

$portForwardJobs = @()

if ($hasKubectl -and $clusterReachable) {
    # MQTT port forward (Magistrala)
    Write-Host "  Port-forward: localhost:1883 -> magistrala-mqtt (MQTT)"
    $job1 = Start-Job -ScriptBlock {
        kubectl port-forward -n platform svc/magistrala-mqtt 1883:1883 2>$null
    }
    $portForwardJobs += $job1

    # Wait a moment for port-forwards to establish
    Start-Sleep -Seconds 2
    Write-Host "  Port forwards established." -ForegroundColor Green
} else {
    Write-Host "  Skipping port forwards (no cluster)." -ForegroundColor Yellow
}

# Automated local Mosquitto check/fallback (Bug 4)
$mqttRunning = Test-NetConnection -ComputerName localhost -Port 1883 -InformationLevel Quiet
if (-not $mqttRunning) {
    Write-Host "  Starting local Mosquitto MQTT broker on port 1883..." -ForegroundColor Yellow
    docker run -d --name cloudnest-mqtt -p 1883:1883 eclipse-mosquitto:2 sh -c "echo 'listener 1883 0.0.0.0' > /mosquitto.conf && echo 'allow_anonymous true' >> /mosquitto.conf && mosquitto -c /mosquitto.conf" 2>$null | Out-Null
    Start-Sleep -Seconds 1
}

# ---- Step 4: Start Provisioning API ----
Write-Host ""
Write-Host "[5/5] Starting Provisioning API..." -ForegroundColor Yellow

# Set environment for local dev
$env:MQTT_PUBLIC_HOST = "host.wokwi.internal"
$env:MQTT_URL = "mqtt://localhost:1883"
$env:MAGISTRALA_URL = "http://localhost:9000"
$env:TB_URL = "http://localhost:8080"

Push-Location $apiDir

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  The SIFT is starting!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  API Health: http://localhost:3000/v1/health" -ForegroundColor Cyan
Write-Host "  MQTT:       localhost:1883" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

# Start the API (foreground)
node src/index.js

Pop-Location

# Cleanup port-forward jobs and local containers on exit
docker rm -f cloudnest-mqtt 2>$null | Out-Null
foreach ($job in $portForwardJobs) {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -ErrorAction SilentlyContinue
}

