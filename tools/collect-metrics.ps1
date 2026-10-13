# ---------------------------------------------------------------------------
# CloudNest — Resource Metrics Sampler (kubectl top -> CSV)
# ---------------------------------------------------------------------------
# Samples node and pod CPU / memory usage every 5 seconds and records to CSV
# in docs/measurements/ for load testing and sizing analysis.
# ---------------------------------------------------------------------------

param (
    [string]$OutputDir = "$PSScriptRoot\..\docs\measurements",
    [int]$IntervalSec = 5,
    [int]$DurationSec = 60
)

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$nodeCsv = Join-Path $OutputDir "metrics-nodes-$timestamp.csv"
$podCsv = Join-Path $OutputDir "metrics-pods-$timestamp.csv"

"Timestamp,Node,CPU_Cores,CPU_Percent,Memory_Bytes,Memory_Percent" | Out-File -FilePath $nodeCsv -Encoding utf8
"Timestamp,Namespace,Pod,CPU_Cores,Memory_Bytes" | Out-File -FilePath $podCsv -Encoding utf8

Write-Host "Collecting Kubernetes resource metrics every $IntervalSec s for $DurationSec s..."
Write-Host "Node metrics output: $nodeCsv"
Write-Host "Pod metrics output:  $podCsv"

$startTime = Get-Date
while (((Get-Date) - $startTime).TotalSeconds -lt $DurationSec) {
    $now = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"

    # Sample Nodes
    try {
        $nodeLines = kubectl top nodes --no-headers 2>$null
        foreach ($line in $nodeLines) {
            $parts = $line -split '\s+'
            if ($parts.Count -ge 5) {
                "$now,$($parts[0]),$($parts[1]),$($parts[2]),$($parts[3]),$($parts[4])" | Out-File -FilePath $nodeCsv -Append -Encoding utf8
            }
        }
    } catch {
        # ignore transient kubectl errors
    }

    # Sample Pods
    try {
        $podLines = kubectl top pods -A --no-headers 2>$null
        foreach ($line in $podLines) {
            $parts = $line -split '\s+'
            if ($parts.Count -ge 4) {
                "$now,$($parts[0]),$($parts[1]),$($parts[2]),$($parts[3])" | Out-File -FilePath $podCsv -Append -Encoding utf8
            }
        }
    } catch {
        # ignore transient kubectl errors
    }

    Start-Sleep -Seconds $IntervalSec
}

Write-Host "Metrics collection finished successfully."
