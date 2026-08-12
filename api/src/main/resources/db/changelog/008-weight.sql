--liquibase formatted sql

--changeset tom:008-weight
-- Épic 12 (US12.1) : poids = état-jour (une valeur par jour), PAS un événement horodaté (D12-A′, grilling).
-- Unicité (baby_id, given_on) = « un poids/jour » par construction. Valeur en grammes entiers (D12-B).
CREATE TABLE weight (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id      UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,   -- cascade comme les tables d'événement
    given_on     DATE NOT NULL,                                         -- jour de la pesée, pas d'heure (D12-A′)
    weight_grams INT  NOT NULL,                                         -- grammes entiers, 0 < g ≤ 30000 (D12-B)
    author_id    UUID NOT NULL REFERENCES app_user(id),                 -- dernier écrivain (D12-C′)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_weight_baby_day UNIQUE (baby_id, given_on)
);
-- Pas d'index dédié : la contrainte UNIQUE (baby_id, given_on) crée déjà l'index btree qui sert
-- la lecture (filtre baby_id + tri given_on ASC). Même choix que vitamin_intake (007).
