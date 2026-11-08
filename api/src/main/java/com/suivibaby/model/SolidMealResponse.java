package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record SolidMealResponse(UUID id, Instant occurredAt, String dish, MealPortion portion, UUID authorId) {
}
