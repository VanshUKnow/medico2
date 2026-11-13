# Medico — production-oriented foundation

This repository refactors the supplied Streamlit proof-of-concept into a React + FastAPI application with database-backed accounts, patient records, prediction history, SHAP explanations, and PDF report export.

## Important clinical limitation
This is **not clinically validated software** and must not be used to diagnose, triage, or treat patients. The included XGBoost artifact is inherited from the supplied repository and requires independent validation, calibration, data provenance review, bias assessment, and clinician-led safety review before any clinical use. A model score is not a diagnosis and is not described as calibrated confidence.

## Requirements
- Python 3.11+
- Node.js 20+
- PostgreSQL for deployment (SQLite can be used for local development)
- The inherited model file at `backend/models/xgb_model.pkl`

## Backend
```bash
cd backend
python -m venv .venv
# activate the environment
pip install -r requirements.txt
cp .env.example .env
# set SECRET_KEY, REGISTRATION_INVITE_CODE, DATABASE_URL, and optionally GEMINI_API_KEY
uvicorn app.main:app --reload
```
API docs are available at `/docs` in local development. Configure `CORS_ORIGINS` for your actual frontend origin before deployment.

## Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Configuration
Never commit `.env`, API keys, patient data, database dumps, or production secrets. Set `ENVIRONMENT=production`, a strong random `SECRET_KEY`, a strong registration invite code, and a PostgreSQL `DATABASE_URL` in deployment. Use HTTPS, managed database backups, restrictive network rules, monitoring, and a formal privacy/security review.

## Included capabilities
- Invite-code-gated account creation and JWT authentication
- User-scoped patient records and prediction history
- Server-side model inference and SHAP feature contribution output
- Optional Gemini explanation and uploaded PDF/image document review (not required for core predictions)
- PDF export of saved analysis records
- Basic API tests

## Not yet a clinical or regulatory release
No independent model validation, calibration, threat model, penetration test, regulatory assessment, healthcare privacy compliance review, or deployment verification is included. Do not use real patient data until those controls are implemented and reviewed.

## Public homepage

The React frontend now opens on a public Medico landing page before authentication. It includes a locally bundled medical hero visual (`frontend/public/medico-hero.png`), a progressive gradient fade toward the bottom of the hero, and a rounded overlapping features section. “Log in” and “Get started” route to the existing sign-in and invite-code registration flows. The homepage describes the inherited model as investigational and does not claim clinical validation.

To run the frontend locally, install dependencies in `frontend/` with `npm install`, then run `npm run dev`. The frontend production build was not verified in the authoring environment because npm package installation could not complete.


## Gemini AI integration

Set these values in `backend/.env` (never in a frontend `VITE_` variable):

```dotenv
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_MODEL=gemini-3.8-flash
```

Install backend dependencies with `python -m pip install -r requirements.txt`, then restart FastAPI. Existing prediction requests continue to work without Gemini configured.

- `POST /api/analyses/{analysis_id}/explain` generates and persists an explanation based on the saved prediction and SHAP values.
- `POST /api/analyses/{analysis_id}/documents/analyze` accepts repeated `files` fields (PDF/JPEG/PNG/WebP, max 10 MB each and 5 files) and appends an evidence-grounded document summary to the report narrative.
- `GET /api/analyses/{analysis_id}/report.pdf` includes saved narrative text.
- Both AI endpoints require the report to belong to the authenticated user. Uploaded files are processed in memory and are not persisted by this implementation; the generated narrative is saved to the existing `Analysis.narrative` field.

Gemini document processing sends uploaded document content to Google's API. Do not upload real patient information unless your data-protection, consent, contractual, and deployment requirements have been reviewed. Generated output is unverified decision support, not a diagnosis or treatment recommendation.
# Medico2
