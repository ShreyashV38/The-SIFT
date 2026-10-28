#!/usr/bin/env bash
# ============================================================================
# The-SIFT — Complete Home Assistant & MQTT Device Entity Reset
# ============================================================================
# Run this on your EC2 instance (or local machine) to completely wipe out
# old/stale devices (bedroom, kitchen, wokwi-led) from Home Assistant and Mosquitto:
#
#   chmod +x tools/reset-ha-entities.sh
#   ./tools/reset-ha-entities.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}  The-SIFT — Purging Stale Home Assistant Entities & MQTT Messages       ${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo ""

# 1. Purge retained discovery messages from MQTT broker
echo -e "${YELLOW}[1/3] Purging retained discovery payloads from MQTT broker (:1883)...${NC}"
if [ -f "tools/purge-stale-ha-devices.js" ]; then
    node tools/purge-stale-ha-devices.js || true
fi

# 2. Reset Home Assistant Docker container and cached volume
echo ""
echo -e "${YELLOW}[2/3] Resetting Home Assistant container (sift-ha) & cache...${NC}"
docker rm -f sift-ha 2>/dev/null || true
docker volume rm -f sift-ha-config 2>/dev/null || true
echo -e "${GREEN}  Stale Home Assistant database and entity registry removed.${NC}"

# 3. Prompt user / restart container cleanly
echo ""
echo -e "${YELLOW}[3/3] Restarting clean Home Assistant container...${NC}"
if [ -f "./start-local.sh" ]; then
    echo -e "${GREEN}  Run ./start-local.sh to boot the clean environment.${NC}"
fi

echo ""
echo -e "${GREEN}========================================================================${NC}"
echo -e "${GREEN}  RESET COMPLETE: Open Home Assistant at :8123 and verify it is empty!  ${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo ""
