package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record TemperatureResponse(UUID id, Instant occurredAt, Integer temperatureCelsiusX10, UUID authorId) {
}
