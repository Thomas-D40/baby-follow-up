package com.suivibaby.model;

import java.util.List;

public record BreastfeedingPage(List<BreastfeedingResponse> items, String nextCursor) {
}
