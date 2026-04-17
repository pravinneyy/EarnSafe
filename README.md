# EarnSafe

> Guidewire DEVTrails 2026

## Problem Statement

India's platform-based delivery workers lose income when external disruptions stop them from working. Heavy rain, flooding, extreme heat, severe air pollution, curfews, and sudden zone closures can cut working hours and reduce monthly earnings by 20 to 30 percent.

The core use case for this project is to protect lost income only.

This solution does not cover:

- health insurance
- life insurance
- accident claims
- vehicle repair costs

The product must also follow a weekly pricing model because gig workers typically think and earn on a weekly cycle.

## Chosen Persona

This project focuses on food delivery partners such as Swiggy and Zomato riders working in dense city zones.

This persona was chosen because:

- their work is highly dependent on short delivery windows
- outdoor delivery routes are heavily affected by rain, flooding, heat, and pollution
- even a few lost hours in a week immediately impacts take-home earnings
- mobile-first access fits how they already work during active shifts

The current codebase still allows a few platform choices, but the hackathon strategy and final product direction are centered on food delivery workers.

## Proposed Solution

EarnSafe is a mobile-first parametric insurance platform that protects delivery workers from income loss caused by verified external disruptions.

The idea is simple:

- the worker buys weekly protection
- the system monitors approved disruption triggers
- when a trigger affects the worker's zone and active policy window, the system creates a zero-touch parametric claim
- the backend validates the event, applies payout guardrails, and credits the worker wallet automatically
- an admin simulation dashboard can trigger the same flow and push live refresh events back into the app

## Why Mobile First

We are choosing a mobile app as the primary worker platform because the delivery partner already operates through a phone during every shift. A mobile interface is the most practical way to handle onboarding, policy purchase, live disruption alerts, claim updates, geolocation-based validation, and payout notifications.

A lightweight web dashboard can be added for insurer and admin analytics, but the worker experience should be mobile-first.

## Persona-Based Scenarios

### Scenario 1: Valid income-loss event

Ravi is a Swiggy rider in Chennai. He has an active weekly policy. A flood alert and heavy rain event are detected for his delivery zone between 2 PM and 8 PM. The platform verifies that the trigger overlaps with his insured geography and working period. Ravi receives a notification that his lost-income protection has been activated. The claim is pre-filled, validated, and moved to payout with minimal manual effort.

### Scenario 2: Suspicious claim

A rider submits a claim for severe rain in a zone where no verified trigger occurred, or the request comes from a mismatched location with repeated claim patterns. The backend marks the claim as suspicious, raises the fraud score, and routes it for review instead of instant payout.

These two scenarios define the core value of the platform:

- fast help for genuine disruption events
- strong controls against false claims

## End-to-End Workflow

1. A delivery worker registers in the mobile app with a username, password, city, delivery zone, platform, and weekly income.
2. The backend creates a persisted worker risk profile and serves it back through `/users/me`.
3. The worker is shown weekly plan options and AI-adjusted premium quotes.
4. Once a policy is active, the backend monitors live weather, AQI, and traffic conditions for the worker's zone. The admin dashboard can simulate the same event flow for demos.
5. When a verified disruption occurs, the platform creates a trigger event and can sync the auto-claim into the wallet/claims screen.
6. The trigger engine checks policy validity, duplicate-event cooldown, weekly claim limits, and remaining weekly payout budget.
7. Auto claims advance through `triggered -> approved -> paid`, while manual claims can still be `approved`, `flagged`, or `rejected` by the fraud pipeline.
8. Paid claims credit the wallet and appear in the mobile app claim history.

### Base weekly plans

| Plan     | Weekly premium | Daily income protection | Max weekly payout |
| -------- | -------------- | ----------------------- | ----------------- |
 Updated upstream
