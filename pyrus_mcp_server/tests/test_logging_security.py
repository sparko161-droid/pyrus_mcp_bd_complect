import pytest
from pyrus_mcp.logging_config import _redact_sensitive

def test_sensitive_field_redaction():
    """Проверка, что конфиденциальные ключи в любом регистре скрываются как [REDACTED]."""
    test_dict = {
        "event": "user_login",
        "token": "secret_bearer_token_12345",
        "access_token": "pyrus_access_token_xyz",
        "security_key": "my_super_secret_key",
        "password": "my_password",
        "authorization": "Bearer abcde",
        "pyrus_security_key": "p_sec_key",
        "webhook_secret": "wh_sec",
        "user_id": 42,
        "action": "view_task",
    }
    
    redacted = _redact_sensitive(None, None, test_dict.copy())
    
    assert redacted["token"] == "[REDACTED]"
    assert redacted["access_token"] == "[REDACTED]"
    assert redacted["security_key"] == "[REDACTED]"
    assert redacted["password"] == "[REDACTED]"
    assert redacted["authorization"] == "[REDACTED]"
    assert redacted["pyrus_security_key"] == "[REDACTED]"
    assert redacted["webhook_secret"] == "[REDACTED]"
    
    # Non-sensitive keys must remain unchanged
    assert redacted["event"] == "user_login"
    assert redacted["user_id"] == 42
    assert redacted["action"] == "view_task"
