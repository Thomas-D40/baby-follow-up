package com.suivibaby.model;

import java.time.LocalDate;

public record SeriesPoint(LocalDate date, int totalMilkMl,
                          long totalSleepMinutes, long stoolCount) {
}
