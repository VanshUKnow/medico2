# Gemini AI integration

## Configuration

From `backend/`, copy `.env.example` to `.env` if you do not already have a local environment file. Preserve your existing `SECRET_KEY`, `REGISTRATION_INVITE_CODE`, `DATABASE_URL`, and other settings. Add:

```dotenv
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_MODEL=gemini-2.5-flash
```

Install dependencies and restart FastAPI:

```bash
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Never put `GEMINI_API_KEY` in the React frontend or a `VITE_` variable.

## API endpoints

All endpoints require the existing bearer token and verify that the requested report belongs to the authenticated user.

- `POST /api/analyses/{analysis_id}/explain` — form field `clinical_notes` (optional). Generates and saves a Gemini explanation using the stored prediction, input features and SHAP values.
- `POST /api/analyses/{analysis_id}/documents/analyze` — repeated multipart `files` fields and optional `clinical_notes`. Accepts PDF, JPEG, PNG and WebP; maximum 5 files, 10 MB each. Adds a document summary to the existing report narrative.
- `GET /api/analyses/{analysis_id}/report.pdf` — exports the saved narrative along with model output and SHAP values.

The original `POST /api/analyses` contract remains unchanged. Its database persistence uses the existing nullable `Analysis.narrative` field; no database migration is required. `AnalysisOut` additionally exposes `ai_explanation` as a compatibility alias for the React UI.

## Frontend workflow

On the New analysis page, keep XGBoost enabled to create the saved report. The current database schema requires a model prediction for a report record. Uploaded documents are then reviewed against that saved report. Existing reports also have controls to regenerate the explanation or analyze documents.

The generated explanation and document summary are saved to the report and included in PDF export. Uploaded file bytes are processed in memory and are not persisted by this implementation.

## Safety and privacy

Gemini document processing sends uploaded file content to Google's API. Do not upload real patient information unless privacy, consent, data-processing terms and deployment requirements have been reviewed. Treat AI output as unverified decision support; it is not a diagnosis, and SHAP contributions are not causal explanations. Clinician review is required.
