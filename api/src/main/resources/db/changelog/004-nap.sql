--liquibase formatted sql

--changeset tom:004-nap
-- Épic 4 (US4.1/4.2) : sieste = un enregistrement, ouvert au début, mis à jour à la fin (D7 / D4-A).
-- baby_id FK ON DELETE CASCADE (un bébé supprimé efface ses siestes) ; identifiants snake_case anglais.
CREATE TABLE nap (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id     UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,    -- cascade comme bottle_feeding
    start_at    TIMESTAMPTZ NOT NULL,                                    -- instant UTC (D3-D / D4-H)
    end_at      TIMESTAMPTZ,                                             -- NULL tant que la sieste est ouverte
    author_id   UUID NOT NULL REFERENCES app_user(id),                  -- celui qui a démarré (D4-I, traçant) ; RESTRICT
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

--changeset tom:004-nap-unique-open
-- D6 Cas C / D4-C : au plus UNE sieste ouverte par bébé (garantie en base → 409 sur double-start).
-- Référent unique de /end et /reopen ; anti-doublon serveur gratuit. NON négociable.
CREATE UNIQUE INDEX uq_open_nap ON nap (baby_id) WHERE end_at IS NULL;

--changeset tom:004-nap-index-time
-- Liste keyset (D3-J / D4-L) + future vue calendrier (Épic 6) : tri start_at DESC, id en tie-breaker.
-- Sert aussi à reopen (D4-E : « la dernière » = ORDER BY start_at DESC, id DESC LIMIT 1).
CREATE INDEX idx_nap_baby_time ON nap (baby_id, start_at DESC, id DESC);
