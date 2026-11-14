
import os
import urllib.parse
from pathlib import Path

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.constants.config import settings


def normalize_database_url(url: str) -> str:
    url = url.strip()

    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql+psycopg://"):
        url = url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
    elif url.startswith("sqlite://"):
        url = url.replace("sqlite://", "sqlite+aiosqlite://", 1)

    # asyncpg does not accept libpq URL parameters such as sslmode, channel_binding, etc.
    # Convert sslmode -> ssl and strip unsupported params so asyncpg.connect() does not fail.
    if url.startswith("postgresql+asyncpg://"):
        parsed = urllib.parse.urlsplit(url)
        if parsed.query:
            query_params = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            has_ssl = any(k == "ssl" for k, _ in query_params)
            new_params = []
            for k, v in query_params:
                if k == "sslmode":
                    if not has_ssl:
                        new_params.append(("ssl", v))
                elif k in {"channel_binding", "gssencmode"}:
                    # Unsupported by asyncpg kwargs
                    continue
                else:
                    new_params.append((k, v))
            new_query = urllib.parse.urlencode(new_params)
            url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))

    return url


DATABASE_URL = (
    settings.DATABASE_URL
    or os.getenv("DATABASE_URL", "").strip()
)

if not DATABASE_URL:
    db_file = Path(__file__).parent / "autonomusAgent.db"
    DATABASE_URL = f"sqlite+aiosqlite:///{db_file.as_posix()}"

DATABASE_URL = normalize_database_url(DATABASE_URL)

is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    **(
        {"connect_args": {"check_same_thread": False}}
        if is_sqlite
        else {"pool_size": 10, "max_overflow": 10, "pool_recycle": 300}
    ),
)

async_session = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
