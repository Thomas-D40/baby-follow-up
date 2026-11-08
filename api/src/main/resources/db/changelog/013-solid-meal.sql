--liquibase formatted sql

--changeset tom:013-solid-meal
-- Epic 18 (US18.3): a diversification meal = a timestamped event with a dish and an optional portion.
-- `dish` is free text copied at entry time, NOT a foreign key to the shared `dish` table: managing
-- the dish list must never alter a past meal (D18-Q).
CREATE TABLE solid_meal (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id     UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,  -- cascade like every event table
    occurred_at TIMESTAMPTZ NOT NULL,
    dish        TEXT NOT NULL,                                        -- edges stripped, inner blanks collapsed, <= 60 chars (service)
    portion     TEXT,                                                 -- nullable: tasted|half|all, application enum (D18-O)
    author_id   UUID NOT NULL REFERENCES app_user(id),                -- traceability; RESTRICT (no account deletion in v1)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

--changeset tom:013-solid-meal-index-time
-- Keyset listing + day slice of the recap.
CREATE INDEX idx_solid_meal_baby_time ON solid_meal (baby_id, occurred_at DESC, id DESC);
