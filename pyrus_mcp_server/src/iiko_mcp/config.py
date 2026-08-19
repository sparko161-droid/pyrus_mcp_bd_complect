from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal

class IikoSettings(BaseSettings):
    # iiko Credentials
    iiko_api_login: str = ""
    iiko_api_url: str = "https://api-ru.iiko.services/api/1"
    
    # Provider capability
    iiko_provider: Literal["cloud", "server"] = "cloud"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

iiko_settings = IikoSettings()
