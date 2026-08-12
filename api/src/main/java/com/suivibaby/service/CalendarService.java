package com.suivibaby.service;

import com.suivibaby.mapper.CalendarMapper;
import com.suivibaby.model.BottleFeedingResponse;
import com.suivibaby.model.CalendarEventResponse;
import com.suivibaby.model.DailyTotalsResponse;
import com.suivibaby.model.NapResponse;
import com.suivibaby.model.SeriesBucket;
import com.suivibaby.model.SeriesPoint;
import com.suivibaby.model.StoolResponse;
import com.suivibaby.model.TotalsSeriesResponse;
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

        // Récap du jour en ordre anté-chronologique (US11.1) : dernier événement en haut. Tie-break
        // déterministe sur l'id, l'ensemble étant inversé (`reversed()`) pour le tri décroissant.
        events.sort(Comparator.comparing(CalendarEventResponse::startAt).thenComparing(CalendarEventResponse::id).reversed());
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

    /** Plafond de buckets retournés : garde-fou contre une plage abusive (ex. année en jours). */
    static final int MAX_BUCKETS = 366;

    public TotalsSeriesResponse totalsSeries(UUID userId, UUID babyId, String fromParam,
                                             String toParam, String bucketParam) {
        SeriesBucket bucket = SeriesBucket.fromParam(bucketParam);
        LocalDate from = requireDate(fromParam, "from");
        LocalDate to = requireDate(toParam, "to");
        if (to.isBefore(from)) {
            throw new BadRequestException("Plage invalide : to antérieur à from.");
        }

        List<SeriesAggregator.Bucket> buckets = SeriesAggregator.buckets(from, to, bucket, PARIS);
        if (buckets.size() > MAX_BUCKETS) {
            throw new BadRequestException("Plage trop large (max " + MAX_BUCKETS + " buckets).");
        }

        // Bornes [from, to) couvrant toute la plage : une requête par type (isolation 404 héritée),
        // puis bucketisation + clipping en mémoire (cf. SeriesAggregator).
        Instant rangeFrom = buckets.get(0).start();
        Instant rangeTo = buckets.get(buckets.size() - 1).end();
        List<BottleFeedingResponse> bottles = bottleFeedingService.listForDay(userId, babyId, rangeFrom, rangeTo);
        List<NapResponse> naps = napService.listForDay(userId, babyId, rangeFrom, rangeTo);
        List<StoolResponse> stools = stoolService.listForDay(userId, babyId, rangeFrom, rangeTo);

        List<SeriesPoint> points = SeriesAggregator.aggregate(buckets, bottles, naps, stools, Instant.now());
        return new TotalsSeriesResponse(bucket, from, to, points);
    }

    private LocalDate requireDate(String date, String field) {
        if (date == null || date.isBlank()) {
            throw new BadRequestException("Paramètre " + field + " requis (format YYYY-MM-DD).");
        }
        try {
            return LocalDate.parse(date);
        } catch (DateTimeParseException e) {
            throw new BadRequestException("Paramètre " + field + " invalide (format attendu YYYY-MM-DD).");
        }
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
