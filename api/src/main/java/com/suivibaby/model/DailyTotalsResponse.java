package com.suivibaby.model;

import java.time.LocalDate;

public record DailyTotalsResponse(LocalDate date, int totalMilkMl, long totalSleepMinutes,
                                  long stoolCount, long urineCount) {
}
