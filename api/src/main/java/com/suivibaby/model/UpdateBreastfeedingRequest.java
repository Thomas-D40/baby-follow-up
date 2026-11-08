package com.suivibaby.model;

import java.time.Instant;

public record UpdateBreastfeedingRequest(Instant occurredAt, BreastSide side, Integer durationMinutes) {
}
