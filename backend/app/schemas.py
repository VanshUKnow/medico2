from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    invite_code: str = Field(min_length=1, max_length=200)

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class PatientIn(BaseModel):
    patient_code: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=200)

class PatientOut(BaseModel):
    id: int
    patient_code: str
    display_name: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AnalysisIn(BaseModel):
    patient_id: int
    age: int = Field(ge=18, le=100)
    sex: int = Field(ge=0, le=1)
    cp: int = Field(ge=0, le=3)
    trestbps: int = Field(ge=60, le=250)
    chol: int = Field(ge=50, le=800)
    fbs: int = Field(ge=0, le=1)
    restecg: int = Field(ge=0, le=2)
    thalach: int = Field(ge=40, le=250)
    exang: int = Field(ge=0, le=1)
    oldpeak: float = Field(ge=-5, le=15)
    slope: int = Field(ge=0, le=2)
    ca: int = Field(ge=0, le=4)
    thal: int = Field(ge=0, le=3)

class AnalysisOut(BaseModel):
    id: int
    patient_id: int
    inputs: dict
    predicted_class: int
    model_score: float
    feature_contributions: dict
    narrative: str | None
    model_version: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def ai_explanation(self) -> str | None:
        """Compatibility alias used by the React report UI."""
        return self.narrative
