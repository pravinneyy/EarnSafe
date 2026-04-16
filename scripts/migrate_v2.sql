-- =============================================================================
-- EarnSafe v2 Migration Script
-- Run this on EXISTING live databases only.
-- Fresh databases will get all tables auto-created via SQLAlchemy create_all().
-- =============================================================================

-- ─── 1. Add last_policy_change_at to users ───────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_policy_change_at TIMESTAMPTZ;


-- ─── 2. Extend ClaimStatus enum with new values ───────────────────────────────
-- Note: PostgreSQL requires adding enum values in a separate transaction.
-- Run each ALTER TYPE in its own transaction block if needed.

ALTER TYPE claimstatus ADD VALUE IF NOT EXISTS 'triggered';
ALTER TYPE claimstatus ADD VALUE IF NOT EXISTS 'paid';


-- ─── 3. Add trigger_event_id to claims (FK + dedup) ──────────────────────────
ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS trigger_event_id INTEGER
        REFERENCES trigger_events (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_claims_user_created_at ON claims (user_id, created_at);


-- ─── 4. Remove old hours_lost constraint (engine sets 0.0 for parametric) ─────
ALTER TABLE claims
    DROP CONSTRAINT IF EXISTS ck_claims_hours_lost_range;


-- ─── 5. Add claim_id to trigger_events (dedup FK) ────────────────────────────
ALTER TABLE trigger_events
    ADD COLUMN IF NOT EXISTS claim_id INTEGER
        REFERENCES claims (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_trigger_events_unprocessed
    ON trigger_events (status, eligible_for_claim);


-- ─── 6. Create wallets table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    balance     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wallets_user_id UNIQUE (user_id),
    CONSTRAINT ck_wallets_balance_non_negative CHECK (balance >= 0)
);


-- ─── 7. Create wallet_transactions table (idempotency log) ───────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    claim_id   INTEGER NOT NULL REFERENCES claims (id) ON DELETE CASCADE,
    amount     NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wallet_transactions_claim_id UNIQUE (claim_id)
);

CREATE INDEX IF NOT EXISTS ix_wallet_transactions_user_id ON wallet_transactions (user_id);


-- ─── 8. Add source column to claims ─────────────────────────────────────────
-- Distinguishes auto (TriggerEngine) vs manual (API) claim origin.
ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual';


-- ─── 9. Back-fill wallets for existing users ──────────────────────────────────
-- Creates a zero-balance wallet for every user that doesn't have one yet.
INSERT INTO wallets (user_id, balance, updated_at)
SELECT u.id, 0.00, NOW()
FROM   users u
WHERE  NOT EXISTS (SELECT 1 FROM wallets w WHERE w.user_id = u.id);


-- =============================================================================
-- Verification queries (run after migration to confirm success)
-- =============================================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_policy_change_at';
-- SELECT enum_range(NULL::claimstatus);   -- should include 'triggered' and 'paid'
-- SELECT COUNT(*) FROM wallets;           -- should equal COUNT(*) FROM users
-- SELECT COUNT(*) FROM wallet_transactions;
-- SELECT DISTINCT source FROM claims;     -- should show 'manual' for existing, 'auto' for new
