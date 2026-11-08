--liquibase formatted sql

--changeset tom:014-dish
-- Epic 18 (US18.4): the shared dish list. First table shared by ALL users (D18-R): no baby_id.
-- normalized_label is computed in Java (DishLabels.normalize: accents stripped, lower case, blanks
-- collapsed) and carries the uniqueness rule of D18-Z; the substring search runs on it (D18-AE).
-- Meals never reference this table (D18-Q).
CREATE TABLE dish (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label            TEXT NOT NULL,
    normalized_label TEXT NOT NULL,
    author_id        UUID NOT NULL REFERENCES app_user(id),   -- RESTRICT like every author_id
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dish_normalized_label UNIQUE (normalized_label)
);
