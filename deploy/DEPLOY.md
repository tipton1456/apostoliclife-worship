# Mic Board Deployment Guide

Deploy the Apostolic Worship Mic Board and PreSonus bridge to another Mac and run both as background services that start automatically at login.

## What gets deployed

- Mic board web app (Next.js on port 3000)
- PreSonus bridge service (port 4310)
- Team photos and Planning Center integration
- macOS LaunchAgents so both services run in the background

## Get the code onto the new computer

This project is **not** synced through iCloud. Use Git on the new Mac.

Repository:

```text
https://github.com/tipton1456/apostoliclife-worship.git
```

### Option A: Git clone (recommended)

On the new Mac:

```bash
xcode-select --install
git clone https://github.com/tipton1456/apostoliclife-worship.git ~/apostoliclife-worship
cd ~/apostoliclife-worship
```

`xcode-select --install` installs Apple's command line tools, which include Git. If you prefer a standalone Git installer, use https://git-scm.com/download/mac instead.

### Option B: USB archive fallback

If Git is not available yet, use `micboard-deploy.tar.gz` from the Desktop of the old Mac:

```bash
tar -xzf micboard-deploy.tar.gz -C ~
```

After Git is installed, you can switch to the repository workflow for future updates.

### Important: `.env.local` does not sync through Git

`.env.local` is intentionally excluded from Git because it contains secrets.

Copy it separately from the old Mac using AirDrop, USB, email-to-self, or another secure method:

```bash
cp /path/to/copied/.env.local ~/apostoliclife-worship/.env.local
```

Or create it from the template:

```bash
cp .env.example .env.local
```

## New computer requirements

1. macOS
2. Node.js 22 or newer: https://nodejs.org/
3. Network access to:
   - Planning Center Online
   - PreSonus StudioLive mixer on your church network
4. The new Mac should stay on the same network as the mixer

## Installation steps

### 1. Copy the project

Put the folder here:

```bash
~/apostoliclife-worship
```

**Do not install background services from the Desktop.** macOS blocks LaunchAgents from accessing projects in `~/Desktop`, which causes `Operation not permitted` errors in the service logs.

### 2. Copy environment settings

On the old computer, copy `.env.local` into the project on the new computer.

If you need to recreate it:

```bash
cp .env.example .env.local
```

Then edit `.env.local` and confirm:

- `PCO_CLIENT_ID` and `PCO_SECRET`
- `PRESONUS_HOST` = your mixer IP
- `NEXT_PUBLIC_PRESONUS_BRIDGE_URL=http://localhost:4310`

### 3. Install and start services

```bash
cd ~/apostoliclife-worship
chmod +x deploy/*.sh
./deploy/install.sh
```

That script will:

1. Install npm dependencies
2. Build the production app
3. Install two background services:
   - `com.apostoliclife.presonus-bridge`
   - `com.apostoliclife.micboard`

### 4. Verify everything is running

```bash
curl http://localhost:4310/health
curl http://localhost:3000
```

Open the mic board in a browser:

```text
http://localhost:3000
```

For a TV or second display on the same Mac, use the same URL.

## Background service behavior

Both services:

- Start automatically when you log in
- Restart themselves if they crash
- Run without Terminal windows
- Write logs to:

```text
~/Library/Logs/apostoliclife-worship/
```

## Useful commands

Check service status:

```bash
launchctl print "gui/$UID/com.apostoliclife.presonus-bridge"
launchctl print "gui/$UID/com.apostoliclife.micboard"
```

Restart services after code or env changes:

```bash
cd ~/apostoliclife-worship
npm run build
./deploy/install-services.sh
```

Stop background services:

```bash
./deploy/uninstall-services.sh
```

View logs:

```bash
tail -f ~/Library/Logs/apostoliclife-worship/micboard.log
tail -f ~/Library/Logs/apostoliclife-worship/presonus-bridge.log
```

Test mixer connectivity:

```bash
npm run presonus:probe
```

## Updating after changes

On the old Mac, commit and push:

```bash
cd ~/Desktop/apostoliclife-worship
git add .
git commit -m "Describe your change"
git push
```

On the new Mac, pull and reinstall services:

```bash
cd ~/apostoliclife-worship
git pull
./deploy/install.sh
```

## Troubleshooting

### Mic board loads but says "Board Offline"

- Confirm bridge health: `curl http://localhost:4310/health`
- Confirm `PRESONUS_HOST` in `.env.local`
- Confirm the mixer is powered on and reachable from the new Mac

### Worship team does not load

- Check `PCO_CLIENT_ID` and `PCO_SECRET` in `.env.local`
- Confirm the new Mac has internet access

### Services do not start at login

- Make sure you ran `./deploy/install-services.sh`
- Log out and back in once after installation

## Optional: PreSonus Companion meter module

If you also want Stream Deck meter feedback on the new computer, copy:

```text
~/Desktop/companion-modules/companion-module-presonus-meter
```

Then enable Companion developer mode and point `dev_modules_path` at `~/Desktop/companion-modules`.