| Basic    | Rs. 29         | Rs. 150                 | Rs. 800          |
| Standard | Rs. 49         | Rs. 300                 | Rs. 1500          |
| Pro      | Rs. 89         | Rs. 500                 | Rs. 3000          |
=======
| Basic    | Rs. 29         | Rs. 150                 | Rs. 800           |
| Standard | Rs. 49         | Rs. 300                 | Rs. 1500          |
| Pro      | Rs. 89         | Rs. 500                 | Rs. 2500          |
 Stashed changes

These values are not stipulated and might change as we work on our prototype

### Pricing logic

Final weekly premium will be calculated as:

`weekly premium = base plan rate x zone risk factor x season factor x platform dependency factor x AI risk multiplier`

This lets the product stay simple for the worker while still adapting to real exposure.

Example:

- Standard plan base rate = Rs. 49
- High-risk flood zone factor = 1.15
- Monsoon season factor = 1.20
- Food delivery dependency factor = 1.10
- AI risk multiplier = 1.05

Estimated weekly premium:

`49 x 1.15 x 1.20 x 1.10 x 1.05 = about Rs. 74 per week`

### Payout logic

The current production path in this repo is the parametric auto-claim flow.

`auto payout = min(policy daily coverage, weekly remaining limit)`

For traffic-triggered events, the payout can be reduced by congestion severity before the weekly cap is applied. Manual claims are still supported for fraud-review demos, but automatic weather-triggered claims are what drive the wallet balance in the app.

## Insurance Domain Grounding & Exclusions

To address the actuarial viability of the product and prevent "moral hazard" (where users might try to game the system), EarnSafe implements a formal set of coverage exclusions and deductibles. 

### 1. Mandatory Coverage Exclusions
Even if a parametric trigger (e.g., Heavy Rain) is met, a claim will be **automatically denied** or **rejected** under the following conditions:

*   **Pre-Existing Conditions (The "Red Alert" Rule):** Policies purchased *after* an official IMD (India Meteorological Department) Red Alert or Cyclone Warning has been issued for the zone are subject to a **12-hour cooling-off period**. No claims can be filed for events starting within this window.
*   **Geographic Mismatch:** If the worker’s GPS and Cell-Tower data show they were outside their "Insured Delivery Zone" during the disruption, the claim is excluded.
*   **Intent to Work:** If the worker was not "Active/Online" on their delivery platform (Swiggy/Zomato) for at least 30 minutes prior to the disruption event, the loss is considered "Voluntary Absence" rather than "External Disruption."
*   **Asset-Level Failures:** Income loss caused by vehicle breakdown, lack of fuel, or personal mobile phone damage is strictly excluded. This is a "Parametric Weather/Civic" policy, not a "Comprehensive Asset" policy.
*   **Behavioral Deactivation:** Claims are void if the rider was blocked or suspended by the delivery platform for performance or disciplinary reasons during the policy week.

### 2. Actuarial Guardrails & Deductibles
To ensure the liquidity of the insurance pool, we implement the following quantitative limits:

| Term | Detail | Purpose |
| :--- | :--- | :--- |
| **Time Deductible** | 60 Minutes | The disruption must persist for 1 hour before the payout clock starts. Prevents "nuisance claims" for brief showers. |
| **Trigger Stacking Cap** | ₹1,200 per event | If multiple triggers occur (e.g., Heat + AQI), the payout is capped to prevent over-indemnity. |
| **Weekly Aggregate Limit** | Based on Plan (Max ₹4k) | Total payouts cannot exceed the weekly cap, regardless of the number of storms. |
| **The 80% Rule** | Indemnity Limit | Payouts are designed to cover ~80% of estimated lost earnings (not 100%) to maintain the worker's incentive to return to work as soon as safely possible. |

### 3. Evidence-Backed Thresholds (Quantifying Viability)
Our thresholds are not arbitrary; they are mapped to the **IMD (India Meteorological Department) Impact-Based Forecast (IBF)** standards:
*   **Rainfall:** Set at >20mm/hr because IMD classifies this as "Heavy," causing significant two-wheeler traction loss.
*   **Heat:** Set at 42°C because the **National Disaster Management Authority (NDMA)** identifies this as the threshold where outdoor physical labor becomes a clinical health risk.
*   **Wind:** Set at 60km/h as this is the standard safety cutoff for high-profile vehicles (like bikes with delivery boxes) to prevent toppling.

