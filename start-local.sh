#!/usr/bin/env bash
# ============================================================================
# CloudNest — Local Environment Bootstrap (Linux / macOS)
# ============================================================================
# Usage: chmod +x start-local.sh && ./start-local.sh
#
# This script:
# 1. Checks prerequisites (kubectl, helm, node, docker)
# 2. Applies cluster manifests (if K8s is available)
# 3. Sets up port-forwards for provisioning-api, MQTT, and HA
# 4. Starts the provisioning API locally
# ============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  The SIFT — Local Environment Bootstrap${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ---- Step 0: Prerequisites ----
echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"

MISSING=""
for cmd in node npm docker; do
    if ! command -v "$cmd" &> /dev/null; then
        MISSING="$MISSING $cmd"
    fi
done

if [ -n "$MISSING" ]; then
    echo -e "${RED}  ERROR: Missing required tools:${MISSING}${NC}"
    echo -e "${RED}  Please install them and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}  Node.js: $(node --version)${NC}"
echo -e "${GREEN}  Docker:  $(docker --version 2>/dev/null || echo 'N/A')${NC}"

HAS_KUBECTL=false
HAS_HELM=false
CLUSTER_REACHABLE=false

if command -v kubectl &> /dev/null; then
    HAS_KUBECTL=true
    echo -e "${GREEN}  kubectl: $(kubectl version --client --short 2>/dev/null || echo 'installed')${NC}"
else
    echo -e "${YELLOW}  kubectl: NOT FOUND (Kubernetes features disabled)${NC}"
fi

if command -v helm &> /dev/null; then
    HAS_HELM=true
    echo -e "${GREEN}  helm:    $(helm version --short 2>/dev/null || echo 'installed')${NC}"
else
    echo -e "${YELLOW}  helm:    NOT FOUND (Helm deployments disabled)${NC}"
fi

# ---- Step 1: Apply cluster manifests ----
echo ""
echo -e "${YELLOW}[2/5] Kubernetes cluster setup...${NC}"

if $HAS_KUBECTL; then
    if kubectl cluster-info &> /dev/null; then
        CLUSTER_REACHABLE=true
        echo -e "${GREEN}  Cluster is reachable. Applying manifests...${NC}"

        if [ -d "./cluster" ]; then
            for f in ./cluster/*.yaml; do
                [ -f "$f" ] && echo "  Applying $(basename $f)..." && kubectl apply -f "$f" 2>/dev/null || true
            done
        fi

        for dir in magistrala thingsboard provisioning; do
            if [ -d "./deploy/$dir" ]; then
                for f in ./deploy/$dir/*.yaml; do
                    [ -f "$f" ] && echo "  Applying deploy/$dir/$(basename $f)..." && kubectl apply -f "$f" 2>/dev/null || true
                done
            fi
        done

        echo -e "${GREEN}  Cluster manifests applied.${NC}"
    else
        echo -e "${YELLOW}  Cluster not reachable. Skipping K8s setup.${NC}"
        echo -e "${YELLOW}  TIP: Run 'k3d cluster start sift' to start your cluster.${NC}"
    fi
else
    echo -e "${YELLOW}  kubectl not found. Skipping K8s setup.${NC}"
fi

# ---- Step 2: Install dependencies ----
echo ""
echo -e "${YELLOW}[3/5] Installing dependencies...${NC}"

API_DIR="./services/provisioning-api"
if [ -f "$API_DIR/package.json" ]; then
    cd "$API_DIR"
    if [ ! -d "node_modules" ]; then
        echo "  Installing provisioning-api dependencies..."
        npm install --silent 2>/dev/null
    else
        echo -e "${GREEN}  Dependencies already installed.${NC}"
    fi
    cd - > /dev/null
fi

# ---- Step 3: Port forwards ----
echo ""
echo -e "${YELLOW}[4/5] Setting up port forwards...${NC}"

PF_PIDS=()
cleanup() {
    echo ""
    echo "Cleaning up..."
    docker rm -f cloudnest-mqtt 2>/dev/null || true
    for pid in "${PF_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    exit 0
}
trap cleanup EXIT INT TERM

if $HAS_KUBECTL && $CLUSTER_REACHABLE; then
    echo "  Port-forward: localhost:1883 -> magistrala-mqtt (MQTT)"
    kubectl port-forward -n platform svc/magistrala-mqtt 1883:1883 &>/dev/null &
    PF_PIDS+=($!)

    sleep 2
    echo -e "${GREEN}  Port forwards established.${NC}"
else
    echo -e "${YELLOW}  Skipping port forwards (no cluster).${NC}"
fi

# Automated local Mosquitto check/fallback (Bug 4)
MQTT_RUNNING=false
if nc -z localhost 1883 2>/dev/null || (echo > /dev/tcp/localhost/1883) 2>/dev/null; then
    MQTT_RUNNING=true
fi

if [ "$MQTT_RUNNING" = false ]; then
    echo -e "${YELLOW}  Starting local Mosquitto MQTT broker on port 1883...${NC}"
    docker run -d --name cloudnest-mqtt -p 1883:1883 eclipse-mosquitto:2 sh -c "echo 'listener 1883 0.0.0.0' > /mosquitto.conf && echo 'allow_anonymous true' >> /mosquitto.conf && mosquitto -c /mosquitto.conf" 2>/dev/null || true
    sleep 1
fi

# ---- Step 4: Start Provisioning API ----
echo ""
echo -e "${YELLOW}[5/5] Starting Provisioning API...${NC}"

export MQTT_PUBLIC_HOST="${MQTT_PUBLIC_HOST:-host.wokwi.internal}"
export MQTT_URL="${MQTT_URL:-mqtt://localhost:1883}"
export MAGISTRALA_URL="${MAGISTRALA_URL:-http://localhost:9000}"
export TB_URL="${TB_URL:-http://localhost:8080}"

cd "$API_DIR"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  The SIFT is starting!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${CYAN}  Dashboard:  http://localhost:3000${NC}"
echo -e "${CYAN}  API Health: http://localhost:3000/v1/health${NC}"
echo -e "${CYAN}  MQTT:       localhost:1883${NC}"
echo ""
echo -e "${YELLOW}  Press Ctrl+C to stop.${NC}"
echo ""

node src/index.js
