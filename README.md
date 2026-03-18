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
- when a trigger affects the worker's zone and active policy window, the system starts a zero-touch claim
- the backend validates the event, checks fraud signals, and triggers a simulated payout for lost income.The platform insures the worker's missed earning time.

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

1. A delivery worker registers in the mobile app with city, delivery zone, platform, weekly income, and work profile.
2. The backend creates a risk profile using worker details, zone-level disruption exposure, and AI scoring.
3. The worker is shown weekly plan options and an appropriate premium.
4. Once the policy is active, the backend monitors configured external triggers for the worker's zone.
5. When a verified disruption occurs, the platform can auto-initiate or pre-fill a claim flow.
6. The claim engine checks policy validity, trigger evidence, location consistency, and fraud signals.
7. The platform returns `approved`, `flagged`, or `rejected`.
8. Approved claims move to a simulated instant payout flow and appear in the worker dashboard.

### Base weekly plans

| Plan     | Weekly premium | Daily income protection | Max weekly payout |
| -------- | -------------- | ----------------------- | ----------------- |
| Basic    | Rs. 29         | Rs. 200                 | Rs. 1000          |
| Standard | Rs. 49         | Rs. 500                 | Rs. 2500          |
| Pro      | Rs. 89         | Rs. 800                 | Rs. 4000          |

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

Payout is based on lost income hours, but always capped by policy rules.

`approved payout = min(hours lost x protected hourly amount, daily protection cap, weekly remaining limit)`

This keeps the product aligned to lost wages instead of unrelated expenses.

## Parametric Triggers

The use case asks for automated disruption triggers. For this persona, the core triggers are:

| Trigger                       | Example source                      | Why it matters                                       |
| ----------------------------- | ----------------------------------- | ---------------------------------------------------- |
| Heavy rainfall                | Weather API or mock weather feed    | Riders cannot safely complete deliveries             |
| Flood or waterlogging alert   | Civic or municipal alert feed       | Pickup and drop routes become unusable               |
| Extreme heat                  | Weather or heat index API           | Outdoor work becomes unsafe or restricted            |
| Severe AQI                    | AQI API or mock pollution feed      | Health-sensitive outdoor exposure reduces shift time |
| Curfew or sudden zone closure | Mock civic feed or admin event feed | Workers cannot access the delivery zone              |

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

## How Frontend, Backend, and AI Work Together

```text
Mobile App
    |
    v
FastAPI Backend
    |
    +--> User and policy services
    +--> Trigger monitoring service
    +--> Claim and fraud service
    +--> CatBoost inference service
    +--> Payout simulator
    |
    v
Database + external data feeds
```

## Tech Stack

### Current trail-phase stack

- Frontend: React Native with Expo + react-native-maps (Integrated)
- Navigation: React Navigation
- Backend: FastAPI
- Validation: Pydantic
- Server: Uvicorn
- Storage: in-memory mock database
- Monitoring: Openweather API (AQI + Weather) (Integrated)

### Planned additions for later phases

- Database: supabase
- ML: Python, CatBoost, pandas, scikit-learn tooling for evaluation
- Data store: PostgreSQL or Supabase
- Trigger feeds: mock apis for civic alerts
- Payments: Razorpay sandbox or mock UPI simulation
- Dashboard: simple web admin and analytics panel

## Development Plan

## Current Repository Status

This repository is the trail-phase starting point for the full solution.

What already exists:

- a skeleton of frontend and backend
- basic file structure

What will be added to fully match the use case:

- strict persona-driven experience for food delivery workers
- automated parametric trigger monitoring
- CatBoost-based AI risk scoring
- ML-assisted fraud detection
- payout simulation
- persistent storage and analytics dashboard

## Summary

EarnSafe is an AI-powered, mobile-first, parametric insurance platform for food delivery workers. It protects weekly income loss caused by verified external disruptions, uses weekly premiums instead of traditional long-cycle pricing, and combines backend automation with CatBoost-based risk intelligence to create faster, fairer protection for gig workers.

This README is intended to serve as the Phase 1 strategy document: it explains the problem, the chosen persona, the workflow, the weekly pricing model, the parametric triggers, the AI and fraud plan, the tech stack, and the phased execution plan.