### 4. Regulatory Alignment
EarnSafe is designed to operate within the **IRDAI (Insurance Regulatory and Development Authority of India) Sandbox** guidelines for micro-insurance. By focusing on "Parametric Payouts," we reduce the administrative load (Loss Adjustment Expenses), allowing us to keep premiums as low as ₹29/week while maintaining a sustainable **Loss Ratio**.

## Parametric Triggers and Thresholds

All triggers are verified against external data sources before a claim is initiated. Thresholds are set based on published government standards — not arbitrary values.

| Trigger | Data Source | Activation Threshold | Evidence Basis | Fixed Payout | Status |
| ------- | ----------- | -------------------- | -------------- | ------------ | ------ |
| Heavy rainfall | Open-Meteo Weather API | Rain > 20mm/hr | IMD standard for heavy rain advisory affecting outdoor workers | Rs. 500 | Implemented |
| Severe waterlogging | Open-Meteo + mock civic feed | Rain > 50mm in flood-risk zone | IMD classification for very heavy rainfall causing urban flooding | Rs. 800 | Implemented |
| Extreme heat | Open-Meteo Weather API | Temperature > 42°C or heat index > 45°C | IMD heatwave threshold for Tamil Nadu — declared dangerous for outdoor labour | Rs. 400 | Implemented |
| Hazardous AQI | Open-Meteo Air Quality API | PM2.5 > 75 µg/m³ | CPCB Poor category threshold — health advisory for outdoor exposure | Rs. 300 | Implemented |
| Dangerous wind | Open-Meteo Weather API | Wind > 60 km/h | IMD cyclonic storm advisory threshold for two-wheeler safety | Rs. 350 | Implemented |
| Curfew or sudden zone closure | Mock civic feed or admin event feed | Admin-issued zone closure flag active | Workers cannot legally access pickup or drop zones | Rs. 500 | Planned for Phase 3 |

Total payout is capped at Rs. 1200 per event to prevent trigger stacking abuse. Thresholds are configurable per city zone. Chennai zones use monsoon-adjusted thresholds during June to November.
## AI and ML Strategy

### 1. Risk assessment and premium intelligence

We plan to use CatBoost to build the main worker and policy risk model.

CatBoost is a good fit because:

- this is a tabular problem
- many important fields are categorical, such as city, zone, platform, and trigger type
- it handles mixed feature types well
- it performs strongly even with moderate dataset sizes
- it can produce a probability score that is easy to convert into business rules

### What the CatBoost model predicts

The first model will predict the probability that a worker-week is likely to experience a valid income-loss event and claim.

That score will be used for:

- dynamic weekly premium adjustment
- plan recommendation
- worker risk banding
- expected claims exposure by zone

### 2. Deep Dive: Model Execution & Crisis Response
During high-risk periods or coordinated disruption events (such as the reported 500-person spoofing syndicate), our models execute two distinct defensive roles in the background:

*   **The Adjuster (CatBoost):** While CatBoost calculates dynamic premiums, it also reacts to environmental anomalies. If a specific geographic zone shows an impossible surge in claims that contradicts official meteorological APIs, the Adjuster temporarily spikes the risk multiplier for that geofence, financially disincentivizing further attacks until the anomaly is resolved.
*   **The Shield (Isolation Forest):** To protect the liquidity pool, we use Isolation Forest to calculate the decision path length for each claim. When a syndicate spoofs the same location simultaneously, their data clusters tightly. The Shield instantly isolates this unnatural cluster, assigning it a critical anomaly score and freezing the payout pipeline.

### Training data plan

Because real insurer-grade data is not available in the hackathon, the model will be trained on a combined dataset built from:

- historical weather and heat data
- AQI and environmental signal data
- city and zone-level disruption patterns
- synthetic worker profiles
- simulated policy data
- simulated claim outcomes based on the business rules

