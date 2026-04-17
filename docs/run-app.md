---
description: Step-by-step guide to run EarnSafe locally, on an Android emulator, and on a physical phone
---

# Run EarnSafe Locally

This guide covers:

- running the backend locally
- running the mobile app locally
- testing on an Android emulator
- testing on a physical Android phone

## Before You Start

You need:

- Node.js 18+
- Python 3.10+
- Android Studio with Android SDK and at least one emulator image
- a local Python virtual environment for the backend
- PostgreSQL and Redis

You can run PostgreSQL and Redis either:

- with Docker Desktop using `docker-compose`
- or from your own local installations

Important:

- Run Expo commands from `frontend`, not from the repo root.
- The app uses native modules like `react-native-razorpay`, so `Expo Go` is not enough for full testing.
- If `EXPO_PUBLIC_API_BASE_URL` is not set, the app falls back to the hosted Render backend instead of your local backend.

## Project Paths

Repository root:

```powershell
d:\EarnSafe\EarnSafe
```

Frontend app:

```powershell
d:\EarnSafe\EarnSafe\frontend
```

Backend app:

```powershell
d:\EarnSafe\EarnSafe\backend
```

## Step 1: Create Backend Environment Variables

Create `backend/.env` with values like:

```env
DATABASE_URL=postgresql+asyncpg://earnsafe:earnsafe@localhost:5432/earnsafe
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=change-this-to-a-long-random-secret-with-32-plus-characters
RAZORPAY_KEY_ID=<your_razorpay_test_key_id>
RAZORPAY_KEY_SECRET=<your_razorpay_test_key_secret>
RAZORPAY_WEBHOOK_SECRET=<optional>
TOMTOM_API_KEY=<optional>
FIREBASE_PROJECT_ID=<optional>
APP_DEBUG=true
```

Notes:

- `RAZORPAY_*` is only needed if you want to test the payment flow.
- `TOMTOM_API_KEY` improves traffic-based behavior, but the app can still run without it.
- `FIREBASE_PROJECT_ID` is optional if you are only using the mock phone login flow.

## Step 2: Create Frontend Environment Variables

Create `frontend/.env`.

### For Android emulator

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
EXPO_PUBLIC_TOMTOM_API_KEY=<optional>
```

### For physical Android phone on the same Wi-Fi

Replace `<LAN_IP>` with your PC's local IP address, for example `192.168.1.23`.

```env
EXPO_PUBLIC_API_BASE_URL=http://<LAN_IP>:8000
EXPO_PUBLIC_TOMTOM_API_KEY=<optional>
```

Notes:

- Android emulator must use `10.0.2.2` to reach your PC.
- A physical phone cannot use `10.0.2.2`; it must use your PC's LAN IP.
- If you change `frontend/.env`, stop and restart Metro so Expo picks up the new value.

## Step 3: Install Dependencies

### Backend

From the repo root:

```powershell
cd d:\EarnSafe\EarnSafe\backend
```

Activate your venv and install dependencies:

```powershell
..\.venv\Scripts\activate
pip install -r requirements.txt
```

If your venv is already active from the repo root, just run:

```powershell
cd backend
pip install -r requirements.txt
```

### Frontend

In a new terminal:

```powershell
cd d:\EarnSafe\EarnSafe\frontend
npm install
```

## Step 4: Start PostgreSQL and Redis

### Option A: Docker Compose

From the repo root:

```powershell
cd d:\EarnSafe\EarnSafe
docker-compose up -d postgres redis
```

### Option B: Local services

If you already run PostgreSQL and Redis locally, make sure:

- PostgreSQL is available on `localhost:5432`
- Redis is available on `localhost:6379`
- the database in `DATABASE_URL` exists

## Step 5: Start the Backend

In a backend terminal:

```powershell
cd d:\EarnSafe\EarnSafe\backend
python run.py
```

The API should start on:

```text
http://localhost:8000
```

Keep this terminal open.

## Step 6: Prepare the Native Android App

In a frontend terminal:

```powershell
cd d:\EarnSafe\EarnSafe\frontend
```

Run the Windows Android setup helper once if needed:

```powershell
npm run android:setup
```

If this is your first native build, or after native dependency changes, run:

```powershell
npx expo prebuild
```

You usually need `expo prebuild` again only when:

- adding/removing a native dependency
- changing native config
- changing app/package identifiers or native project settings

## Step 7: Start Metro

In a separate frontend terminal:

```powershell
cd d:\EarnSafe\EarnSafe\frontend
npx expo start --dev-client
```

Keep Metro running while you test.

## Run on Android Emulator

### Step 1: Start the emulator

Open Android Studio and start an emulator, or run it directly:

```powershell
$env:ANDROID_SDK_ROOT="$env:LOCALAPPDATA\Android\Sdk"
& "$env:ANDROID_SDK_ROOT\emulator\emulator.exe" -avd <YOUR_AVD_NAME>
```

Wait until the emulator fully boots.

You can list available AVDs with:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -list-avds
```

