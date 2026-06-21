package com.suivibaby.model;

/**
 * Baby sex (US2.1, D2-F). Closed enum validated by the ORM/Java layer; the DB column stays
 * {@code TEXT} (no Postgres CHECK, aligned with {@code app_user.role}). Lowercase constants so
 * both the stored value and the JSON serialization read {@code "male"}/{@code "female"}. The field
 * is optional: {@code null} means "not specified".
 */
public enum Sex {
    male,
    female
}
