from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    environment: str = "development"
    secret_key: str
    access_token_minutes: int = 60
    registration_invite_code: str
    database_url: str = "sqlite:///./medico.db"
    cors_origins: str = "http://localhost:5173"
    model_path: str = "./models/xgb_model.pkl"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

settings = Settings()
