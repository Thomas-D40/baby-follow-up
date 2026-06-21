package com.suivibaby.model;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** Parent↔baby linking payload (US1.4). */
public record LinkCaregiverRequest(@NotNull UUID userId) {
}
