from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal

class Settings(BaseSettings):
    # Pyrus Credentials (Phase 5: Auth v4)
    pyrus_login: str = ""
    pyrus_security_key: str = ""
    pyrus_person_id: str = ""
    pyrus_webhook_secret: str = ""
    redis_url: str = ""  # Optional вЂ” if set, enables Redis cache adapter
    pyrus_api_url: str = "https://api.pyrus.com/v4"
    
    # Server configuration
    server_auth_token: str = ''
    mcp_transport: Literal["stdio", "sse"] = "stdio"
    mcp_stateless: bool = True
    cors_origins: list[str] = ["http://localhost", "http://127.0.0.1", "http://localhost:3000", "http://localhost:8000"]
    cors_allow_all: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"
    
    # Threat Model limits
    max_requests_per_minute: int = 100
    enable_tenant_isolation: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()