### Training pipeline

1. Build worker-week training records.
2. Join worker, policy, event, and claim data.
3. Clean and normalize categories.
4. Train a `CatBoostClassifier`.
5. Evaluate AUC, precision, recall, and calibration.
6. Export the model artifact.
7. Load the model in the backend inference layer for scoring.

## Adversarial Defense & Anti-Spoofing Strategy

In response to reports of advanced GPS-spoofing syndicates, our intelligence layer has officially deprecated basic GPS-reliance. We differentiate bad actors from genuinely stranded workers by analyzing corroborating, un-fakeable **"Sensor Fusion"** signals:

*   **IMU Sensor Data (Accelerometer & Gyroscope):** A worker genuinely riding a bike in a severe storm produces distinct, erratic motion signatures. A spoofer registers near-zero movement. GPS-spoofing apps cannot inject fake hardware-level IMU data.
*   **Battery Drain & Thermal Dynamics:** Active navigation in the rain results in specific battery drain and thermal throttling. A phone idle on a couch drains at a vastly different baseline.
*   **Network Fluctuation Realities:** Genuine bad weather causes severe signal drops and cell tower handoffs. A spoofer connected to stable home Wi-Fi during a "red-alert storm" is an immediate anomaly.
*   **Telecom Cell Tower Triangulation:** Cross-referencing which physical cell tower the device is pinging versus its software-claimed GPS zone.

### Fair Handling of Flagged Claims (UX Balance)
A fraud system that wrongly penalizes honest workers is a failure. We manage flags through a tiered response model:
- 🟢 **Clean Score:** Auto-approved payout, zero friction.
- 🟡 **Mild Flag:** Payout approved instantly; logged for ongoing monitoring.
- 🟠 **Medium Flag:** Payout held temporarily (2–4 hours). The worker receives a neutral notification: *"We're verifying your claim due to local network conditions — no action needed."*
- 🔴 **High Confidence Fraud:** Payout blocked. Human review triggered with a lightweight live photo appeal.

## Fraud Detection Strategy

Fraud detection will be built as a hybrid system.

### Phase 1 and 2 approach

Start with rule-based controls:

- duplicate claim prevention
- invalid trigger detection
- claim amount above plan cap
- repeated claims for the same disruption
- location mismatch between claim and insured zone

### Phase 3 approach

Add an ML-assisted fraud score using claim behavior and event consistency features. CatBoost can also be used here because the fraud problem is again tabular, categorical, and probability-based.

## Architecture

```text
Mobile App
    |
    v
FastAPI Backend
    |
    +--> User and policy services
    +--> Trigger monitoring service
    +--> Claim and fraud service (Shield + Sensor Fusion)
    +--> CatBoost inference service (Adjuster)
    +--> Payout simulator
    |
    v
Database + external data feeds
```
## How Our AI Actually Works

We didn’t want to just plug into a generic math formula. The reality of gig work is chaotic, so we built a dual-model Python backend that actually understands context—like bad weather, high-risk zones, and local disruptions—in real time. 

Here is what is happening under the hood:

### 1. The Dynamic Pricing Engine — CatBoost

Insurance should not cost the same on a sunny Tuesday as it does during a monsoon. The CatBoost model solves this.

**Model details:**
- Type: Gradient Boosted Decision Tree (CatBoost Classifier)
- Trained on: 600 rows of synthetic Chennai food delivery data covering realistic monsoon, summer, and dry season patterns
- Data basis: synthetic profiles modelled after India Meteorological Department (IMD) historical rainfall records for Chennai, CPCB air quality index standards, and IMD heatwave definitions for Tamil Nadu
- Features: zone, month, rainfall mm, temperature °C, PM2.5 AQI, wind speed KPH, external disruption label
- Output: risk probability (0.0 to 1.0) used to adjust weekly premium
- Premium formula: `base_rate x (1 + risk_probability)`

CatBoost was chosen because delivery zones and platform names are text-heavy categorical data. CatBoost handles mixed feature types well without additional preprocessing and produces calibrated probability scores that translate directly into premium adjustments.

