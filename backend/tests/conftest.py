import os
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-0123456789")
os.environ.setdefault("REGISTRATION_INVITE_CODE", "test-invite-code")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_medico.db")
