package com.suivibaby.model;

import java.time.LocalDate;
import java.util.List;
public record TotalsSeriesResponse(SeriesBucket bucket, LocalDate from, LocalDate to,
                                   List<SeriesPoint> points) {
}