The model charges less per week if the worker operates in a zone historically safe from waterlogging. OMR gets a lower premium than Velachery during monsoon season because IMD historical data shows significantly lower flood incidence in that zone.

**Plan premium ranges with AI adjustment:**
- Basic: Rs. 29 base → up to Rs. 58 per week
- Standard: Rs. 49 base → up to Rs. 98 per week
- Pro: Rs. 89 base → up to Rs. 178 per week

### 2. The Trust Engine: Fraud Detection (Isolation Forest)
If we are going to offer instant claim payouts, we have to protect the system from bad actors automatically. 

* **Why Isolation Forest?** Actual insurance fraud is rare compared to honest claims. Instead of trying to define what a "normal" claim is, Isolation Forest is specifically designed to hunt for weird, isolated anomalies.
* **The Sanity Check:** When a claim is filed, the AI cross-references it with reality. If a user claims they couldn't work due to a massive flood, but our location data and weather APIs say it was completely dry in that exact zone, the model flags the mismatch.
* **The Output:** Honest claims slide right through the decision tree for instant payout, while the highly unusual anomalies are caught and flagged for manual review.

### 3. The "Bouncer" (Data Pipeline & FastAPI)
You can never trust user input to be perfectly typed. We built a high-speed **FastAPI** backend that acts as our data bouncer. Before any information even touches the machine learning models, our pipeline intercepts it, strips out accidental spaces, and fixes capitalization (so a messy `"  anna nagar "` instantly becomes a clean `"Anna Nagar"`). This keeps the AI fast, accurate, and crash-free.

## Integrated APIs & Evidence-Based Logic

EarnSafe now uses a fallback-first data strategy: live external feeds are queried in real time, and the backend falls back to cached or synthetic snapshots when upstream services are unavailable so the app and demo flows keep running.

### 1. Data Source Inventory

| Service | Architecture Layer | Specific Usage | Data Type |
| :--- | :--- | :--- | :--- |
| **Open-Meteo Forecast** | `backend/app/integrations/ai_client.py` | Live rain, temperature, wind, and forecast inputs for risk scoring and trigger evaluation. | Weather |
| **Open-Meteo Air Quality** | `backend/app/integrations/ai_client.py` | PM2.5 / PM10 / AQI inputs for hazardous-air triggers and risk scoring. | AQI |
| **TomTom Flow Segment API** | `backend/app/services/traffic_service.py` | Congestion lookup for traffic-sensitive payout logic. | Traffic |
| **Razorpay** | Payments | Sandbox quote, order creation, and payment verification. | Webhook / API |
| **PostgreSQL + SQLAlchemy** | Persistence | Source of truth for users, policies, trigger events, claims, payments, and wallets. | Relational Data |
| **Redis** | Cache / worker support | AI snapshot caching and shared infra for the API + Celery worker. | Cache / queue |
| **WebSocket (`/ws/simulation`)** | Realtime | Pushes admin-triggered refresh events into the mobile app. | App sync |
| **`api-test-dashboard/index.html`** | Demo admin surface | Starts/stops simulation mode and triggers live claim generation for demos. | Admin testing |

### 2. Evidence-Backed Model Decisions
Current trigger and pricing decisions in the repo are grounded in these live inputs:

*   **Rainfall (Rain > 20mm):** pulled from **Open-Meteo** and mapped to the heavy-rain disruption threshold used in the trigger engine.
*   **Thermal Stress (Temp > 42°C):** pulled from **Open-Meteo** and treated as an extreme-heat trigger.
*   **Air Quality (PM2.5 > 75):** pulled from **Open-Meteo AQI** and treated as a hazardous-air trigger.
*   **Traffic Severity:** pulled from **TomTom** and used to scale or suppress traffic-sensitive payouts.

