# Mathies Tucker Art Collection

Personal art catalog for the Mathies Tucker Home collection.

## Stack
- Node.js + Express
- SQLite (via better-sqlite3)
- Vanilla JS frontend
- PM2 process manager
- Sharp for image processing

## First-Time Setup on OptiPlex

### 1. Install Node.js (if not done)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
```

### 2. Install PM2
```bash
npm install -g pm2
```

### 3. Clone repo and install
```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/YOUR_USERNAME/home-apps.git
cd home-apps/art-catalog
npm install
mkdir -p logs uploads data
```

### 4. Start with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the printed command to auto-start on reboot
```

### 5. Access the app
Open browser to: `http://192.168.1.225:3001`

## Deploy Updates
```bash
cd ~/apps/home-apps/art-catalog
bash deploy.sh
```

## Importing Legacy Data
1. Open the old static HTML file in a browser
2. Use its Export JSON button
3. In this app, go to Export / Import → Import JSON
4. Select the exported file

## GitHub Setup (first time)
```bash
cd ~/apps
git init
git remote add origin https://github.com/YOUR_USERNAME/home-apps.git
git add .
git commit -m "Initial commit - art catalog"
git push -u origin main
```

## Ports
- Art Catalog: 3001
- Spil (music app, future): 3002
