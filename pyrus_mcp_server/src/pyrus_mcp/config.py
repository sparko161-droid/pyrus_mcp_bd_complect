from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal

class Settings(BaseSettings):
    # Pyrus Credentials (Phase 5: Auth v4)
    pyrus_login: str = ""
    pyrus_security_key: str = ""
    pyrus_webhook_secret: str = ""
    redis_url: str = ""  # Optional — if set, enables Redis cache adapter
    pyrus_api_url: str = "https://api.pyrus.com/v4"
    
    # Server configuration
    mcp_transport: Literal["stdio", "sse"] = "stdio"
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"
    
    # Threat Model limits
    max_requests_per_minute: int = 100
    enable_tenant_isolation: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
