# IntelliTraffic — Development Guide

> **Development branch:** `dev`
> This README is the technical guide for developing, testing, containerizing, and deploying IntelliTraffic.

For the project overview, features, results, screenshots, demo, and other showcase information, refer to the `main` branch README.

---

## 1. Development Scope

The `dev` branch is used for:

* Active feature development
* ML/model development
* Backend development
* Frontend integration
* Testing
* Docker validation
* CI/CD validation
* Deployment preparation

Production-ready changes are promoted from `dev` to `main` only after validation.

---

## 2. System Architecture

```text
                    ┌──────────────────────┐
                    │   California PeMS    │
                    │    Traffic Data      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Data Processing &    │
                    │ Feature Engineering  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    LightGBM V2       │
                    │   Traffic Model      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │       FastAPI        │
                    │      REST API        │
                    └──────────┬───────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
        ┌─────────────────┐         ┌─────────────────┐
        │     Frontend    │         │  Traffic Map    │
        │ Vite + JavaScript│        │    Leaflet      │
        └─────────────────┘         └─────────────────┘
                 │                           │
                 └─────────────┬─────────────┘
                               ▼
                       User Interface
```

---

## 3. Repository Structure

```text
traffic-prediction-system/
│
├── .github/
│   └── workflows/
│       └── ...
│
├── data/
│   ├── raw/
│   └── processed/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.*
│
├── models/
│   └── traffic_lightgbm_v2.txt
│
├── notebooks/
│
├── scripts/
│
├── src/
│   ├── main.py
│   └── ...
│
├── tests/
│
├── .dockerignore
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md
```

The structure may change as the system evolves. New architectural components should be documented here when introduced.

---

# 4. Development Environment

Recommended environment:

```text
OS              Windows / Linux / macOS
Python          3.11
Node.js         LTS
Package Manager npm
Backend         FastAPI
Frontend        Vite
ML              LightGBM
Container       Docker
Version Control Git
```

---

# 5. Clone the Repository

```powershell
git clone https://github.com/Arham-15/traffic-prediction-system.git
cd traffic-prediction-system
```

Switch to the development branch:

```powershell
git switch dev
```

Pull the latest changes:

```powershell
git pull origin dev
```

---

# 6. Python Environment

Create the virtual environment:

```powershell
py -3.11 -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Upgrade pip:

```powershell
python -m pip install --upgrade pip
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Verify Python:

```powershell
python --version
```

---

# 7. Backend Development

The backend is located in:

```text
src/
```

The FastAPI application entry point is:

```text
src/main.py
```

Start the development server:

```powershell
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Local API:

```text
http://localhost:8000
```

Interactive API documentation:

```text
http://localhost:8000/docs
```

Alternative API documentation:

```text
http://localhost:8000/redoc
```

---

# 8. API Development

The API is responsible for:

```text
Request
   ↓
Input validation
   ↓
Location/sensor processing
   ↓
Feature preparation
   ↓
LightGBM prediction
   ↓
Response
```

The request schema is defined in the FastAPI application.

Current prediction inputs include:

```text
latitude
longitude
date_time
day_type
temperature
rain
snow
cloudiness
```

Example development request:

```json
{
  "latitude": 38.5816,
  "longitude": -121.4944,
  "date_time": "2026-10-08T18:00:00",
  "day_type": "Weekday",
  "temperature": 24.0,
  "rain": 0.0,
  "snow": 0.0,
  "cloudiness": 20.0
}
```

Always verify the current schema through:

```text
http://localhost:8000/docs
```

when the API is modified.

---

# 9. Frontend Development

The frontend is located in:

```text
frontend/
```

Install dependencies:

```powershell
cd frontend
npm install
```

Start the development server:

```powershell
npm run dev
```

Vite will display the local development URL in the terminal.

Typically:

```text
http://localhost:5173
```

---

# 10. Frontend ↔ Backend

During local development:

```text
Browser
   │
   ▼
Vite Frontend
localhost:5173
   │
   │ HTTP requests
   ▼
FastAPI
localhost:8000
   │
   ▼
