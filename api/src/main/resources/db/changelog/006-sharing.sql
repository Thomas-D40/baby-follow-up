--liquibase formatted sql

--changeset tom:006-baby-caregiver-owner
-- Épic 8 : propriété PAR bébé (D8-G). Boolean, pas enum (YAGNI).
-- DEFAULT true sert AUSSI de backfill des caregivers existants (D8-H) : avant cet épic,
-- tout caregiver lié était propriétaire de plein droit.
-- ⚠️ Le DEFAULT true reste dangereux pour les nouvelles lignes : le code de l'acceptation
-- d'invitation passe TOUJOURS is_owner = false EXPLICITEMENT (jamais de DEFAULT implicite, D8-F/R5).
ALTER TABLE baby_caregiver ADD COLUMN is_owner BOOLEAN NOT NULL DEFAULT true;

--changeset tom:006-baby-invitation
-- Invitation hors-bande, token usage-unique 3j — calque activation_token (002, D8-C).
CREATE TABLE baby_invitation (
    token        UUID PRIMARY KEY,
    baby_id      UUID NOT NULL REFERENCES baby(id)      ON DELETE CASCADE,  -- une invit ne survit pas au bébé
    created_by   UUID NOT NULL REFERENCES app_user(id),                     -- owner émetteur (traçant)
    expires_at   TIMESTAMPTZ NOT NULL,                                      -- now + 3 jours (D8-C)
    used_at      TIMESTAMPTZ,                                               -- NULL tant que non consommé
    accepted_by  UUID          REFERENCES app_user(id)                      -- qui a accepté (NULL avant)
);

--changeset tom:006-baby-invitation-active-index
-- Au plus une invitation ACTIVE (non consommée) par bébé — calque uq_active_activation_token.
-- NB: l'expiration n'étant pas exprimable dans un index partiel (now() non immutable),
-- l'unicité porte sur used_at IS NULL ; l'expiration est vérifiée applicativement à l'acceptation.
CREATE UNIQUE INDEX uq_active_baby_invitation
    ON baby_invitation (baby_id) WHERE used_at IS NULL;
