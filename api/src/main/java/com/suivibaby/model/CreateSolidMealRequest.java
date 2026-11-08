package com.suivibaby.model;

import java.time.Instant;

public record CreateSolidMealRequest(Instant occurredAt, String dish, MealPortion portion) {
}