LightGBM V2
```

The frontend must use the appropriate API base URL for the environment.

Do not hard-code production URLs when environment-based configuration is available.

---

# 11. Machine Learning Development

The current primary development model is:

```text
LightGBM V2
```

Model file:

```text
models/traffic_lightgbm_v2.txt
```

The model is trained using historical traffic information together with engineered temporal, geographic, road, and weather-related features.

---

# 12. Current Feature Pipeline

The current continuous feature set includes:

```text
traffic
hour
day_of_week
month
is_weekend
is_rush_hour
traffic_lag_1
traffic_lag_2
traffic_lag_3
traffic_lag_24
traffic_lag_168
rolling_mean_3
rolling_mean_24
latitude
longitude
lanes
```

Feature engineering must remain consistent between:

```text
Training
   ↕
Inference
```

A change to feature names, transformations, ordering, or preprocessing must be reflected in both sides.

---

# 13. Traffic Data

The traffic model is based on California PeMS data.

The project uses traffic sensor metadata for geographic lookup and map-related functionality.

Important development assets include:

```text
data/raw/
data/processed/
```

Large raw datasets should not be committed to Git unless explicitly required.

---

# 14. Weather Data

Historical weather information is aligned with traffic data geographically and temporally.

Weather-related inputs currently include:

```text
temperature
rain
snow
cloudiness
```

Production predictions should use real or appropriately sourced values.

Do not introduce random or fabricated weather values into the production prediction pipeline.

---

# 15. Geographic Scope

The current traffic model is trained on California PeMS traffic data.

Therefore, traffic prediction is currently limited by the training domain.

Changing the latitude and longitude does **not** automatically make the model capable of predicting traffic for an unrelated country or region.

Supporting locations such as:

```text
Delhi
Dubai
Riyadh
London
Germany
```

would require suitable traffic data, feature alignment, validation, and model training for those regions.

---

# 16. Geospatial Processing

The backend performs geographic sensor lookup using PeMS sensor metadata.

The system can identify nearby traffic sensors for supported geographic requests.

Current development configuration uses nearby sensors with a maximum search distance of approximately:

```text
50 km
```

Geospatial functionality should be tested whenever changes are made to:

```text
latitude
longitude
sensor lookup
map endpoints
distance calculations
```

---

# 17. Testing

Run the test suite from the repository root:

```powershell
pytest -v
```

For a normal run:

```powershell
pytest
```

Before merging a significant change, test:

```text
[ ] ML prediction
[ ] API validation
[ ] API response
[ ] Geographic lookup
[ ] Frontend/API communication
[ ] Error handling
[ ] Docker build
```

---

# 18. Manual API Testing

Start FastAPI:

```powershell
uvicorn src.main:app --reload --port 8000
```

Open:

```text
http://localhost:8000/docs
```

Test each relevant endpoint through Swagger UI.

Verify:

```text
Valid request
Invalid request
Missing fields
Invalid coordinates
Invalid date/time
Invalid weather values
Unsupported location
Model response
```

---

# 19. Docker Development

The backend can be built as a Docker image.

From the repository root:

```powershell
docker build -t intellitraffic-api:dev .
```

Run:

```powershell
docker run --rm -p 8000:8000 intellitraffic-api:dev
```

Verify:

```text
http://localhost:8000/docs
```

---

# 20. Docker Runtime Requirements

The production container must contain the runtime assets required by the API.

Important assets include:

```text
src/
models/traffic_lightgbm_v2.txt
data/raw/largest/ca_meta.csv
data/processed/hourly/
```

Large training-only datasets should not be included in the production image unless they are required at runtime.

Use:

```text
.dockerignore
```

to prevent unnecessary files from entering the Docker build context.

---

# 21. Docker Compose

If the local Compose configuration is required:

```powershell
docker compose up --build
```

Stop services:

```powershell
docker compose down
```

View running containers:

```powershell
docker ps
```

View logs:

```powershell
docker logs <container-id>
```

---

# 22. CI/CD

GitHub Actions workflows are located in:

```text
.github/workflows/
```

The intended development pipeline is:

```text
Feature Branch
      │
      ▼
