package com.suivibaby.model;

import java.time.Instant;

// Boxed value on purpose: null ("field absent") must be told apart from 0, which the service rejects
// as out of bounds. Same convention as CreateBottleFeedingRequest.quantityMl.
public record CreateTemperatureRequest(Instant occurredAt, Integer temperatureCelsiusX10) {
}
