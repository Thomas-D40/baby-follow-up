package com.suivibaby.model;

import java.time.Instant;

// Partial patch: a null field means "leave unchanged", never "reset".
public record UpdateTemperatureRequest(Instant occurredAt, Integer temperatureCelsiusX10) {
}
