package com.suivibaby.model;

import java.util.List;

public record UrinePage(List<UrineResponse> items, String nextCursor) {
}
