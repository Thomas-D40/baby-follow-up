package com.suivibaby.model;

import java.time.Instant;

// `addToDishes` absent in the JSON means false.
public record CreateSolidMealRequest(Instant occurredAt, String dish, MealPortion portion,
                                     boolean addToDishes) {
}
