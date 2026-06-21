--liquibase formatted sql

--changeset tom:003-bottle-feeding
-- Épic 3 (US3.1) : 1ʳᵉ table d'événement. Solde deux contrats forward de l'Épic 2 :
--   D2-H : baby_id FK ON DELETE CASCADE (un bébé supprimé efface ses événements)
--   D2-D : baby_id revalidé sur écriture (path /api/babies/{babyId}/…), enforcé côté service (D3-C)
-- Convention : identifiants DB snake_case anglais ; prose métier en français.
CREATE TABLE bottle_feeding (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id         UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,   -- D2-H
    occurred_at     TIMESTAMPTZ NOT NULL,                                   -- instant UTC (D3-D)
    quantity_ml     INT NOT NULL,                                           -- borné applicativement 0<q≤2000 (D3-E)
    milk_type       TEXT,                                                   -- nullable: breast|formula (enum applicatif, D3-F)
    author_id       UUID NOT NULL REFERENCES app_user(id),                  -- traçant (D3-I) ; RESTRICT (pas de suppression de compte en v1)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index calendrier / GET paginé keyset (D3-B/D3-J) — id en tie-breaker pour un curseur stable.
CREATE INDEX idx_bottle_feeding_baby_time ON bottle_feeding (baby_id, occurred_at DESC, id DESC);
