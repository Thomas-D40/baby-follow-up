--liquibase formatted sql

--changeset tom:001-init-schema
-- Base "Accounts & access" schema (see Schema/Modele-de-donnees.md).
-- Convention: DB identifiers in snake_case English; business prose in French.
-- Event tables (bottle_feeding, nap, stool) come with their epics (3→5).

CREATE TABLE app_user (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT,                 -- nullable while the account is "pending activation" (US1.1/US1.2)
    first_name    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE baby (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name  TEXT NOT NULL,
    birth_date  DATE,
    sex         TEXT,                   -- nullable
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Binary N-N parent↔baby link: no caregiver-role column (D-E).
-- Only app_user.role (added in 002-auth) distinguishes admin|parent.
CREATE TABLE baby_caregiver (
    app_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    baby_id     UUID NOT NULL REFERENCES baby(id)     ON DELETE CASCADE,
    PRIMARY KEY (app_user_id, baby_id)
);
