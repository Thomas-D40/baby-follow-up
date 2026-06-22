package com.suivibaby.model;

import java.time.Instant;

public record UpdateBottleFeedingRequest(Instant occurredAt, Integer quantityMl, MilkType milkType) {
}