### Step 2: Build and install the app

From `frontend`:

```powershell
npx expo run:android
```

This installs the development build onto the emulator.

### Step 3: Open the app

After the build finishes:

- the app usually opens automatically
- if not, tap the EarnSafe app icon in the emulator

### Step 4: Verify local backend connection

For emulator testing, `frontend/.env` should contain:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
```

If the app still talks to the deployed backend:

1. stop Metro
2. confirm `frontend/.env` is correct
3. start Metro again with `npx expo start --dev-client`
4. reload the app

### Emulator quick workflow

If the app is already installed and you only changed JS code:

- keep Metro running
- save your code
- reload the app

You do not need to rebuild native Android every time.

## Run on Physical Android Phone

### Step 1: Enable USB debugging

On the phone:

1. Open `Settings -> About phone`
2. Tap `Build number` 7 times
3. Open `Developer options`
4. Enable `USB debugging`

### Step 2: Connect the phone

Connect the phone with USB and allow the debugging prompt on the device.

Check that ADB sees it:

```powershell
adb devices
```

You should see a device listed with status `device`.

### Step 3: Point the phone to your local backend

Edit `frontend/.env` to use your PC's LAN IP:

```env
EXPO_PUBLIC_API_BASE_URL=http://<LAN_IP>:8000
```

Example:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.23:8000
```

Your phone and PC must be on the same Wi-Fi network if you are using LAN IP.

### Step 4: Restart Metro

After changing `frontend/.env`, restart Metro:

```powershell
cd d:\EarnSafe\EarnSafe\frontend
npx expo start --dev-client
```

### Step 5: Build and install on the phone

From `frontend`:

```powershell
npx expo run:android --device
```

If more than one device is connected, Expo will ask which one to use.

### Step 6: Open the app on the phone

After install:

- open the EarnSafe app on the phone
- let it connect to Metro
- test the app normally

### Phone quick workflow

If the development build is already installed and you only changed JS code:

- keep Metro running
- reopen or reload the app
- no full native rebuild is needed

## Recommended Terminal Setup

For the smoothest local workflow, keep 3 terminals open:

### Terminal 1: Infra

```powershell
cd d:\EarnSafe\EarnSafe
docker-compose up -d postgres redis
```

### Terminal 2: Backend

```powershell
cd d:\EarnSafe\EarnSafe\backend
python run.py
```

### Terminal 3: Frontend Metro

```powershell
cd d:\EarnSafe\EarnSafe\frontend
npx expo start --dev-client
```

Then use a fourth terminal only when you need a native Android build:

```powershell
cd d:\EarnSafe\EarnSafe\frontend
npx expo run:android
```

or:

```powershell
npx expo run:android --device
```

## When You Need to Rebuild

Run a fresh Android native build when:

- you added a native dependency
- you changed Android native config
- you changed app identity/native settings
- the dev build is missing from the emulator or phone

Command:

```powershell
cd d:\EarnSafe\EarnSafe\frontend
npx expo run:android
```

For a phone:

```powershell
npx expo run:android --device
```

## Common Problems

### App cannot reach local backend on emulator

Check:

- backend is running on port `8000`
- `frontend/.env` uses `http://10.0.2.2:8000`
- Metro was restarted after env changes

### App cannot reach local backend on phone

Check:

- `frontend/.env` uses your PC's LAN IP, not `10.0.2.2`
- phone and PC are on the same Wi-Fi
- Windows firewall allows port `8000`
- backend is listening and reachable from other devices on your network

### `adb devices` shows no device

Try:

```powershell
adb kill-server
adb start-server
adb devices
```

### Metro is already using port 8081

Close the old Metro process, or find and kill the process using port `8081`.

### Native build fails after Android Studio changes

Run:

```powershell
cd d:\EarnSafe\EarnSafe\frontend
npm run android:setup
```

Then try:

```powershell
npx expo run:android
```

## Related Docs

- [README.md](../README.md)
- [razorpay-sandbox-setup.md](./razorpay-sandbox-setup.md)
- [deploy-render.md](./deploy-render.md)
