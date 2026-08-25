package com.suivibaby.model;

import java.util.List;

public record TemperaturePage(List<TemperatureResponse> items, String nextCursor) {
}
