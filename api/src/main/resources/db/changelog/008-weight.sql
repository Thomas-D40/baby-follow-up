--liquibase formatted sql

--changeset tom:008-weight
-- Épic 12 (US12.1): weight = day-state (one value per day), NOT a timestamped event (D12-A′, grilling).
-- Uniqueness (baby_id, given_on) = "one weight/day" by construction. Value in whole grams (D12-B).
CREATE TABLE weight (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id      UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,   -- cascade like the event tables
    given_on     DATE NOT NULL,                                         -- day of the weigh-in, no time (D12-A′)
    weight_grams INT  NOT NULL,                                         -- whole grams, 0 < g ≤ 30000 (D12-B)
    author_id    UUID NOT NULL REFERENCES app_user(id),                 -- last writer (D12-C′)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_weight_baby_day UNIQUE (baby_id, given_on)
);
-- No dedicated index: the UNIQUE (baby_id, given_on) constraint already creates the btree index that
-- serves reads (baby_id filter + given_on ASC sort). Same choice as vitamin_intake (007).
