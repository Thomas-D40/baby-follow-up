package com.suivibaby.model;

import java.time.LocalDate;
import java.util.List;

public record VitaminDayResponse(LocalDate date, List<VitaminState> items) {
}
