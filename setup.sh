#!/bin/bash

echo "Museum OS setup started..."

# -------------------------------
# 1. Ask for GitHub credentials
# -------------------------------
read -p "Enter GitHub Username: " GIT_USERNAME
read -s -p "Enter GitHub Token (hidden): " GIT_TOKEN
echo ""

# -------------------------------
# 2. Install basic tools
# -------------------------------
echo "Installing Git and dependencies..."
sudo apt update
sudo apt install -y git curl ca-certificates gnupg openssl

# -------------------------------
# 3. Clone repo (only branch)
# -------------------------------
echo "Cloning Museum OS (issues-resolved branch)..."

cd ~
rm -rf museumos-app01

git clone --branch issues-resolved --single-branch https://$GIT_USERNAME:$GIT_TOKEN@github.com/sagrkv/museumos-app01.git

cd museumos-app01 || { echo "Clone failed"; exit 1; }

# -------------------------------
# 4. Install Docker (official)
# -------------------------------
echo "Installing Docker..."

sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl start docker
sudo systemctl enable docker

# -------------------------------
# 5. Fix permissions
# -------------------------------
echo "Setting Docker permissions..."
sudo usermod -aG docker $USER

# -------------------------------
# 6. Create network
# -------------------------------
echo "Creating Docker network..."
docker network create museumos-network || true

# -------------------------------
# 7. Start PostgreSQL
# -------------------------------
echo "Starting PostgreSQL..."

docker rm -f museumos-db || true

docker run -d --name museumos-db --network museumos-network -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=museumos -p 5432:5432 --restart unless-stopped postgres:16-alpine

# -------------------------------
# 8. Fix Dockerfile issues
# -------------------------------
echo "Fixing Dockerfile..."

sed -i '/docs/d' Dockerfile
sed -i 's/tsc -b && //' admin/package.json

# -------------------------------
# 9. Build app images
# -------------------------------
echo "Building Docker images..."

docker build -t museumos-app .
docker build -f admin/Dockerfile -t museumos-admin .

# -------------------------------
# 10. Run app containers
# -------------------------------
echo "Starting Museum OS app..."

docker rm -f museumos-app || true
docker rm -f museumos-admin || true

docker volume create museumos_storage || true
docker volume create museumos_backups || true

JWT_SECRET=$(openssl rand -hex 32)
docker run -d --name museumos-app \
  --network museumos-network \
  -p 3401:3401 \
  -e DATABASE_URL=postgresql://postgres:postgres123@museumos-db:5432/museumos \
  -e JWT_SECRET="$JWT_SECRET" \
  -v museumos_storage:/app/server/storage \
  -v museumos_backups:/app/server/backups \
  --restart unless-stopped \
  museumos-app

echo "Starting Museum OS admin..."

docker run -d --name museumos-admin \
  --network museumos-network \
  -p 3402:3402 \
  -e VITE_PROXY_TARGET=http://museumos-app:3401 \
  --restart unless-stopped \
  museumos-admin

# -------------------------------
# 11. Open firewall
# -------------------------------
echo "Opening ports 3401 and 3402..."

sudo ufw allow 3401 || true
sudo ufw allow 3402 || true

# -------------------------------
# 12. Install Portainer
# -------------------------------
echo "Installing Portainer..."

docker volume create portainer_data || true

docker run -d -p 9000:9000 --name portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce

# -------------------------------
# DONE
# -------------------------------
IP=$(hostname -I | awk '{print $1}')

echo ""
echo "SETUP COMPLETE"
echo "App URL: http://$IP:3401"
echo "Admin URL: http://$IP:3402"
echo "Portainer: http://$IP:9000"
echo ""
echo "Default Login:"
echo "Email: admin@museumos.local"
echo "Password: admin123"
