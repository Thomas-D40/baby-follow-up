package com.suivibaby.model;

import java.util.List;

public record MedicalCarePage(List<MedicalCareResponse> items, String nextCursor) {
}