Pull Request
      │
      ▼
     dev
      │
      ▼
CI Checks
      │
      ├── Tests
      ├── Validation
      └── Docker Build
      │
      ▼
   Approved
      │
      ▼
    main
      │
      ▼
 Production
```

CI configuration should be updated whenever the project's build, test, or deployment requirements change.

---

# 23. CI/CD Principles

CI/CD should verify the application before production promotion.

Typical validation stages:

```text
Install dependencies
        ↓
Run tests
        ↓
Validate application
        ↓
Build Docker image
        ↓
Push image
        ↓
Deploy
        ↓
Verify deployment
```

Production credentials must be stored as repository/environment secrets rather than inside workflow files.

---

# 24. Azure Deployment

The intended backend deployment architecture is:

```text
GitHub
   ↓
GitHub Actions
   ↓
Docker Image
   ↓
Azure Container Registry
   ↓
Azure Container Apps
   ↓
FastAPI
```

The frontend may be deployed separately as a static web application.

---

# 25. Container Registry

Container images should use versioned tags.

Example:

```text
intellitraffic-api:1.0
intellitraffic-api:1.1
intellitraffic-api:v2
```

For production, prefer traceable version tags so that a deployment can be associated with a specific source revision.

Avoid depending exclusively on:

```text
latest
```

for production rollback and traceability.

---

# 26. Environment Configuration

Environment-specific configuration should be provided through environment variables.

Local development may use:

```text
.env
```

Never commit:

```text
.env
```

or credentials containing:

```text
API keys
Azure credentials
GitHub tokens
Passwords
Private keys
Service credentials
```

Production secrets should be configured through the appropriate Azure/GitHub secret-management mechanism.

---

# 27. Branching Strategy

### `main`

Stable and production-ready code.

```text
main
 ↓
Production
```

### `dev`

Active integration and testing branch.

```text
dev
 ↓
Development / Integration
```

### Feature branches

Used for isolated development.

Examples:

```text
feature/model-improvement
feature/map-upgrade
feature/api-update
feature/frontend-update
fix/api-error
fix/docker-build
```

---

# 28. Recommended Git Workflow

Update `dev`:

```powershell
git switch dev
git pull origin dev
```

Create a feature branch:

```powershell
git switch -c feature/<feature-name>
```

Develop and test.

Check changes:

```powershell
git status
git diff
```

Stage:

```powershell
git add .
```

Commit:

```powershell
git commit -m "feat: description of change"
```

Push:

```powershell
git push -u origin feature/<feature-name>
```

Create a Pull Request:

```text
feature/<feature-name>
        ↓
       dev
