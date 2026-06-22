package com.suivibaby.service;

import com.suivibaby.mapper.CalendarMapper;
import com.suivibaby.model.CalendarEventResponse;
import com.suivibaby.model.DailyTotalsResponse;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class CalendarService {

    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    @Inject
    BottleFeedingService bottleFeedingService;

    @Inject
    NapService napService;

    @Inject
    StoolService stoolService;

    @Inject
    CalendarMapper calendarMapper;

    public List<CalendarEventResponse> eventsOfDay(UUID userId, UUID babyId, String date) {
        LocalDate day = resolveDate(date);
        Instant from = day.atStartOfDay(PARIS).toInstant();
        Instant to = day.plusDays(1).atStartOfDay(PARIS).toInstant();

        List<CalendarEventResponse> events = new ArrayList<>();
        bottleFeedingService.listForDay(userId, babyId, from, to).forEach(b -> events.add(calendarMapper.fromBottle(b)));
        napService.listForDay(userId, babyId, from, to).forEach(n -> events.add(calendarMapper.fromNap(n)));
        stoolService.listForDay(userId, babyId, from, to).forEach(s -> events.add(calendarMapper.fromStool(s)));

        events.sort(Comparator.comparing(CalendarEventResponse::startAt).thenComparing(CalendarEventResponse::id));
        return events;
    }

    public DailyTotalsResponse dailyTotals(UUID userId, UUID babyId, String date) {
        LocalDate day = resolveDate(date);
        Instant from = day.atStartOfDay(PARIS).toInstant();
        Instant to = day.plusDays(1).atStartOfDay(PARIS).toInstant();

        int totalMilkMl = bottleFeedingService.totalMilkForDay(userId, babyId, from, to);
        long totalSleepMinutes = napService.sleepMinutesForDay(userId, babyId, from, to);
        long stoolCount = stoolService.countForDay(userId, babyId, from, to);
        return new DailyTotalsResponse(day, totalMilkMl, totalSleepMinutes, stoolCount);
    }

    private LocalDate resolveDate(String date) {
        if (date == null || date.isBlank()) {
            return LocalDate.now(PARIS);
        }
        try {
            return LocalDate.parse(date);
        } catch (DateTimeParseException e) {
            throw new BadRequestException("Date invalide (format attendu YYYY-MM-DD).");
        }
    }
}
