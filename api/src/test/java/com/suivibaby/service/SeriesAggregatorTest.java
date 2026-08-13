package com.suivibaby.service;

import com.suivibaby.model.BottleFeedingResponse;
import com.suivibaby.model.MilkType;
import com.suivibaby.model.NapResponse;
import com.suivibaby.model.SeriesBucket;
import com.suivibaby.model.SeriesPoint;
import com.suivibaby.model.StoolConsistency;
import com.suivibaby.model.StoolResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Test unitaire pur de {@link SeriesAggregator} (sans Quarkus) : grille de buckets DST-safe et
 * clipping des siestes par bucket, miroir des règles validées sur les totaux quotidiens (D6-F/G).
 */
class SeriesAggregatorTest {

    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    private static Instant paris(int y, int mo, int d, int h, int mi) {
        return ZonedDateTime.of(y, mo, d, h, mi, 0, 0, PARIS).toInstant();
    }

    private static BottleFeedingResponse bottle(Instant at, int ml) {
        return new BottleFeedingResponse(UUID.randomUUID(), at, ml, MilkType.formula, UUID.randomUUID());
    }

    private static NapResponse nap(Instant start, Instant end) {
        return new NapResponse(UUID.randomUUID(), start, end, UUID.randomUUID());
    }

    private static StoolResponse stool(Instant at) {
        return new StoolResponse(UUID.randomUUID(), at, StoolConsistency.soft, UUID.randomUUID());
    }

    @Nested
    @DisplayName("Grille de buckets")
    class Grid {

        @Test
        @DisplayName("Jour : une semaine → 7 buckets datés du lundi au dimanche")
        void jour_semaine() {
            var buckets = SeriesAggregator.buckets(
                    LocalDate.of(2026, 6, 15), LocalDate.of(2026, 6, 21), SeriesBucket.day, PARIS);
            assertEquals(7, buckets.size());
            assertEquals(LocalDate.of(2026, 6, 15), buckets.get(0).date());
            assertEquals(LocalDate.of(2026, 6, 21), buckets.get(6).date());
        }

        @Test
        @DisplayName("Mois : une année → 12 buckets, alignés sur le 1er")
        void mois_annee() {
            var buckets = SeriesAggregator.buckets(
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31), SeriesBucket.month, PARIS);
            assertEquals(12, buckets.size());
            assertEquals(LocalDate.of(2026, 1, 1), buckets.get(0).date());
            assertEquals(LocalDate.of(2026, 12, 1), buckets.get(11).date());
        }

        @Test
        @DisplayName("Semaine : le from est aligné sur le lundi précédent-ou-égal")
        void semaine_alignee_lundi() {
            // 2026-06-17 = mercredi → bucket démarre lundi 2026-06-15.
            var buckets = SeriesAggregator.buckets(
                    LocalDate.of(2026, 6, 17), LocalDate.of(2026, 6, 30), SeriesBucket.week, PARIS);
            assertEquals(LocalDate.of(2026, 6, 15), buckets.get(0).date());
        }
    }

    @Nested
    @DisplayName("Agrégation")
    class Aggregate {

        @Test
        @DisplayName("Somme le lait et compte les selles par jour")
        void lait_par_jour() {
            var buckets = SeriesAggregator.buckets(
                    LocalDate.of(2026, 6, 15), LocalDate.of(2026, 6, 16), SeriesBucket.day, PARIS);
            List<SeriesPoint> points = SeriesAggregator.aggregate(
                    buckets,
                    List.of(bottle(paris(2026, 6, 15, 9, 0), 120),
                            bottle(paris(2026, 6, 15, 13, 0), 80),
                            bottle(paris(2026, 6, 16, 8, 0), 100)),
                    List.of(),
                    List.of(stool(paris(2026, 6, 15, 10, 0))),
                    Instant.now());

            assertEquals(200, points.get(0).totalMilkMl());
            assertEquals(1, points.get(0).stoolCount());
            assertEquals(100, points.get(1).totalMilkMl());
            assertEquals(0, points.get(1).stoolCount());
        }

        @Test
        @DisplayName("Sieste 22h→8h : clippée à 2h sur J et 8h sur J+1 (buckets jour)")
        void sieste_clippee_cross_minuit() {
            var buckets = SeriesAggregator.buckets(
                    LocalDate.of(2026, 6, 15), LocalDate.of(2026, 6, 16), SeriesBucket.day, PARIS);
            List<SeriesPoint> points = SeriesAggregator.aggregate(
                    buckets, List.of(),
                    List.of(nap(paris(2026, 6, 15, 22, 0), paris(2026, 6, 16, 8, 0))),
                    List.of(), Instant.now());

            assertEquals(120, points.get(0).totalSleepMinutes());
            assertEquals(480, points.get(1).totalSleepMinutes());
        }

        @Test
        @DisplayName("Sieste à cheval sur 2 mois : clippée à chaque bucket mois")
        void sieste_clippee_cross_mois() {
            var buckets = SeriesAggregator.buckets(
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 2, 28), SeriesBucket.month, PARIS);
            // 31 janv. 23h → 1er févr. 1h : 1h sur janvier, 1h sur février.
            List<SeriesPoint> points = SeriesAggregator.aggregate(
                    buckets, List.of(),
                    List.of(nap(paris(2026, 1, 31, 23, 0), paris(2026, 2, 1, 1, 0))),
                    List.of(), Instant.now());

            assertEquals(60, points.get(0).totalSleepMinutes());
            assertEquals(60, points.get(1).totalSleepMinutes());
        }

        @Test
        @DisplayName("Sieste en cours (end null) : clippée jusqu'à now()")
        void sieste_en_cours() {
            Instant now = paris(2026, 6, 15, 10, 0);
            var buckets = SeriesAggregator.buckets(
                    LocalDate.of(2026, 6, 15), LocalDate.of(2026, 6, 15), SeriesBucket.day, PARIS);
            List<SeriesPoint> points = SeriesAggregator.aggregate(
                    buckets, List.of(),
                    List.of(nap(paris(2026, 6, 15, 9, 0), null)),
                    List.of(), now);

            assertEquals(60, points.get(0).totalSleepMinutes()); // 9h → now (10h) = 1h
        }

        @Test
        @DisplayName("Plage vide : tous les agrégats à 0")
        void plage_vide() {
            var buckets = SeriesAggregator.buckets(
                    LocalDate.of(2026, 6, 15), LocalDate.of(2026, 6, 15), SeriesBucket.day, PARIS);
            List<SeriesPoint> points = SeriesAggregator.aggregate(
                    buckets, List.of(), List.of(), List.of(), Instant.now());

            SeriesPoint p = points.get(0);
            assertEquals(0, p.totalMilkMl());
            assertEquals(0, p.totalSleepMinutes());
            assertEquals(0, p.stoolCount());
        }
    }
}
