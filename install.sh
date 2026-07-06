#!/bin/bash
set -e
set -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Steam Account Sentinel Installer ===${NC}"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo &> /dev/null; then
        SUDO="sudo"
    fi
fi

if ! command -v git &> /dev/null || ! command -v node &> /dev/null; then
    echo -e "${BLUE}Missing prerequisites. Attempting auto-installation...${NC}"
    
    if command -v apt-get &> /dev/null; then
        echo -e "${BLUE}Detected Debian/Ubuntu system.${NC}"
        echo 'Acquire::AllowReleaseInfoChange "true";' | $SUDO tee /etc/apt/apt.conf.d/99allow-label-change > /dev/null
        $SUDO apt-get update || true
        
        if ! command -v git &> /dev/null; then
            echo -e "${BLUE}Installing git...${NC}"
            $SUDO apt-get install -y git
        fi
        
        if ! command -v node &> /dev/null; then
            echo -e "${BLUE}Installing Node.js...${NC}"
            if [ -n "$SUDO" ]; then
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            else
                curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            fi
            $SUDO apt-get install -y nodejs
        fi
        
        $SUDO rm -f /etc/apt/apt.conf.d/99allow-label-change
    elif command -v yum &> /dev/null; then
        echo -e "${BLUE}Detected RHEL/CentOS system.${NC}"
        
        if ! command -v git &> /dev/null; then
            echo -e "${BLUE}Installing git...${NC}"
            $SUDO yum install -y git
        fi
        
        if ! command -v node &> /dev/null; then
            echo -e "${BLUE}Installing Node.js...${NC}"
            curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
            $SUDO yum install -y nodejs
        fi
    else
        echo -e "${RED}Error: Unsupported package manager. Please install git and Node.js manually.${NC}"
        exit 1
    fi
fi

REPO_URL="https://github.com/whitehai11/steamacc-chekcer.git"
TARGET_DIR="steamacc-checker"

if [ -d ".git" ] && git remote -v | grep -q "steamacc-chekcer"; then
    echo -e "${BLUE}Already inside the repository. Pulling latest updates...${NC}"
    git pull
else
    if [ -d "$TARGET_DIR/.git" ]; then
        echo -e "${BLUE}Updating existing repository directory...${NC}"
        cd "$TARGET_DIR"
        git pull
    else
        echo -e "${BLUE}Cloning repository from GitHub...${NC}"
        git clone "$REPO_URL" "$TARGET_DIR"
        cd "$TARGET_DIR"
    fi
fi

echo -e "${BLUE}Installing production dependencies...${NC}"
npm install --omit=dev

CONFIG_FILE="config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo '{"dashboardPassword":"admin","asfPath":"./asf","steamApiKey":"","csrepKeyId":"","csrepSecret":"","asfIpcUrl":"http://127.0.0.1:1242","externalAsf":true,"discordWebhookUrl":"","port":3000}' > "$CONFIG_FILE"
fi

EXISTING_PASS=$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("config.json")).dashboardPassword || "admin")')
EXISTING_CSREP_KEY=$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("config.json")).csrepKeyId || "")')
EXISTING_CSREP_SECRET=$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("config.json")).csrepSecret || "")')
EXISTING_STEAM_KEY=$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("config.json")).steamApiKey || "")')
EXISTING_DISCORD_WEBHOOK=$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("config.json")).discordWebhookUrl || "")')

echo -e "\n${BLUE}--- Configuration Setup ---${NC}"
echo "Press [Enter] to keep the existing value in brackets."

read -p "Dashboard Password [$EXISTING_PASS]: " DB_PASS < /dev/tty
DB_PASS=${DB_PASS:-$EXISTING_PASS}

read -p "CSRep Key ID [${EXISTING_CSREP_KEY:-None}]: " CSREP_KEY < /dev/tty
CSREP_KEY=${CSREP_KEY:-$EXISTING_CSREP_KEY}

read -p "CSRep Secret [${EXISTING_CSREP_SECRET:-None}]: " CSREP_SECRET < /dev/tty
CSREP_SECRET=${CSREP_SECRET:-$EXISTING_CSREP_SECRET}

read -p "Steam API Key (Optional) [${EXISTING_STEAM_KEY:-None}]: " STEAM_KEY < /dev/tty
STEAM_KEY=${STEAM_KEY:-$EXISTING_STEAM_KEY}

read -p "Discord Webhook URL (Optional) [${EXISTING_DISCORD_WEBHOOK:-None}]: " DISCORD_WEBHOOK < /dev/tty
DISCORD_WEBHOOK=${DISCORD_WEBHOOK:-$EXISTING_DISCORD_WEBHOOK}

export DB_PASS CSREP_KEY CSREP_SECRET STEAM_KEY DISCORD_WEBHOOK
node -e '
  const fs = require("fs");
  const file = "config.json";
  let data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.dashboardPassword = process.env.DB_PASS;
  data.csrepKeyId = process.env.CSREP_KEY;
  data.csrepSecret = process.env.CSREP_SECRET;
  data.steamApiKey = process.env.STEAM_KEY;
  data.discordWebhookUrl = process.env.DISCORD_WEBHOOK;
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
'

echo -e "\n${GREEN}Setup completed successfully!${NC}"
echo -e "To start the application: ${BLUE}npm start${NC}"
