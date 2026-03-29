# Razorpay Sandbox Setup

This project now creates a backend quote, opens Razorpay Checkout, verifies the returned signature on the backend, and only then activates the policy.

## What You Need

- A Razorpay account with Test Mode enabled
- Test API keys from the Razorpay Dashboard
- A native Expo build target

## Backend Environment

Add these variables to the root `.env` file:

```env
OPENWEATHER_API_KEY=<your_openweather_api_key>
SUPABASE_URL=<your_supabase_project_url>
SUPABASE_SERVICE_ROLE_KEY=<your_supabase_service_role_key>
RAZORPAY_KEY_ID=<your_razorpay_test_key_id>
RAZORPAY_KEY_SECRET=<your_razorpay_test_key_secret>
```

## Frontend Environment

If you are testing on a real device, create `frontend/.env` and point the app at your machine:

```env
EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:8000
```

## Native Build Requirement

`react-native-razorpay` is a native module. That means:

- Expo Go is not enough
- you need a native build created with Expo prebuild
- you should run the app with `npx expo run:android` or `npx expo run:ios`
- you should run Expo commands from `frontend`, not from the repository root
- Android Studio, the Android SDK, and the Android emulator must be installed before Android builds will work
- after setting `JAVA_HOME`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT`, open a fresh terminal

## Install and Run

1. Install backend dependencies:

```bash
cd backend
pip install -r requirements.txt
```

2. Start the backend:

```bash
cd backend
python run.py
```

3. Install frontend dependencies:

```bash
cd frontend
npm install
```

4. Generate native projects:

```bash
cd frontend
npx expo prebuild
```

5. Run the app:

```bash
cd frontend
npx expo run:android
```

For iOS, use `npx expo run:ios`.

The first Android build is slow because Gradle downloads and compiles the native toolchain. Later builds are much faster.

## Sandbox Test Flow

1. Open the app and sign in or register.
2. Go to the plan screen.
3. Choose a plan.
4. Tap the payment button.
5. Complete the Razorpay sandbox checkout.
6. The backend verifies the signature and activates the policy.

## Notes

- The backend endpoints used by the flow are `/payments/quote`, `/payments/order`, and `/payments/verify`.
- The app also has a web fallback for Razorpay Checkout, but the main supported path is Android/iOS native.
- Quotes are short-lived and are re-created when the selected plan changes.
