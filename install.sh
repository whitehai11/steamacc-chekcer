#!/bin/bash
set -e

# Color definitions for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================================================${NC}"
echo -e "${YELLOW}  STEAM BOT MASTER CONTROL // AUTOMATED VPS INSTALLER                  ${NC}"
echo -e "${YELLOW}========================================================================${NC}"

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Fehler: Bitte starte das Skript als root (sudo ./install.sh).${NC}"
  exit 1
fi

# 1. System Updates & Docker Infrastructure Installation
echo -e "\n${GREEN}[1/6] Aktualisiere Systempakete...${NC}"
apt-get update && apt-get upgrade -y

echo -e "\n${GREEN}[1/6] Überprüfe Abhängigkeiten (Git, Docker, Docker Compose)...${NC}"

# Install Git if missing
if ! command -v git &> /dev/null; then
  echo -e "${YELLOW}Git nicht gefunden. Installiere Git...${NC}"
  apt-get install -y git
else
  echo -e "Git ist bereits installiert."
fi

# Install Docker if missing
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker nicht gefunden. Installiere offizielle Docker-Engine...${NC}"
  apt-get install -y apt-transport-https ca-certificates curl software-properties-common
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io
  systemctl start docker
  systemctl enable docker
else
  echo -e "Docker ist bereits installiert."
fi

# Install Docker Compose if missing
if ! docker compose version &> /dev/null; then
  echo -e "${YELLOW}Docker Compose Plugin nicht gefunden. Installiere...${NC}"
  apt-get install -y docker-compose-plugin
else
  echo -e "Docker Compose ist bereits installiert."
fi

# 2. Repository klonen & Struktur aufbauen
INSTALL_DIR="/opt/steam-bot-dashboard"

echo -e "\n${GREEN}[2/6] Richte Installationsverzeichnis ein...${NC}"
if [ -d "$INSTALL_DIR" ]; then
  BACKUP_DIR="${INSTALL_DIR}_backup_$(date +%Y%m%d_%H%M%S)"
  echo -e "${YELLOW}Verzeichnis $INSTALL_DIR existiert bereits. Erstelle Backup unter $BACKUP_DIR...${NC}"
  mv "$INSTALL_DIR" "$BACKUP_DIR"
fi

echo -e "${GREEN}Klone Repository von GitHub...${NC}"
git clone https://github.com/whitehai11/steamacc-chekcer "$INSTALL_DIR"

# Erstelle Unterordner für ASF falls nötig
mkdir -p "$INSTALL_DIR/asf/config"
mkdir -p "$INSTALL_DIR/asf/plugins"

# Rechte setzen
echo -e "${GREEN}Setze Lese- und Schreibrechte für ASF...${NC}"
chmod -R 777 "$INSTALL_DIR/asf"

# 3. ASF-Initialisierung (ASF.json generieren)
ASF_CONFIG="$INSTALL_DIR/asf/config/ASF.json"

if [ ! -f "$ASF_CONFIG" ]; then
  echo -e "\n${GREEN}[3/6] Generiere Standard ASF.json Konfiguration...${NC}"
  cat <<EOT > "$ASF_CONFIG"
{
  "IPC": true,
  "IPCPassword": "mein_sicheres_ipc_passwort"
}
EOT
  chmod 777 "$ASF_CONFIG"
else
  echo -e "\n${GREEN}[3/6] ASF.json bereits vorhanden. Überspringe...${NC}"
fi

# 4. Das Auto-Update-Skript (update.sh) generieren
UPDATE_SCRIPT="$INSTALL_DIR/update.sh"

echo -e "\n${GREEN}[4/6] Erstelle automatisches Update-Skript (update.sh)...${NC}"
cat <<'EOT' > "$UPDATE_SCRIPT"
#!/bin/bash
set -e

INSTALL_DIR="/opt/steam-bot-dashboard"
cd "$INSTALL_DIR"

# Lokale Änderungen verwerfen oder stashen falls nötig
git reset --hard HEAD

# Hole neueste Updates vom Branch
echo "[Auto-Update] Frage GitHub nach Updates ab..."
git fetch origin

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse @{u})

if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
  echo "[Auto-Update] Änderungen erkannt. Starte Aktualisierung..."
  git pull origin main || git pull origin master
  
  echo "[Auto-Update] Baue Docker Container neu..."
  docker compose down
  docker compose up --build -d
  echo "[Auto-Update] System erfolgreich aktualisiert!"
else
  echo "[Auto-Update] Keine Änderungen vorhanden. System ist auf dem neuesten Stand."
fi
EOT

chmod +x "$UPDATE_SCRIPT"

# 5. Cronjob für den Autopiloten einrichten (alle 6 Stunden)
echo -e "\n${GREEN}[5/6] Richte Cronjob für automatische Updates ein (alle 6 Stunden)...${NC}"
CRON_JOB="0 */6 * * * /bin/bash $UPDATE_SCRIPT > /var/log/steam_bot_update.log 2>&1"

# Prüfe ob Cronjob bereits existiert, falls nicht, hinzufügen
(crontab -l 2>/dev/null | grep -F "$UPDATE_SCRIPT") &>/dev/null || {
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  echo -e "Cronjob erfolgreich registriert."
}

# 6. Erststart
echo -e "\n${GREEN}[6/6] Starte Docker Container (Erststart)...${NC}"
cd "$INSTALL_DIR"
docker compose up --build -d

# VPS IP ermitteln
VPS_IP=$(curl -s https://ipinfo.io/ip || curl -s https://ifconfig.me || echo "DEINE_VPS_IP")

echo -e "\n${GREEN}========================================================================${NC}"
echo -e "${GREEN}  INSTALLATION ERFOLGREICH ABGESCHLOSSEN!                               ${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo -e "Das Dashboard läuft im Hintergrund und ist erreichbar unter:"
echo -e "👉 ${YELLOW}http://${VPS_IP}:3000${NC}"
echo -e "\nUpdates werden automatisch alle 6 Stunden überprüft."
echo -e "Protokollierung unter: /var/log/steam_bot_update.log"
echo -e "${GREEN}========================================================================${NC}"
