--liquibase formatted sql

--changeset tom:009-urine
-- Épic 13 (US13.2) : urine = événement ponctuel horodaté (un INSERT → 201), comme stool (D5-A).
-- baby_id FK ON DELETE CASCADE (un bébé supprimé efface ses urines) ; identifiants snake_case anglais.
-- Pas de typage/consistance ni de quantité (miroir de stool sans consistency) ; pas de idempotency_key (D3-A).
CREATE TABLE urine (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id     UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,    -- cascade comme stool/bottle_feeding/nap
    occurred_at TIMESTAMPTZ NOT NULL,                                    -- instant UTC (D3-D / D5-D)
    author_id   UUID NOT NULL REFERENCES app_user(id),                  -- traçant (D5-H) ; RESTRICT (pas de suppression de compte en v1)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

--changeset tom:009-urine-index-time
-- Liste keyset (D3-J / D5-I) + future vue calendrier (UNION ALL) : tri occurred_at DESC, id en tie-breaker.
CREATE INDEX idx_urine_baby_time ON urine (baby_id, occurred_at DESC, id DESC);
