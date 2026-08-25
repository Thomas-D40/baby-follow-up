package com.suivibaby.service;

import com.suivibaby.model.CareType;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.NotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

// Guard on the requireLinked of the FOUR recap reads that have NO route of their own: they are only
// ever reached through CalendarService (daily-totals / events), which calls bottleFeedingService
// FIRST. That neighbour already throws 404 on an unlinked baby, so the controller-level isolation
// tests (DailyTotalsTest, CalendarEventsTest) stay green even if these four lose their requireLinked
// — and the @Nested MaxForDay milestones go through the repository via TestDataFactory, which
// short-circuits the service entirely.
//
// Hence a direct call on the SERVICE, injected, with no HTTP in the way: here the only thing that can
// produce the 404 is the guard under test. Each test also asserts the same read succeeding for the
// LINKED caregiver, so a blanket failure cannot pass for isolation.
//
// @Transactional on the test methods: these reads are not transactional themselves and a bare test
// method holds no session (cf. TestDataFactory.maxTemperatureForDay).
@QuarkusTest
class MedicalReadIsolationTest {

    static final String PWD = "medical-read-isolation-pwd-123";
    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    static final Instant FROM = ZonedDateTime.of(2026, 7, 15, 0, 0, 0, 0, PARIS).toInstant();
    static final Instant TO = ZonedDateTime.of(2026, 7, 16, 0, 0, 0, 0, PARIS).toInstant();

    @Inject
    TestDataFactory data;

    @Inject
    TemperatureService temperatureService;

    @Inject
    MedicalCareService medicalCareService;

    private record Fixture(UUID owner, UUID intruder, UUID babyId) {
    }

    // One reading (39,1 °C) + one eye care + one nose care on 2026-07-15, on a baby the intruder is
    // NOT linked to.
    private Fixture seed(String prefix) {
        UUID owner = data.createActiveParent(data.uniqueEmail(prefix + "-owner"), PWD);
        UUID babyId = data.createBaby("Bébé-" + prefix);
        data.link(owner, babyId);
        data.createTemperature(babyId, owner, ZonedDateTime.of(2026, 7, 15, 9, 0, 0, 0, PARIS).toInstant(), 391);
        data.createMedicalCare(babyId, owner, CareType.eye,
                ZonedDateTime.of(2026, 7, 15, 10, 0, 0, 0, PARIS).toInstant());
        data.createMedicalCare(babyId, owner, CareType.nose,
                ZonedDateTime.of(2026, 7, 15, 11, 0, 0, 0, PARIS).toInstant());
        UUID intruder = data.createActiveParent(data.uniqueEmail(prefix + "-intruder"), PWD);
        return new Fixture(owner, intruder, babyId);
    }

    @Test
    @Transactional
    @DisplayName("Scénario : TemperatureService.listForDay sur un bébé non lié → 404 (et OK pour le lié)")
    void temperature_list_for_day_bebe_non_lie() {
        Fixture f = seed("temp-list");

        assertThrows(NotFoundException.class,
                () -> temperatureService.listForDay(f.intruder(), f.babyId(), FROM, TO));
        assertEquals(1, temperatureService.listForDay(f.owner(), f.babyId(), FROM, TO).size());
    }

    @Test
    @Transactional
    @DisplayName("Scénario : TemperatureService.maxForDay sur un bébé non lié → 404 (et OK pour le lié)")
    void temperature_max_for_day_bebe_non_lie() {
        Fixture f = seed("temp-max");

        assertThrows(NotFoundException.class,
                () -> temperatureService.maxForDay(f.intruder(), f.babyId(), FROM, TO));
        assertEquals(391, temperatureService.maxForDay(f.owner(), f.babyId(), FROM, TO).intValue());
    }

    @Test
    @Transactional
    @DisplayName("Scénario : MedicalCareService.listForDay sur un bébé non lié → 404 (et OK pour le lié)")
    void soin_list_for_day_bebe_non_lie() {
        Fixture f = seed("care-list");

        assertThrows(NotFoundException.class,
                () -> medicalCareService.listForDay(f.intruder(), f.babyId(), FROM, TO));
        assertEquals(2, medicalCareService.listForDay(f.owner(), f.babyId(), FROM, TO).size());
    }

    @Test
    @Transactional
    @DisplayName("Scénario : MedicalCareService.countForDay sur un bébé non lié → 404 sur LES DEUX types")
    void soin_count_for_day_bebe_non_lie() {
        Fixture f = seed("care-count");

        // The two chips 👁/👃 are two distinct calls: both must be guarded.
        assertThrows(NotFoundException.class,
                () -> medicalCareService.countForDay(f.intruder(), f.babyId(), CareType.eye, FROM, TO));
        assertThrows(NotFoundException.class,
                () -> medicalCareService.countForDay(f.intruder(), f.babyId(), CareType.nose, FROM, TO));
        assertEquals(1, medicalCareService.countForDay(f.owner(), f.babyId(), CareType.eye, FROM, TO));
        assertEquals(1, medicalCareService.countForDay(f.owner(), f.babyId(), CareType.nose, FROM, TO));
    }
}
