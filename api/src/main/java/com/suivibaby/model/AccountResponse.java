package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

// Admin view of an account: no hash, no token, no activation date, only the derived status.
public record AccountResponse(UUID id, String email, String firstName, String role, AccountStatus status,
                              Instant createdAt) {
}
