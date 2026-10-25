#!/usr/bin/env bash
# ============================================================================
# The SIFT — Complete Local Environment Bootstrap (Linux / macOS / WSL)
# ============================================================================
# Usage: chmod +x start-local.sh && ./start-local.sh
# ============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}  The SIFT — Multi-Tenant Cloud-Native IoT Platform Bootstrap${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo ""

# ---- Step 1: Detect Prerequisites ----
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

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
HAS_K3D=false
CLUSTER_REACHABLE=false

if command -v kubectl &> /dev/null; then
    HAS_KUBECTL=true
    echo -e "${GREEN}  kubectl: Available${NC}"
fi

if command -v helm &> /dev/null; then
    HAS_HELM=true
    echo -e "${GREEN}  helm:    Available${NC}"
fi

if command -v k3d &> /dev/null; then
    HAS_K3D=true
    echo -e "${GREEN}  k3d:     Available${NC}"
fi

# ---- Step 2: Check Docker Engine ----
echo ""
echo -e "${YELLOW}[2/6] Checking Docker engine status...${NC}"

DOCKER_RUNNING=false
if docker info &>/dev/null; then
    DOCKER_RUNNING=true
    echo -e "${GREEN}  Docker engine is active and ready.${NC}"
else
    echo -e "${RED}  WARNING: Docker daemon is not running! Please start Docker Desktop.${NC}"
fi

# ---- Step 3: Infrastructure (K3s vs Local Containers) ----
echo ""
echo -e "${YELLOW}[3/6] Starting Infrastructure (MQTT, ThingsBoard, Home Assistant)...${NC}"

