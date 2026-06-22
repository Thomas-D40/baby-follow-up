package com.suivibaby.model;

import java.util.List;

public record StoolPage(List<StoolResponse> items, String nextCursor) {
}
