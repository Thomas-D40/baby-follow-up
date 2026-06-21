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

/**
 * Vue calendrier d'un bébé (Épic 6) — <strong>lecture seule</strong>, agrège sans taper les repos
 * directement (D6-B) : délègue aux services propriétaires ({@code BottleFeeding}/{@code Nap}/{@code Stool}),
 * qui gardent chacun leur {@code assertLinked} (D6-E). Bornes de jour en <strong>Europe/Paris en dur</strong>
 * (D6-D) via {@code java.time} (offset DST correct), en intervalles semi-ouverts {@code [from, to)} (D6-C).
 * La vue {@code calendar_event} UNION ALL a été <strong>abandonnée</strong> (D6-A) : trois requêtes typées
 * fusionnées ici. Aucune écriture, aucune pagination (journée bornée — §1 du plan).
 */
@ApplicationScoped
public class CalendarService {

    /** Fuseau pinné (D6-D) : deux parents en France voient le même découpage de jour. */
    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    @Inject
    BottleFeedingService bottleFeedingService;

    @Inject
    NapService napService;

    @Inject
    StoolService stoolService;

    @Inject
    CalendarMapper calendarMapper;

    /**
     * Événements d'un jour (US6.1), liste chrono unique triée par heure ASC. {@code date} absente =
     * aujourd'hui (Paris), malformée → 400. Le 1ᵉʳ sous-service appelé lève 404 si non lié (D6-E) ;
     * lié + journée vide = 200 liste vide.
     */
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

    /**
     * Totaux quotidiens (US6.3) : lait sommé, sommeil clippé à la fenêtre (D6-F/G), selles comptées.
     * Mêmes bornes Paris et mêmes prédicats que {@link #eventsOfDay}. Non lié → 404 (D6-E, via le 1ᵉʳ appel).
     */
    public DailyTotalsResponse dailyTotals(UUID userId, UUID babyId, String date) {
        LocalDate day = resolveDate(date);
        Instant from = day.atStartOfDay(PARIS).toInstant();
        Instant to = day.plusDays(1).atStartOfDay(PARIS).toInstant();

        int totalMilkMl = bottleFeedingService.totalMilkForDay(userId, babyId, from, to);
        long totalSleepMinutes = napService.sleepMinutesForDay(userId, babyId, from, to);
        long stoolCount = stoolService.countForDay(userId, babyId, from, to);
        return new DailyTotalsResponse(day, totalMilkMl, totalSleepMinutes, stoolCount);
    }

    /** {@code date} absente/vide → aujourd'hui (Paris, D6-D) ; format ≠ YYYY-MM-DD → 400. */
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
