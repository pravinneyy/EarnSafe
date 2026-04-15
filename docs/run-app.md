---
description: How to run the EarnSafe app in dev mode (emulator and/or physical device)
---

# Running EarnSafe in Development

## Prerequisites
- Android SDK installed at `%LOCALAPPDATA%\Android\Sdk`
- Node.js installed
- Python venv at `d:\devtrails\.venv` with backend dependencies
- `frontend/.env` populated with the API base URL and Google auth keys

---

## Step 1: Start the Backend

```bash
cd d:\devtrails\backend
..\.venv\Scripts\activate
python run.py
```

This starts FastAPI on `http://0.0.0.0:8000`.

---

## Step 2: Start Metro Bundler

Open a **separate terminal**:

```bash
cd d:\devtrails\frontend
npx expo start --dev-client
```

This starts Metro on port 8081. Leave this running.

---

## Step 3a: Run on Emulator

### First time / after native changes (new packages, app.json changes):
```bash
cd d:\devtrails\frontend
npm run android:setup
npx expo run:android
```
This builds the native app AND opens it on the emulator.

### If the emulator isn't running:
```bash
%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Pixel_8_API_36
```
Wait for the home screen to appear, then run the command above.

### If the app is already installed (no native changes, just JS edits):
Just open the app on the emulator — it auto-connects to Metro on port 8081.  
Or launch it via:
```bash
adb shell am start -n com.insuranceapp.app/.MainActivity
```

### Android maps note
If you want the native Google Map instead of the preview fallback, add this to `frontend/.env` and rebuild the Android app:
```bash
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<YOUR_ANDROID_MAPS_KEY>
```
After adding the key, run `npx expo prebuild` and `npx expo run:android`.

---

## Step 3b: Run on Physical Phone

### One-time setup:
1. On your phone: **Settings → About Phone → tap "Build Number" 7 times** to enable Developer Options
2. Go to **Settings → Developer Options → Enable USB Debugging**
3. Connect phone via USB cable
4. A popup will ask "Allow USB debugging?" — tap **Allow**

### Verify phone is connected:
```bash
adb devices
```
You should see your device listed (e.g. `XXXXXXXX  device`).

### Build & install on phone:
```bash
cd d:\devtrails\frontend
npx expo run:android --device
```
If multiple devices are connected (emulator + phone), it will ask you to pick one.

### If already installed (JS-only changes):
Just open the app on your phone. It will connect to Metro **IF** your phone is on the same WiFi network as your PC.

> **Important:** If Expo host detection does not work or you are testing a release build, set `frontend/.env` explicitly:
> ```
> EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
> ```
> Use `http://10.0.2.2:8000` for an Android emulator talking to a local backend, or your deployed backend URL for release builds.

---

## Quick Reference

| What you changed | What to run |
|---|---|
| Only JS/React code | Just save — Metro hot-reloads automatically |
| `app.json` or installed a native package | `npx expo prebuild` then `npx expo run:android` |
| Nothing, just want to reopen | Open the app on device/emulator (it reconnects to Metro) |

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 8081 already in use | `for /f "tokens=5" %a in ('netstat -ano ^| findstr :8081 ^| findstr LISTENING') do taskkill /F /PID %a` |
| Emulator not showing in `adb devices` | Restart ADB: `adb kill-server && adb start-server` |
| App can't connect to backend on phone | Make sure phone is on same WiFi, and `EXPO_PUBLIC_API_BASE_URL` has your PC's LAN IP |
| Emulator crashes / offline | Cold boot: `emulator -avd Pixel_8_API_36 -no-snapshot-load` |
