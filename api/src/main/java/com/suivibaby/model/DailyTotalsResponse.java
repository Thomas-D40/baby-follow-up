package com.suivibaby.model;

import java.time.LocalDate;

// `maxTemperatureCelsiusX10` is the first BOXED numeric field of this record, and the boxing is the
// contract (D15-K): null means NO READING AT ALL that day, and the front must then render no 🌡
// chip — neither a 0 nor a dash. An absent measurement is not a zero, and 0 °C would be a lie.
// The two care counts are deliberately NOT nullable: a count of 0 is information ("no nose wash
// today"), so they stay primitive longs.
public record DailyTotalsResponse(LocalDate date, int totalMilkMl, long totalSleepMinutes,
                                  long stoolCount, long urineCount,
                                  Integer maxTemperatureCelsiusX10,
                                  long eyeCareCount, long noseCareCount) {
}
