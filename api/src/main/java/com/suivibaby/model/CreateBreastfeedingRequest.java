package com.suivibaby.model;

import java.time.Instant;

public record CreateBreastfeedingRequest(Instant occurredAt, BreastSide side, Integer durationMinutes) {
}
