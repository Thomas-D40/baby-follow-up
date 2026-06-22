package com.suivibaby.model;

import java.time.Instant;

public record CreateBottleFeedingRequest(Instant occurredAt, Integer quantityMl, MilkType milkType) {
}
