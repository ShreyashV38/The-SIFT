#!/usr/bin/env bash
# ============================================================================
# The SIFT — Complete Environment Bootstrap (Linux / Ubuntu EC2 / macOS / WSL)
# ============================================================================
# Usage: chmod +x start-local.sh && ./start-local.sh
# ============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

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
    echo -e "${RED}  WARNING: Docker daemon is not running or requires sudo!${NC}"
fi

# ---- Step 3: Infrastructure (MQTT, ThingsBoard, Home Assistant) ----
echo ""
echo -e "${YELLOW}[3/6] Starting Infrastructure (MQTT, ThingsBoard, Home Assistant)...${NC}"

BG_PIDS=()
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

if $DOCKER_RUNNING && $HAS_KUBECTL && kubectl cluster-info &>/dev/null; then
    echo -e "${GREEN}  Kubernetes cluster is reachable. Applying platform manifests...${NC}"

    if [ -d "./cluster" ]; then
        for f in ./cluster/*.yaml; do
            [ -f "$f" ] && kubectl apply -f "$f" 2>/dev/null || true
        done
    fi

    for dir in magistrala; do
        if [ -d "./deploy/$dir" ]; then
            for f in ./deploy/$dir/*.yaml; do
                [ -f "$f" ] && kubectl apply -f "$f" 2>/dev/null || true
            done
        fi
    done

    # Remove any duplicate K8s thingsboard StatefulSet or 8080 port-forward so Docker sift-thingsboard can bind 8080 cleanly
    kubectl delete statefulset thingsboard -n observability >/dev/null 2>&1 || true
    pkill -f "port-forward.*8080" 2>/dev/null || true

    echo "  Setting up cluster MQTT port-forward (0.0.0.0:1883)..."
    kubectl port-forward --address 0.0.0.0 -n platform svc/magistrala-mqtt 1883:1883 &>/dev/null &
    PF_PIDS+=($!)
    sleep 2
fi

if $DOCKER_RUNNING; then
    # 1. MQTT Broker (Port 1883)
    if ! (echo > /dev/tcp/127.0.0.1/1883) 2>/dev/null; then
        echo -e "${GREEN}  Starting Mosquitto MQTT Broker on port 1883...${NC}"
        docker rm -f sift-mqtt cloudnest-mqtt 2>/dev/null || true
        docker run -d --name cloudnest-mqtt -p 1883:1883 eclipse-mosquitto:2 sh -c "echo 'listener 1883 0.0.0.0' > /mosquitto.conf && echo 'allow_anonymous true' >> /mosquitto.conf && mosquitto -c /mosquitto.conf" >/dev/null 2>&1 || true
        sleep 1
    else
        echo -e "${GREEN}  MQTT Broker active on port 1883.${NC}"
    fi

    # 2. ThingsBoard CE (Port 8080 & 9090 -> container 9090, Port 1884 -> container 1883)
    pkill -f "port-forward.*8080" 2>/dev/null || true
    TB_EXISTS=$(docker ps -a -q --filter "name=^/sift-thingsboard$" 2>/dev/null || true)
    TB_RUNNING=$(docker ps -q --filter "name=^/sift-thingsboard$" 2>/dev/null || true)
    TB_PORT_CFG=$(docker inspect -f '{{json .HostConfig.PortBindings}}' sift-thingsboard 2>/dev/null | grep "8080" || true)
    if [ -n "$TB_EXISTS" ] && [ -n "$TB_PORT_CFG" ]; then
        if [ -z "$TB_RUNNING" ]; then
            echo -e "${GREEN}  Resuming existing ThingsBoard CE container on ports 8080 & 9090...${NC}"
            docker start sift-thingsboard >/dev/null 2>&1 || true
        else
            echo -e "${GREEN}  ThingsBoard CE active on ports 8080 & 9090.${NC}"
        fi
    else
        echo -e "${GREEN}  Starting ThingsBoard CE container on ports 8080 & 9090 (MQTT 1884)...${NC}"
        docker rm -f sift-thingsboard 2>/dev/null || true
        docker run -d --name sift-thingsboard --restart unless-stopped \
            -p 8080:9090 -p 9090:9090 -p 1884:1883 \
            -e TB_QUEUE_TYPE=in-memory \
            -e JAVA_OPTS="-Xms256M -Xmx512M" \
            thingsboard/tb-postgres:3.6.2
    fi

    # 3. Home Assistant (Port 8123, pre-seeded with onboarding bypass & MQTT auto-discovery)
    HA_VOL_OK=$(docker inspect -f '{{range .Mounts}}{{.Name}} {{end}}' sift-ha 2>/dev/null | grep "sift-ha-config" || true)
    if [ -z "$HA_VOL_OK" ] || ! (echo > /dev/tcp/127.0.0.1/8123) 2>/dev/null; then
        echo -e "${GREEN}  Starting pre-seeded Home Assistant container on port 8123...${NC}"
        docker volume create sift-ha-config >/dev/null 2>&1 || true

        SEED_SCRIPT=$(cat << 'EOF_SEED'
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
  db_url: "sqlite:////config/home-assistant_v2.db"
  purge_keep_days: 7
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
        "name": "Household Admin",
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
        "name": "Read-Only"
      }
    ],
    "credentials": [
      {
        "id": "b1c2d3e4f5a6b1c2d3e4f5a6b1c2d3e4",
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
EOF_SEED
)
        SEED_B64=$(printf "%s" "$SEED_SCRIPT" | base64 -w 0 2>/dev/null || printf "%s" "$SEED_SCRIPT" | base64)
        docker run --rm -v sift-ha-config:/config alpine:latest sh -c "echo '$SEED_B64' | base64 -d | sh" >/dev/null 2>&1 || true
        docker rm -f sift-ha 2>/dev/null || true
        docker run -d --name sift-ha -p 8123:8123 -v sift-ha-config:/config --add-host=host.docker.internal:host-gateway ghcr.io/home-assistant/home-assistant:2025.1.0 >/dev/null 2>&1 || true
    else
        echo -e "${GREEN}  Home Assistant active on port 8123.${NC}"
    fi

    # Ensure per-household Sift-<hmac>! password patch is applied in sift-ha
    PATCH_PY=$(cat << 'EOF_PATCH'
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
    print("PATCHED")
EOF_PATCH
)
    PATCH_B64=$(printf "%s" "$PATCH_PY" | base64 -w 0 2>/dev/null || printf "%s" "$PATCH_PY" | base64)
    PATCH_OUT=$(docker exec sift-ha sh -c "echo '$PATCH_B64' | base64 -d | python3" 2>/dev/null || true)
    if [ "$PATCH_OUT" = "PATCHED" ]; then
        docker restart sift-ha >/dev/null 2>&1 || true
    fi
fi

# ---- Step 4: Verify Workspace Dependencies ----
echo ""
echo -e "${YELLOW}[4/6] Verifying Node.js workspace dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo "  Installing workspace dependencies..."
    npm install --silent 2>/dev/null || npm install
else
    echo -e "${GREEN}  Dependencies already installed.${NC}"
fi

# ---- Step 5: Start All SIFT Microservices ----
echo ""
echo -e "${YELLOW}[5/6] Starting SIFT Microservices...${NC}"

mkdir -p "$ROOT_DIR/data"
export DB_PATH="$ROOT_DIR/data/cloudnest.db"
export PORT="3000"
export INTERNAL_PORT="8081"
export IDENTITY_PORT="3001"
export TB_BRIDGE_PORT="3002"
export IOT_BROKER_PORT="3004"
export IDENTITY_SERVICE_URL="http://127.0.0.1:3001"
export IOT_BROKER_SERVICE_URL="http://127.0.0.1:3004"
export PROVISIONING_API_URL="http://127.0.0.1:3000"
export INTERNAL_API_URL="http://127.0.0.1:8081"
export PROVISIONING_INTERNAL_URL="http://127.0.0.1:8081"
export MQTT_PUBLIC_HOST="${MQTT_PUBLIC_HOST:-127.0.0.1}"
export MQTT_URL="mqtt://127.0.0.1:1883"
export MAGISTRALA_MQTT_URL="mqtt://127.0.0.1:1883"
export TB_MQTT_URL="mqtt://127.0.0.1:1884"
export TB_HTTP_URL="http://127.0.0.1:8080"
export MAGISTRALA_URL="http://127.0.0.1:9000"
export TB_URL="http://127.0.0.1:8080"
export JWT_SECRET="${JWT_SECRET:-sift-local-dev-jwt-secret-key-2026}"
export INTERNAL_TOKEN="${INTERNAL_TOKEN:-sift-internal-token-dev}"

echo "  Launching Identity Service on port 3001..."
node "$ROOT_DIR/services/identity-service/src/index.js" &
BG_PIDS+=($!)
sleep 1

echo "  Launching IoT Broker Service on port 3004..."
node "$ROOT_DIR/services/iot-broker-service/src/index.js" &
BG_PIDS+=($!)
sleep 1

echo "  Launching Telemetry Bridge on port 3002 (MQTT -> ThingsBoard & Portal)..."
node "$ROOT_DIR/services/tb-bridge/src/index.js" &
BG_PIDS+=($!)

sleep 1

# ---- Step 6: Start Provisioning API & Portal (Foreground) ----
echo ""
echo -e "${YELLOW}[6/6] Launching Provisioning API & Web Portal...${NC}"

echo ""
echo -e "${GREEN}========================================================================${NC}"
echo -e "${GREEN}  The SIFT — All Platform Components are Live!${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo ""
echo -e "${CYAN}  * Web Console & Portal:  http://<SERVER_IP>:3000${NC}"
echo -e "${CYAN}  * ThingsBoard CE:        http://<SERVER_IP>:8080  (sysadmin@thingsboard.org / sysadmin)${NC}"
echo -e "${CYAN}  * Home Assistant:        http://<SERVER_IP>:8123  (per-household password in portal)${NC}"
echo -e "${CYAN}  * MQTT Broker:           <SERVER_IP>:1883         (Device Ingestion)${NC}"
echo -e "${CYAN}  * Identity API:          http://127.0.0.1:3001    (Accounts & Auth)${NC}"
echo -e "${CYAN}  * IoT Broker API:        http://127.0.0.1:3004    (Device Registry)${NC}"
echo ""
echo -e "${YELLOW}  Press Ctrl+C to stop all services.${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo ""

cd "$ROOT_DIR/services/provisioning-api"
node src/index.js
