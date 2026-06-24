package com.suivibaby.model;

import java.time.LocalDate;

public record SeriesPoint(LocalDate date, long bottleCount, int totalMilkMl,
                          long totalSleepMinutes, long stoolCount) {
}
