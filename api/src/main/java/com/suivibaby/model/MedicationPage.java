package com.suivibaby.model;

import java.util.List;

public record MedicationPage(List<MedicationResponse> items, String nextCursor) {
}