```

---

# 29. Commit Convention

Use descriptive commit messages.

Recommended prefixes:

```text
feat:     New functionality
fix:      Bug fix
test:     Testing changes
docs:     Documentation
refactor: Code restructuring
build:    Build/Docker changes
ci:       CI/CD changes
perf:     Performance improvements
```

Examples:

```text
feat: add traffic map endpoint
fix: resolve prediction input validation
test: add API prediction tests
docs: update development guide
build: optimize Docker image
ci: update deployment workflow
```

---

# 30. Pull Request Rules

Before merging into `dev`:

```text
[ ] Feature works locally
[ ] Tests pass
[ ] CI passes
[ ] No secrets committed
[ ] No unnecessary large files
[ ] API changes documented
[ ] ML changes validated
[ ] Docker tested when applicable
```

Before merging `dev` into `main`:

```text
[ ] Development branch is stable
[ ] ML model validated
[ ] API tested
[ ] Frontend tested
[ ] Docker image tested
[ ] CI/CD passes
[ ] Deployment verified
```

---

# 31. Model Versioning

Do not silently replace a validated model.

Use explicit model versions:

```text
traffic_lightgbm_v1.txt
traffic_lightgbm_v2.txt
traffic_lightgbm_v3.txt
```

When introducing a new model, record:

```text
Model version
Training data
Feature set
Validation metrics
Training changes
Inference changes
Deployment version
```

The validated V1 model should remain available as a fallback/reference while newer versions are developed.

---

# 32. Model Validation

A new model should be compared against the current baseline.

Primary regression metrics:

```text
MAE
RMSE
R²
```

Also verify:

```text
No data leakage
No unexpected missing values
Correct feature schema
Correct temporal alignment
Correct geographic alignment
Training/inference consistency
```

A model should not be promoted based on a single metric alone.

---

# 33. Data Integrity Rules

Development code must not introduce:

```text
Random traffic values
Random weather values
Fake event values
Artificial production sensor data
```

Training and inference data should be traceable to their intended sources.

Any data transformation that affects model behavior should be documented.

---

# 34. Security Rules

Never commit credentials or secrets.

Before pushing:

```powershell
git status
git diff
```

Review staged changes:

```powershell
git diff --cached
```

If a secret is accidentally committed:

1. Revoke/rotate the secret immediately.
2. Remove it from the repository.
3. Check Git history if necessary.
4. Replace it with a secure secret-management mechanism.

---

# 35. Troubleshooting

## Backend does not start

Check:

```text
Python version
Virtual environment
Dependencies
Model file
Required runtime data
Port availability
```

Run:

```powershell
uvicorn src.main:app --reload --port 8000
```

---

## Frontend cannot reach API

Check:

```text
FastAPI is running
API URL is correct
CORS configuration
Frontend environment configuration
Browser DevTools network requests
```

---

## Docker container fails

Check:

```powershell
docker ps -a
```

Then:

```powershell
docker logs <container-id>
```

---

## Docker build is unexpectedly large

Check:

```text
.dockerignore
Large datasets
Virtual environment
Node modules
Temporary files
Notebooks/output files
```

Training datasets should not unnecessarily become part of the production image.

---

## Prediction fails

Check:

```text
Request schema
Feature names
Feature order
Feature preprocessing
Model version
Model file
Location support
Date/time format
Required runtime data
```

---

# 36. Developer Checklist

## Before Commit

```text
[ ] Code formatted/clean
[ ] Feature tested
[ ] Existing functionality checked
[ ] Tests pass
[ ] No secrets
[ ] No unnecessary large files
[ ] Git diff reviewed
```

## Before Pull Request

```text
[ ] Feature branch is up to date
[ ] Tests pass
[ ] API tested
[ ] Frontend tested when applicable
[ ] Docker tested when applicable
[ ] Documentation updated
```

## Before Production

```text
[ ] dev is stable
[ ] CI passes
[ ] Model validated
[ ] Backend tested
[ ] Frontend tested
[ ] Docker tested
[ ] Azure configuration verified
[ ] Production API verified
[ ] Frontend connected to production API
```

---

# 37. Development Lifecycle

```text
Requirement
    ↓
Implementation
    ↓
Local Testing
    ↓
Feature Branch
    ↓
Pull Request
    ↓
CI Validation
    ↓
dev
    ↓
Integration Testing
    ↓
Production Validation
    ↓
main
    ↓
Deployment
    ↓
Post-Deployment Verification
```

---

# 38. Important Engineering Principles

### Keep `main` stable

Experimental work belongs in feature branches and `dev`.

### Keep training and inference aligned

A model is only reliable when the production feature pipeline matches the training pipeline.

### Prefer real data

Do not use fabricated production inputs.

### Validate before promotion

Every model, API, frontend, and deployment change should be tested before reaching production.

### Keep deployments reproducible

The same source revision should be traceable to the Docker image and deployment.

### Keep the repository clean

Do not commit unnecessary datasets, generated files, credentials, or local environments.

---

# 39. Quick Start

For a new developer:

```powershell
git clone https://github.com/Arham-15/traffic-prediction-system.git
cd traffic-prediction-system
git switch dev

py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

uvicorn src.main:app --reload --port 8000
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Then verify:

```text
Frontend → FastAPI → LightGBM V2
```

API documentation:

```text
http://localhost:8000/docs
```

---

## Development Branch Principle

```text
feature/*
     ↓
    dev
     ↓
 test + CI
     ↓
   main
     ↓
production
```

**`dev` is where IntelliTraffic is built.
`main` is where validated IntelliTraffic is presented and released.**
