# Legacy repository notes

The original repository contained two near-duplicate Streamlit apps, a serialized XGBoost model, the Cleveland heart dataset, a SHAP plot script, and a Gemini explanation helper. The active application in this refactor is the React frontend and FastAPI backend. The original model pickle was copied unchanged to `backend/models/xgb_model.pkl`; it has not been retrained or independently validated. The dataset is retained at `backend/data/heart_cleveland_upload.csv` as source material, not as live patient data.
