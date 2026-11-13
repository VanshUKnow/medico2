# API tests are intentionally minimal; set required environment variables before running pytest.
from fastapi.testclient import TestClient
from app.main import app

def test_health_endpoint():
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["clinical_validation"] == "not established"
