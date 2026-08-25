package com.suivibaby.service;

import com.suivibaby.model.BottleFeedingResponse;
import com.suivibaby.model.NapResponse;
import com.suivibaby.model.SeriesBucket;
import com.suivibaby.model.SeriesPoint;
import com.suivibaby.model.StoolResponse;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

public final class SeriesAggregator {

    private SeriesAggregator() {
    }

    /** Un bucket : sa date de début (locale) et son intervalle d'instants {@code [start, end)}. */
    public record Bucket(LocalDate date, Instant start, Instant end) {
    }

    /**
     * Découpe {@code [from, to]} (dates locales incluses) en buckets de granularité {@code unit},
     * alignés sur la frontière naturelle ≤ from (jour : from).
     */
    public static List<Bucket> buckets(LocalDate from, LocalDate to, SeriesBucket unit, ZoneId zone) {
        List<Bucket> result = new ArrayList<>();
        LocalDate cursor = alignStart(from, unit);
        while (!cursor.isAfter(to)) {
            LocalDate next = advance(cursor, unit);
            result.add(new Bucket(cursor,
                    cursor.atStartOfDay(zone).toInstant(),
                    next.atStartOfDay(zone).toInstant()));
            cursor = next;
        }
        return result;
    }

    // Both switches stay exhaustive over SeriesBucket on purpose: adding a granularity back makes
    // the compiler point at every site that has to handle it (Épic 14, D14-H).
    private static LocalDate alignStart(LocalDate date, SeriesBucket unit) {
        return switch (unit) {
            case day -> date;
        };
    }

    private static LocalDate advance(LocalDate date, SeriesBucket unit) {
        return switch (unit) {
            case day -> date.plusDays(1);
        };
    }

    /**
     * Agrège les événements sur la grille de buckets fournie. {@code now} sert à clipper les
     * siestes encore ouvertes (end null), comme {@code COALESCE(end_at, now())} côté SQL.
     */
    public static List<SeriesPoint> aggregate(List<Bucket> buckets,
                                              List<BottleFeedingResponse> bottles,
                                              List<NapResponse> naps,
                                              List<StoolResponse> stools,
                                              Instant now) {
        List<SeriesPoint> points = new ArrayList<>(buckets.size());
        for (Bucket bucket : buckets) {
            int totalMilkMl = 0;
            for (BottleFeedingResponse bottle : bottles) {
                if (within(bottle.occurredAt(), bucket)) {
                    if (bottle.quantityMl() != null) {
                        totalMilkMl += bottle.quantityMl();
                    }
                }
            }

            long stoolCount = 0;
            for (StoolResponse stool : stools) {
                if (within(stool.occurredAt(), bucket)) {
                    stoolCount++;
                }
            }

            long sleepSeconds = 0;
            for (NapResponse nap : naps) {
                sleepSeconds += clippedSleepSeconds(nap, bucket, now);
            }
            long totalSleepMinutes = Math.round(sleepSeconds / 60.0);

            points.add(new SeriesPoint(bucket.date(), totalMilkMl,
                    totalSleepMinutes, stoolCount));
        }
        return points;
    }

    private static boolean within(Instant instant, Bucket bucket) {
        return !instant.isBefore(bucket.start()) && instant.isBefore(bucket.end());
    }

    /** Recouvrement (en secondes) de la sieste avec le bucket, clippé aux bornes {@code [start, end)}. */
    private static long clippedSleepSeconds(NapResponse nap, Bucket bucket, Instant now) {
        Instant napEnd = nap.endAt() == null ? now : nap.endAt();
        Instant effStart = max(nap.startAt(), bucket.start());
        Instant effEnd = min(napEnd, bucket.end());
        if (!effEnd.isAfter(effStart)) {
            return 0;
        }
        return effEnd.getEpochSecond() - effStart.getEpochSecond();
    }

    private static Instant max(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }
}
