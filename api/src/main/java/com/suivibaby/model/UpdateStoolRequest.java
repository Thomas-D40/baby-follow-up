package com.suivibaby.model;

import java.time.Instant;

public record UpdateStoolRequest(Instant occurredAt, StoolConsistency consistency) {
}
