package com.suivibaby.model;

import java.util.List;

public record SolidMealPage(List<SolidMealResponse> items, String nextCursor) {
}
