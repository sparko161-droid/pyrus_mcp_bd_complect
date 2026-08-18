from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Pyrus Credentials
    pyrus_login: str = ""
    pyrus_security_key: str = ""
    pyrus_api_url: str = "https://api.pyrus.com/v4"
    
    # Server configuration
    server_auth_token: str = ""
    form_cache_ttl_seconds: int = 3600
    rate_limit_per_10min: int = 5000

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
