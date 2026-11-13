from datetime import datetime, timezone
from google.genai.errors import ServerError
from io import BytesIO
import textwrap
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import select
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from app.config import settings
from app.db import Base, engine, get_db
from app.models import User, Patient, Analysis
from app.schemas import RegisterIn, LoginIn, TokenOut, PatientIn, PatientOut, AnalysisIn, AnalysisOut
from app.security import hash_password, verify_password, create_access_token, decode_access_token
from app.model_service import FEATURES, predict
from app.ai_service import explain_analysis, analyze_documents, ALLOWED_MIME_TYPES, MAX_DOCUMENT_BYTES
import logging

logger = logging.getLogger(__name__)

app = FastAPI(title="Medico API", version="1.0.0", description="Authenticated heart-risk model research/reporting API; not for clinical diagnosis.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

def current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    subject = decode_access_token(token)
    if not subject:
        raise HTTPException(status_code=401, detail="Invalid or expired token", headers={"WWW-Authenticate":"Bearer"})
    user = db.get(User, int(subject))
    if not user:
        raise HTTPException(status_code=401, detail="Account not found")
    return user

@app.get("/api/health")
def health():
    return {"status":"ok", "timestamp":datetime.now(timezone.utc).isoformat(), "clinical_validation":"not established"}

@app.post("/api/auth/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if payload.invite_code != settings.registration_invite_code:
        raise HTTPException(status_code=403, detail="Invalid registration invite code")
    email = payload.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=email, password_hash=hash_password(payload.password), role="clinician")
    db.add(user); db.commit(); db.refresh(user)
    return {"access_token":create_access_token(str(user.id))}

@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token":create_access_token(str(user.id))}

@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return {"id":user.id, "email":user.email, "role":user.role}

@app.get("/api/patients", response_model=list[PatientOut])
def list_patients(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(Patient).where(Patient.owner_id == user.id).order_by(Patient.created_at.desc())))

@app.post("/api/patients", response_model=PatientOut, status_code=201)
def create_patient(payload: PatientIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient = Patient(owner_id=user.id, patient_code=payload.patient_code.strip(), display_name=payload.display_name.strip())
    db.add(patient); db.commit(); db.refresh(patient)
    return patient

@app.get("/api/analyses", response_model=list[AnalysisOut])
def list_analyses(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(Analysis).where(Analysis.owner_id == user.id).order_by(Analysis.created_at.desc())))