### 3. Runtime Guardrails & Fallback Logic
Before a payout reaches the wallet, the backend performs multiple checks:
1.  **Live Snapshot Check:** weather/AQI/traffic inputs are fetched live, but a synthetic fallback snapshot is returned if upstream providers fail.
2.  **Trigger Guardrails:** duplicate-event suppression, cooldown windows, weekly claim limits, and weekly payout caps run inside the trigger pipeline.
3.  **Fraud Review for Manual Claims:** Isolation Forest and location-trust signals still gate the manual claim path.

## Tech Stack

### Current trail-phase stack

- Frontend: React Native + Expo
- Navigation/UI: React Navigation, React Native WebView, and Leaflet/TomTom-backed map rendering
- Backend: FastAPI + Uvicorn
- Validation: Pydantic
- Persistence: PostgreSQL via SQLAlchemy asyncio
- Cache / workers: Redis + Celery
- Weather / AQI: Open-Meteo forecast + Open-Meteo air-quality APIs
- Traffic: TomTom Flow Segment API
- Payments: Razorpay sandbox order creation + signature verification
- Realtime sync: FastAPI WebSocket broadcast for admin simulation refreshes
- ML: Python, CatBoost, pandas, numpy, scikit-learn
- Demo tooling: `api-test-dashboard/` static admin dashboard

### Planned additions for later phases

- Production-grade admin auth and operations tooling
- Richer civic / closure trigger feeds
- Stronger client-side Firebase integration

## Development Plan

## Current Repository Status

This repository is now beyond the initial skeleton stage. It already contains a working end-to-end demo flow across mobile, backend, payments, claims, and admin simulation.

What already exists:

- React Native mobile app for register/login, home weather view, policy management, wallet/claims, and profile
- JWT-authenticated FastAPI backend with `/users/me`, wallet, policy, payments, claims, weather, and admin routes
- CatBoost-based premium / risk scoring plus Isolation Forest-backed manual-claim fraud checks
- Automatic trigger-to-claim pipeline with wallet credits, claim cooldowns, weekly limits, and idempotent payout protection
- Razorpay sandbox quote/order/verify flow
- Admin simulation dashboard that can start/stop weather scenarios and push realtime refresh events to the app
- Docker Compose setup for PostgreSQL, Redis, API, and Celery worker
- Runnable Android artifacts in the repo for demo purposes

What is still evolving:

- richer trigger feeds beyond weather/AQI/traffic
- stronger production-ready admin auth and audit tooling
- more polished client-side Firebase phone auth

## Summary

EarnSafe is an AI-powered, mobile-first, parametric insurance platform for food delivery workers. It protects weekly income loss caused by verified external disruptions, uses weekly premiums instead of traditional long-cycle pricing, and combines backend automation with CatBoost-based risk intelligence to create faster, fairer protection for gig workers.

This README is intended to serve as the Phase 1 strategy document: it explains the problem, the chosen persona, the workflow, the weekly pricing model, the parametric triggers, the AI and fraud plan, the tech stack, and the phased execution plan.
By combining **CatBoost** for fair pricing and **Isolation Forest** with **Sensor Fusion** for adversarial defense, EarnSafe provides the first robust, parametric protection for the backbone of India's gig economy.

---

## How to Run

For the payment setup used by the mobile app, see `docs/razorpay-sandbox-setup.md`.

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 16+ and Redis 7+ if you are not using Docker Compose
- Android Studio emulator or a physical Android device
- Xcode if you want to run the iOS build
- A Razorpay account with Test Mode enabled
- Docker Desktop is optional but recommended for local backend infra

### 1. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs FastAPI, Uvicorn, CatBoost, scikit-learn, pandas, numpy, and all other required packages. The AI/ML models (CatBoost risk engine + IsolationForest fraud detector) load automatically on server startup.

If you want local infrastructure quickly, start PostgreSQL and Redis from the repository root:

```bash
docker-compose up -d postgres redis
```

### 2. Set Up Environment Variables

Create a `.env` file in the backend folder of the project with:

