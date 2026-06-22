package com.suivibaby.model;

import java.time.Instant;

public record UpdateNapRequest(Instant startAt, Instant endAt) {
}
