package com.suivibaby.model;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record LinkCaregiverRequest(@NotNull UUID userId) {
}
