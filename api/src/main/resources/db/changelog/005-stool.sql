--liquibase formatted sql

--changeset tom:005-stool
-- Épic 5 (US5.1) : selle = événement ponctuel (un INSERT → 201), comme bottle_feeding (D5-A).
-- baby_id FK ON DELETE CASCADE (un bébé supprimé efface ses selles) ; identifiants snake_case anglais.
-- Couleur volontairement absente du périmètre v1 (D5-F) ; pas de idempotency_key (D5-G / D3-A).
CREATE TABLE stool (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id     UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,    -- cascade comme bottle_feeding/nap
    occurred_at TIMESTAMPTZ NOT NULL,                                    -- instant UTC (D3-D / D5-D)
    consistency TEXT,                                                    -- nullable: hard|soft|liquid (enum applicatif, D5-E)
    author_id   UUID NOT NULL REFERENCES app_user(id),                  -- traçant (D5-H) ; RESTRICT (pas de suppression de compte en v1)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

--changeset tom:005-stool-index-time
-- Liste keyset (D3-J / D5-I) + future vue calendrier (Épic 6, UNION ALL) : tri occurred_at DESC, id en tie-breaker.
CREATE INDEX idx_stool_baby_time ON stool (baby_id, occurred_at DESC, id DESC);
