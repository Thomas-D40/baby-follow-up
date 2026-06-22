package com.suivibaby.model;

import java.util.List;

public record BottleFeedingPage(List<BottleFeedingResponse> items, String nextCursor) {
}
