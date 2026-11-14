from pydantic_settings import BaseSettings, SettingsConfigDict

class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    USER: str = "Arpan"
    IDENTTY :str = "Owner"

    # Database
    DATABASE_URL: str = ""

    # LiveKit Credentials
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""
    AGENT_NAME: str = ""

settings = Config()
