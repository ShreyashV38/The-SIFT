#!/usr/bin/env bash
# ============================================================================
# The SIFT — Local Environment Teardown (Linux / macOS / WSL)
# ============================================================================
# Usage: ./stop-local.sh
# ============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
GRAY='\033[0;90m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  The SIFT — Stopping Local Environment${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# 1. Kill Node.js services running from project
echo -e "${YELLOW}[1/3] Stopping SIFT Node.js processes...${NC}"
pkill -f "services/provisioning-api" 2>/dev/null || true
pkill -f "services/identity-service" 2>/dev/null || true
pkill -f "services/iot-broker-service" 2>/dev/null || true
pkill -f "services/tb-bridge" 2>/dev/null || true
pkill -f "one-device.js" 2>/dev/null || true
pkill -f "simulator.js" 2>/dev/null || true

# Kill anything listening on SIFT service ports
for PORT in 3000 3001 3004 8080 8081 8123; do
    if command -v fuser &>/dev/null; then
        fuser -k ${PORT}/tcp 2>/dev/null || true
    elif command -v lsof &>/dev/null; then
        lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true
    fi
done
echo -e "${GREEN}  SIFT Node.js processes stopped.${NC}"

# 2. Stop Docker containers
echo ""
echo -e "${YELLOW}[2/3] Stopping Docker containers...${NC}"
if command -v docker &>/dev/null; then
    docker stop sift-thingsboard 2>/dev/null || true
    docker rm -f sift-mqtt cloudnest-mqtt sift-ha 2>/dev/null || true
    HA_CONTAINERS=$(docker ps -a -q --filter "name=^/ha-" 2>/dev/null || true)
    if [ -n "$HA_CONTAINERS" ]; then
        docker rm -f $HA_CONTAINERS 2>/dev/null || true
    fi
    echo -e "${GREEN}  Docker containers cleaned up.${NC}"
else
    echo -e "${GRAY}  Docker not found. Skipping.${NC}"
fi

# 3. Summary
echo ""
echo -e "${YELLOW}[3/3] Port verification...${NC}"
for PORT in 3000 3001 3004 8080 8081 1883 8123; do
    if command -v nc &>/dev/null && nc -z localhost $PORT 2>/dev/null; then
        echo -e "  Port $PORT: IN USE"
    else
        echo -e "  Port $PORT: ${GREEN}Free${NC}"
    fi
done

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  All SIFT services stopped successfully.${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
