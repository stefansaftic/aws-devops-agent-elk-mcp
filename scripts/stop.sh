#!/bin/bash
# =============================================================================
# Stop ELK MCP Demo Stack (local mode)
# =============================================================================
# Usage:
#   ./scripts/stop.sh              # Stop containers only
#   ./scripts/stop.sh --colima     # Stop containers + Colima
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

STOP_COLIMA=false
if [ "$1" = "--colima" ] || [ "$1" = "-c" ]; then
    STOP_COLIMA=true
fi

echo -e "${YELLOW}🛑 Stopping ELK MCP Demo Stack...${NC}"

# Stop Docker Compose
cd "$(dirname "$0")/.."
docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
echo -e "${GREEN}✅ Docker containers stopped${NC}"

# Optionally stop Colima
if [ "$STOP_COLIMA" = true ]; then
    if command -v colima &> /dev/null; then
        echo "🐋 Stopping Colima..."
        colima stop 2>/dev/null || true
        echo -e "${GREEN}✅ Colima stopped${NC}"
    else
        echo "ℹ️  Colima not found, skipping"
    fi
fi

echo ""
echo -e "${GREEN}Done! To restart: docker compose up -d --build${NC}"
