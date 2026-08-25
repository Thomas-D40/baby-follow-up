--liquibase formatted sql

--changeset tom:010-temperature
-- Epic 15 (US15.1): temperature = a timestamped event CARRYING A VALUE (D15-I). Not a day-state:
-- several readings a day are the norm during a fever, and the time of the reading is part of the
-- information ("38.4 °C at 3am" ≠ "38.4 °C at 4pm"), so the vitamin/weight one-row-per-day upsert
-- would overwrite the previous reading.
-- Value stored as a whole INT in tenths of a degree (D15-J), never NUMERIC/float: same convention as
-- bottle_feeding.quantity_ml and weight.weight_grams. Bounds 300..430 are enforced in the service.
CREATE TABLE temperature (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id                 UUID NOT NULL REFERENCES baby(id) ON DELETE CASCADE,  -- cascade like every event table
    occurred_at             TIMESTAMPTZ NOT NULL,                                 -- UTC instant (D3-D / D5-D)
    temperature_celsius_x10 INT NOT NULL,                                         -- tenths of a degree Celsius, 300 ≤ t ≤ 430 (D15-J)
    author_id               UUID NOT NULL REFERENCES app_user(id),                -- traceability; RESTRICT (no account deletion in v1)
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

--changeset tom:010-temperature-index-time
-- Keyset listing (D3-J / D5-I) and day slice of the recap: both filter on baby_id then sort on
-- occurred_at, with id as the tie-breaker.
CREATE INDEX idx_temperature_baby_time ON temperature (baby_id, occurred_at DESC, id DESC);
