from pathlib import Path
import pickle
import pandas as pd
import shap
from app.config import settings

FEATURES = ["age", "sex", "cp", "trestbps", "chol", "fbs", "restecg", "thalach", "exang", "oldpeak", "slope", "ca", "thal"]
_model = None
_explainer = None
_load_error = None

def load_model():
    global _model, _explainer, _load_error
    if _model is not None:
        return _model, _explainer
    path = Path(settings.model_path)
    if not path.is_absolute():
        path = (Path(__file__).resolve().parents[1] / path).resolve()
    if not path.exists():
        _load_error = f"Model artifact not found at {path}"
        raise RuntimeError(_load_error)
    try:
        with path.open("rb") as f:
            _model = pickle.load(f)
        _explainer = shap.Explainer(_model)
        return _model, _explainer
    except Exception as exc:
        _load_error = f"Model artifact could not be loaded: {type(exc).__name__}"
        raise RuntimeError(_load_error) from exc

def predict(features: dict) -> dict:
    model, explainer = load_model()
    row = pd.DataFrame([[features[name] for name in FEATURES]], columns=FEATURES)
    predicted = int(model.predict(row)[0])
    probabilities = model.predict_proba(row)[0]
    score = float(probabilities[1]) if len(probabilities) > 1 else float(probabilities[0])
    explanation = explainer(row)
    values = explanation[0].values
    # SHAP output dimensions differ across model/library versions; normalize one row to feature map.
    if getattr(values, "ndim", 1) > 1:
        values = values[:, -1] if values.shape[-1] > 1 else values[:, 0]
    contributions = {name: float(value) for name, value in zip(FEATURES, values)}
    return {"predicted_class": predicted, "model_score": score, "feature_contributions": contributions}