```
DATABASE_URL=postgresql+asyncpg://earnsafe:earnsafe@localhost:5432/earnsafe
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=<a-long-random-secret-at-least-32-characters>
RAZORPAY_KEY_ID=<your_razorpay_test_key_id>
RAZORPAY_KEY_SECRET=<your_razorpay_test_key_secret>
RAZORPAY_WEBHOOK_SECRET=<optional-for-webhook-testing>
TOMTOM_API_KEY=<optional-for-traffic-risk-checks>
FIREBASE_PROJECT_ID=<optional-for-server-side-firebase-token-verification>
APP_DEBUG=true
```

For the frontend, create `frontend/.env` :

```
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
EXPO_PUBLIC_TOMTOM_API_KEY=<optional-map-tile-key>
```

Notes:

- `EXPO_PUBLIC_API_BASE_URL` is optional. If you leave it unset, the app falls back to the hosted Render backend.
- On Android emulators, `10.0.2.2` points back to your local machine.
- Open-Meteo base URLs already have defaults in the backend config, so you usually do not need to set them manually.

### 3. Razorpay Sandbox Setup

1. Log in to the Razorpay Dashboard and switch to Test Mode.
2. Open Account & Settings -> Website and App Settings -> API Keys.
3. Generate a Test Key Id and Test Key Secret.
4. Copy those values into the root `.env` file as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
5. Make sure your test payments are captured so successful checkouts do not remain in a pending state.

### 4. Start the Backend

```bash
cd backend
python run.py
```

The server starts at **http://localhost:8000** with hot-reload enabled. You will see `⚡ Booting EarnSafe AI Models...` in the console confirming the ML models are loaded.

### 5. Install Frontend Dependencies

Use a terminal opened in `frontend`. Do not run Expo commands from the repository root because the root `package.json` is not the Expo app.

The current backend startup log text is `Booting EarnSafe AI Models...`.

```bash
cd frontend
npm install
```

### 6. Generate Native Projects for Expo

```bash
cd frontend
npx expo prebuild
```

Run this again when a new native dependency is added.

### 7. Run the Frontend

For Android:

```bash
cd frontend
npm run android:setup
npx expo run:android
```

For iOS:

```bash
cd frontend
npx expo run:ios
```

Important notes:

- Run Expo commands from `frontend`, not from the repository root.
- Razorpay checkout does not work inside Expo Go because `react-native-razorpay` is a native module.
- Use `npx expo run:android`, `npx expo run:ios`, or a custom dev client build.
- Android Studio, the Android SDK, and the Android emulator must be installed before `npx expo run:android` will work.
- On Windows, run `npm run android:setup` once after installing Android Studio or changing your Java/SDK paths.
- After setting `JAVA_HOME`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT`, open a fresh terminal so Expo and Gradle can see them.
- Make sure your phone and computer are on the same Wi-Fi network if you are testing on a physical device.
- `EXPO_PUBLIC_API_BASE_URL` is recommended for real-device testing.
- The first Android build is slow because Gradle downloads and compiles the native toolchain. Later builds are much faster.

### 8. (Optional) Run the Standalone AI Demo Server

```bash
cd ai/ml
uvicorn fastapiwrapper:app --reload --port 8001
```

This runs the AI models as an independent server on port 8001 for testing or demo purposes.

### 9. Test the AI Endpoint

```bash
curl -H "Authorization: Bearer <access_token>" "http://localhost:8000/policy/ai-premium?zone=Velachery&persona=Food&tier=standard"
```

Get `<access_token>` from `/users/login`, `/users/register`, or `/auth/phone-login` first.

Or run the test script:

```bash
cd ai/ml
python test.py
```

---

## API Endpoints

Unless explicitly noted otherwise, app-facing routes below are JWT-protected and expect `Authorization: Bearer <token>`.

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/`      | Health check — returns `{"status": "ok"}` |

### Users

| Method | Endpoint            | Description                  |
|--------|---------------------|------------------------------|
| `POST` | `/users/register`   | Register a new delivery worker |
| `POST` | `/users/login`      | Login with username and password |
| `GET`  | `/users/me`         | Get the current authenticated session profile |
| `GET`  | `/users/wallet`     | Get the current user's wallet balance |
| `GET`  | `/users/{user_id}`  | Get user profile by ID       |

