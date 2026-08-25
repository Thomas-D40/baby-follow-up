package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

// One field per NATURE of detail, never a recycled one (D15-F′). In particular `quantityMl` is
// typed millilitres by contract and read by the bottle row label (`describeEvent`) — the 🍼 chip
// reads `totals.totalMilkMl`, not this field. Carrying a temperature in it would break the bottle
// label SILENTLY. Hence a dedicated `temperatureCelsiusX10`, null for every other event type.
// No `careType` field: medical cares are two distinct calendar types (eye_care / nose_care), so
// nothing reads it here. MedicalCareResponse keeps its own `careType` — that is the resource DTO.
public record CalendarEventResponse(CalendarEventType type, UUID id, Instant startAt, Instant endAt,
                                    UUID authorId, Integer quantityMl, MilkType milkType,
                                    StoolConsistency consistency, Integer temperatureCelsiusX10) {
}
