from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.models import Base

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    future=True,
    echo=settings.debug,
    pool_pre_ping=True,
)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """
    Initialise the database schema.

    Strategy (safe for both fresh and existing deployments):
    1.  create_all() — creates any tables that don't exist yet (idempotent).
    2.  _run_migrations() — safely adds columns / indexes / enum values that
        may be missing on existing databases (all statements use IF NOT EXISTS
        or IF EXISTS guards, so they are safe to re-run on every startup).
    """
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await _run_migrations()


async def _run_migrations() -> None:
    """
    Idempotent migration statements.
    Every statement must be safe to execute even if the change already exists.
    """
    migrations = [
        # ── Users ─────────────────────────────────────────────────────────
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_policy_change_at TIMESTAMPTZ",

        # ── ClaimStatus enum — PostgreSQL requires individual ALTER TYPE ──
        # These no-op if the value already exists.
        "ALTER TYPE claimstatus ADD VALUE IF NOT EXISTS 'triggered'",
        "ALTER TYPE claimstatus ADD VALUE IF NOT EXISTS 'paid'",

        # ── Claims — new columns ──────────────────────────────────────────
        """ALTER TABLE claims
               ADD COLUMN IF NOT EXISTS trigger_event_id INTEGER
               REFERENCES trigger_events (id) ON DELETE SET NULL""",

        "ALTER TABLE claims ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual'",

        # ── Claims — drop old constraint that breaks parametric engine ────
        "ALTER TABLE claims DROP CONSTRAINT IF EXISTS ck_claims_hours_lost_range",

        # ── trigger_events — new column ───────────────────────────────────
        """ALTER TABLE trigger_events
               ADD COLUMN IF NOT EXISTS claim_id INTEGER
               REFERENCES claims (id) ON DELETE SET NULL""",

        # ── Indexes ───────────────────────────────────────────────────────
        "CREATE INDEX IF NOT EXISTS ix_claims_user_created_at ON claims (user_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_claims_status ON claims (status)",
        "CREATE INDEX IF NOT EXISTS ix_trigger_events_unprocessed ON trigger_events (status, eligible_for_claim)",

        # ── Wallets table (idempotent via create_all, belt-and-suspenders) ─
        """CREATE TABLE IF NOT EXISTS wallets (
               id         SERIAL PRIMARY KEY,
               user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
               balance    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
               updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
               CONSTRAINT uq_wallets_user_id UNIQUE (user_id),
               CONSTRAINT ck_wallets_balance_non_negative CHECK (balance >= 0)
           )""",

        # ── Wallet transactions table ──────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS wallet_transactions (
               id         SERIAL PRIMARY KEY,
               user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
               claim_id   INTEGER NOT NULL REFERENCES claims (id) ON DELETE CASCADE,
               amount     NUMERIC(10, 2) NOT NULL,
               created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
               CONSTRAINT uq_wallet_transactions_claim_id UNIQUE (claim_id)
           )""",

        "CREATE INDEX IF NOT EXISTS ix_wallet_transactions_user_id ON wallet_transactions (user_id)",

        # ── Back-fill wallets for existing users ──────────────────────────
        """INSERT INTO wallets (user_id, balance, updated_at)
               SELECT u.id, 0.00, NOW()
               FROM   users u
               WHERE  NOT EXISTS (SELECT 1 FROM wallets w WHERE w.user_id = u.id)""",
    ]

    async with engine.begin() as connection:
        for stmt in migrations:
            await connection.execute(text(stmt))
