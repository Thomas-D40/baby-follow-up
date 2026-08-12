--liquibase formatted sql

--changeset tom:007-vitamin
-- Épic 9 (US9.1) : vitamine = état-jour idempotent (présence de ligne), PAS un événement horodaté (D9-A).
-- Ni heure (given_on DATE, D9-E), ni dose. Unicité (baby_id, vitamin_type, given_on) = anti-doublon par construction (D9-G).
CREATE TABLE vitamin_intake (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id      UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,   -- cascade comme les tables d'événement
    vitamin_type TEXT NOT NULL,                                         -- enum applicatif fermé d|k (D9-D)
    given_on     DATE NOT NULL,                                         -- jour de la prise, pas d'heure (D9-E)
    author_id    UUID NOT NULL REFERENCES app_user(id),                 -- traçant (D9-F), RESTRICT par défaut
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_vitamin_baby_type_day UNIQUE (baby_id, vitamin_type, given_on)
);