PF_PIDS=()
cleanup() {
    echo ""
    echo "Cleaning up SIFT services and background jobs..."
    for pid in "${BG_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    for pid in "${PF_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    exit 0
}
trap cleanup EXIT INT TERM

if $DOCKER_RUNNING && $HAS_KUBECTL && $HAS_K3D; then
    if ! kubectl cluster-info &>/dev/null; then
        echo -e "${CYAN}  Checking k3d cluster 'sift'...${NC}"
        if k3d cluster list 2>/dev/null | grep -q "sift"; then
            echo -e "${GREEN}  Starting existing k3d cluster 'sift'...${NC}"
            k3d cluster start sift 2>/dev/null || true
        else
            echo -e "${CYAN}  Creating 2-node k3d cluster 'sift'...${NC}"
            k3d cluster create sift \
                --servers 1 --agents 1 \
                --port "80:80@loadbalancer" \
                --port "443:443@loadbalancer" \
                --port "1883:1883@loadbalancer" \
                --port "8080:8080@loadbalancer" \
                --k3s-node-label "sift.io/role=identity@server:0" \
                --k3s-node-label "sift.io/role=worker@agent:0" 2>/dev/null || true
        fi
    fi
fi

if $DOCKER_RUNNING && $HAS_KUBECTL && kubectl cluster-info &>/dev/null; then
    CLUSTER_REACHABLE=true
    echo -e "${GREEN}  Kubernetes cluster is reachable. Applying platform manifests...${NC}"

    if [ -d "./cluster" ]; then
        for f in ./cluster/*.yaml; do
            [ -f "$f" ] && kubectl apply -f "$f" 2>/dev/null || true
        done
    fi

    for dir in magistrala thingsboard; do
        if [ -d "./deploy/$dir" ]; then
            for f in ./deploy/$dir/*.yaml; do
                [ -f "$f" ] && kubectl apply -f "$f" 2>/dev/null || true
            done
        fi
    done

    echo "  Setting up cluster port-forwards..."
    kubectl port-forward -n platform svc/magistrala-mqtt 1883:1883 &>/dev/null &
    PF_PIDS+=($!)
    kubectl port-forward -n observability svc/thingsboard 8080:8080 &>/dev/null &
    PF_PIDS+=($!)
    sleep 2
    echo -e "${GREEN}  Cluster services ready.${NC}"
else
    echo -e "${CYAN}  Using direct Docker containers for MQTT, ThingsBoard, and Home Assistant...${NC}"
    if $DOCKER_RUNNING; then
        # 1. MQTT
        if ! nc -z localhost 1883 2>/dev/null; then
            echo -e "${GREEN}  Starting Mosquitto MQTT Broker on port 1883...${NC}"
            docker rm -f sift-mqtt 2>/dev/null || true
            docker run -d --name sift-mqtt -p 1883:1883 eclipse-mosquitto:2 sh -c "echo 'listener 1883 0.0.0.0' > /mosquitto.conf && echo 'allow_anonymous true' >> /mosquitto.conf && mosquitto -c /mosquitto.conf" 2>/dev/null || true
        fi

        # 2. ThingsBoard
        if ! nc -z localhost 8080 2>/dev/null; then
            echo -e "${GREEN}  Starting ThingsBoard CE container on port 8080...${NC}"
            docker rm -f sift-thingsboard 2>/dev/null || true
            docker run -d --name sift-thingsboard -p 8080:8080 -e TB_QUEUE_TYPE=in-memory thingsboard/tb-postgres:3.6.2 2>/dev/null || true
        fi

        # 3. Home Assistant
        if ! nc -z localhost 8123 2>/dev/null; then
            echo -e "${GREEN}  Starting Home Assistant container on port 8123...${NC}"
            docker rm -f sift-ha 2>/dev/null || true
            docker run -d --name sift-ha -p 8123:8123 -e TZ=UTC ghcr.io/home-assistant/home-assistant:2024.10.1 2>/dev/null || true
        fi
    fi
fi

# ---- Step 4: Verify Workspace Dependencies ----
echo ""
echo -e "${YELLOW}[4/6] Verifying Node.js workspace dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo "  Installing workspace dependencies..."
    npm install --silent 2>/dev/null || true
else
    echo -e "${GREEN}  Dependencies already installed.${NC}"
fi

# ---- Step 5: Start All SIFT Microservices ----
echo ""
echo -e "${YELLOW}[5/6] Starting SIFT Microservices...${NC}"

export MQTT_PUBLIC_HOST="localhost"
export MQTT_URL="mqtt://localhost:1883"
export MAGISTRALA_URL="http://localhost:9000"
export TB_URL="http://localhost:8080"
export IDENTITY_SERVICE_URL="http://localhost:3001"
export IOT_BROKER_SERVICE_URL="http://localhost:3004"

BG_PIDS=()

echo "  Launching Identity Service on port 3001..."
PORT=3001 IDENTITY_PORT=3001 node services/identity-service/src/index.js &
BG_PIDS+=($!)

echo "  Launching IoT Broker Service on port 3004..."
PORT=3004 IOT_BROKER_PORT=3004 MQTT_URL="mqtt://localhost:1883" TB_URL="http://localhost:8080" node services/iot-broker-service/src/index.js &
BG_PIDS+=($!)

echo "  Launching Telemetry Bridge (MQTT -> ThingsBoard)..."
MQTT_URL="mqtt://localhost:1883" TB_URL="http://localhost:8080" node services/tb-bridge/src/index.js &
BG_PIDS+=($!)

sleep 2

# ---- Step 6: Start Provisioning API & Portal (Foreground) ----
echo ""
echo -e "${YELLOW}[6/6] Launching Provisioning API & Web Portal...${NC}"

echo ""
echo -e "${GREEN}========================================================================${NC}"
echo -e "${GREEN}  The SIFT — All Platform Components are Live!${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo ""
echo -e "${CYAN}  * Web Console & Portal:  http://localhost:3000${NC}"
echo -e "${CYAN}  * ThingsBoard CE:        http://localhost:8080  (Observability)${NC}"
echo -e "${CYAN}  * Home Assistant:        http://localhost:8123  (Smart Home UI)${NC}"
echo -e "${CYAN}  * MQTT Broker:           localhost:1883         (Device Ingestion)${NC}"
echo -e "${CYAN}  * Identity API:          http://localhost:3001  (Accounts & Auth)${NC}"
echo -e "${CYAN}  * IoT Broker API:        http://localhost:3004  (Device Registry)${NC}"
echo ""
echo -e "${YELLOW}  Press Ctrl+C to stop all services.${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo ""

cd "./services/provisioning-api"
node src/index.js
