package com.suivibaby.model;

import java.time.Instant;

public record CreateStoolRequest(Instant occurredAt, StoolConsistency consistency) {
}
