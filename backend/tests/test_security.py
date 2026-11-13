from app.security import hash_password, verify_password, create_access_token, decode_access_token

def test_password_hash_round_trip():
    password = "test-password-with-enough-length"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("incorrect-password", hashed)

def test_token_round_trip():
    token = create_access_token("42")
    assert decode_access_token(token) == "42"
