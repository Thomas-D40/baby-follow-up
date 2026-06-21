--liquibase formatted sql

--changeset tom:002-auth-role
-- US1.1: account role (admin | parent). Default 'parent' (D-E: no caregiver role).
ALTER TABLE app_user ADD COLUMN role TEXT NOT NULL DEFAULT 'parent';

--changeset tom:002-auth-activation-token
-- US1.2: single-use activation token + expiration (password definition).
CREATE TABLE activation_token (
    token        UUID PRIMARY KEY,
    app_user_id  UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ              -- NULL until the token has been used
);

-- At most one ACTIVE (unused) token per user: regeneration invalidates the previous one.
CREATE UNIQUE INDEX uq_active_activation_token
    ON activation_token (app_user_id) WHERE used_at IS NULL;
