package com.suivibaby.model;

import java.time.Instant;

public record UpdateSolidMealRequest(Instant occurredAt, String dish, MealPortion portion) {
}
