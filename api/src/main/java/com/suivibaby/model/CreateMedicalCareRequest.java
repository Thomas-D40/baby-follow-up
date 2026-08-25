package com.suivibaby.model;

import java.time.Instant;

// careType is mandatory: null (absent field) is rejected by the service with "Type de soin inconnu.".
// A string outside the enum never reaches the service — Jackson rejects it at deserialization with a
// 400, same as StoolConsistency and MilkType.
public record CreateMedicalCareRequest(Instant occurredAt, CareType careType) {
}
