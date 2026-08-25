--liquibase formatted sql

--changeset tom:011-medical-care
-- Epic 15 (US15.2): eye/nose care = a timestamped event WITHOUT a value (D15-I). A saline nose rinse
-- happens 5-8 times a day, eye care morning and evening: the spacing IS the information, so a
-- "done today" checkbox would lose the answer to "how long ago?".
-- One typed table rather than two identical stacks: care_type is a CLOSED APPLICATION enum eye|nose
-- (TEXT column + Java enum, unknown value → 400 in the service), same as milk_type, consistency and
-- vitamin_type. No CHECK constraint: this repo validates in the service, never in the schema.
-- NB: the calendar DTO exposes these rows as TWO event types (eye_care / nose_care) so the day
-- filter and the chips key on `type` like every other event; the storage stays one typed table.
CREATE TABLE medical_care (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id     UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,  -- cascade like every event table
    care_type   TEXT NOT NULL,                                        -- closed application enum eye|nose (D15-I)
    occurred_at TIMESTAMPTZ NOT NULL,                                 -- UTC instant (D3-D / D5-D)
    author_id   UUID NOT NULL REFERENCES app_user(id),                -- traceability; RESTRICT (no account deletion in v1)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

--changeset tom:011-medical-care-index-time
-- Keyset listing + day slice of the recap. The per-type day count (D15-K, two distinct chips) adds a
-- care_type predicate on top of this prefix; with ≤ 10 rows/baby/day it needs no dedicated index.
CREATE INDEX idx_medical_care_baby_time ON medical_care (baby_id, occurred_at DESC, id DESC);
