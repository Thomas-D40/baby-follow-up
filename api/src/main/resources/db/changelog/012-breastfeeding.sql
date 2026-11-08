--liquibase formatted sql

--changeset tom:012-breastfeeding
-- Epic 18 (US18.2): a breastfeeding session = a timestamped event with an optional side and an
-- optional duration. Never counted in millilitres (D18-C), hence a table of its own rather than
-- columns on bottle_feeding (D18-AA).
CREATE TABLE breastfeeding (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id          UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,  -- cascade like every event table
    occurred_at      TIMESTAMPTZ NOT NULL,                                 -- start of the feed (D18-M)
    side             TEXT,                                                 -- nullable: left|right, application enum (D18-K)
    duration_minutes INT,                                                  -- nullable, 1..120 enforced by the service (D18-M)
    author_id        UUID NOT NULL REFERENCES app_user(id),                -- traceability; RESTRICT (no account deletion in v1)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

--changeset tom:012-breastfeeding-index-time
-- Keyset listing + day slice of the recap + "last feed" reminder.
CREATE INDEX idx_breastfeeding_baby_time ON breastfeeding (baby_id, occurred_at DESC, id DESC);
