package com.suivibaby.model;

import java.time.LocalDate;

/**
 * Baby edit payload (D2-E). Partial update (PATCH): only non-null fields are applied. A present but
 * blank {@code firstName} is rejected (400) by the service; an invalid {@code sex} fails JSON
 * deserialization → 400.
 */
public record UpdateBabyRequest(String firstName, LocalDate birthDate, Sex sex) {
}
