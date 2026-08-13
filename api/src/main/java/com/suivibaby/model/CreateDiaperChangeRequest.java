package com.suivibaby.model;

import java.time.Instant;

public record CreateDiaperChangeRequest(Instant occurredAt, boolean withUrine, boolean withStool,
                                        StoolConsistency consistency) {
}
