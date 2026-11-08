--liquibase formatted sql

--changeset tom:015-medication
-- Epic 19 (US19.1): one medication given = a timestamped event with a free-text name and an optional
-- free-text dosage, both stored as typed once tidied (edges stripped, inner blanks collapsed,
-- <= 60 chars, enforced by the service). The six default names live in the front only (D19-L).
CREATE TABLE medication (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id         UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,  -- cascade like every event table
    occurred_at     TIMESTAMPTZ NOT NULL,
    medication_name TEXT NOT NULL,
    dosage          TEXT,                                                 -- nullable: no dosage given (D19-K)
    author_id       UUID NOT NULL REFERENCES app_user(id),                -- traceability; RESTRICT
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

--changeset tom:015-medication-index-time
-- Keyset listing + day slice of the recap.
CREATE INDEX idx_medication_baby_time ON medication (baby_id, occurred_at DESC, id DESC);
