package com.suivibaby.model;

import java.util.UUID;

/** Current identity projection (US1.3). */
public record MeResponse(UUID id, String email, String firstName, String role) {
}
