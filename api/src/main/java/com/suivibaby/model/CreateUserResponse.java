package com.suivibaby.model;

import java.util.UUID;

/** Result of an account creation / activation-link regeneration (US1.1, US1.2). */
public record CreateUserResponse(UUID userId, String activationLink) {
}