### Auth

| Method | Endpoint             | Description |
|--------|----------------------|-------------|
| `POST` | `/auth/login`        | Secondary username/password auth route |
| `POST` | `/auth/phone-login`  | Mock OTP login used by the current mobile app |
| `POST` | `/auth/firebase`     | Firebase token exchange for server-issued JWT |

### Policy

| Method | Endpoint                                          | Description                                      |
|--------|---------------------------------------------------|--------------------------------------------------|
| `GET`  | `/policy/`                                        | Get the current active policy for the authenticated user |
| `POST` | `/policy/change`                                  | Change the active plan tier (7-day cooldown) |
| `GET`  | `/policy/ai-premium?zone=X&persona=Y&tier=Z`     | **AI-powered** real-time premium quote (CatBoost) |
| `GET`  | `/policy/ai-premium/live?lat=X&lon=Y&zone=Z&tier=T` | Live premium + disruption snapshot from live feeds |
| `GET`  | `/policy/triggers`                                | List configured trigger definitions |
| `POST` | `/policy/create`                                  | Create and activate a policy                      |
| `GET`  | `/policy/{policy_id}`                             | Get policy details                                |
| `GET`  | `/policy/user/{user_id}`                          | Get all policies for a user                       |

### Payments

| Method | Endpoint           | Description |
|--------|--------------------|-------------|
| `POST` | `/payments/quote`  | Create a short-lived backend quote for a plan |
| `POST` | `/payments/order`  | Create a Razorpay sandbox order from that quote |
| `POST` | `/payments/verify` | Verify the Razorpay signature and activate the policy |
| `POST` | `/payments/webhook` | Accept Razorpay webhook callbacks |

### Claims

| Method | Endpoint               | Description                                         |
|--------|------------------------|-----------------------------------------------------|
| `GET`  | `/claims/`             | Get all claims for the authenticated user |
| `POST` | `/claims/sync-auto`    | Sync parametric auto-claims for the authenticated user |
| `POST` | `/claims/auto-process` | Run the full trigger-event to claim pipeline for active users |
| `POST` | `/claims/submit`       | Submit a claim (uses **IsolationForest** fraud detection) |
| `GET`  | `/claims/user/{user_id}` | Get all claims for a user                          |
| `GET`  | `/claims/{claim_id}`   | Get claim details                                   |

### Weather

| Method | Endpoint                  | Description                        |
|--------|---------------------------|------------------------------------|
| `GET`  | `/weather/?lat=X&lon=Y`  | Live weather + AQI + disruption analysis |
| `GET`  | `/weather/forecast?lat=X&lon=Y` | Forecast-oriented weather bundle using the same safe fallback logic |

### Admin / Demo

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/login` | Minimal admin login used by the demo dashboard |
| `POST` | `/admin/start-simulation` | Start simulation mode, return live risk snapshot, and run claim sync |
| `POST` | `/admin/stop-simulation` | Stop simulation mode and broadcast an app refresh |
| `WS`   | `/ws/simulation` | Realtime refresh channel consumed by the mobile claims screen |

### Example: AI Premium Response

```json
{
  "status": "success",
  "ai_risk_score": 0.42,
  "weekly_premium_inr": 69.58,
  "zone": "Velachery",
  "active_disruption": "None"
}
```

### Example: Claim Fraud Detection Response

```json
{
  "id": 1,
  "user_id": 1,
  "policy_id": 1,
  "trigger_event_id": null,
  "disruption_type": "heavy_rainfall",
  "hours_lost": 6.0,
  "claim_amount": 400,
  "fraud_score": 0.0,
  "status": "approved",
  "source": "manual",
  "reason": null
}
```
### PITCHDECK
https://docs.google.com/presentation/d/1q8TFu0DMk1K2cjkaV4h-PpQxi4YRjMZ849kHg9ZhZHg/edit?usp=sharing
