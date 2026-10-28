# ============================================================================
# The-SIFT — Complete Home Assistant & MQTT Device Entity Reset (Windows)
# ============================================================================
# Usage: .\tools\reset-ha-entities.ps1
# ============================================================================

$ErrorActionPreference = "Continue"
$rootDir = (Get-Item $PSScriptRoot).Parent.FullName

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  The-SIFT — Purging Stale Home Assistant Entities & MQTT Messages       " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Purge retained discovery messages from MQTT broker
Write-Host "[1/3] Purging retained discovery payloads from MQTT broker (:1883)..." -ForegroundColor Yellow
if (Test-Path "$rootDir\tools\purge-stale-ha-devices.js") {
    node "$rootDir\tools\purge-stale-ha-devices.js"
}

# 2. Reset Home Assistant Docker container and cached volume
Write-Host ""
Write-Host "[2/3] Resetting Home Assistant container (sift-ha) & cache..." -ForegroundColor Yellow
docker rm -f sift-ha 2>$null | Out-Null
docker volume rm sift-ha-config 2>$null | Out-Null
Write-Host "  Stale Home Assistant database and entity registry removed." -ForegroundColor Green

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "  RESET COMPLETE: Run .\start-local.ps1 to start fresh!                 " -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Write-Host ""