@app.post("/api/analyses", response_model=AnalysisOut, status_code=201)
def create_analysis(payload: AnalysisIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient = db.scalar(select(Patient).where(Patient.id == payload.patient_id, Patient.owner_id == user.id))
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    features = {name:getattr(payload, name) for name in FEATURES}
    try:
        result = predict(features)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Prediction service unavailable. Check server configuration and logs.")
    analysis = Analysis(owner_id=user.id, patient_id=patient.id, inputs=features, **result)
    db.add(analysis); db.commit(); db.refresh(analysis)
    return analysis


@app.post("/api/analyses/{analysis_id}/explain", response_model=AnalysisOut)
def generate_analysis_explanation(
    analysis_id: int,
    clinical_notes: str = Form(default=""),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Generate and persist a Gemini explanation for an existing model/SHAP report."""
    analysis = db.scalar(select(Analysis).where(
        Analysis.id == analysis_id, Analysis.owner_id == user.id
    ))
    if not analysis:
        raise HTTPException(status_code=404, detail="Report not found")
    try:
        analysis.narrative = explain_analysis(analysis, clinical_notes)
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        return analysis
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        db.rollback()
        logger.exception(
            "Gemini explanation failed for analysis_id=%s",
            analysis_id,
        )
        raise HTTPException(
            status_code=502,
            detail="Gemini explanation failed. Check backend logs.",
        )
@app.post("/api/analyses/{analysis_id}/documents/analyze", response_model=AnalysisOut)
async def analyze_analysis_documents(
    analysis_id: int,
    files: list[UploadFile] = File(...),
    clinical_notes: str = Form(default=""),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Summarize uploaded PDF/image evidence and append it to an existing saved report."""
    analysis = db.scalar(select(Analysis).where(
        Analysis.id == analysis_id, Analysis.owner_id == user.id
    ))
    if not analysis:
        raise HTTPException(status_code=404, detail="Report not found")
    if not files:
        raise HTTPException(status_code=400, detail="Attach at least one document.")
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="A maximum of 5 documents can be processed at once.")

    document_parts = []
    try:
        for upload in files:
            mime_type = (upload.content_type or "").lower()
            if mime_type not in ALLOWED_MIME_TYPES:
                raise HTTPException(
                    status_code=415,
                    detail=f"Unsupported file type for {upload.filename or 'uploaded file'}. Use PDF, JPEG, PNG or WebP.",
                )
            data = await upload.read(MAX_DOCUMENT_BYTES + 1)
            if not data:
                raise HTTPException(status_code=400, detail=f"{upload.filename or 'Uploaded file'} is empty.")
            if len(data) > MAX_DOCUMENT_BYTES:
                raise HTTPException(status_code=413, detail=f"{upload.filename or 'Uploaded file'} exceeds 10 MB.")
            document_parts.append((upload.filename or "uploaded-document", mime_type, data))

        analysis.narrative = analyze_documents(
            document_parts,
            clinical_notes=clinical_notes,
            existing_narrative=analysis.narrative,
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        return analysis
    except HTTPException:
        db.rollback()
        raise
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=415, detail=str(exc))
    except Exception:
        db.rollback()
        logger.exception(
            "Gemini document analysis failed for analysis_id=%s",
            analysis_id,
        )
        raise HTTPException(
            status_code=502,
            detail="Gemini document analysis failed. Check backend logs.",
        )
    finally:
        for upload in files:
            await upload.close()

@app.get("/api/analyses/{analysis_id}/report.pdf")
def report_pdf(analysis_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    analysis = db.scalar(select(Analysis).where(Analysis.id == analysis_id, Analysis.owner_id == user.id))
    if not analysis:
        raise HTTPException(status_code=404, detail="Report not found")
    patient = db.get(Patient, analysis.patient_id)
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    y = height - 55
    pdf.setTitle(f"Medico analysis {analysis.id}")
    pdf.setFont("Helvetica-Bold", 18); pdf.drawString(50, y, "Medico — Model Analysis Report"); y -= 30
    pdf.setFont("Helvetica", 10)
    lines = [
        f"Report ID: {analysis.id}",
        f"Patient code: {patient.patient_code if patient else 'Unavailable'}",
        f"Created: {analysis.created_at.isoformat()}",
        "IMPORTANT: Research/decision-support output only. Not a diagnosis.",
        f"Model class output: {analysis.predicted_class}",
        f"Model score for class 1 (not calibrated clinical confidence): {analysis.model_score:.4f}",
        "", "Input features:"
    ]
    for key, value in analysis.inputs.items():
        lines.append(f"{key}: {value}")
    lines += ["", "Feature contributions (SHAP):"]
    for key, value in sorted(analysis.feature_contributions.items(), key=lambda x:abs(x[1]), reverse=True):
        lines.append(f"{key}: {value:+.5f}")
    if analysis.narrative:
        lines += ["", "AI-assisted narrative (requires clinician review):"]
        lines.extend(analysis.narrative.splitlines())
    lines += ["", "Clinical validation status: not established."]
    for original_line in lines:
        safe_line = original_line.encode("latin-1", "replace").decode("latin-1")
        wrapped_lines = textwrap.wrap(safe_line, width=95, replace_whitespace=False, drop_whitespace=True) or [""]
        for line in wrapped_lines:
            if y < 55:
                pdf.showPage(); y = height - 55; pdf.setFont("Helvetica", 10)
            pdf.drawString(50, y, line)
            y -= 15
    pdf.save(); buffer.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition":f'attachment; filename="medico-report-{analysis.id}.pdf"'})

@app.delete("/api/patients/{patient_id}", status_code=204)
def delete_patient(patient_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient = db.scalar(select(Patient).where(Patient.id == patient_id, Patient.owner_id == user.id))
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(patient); db.commit()
    return None
