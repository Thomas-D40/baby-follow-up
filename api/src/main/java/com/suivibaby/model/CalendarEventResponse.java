package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

public record CalendarEventResponse(CalendarEventType type, UUID id, Instant startAt, Instant endAt,
                                    UUID authorId, Integer quantityMl, MilkType milkType,
                                    StoolConsistency consistency) {
}
