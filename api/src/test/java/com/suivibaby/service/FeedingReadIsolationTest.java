package com.suivibaby.service;

import com.suivibaby.model.BreastSide;
import com.suivibaby.model.MealPortion;
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

// Guard on the requireLinked of the recap reads of the Épic 18 events that have NO route of their
// own for a day window: they are only reached through CalendarService, which calls
// bottleFeedingService FIRST. That neighbour already throws 404 on an unlinked baby, so the
// controller-level isolation tests (DailyTotalsTest, CalendarEventsTest) stay green even if these
// reads lose their requireLinked.
//
// Hence a direct call on the SERVICE, with no HTTP in the way: the only thing that can produce the
// 404 is the guard under test. Each test also asserts the same read succeeding for the LINKED
// caregiver, so a blanket failure cannot pass for isolation.
//
// @Transactional on the test methods: these reads are not transactional themselves and a bare test
// method holds no session.
@QuarkusTest
class FeedingReadIsolationTest {

    static final String PWD = "feeding-read-isolation-pwd-123";
    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    static final Instant FROM = ZonedDateTime.of(2026, 7, 15, 0, 0, 0, 0, PARIS).toInstant();
    static final Instant TO = ZonedDateTime.of(2026, 7, 16, 0, 0, 0, 0, PARIS).toInstant();

    @Inject
    TestDataFactory data;

    @Inject
    BreastfeedingService breastfeedingService;

    @Inject
    SolidMealService solidMealService;

    private record Fixture(UUID owner, UUID intruder, UUID babyId) {
    }

    // One breastfeeding on 2026-07-15 on a baby the intruder is NOT linked to.
    private Fixture seedBreastfeeding(String prefix) {
        UUID owner = data.createActiveParent(data.uniqueEmail(prefix + "-owner"), PWD);
        UUID babyId = data.createBaby("Bébé-" + prefix);
        data.link(owner, babyId);
        data.createBreastfeeding(babyId, owner,
                ZonedDateTime.of(2026, 7, 15, 9, 0, 0, 0, PARIS).toInstant(), BreastSide.left, 12);
        UUID intruder = data.createActiveParent(data.uniqueEmail(prefix + "-intruder"), PWD);
        return new Fixture(owner, intruder, babyId);
    }

    // One solid meal on 2026-07-15 on a baby the intruder is NOT linked to.
    private Fixture seedSolidMeal(String prefix) {
        UUID owner = data.createActiveParent(data.uniqueEmail(prefix + "-owner"), PWD);
        UUID babyId = data.createBaby("Bébé-" + prefix);
        data.link(owner, babyId);
        data.createSolidMeal(babyId, owner,
                ZonedDateTime.of(2026, 7, 15, 12, 0, 0, 0, PARIS).toInstant(), "Purée", MealPortion.all);
        UUID intruder = data.createActiveParent(data.uniqueEmail(prefix + "-intruder"), PWD);
        return new Fixture(owner, intruder, babyId);
    }

    @Test
    @Transactional
    @DisplayName("Scénario : SolidMealService.listForDay sur un bébé non lié → 404 (et OK pour le lié)")
    void repas_list_for_day_bebe_non_lie() {
        Fixture f = seedSolidMeal("meal-list");

        assertThrows(NotFoundException.class,
                () -> solidMealService.listForDay(f.intruder(), f.babyId(), FROM, TO));
        assertEquals(1, solidMealService.listForDay(f.owner(), f.babyId(), FROM, TO).size());
    }

    @Test
    @Transactional
    @DisplayName("Scénario : SolidMealService.countForDay sur un bébé non lié → 404 (et OK pour le lié)")
    void repas_count_for_day_bebe_non_lie() {
        Fixture f = seedSolidMeal("meal-count");

        assertThrows(NotFoundException.class,
                () -> solidMealService.countForDay(f.intruder(), f.babyId(), FROM, TO));
        assertEquals(1, solidMealService.countForDay(f.owner(), f.babyId(), FROM, TO));
    }

    @Test
    @Transactional
    @DisplayName("Scénario : BreastfeedingService.listForDay sur un bébé non lié → 404 (et OK pour le lié)")
    void tetee_list_for_day_bebe_non_lie() {
        Fixture f = seedBreastfeeding("breast-list");

        assertThrows(NotFoundException.class,
                () -> breastfeedingService.listForDay(f.intruder(), f.babyId(), FROM, TO));
        assertEquals(1, breastfeedingService.listForDay(f.owner(), f.babyId(), FROM, TO).size());
    }

    @Test
    @Transactional
    @DisplayName("Scénario : BreastfeedingService.countForDay sur un bébé non lié → 404 (et OK pour le lié)")
    void tetee_count_for_day_bebe_non_lie() {
        Fixture f = seedBreastfeeding("breast-count");

        assertThrows(NotFoundException.class,
                () -> breastfeedingService.countForDay(f.intruder(), f.babyId(), FROM, TO));
        assertEquals(1, breastfeedingService.countForDay(f.owner(), f.babyId(), FROM, TO));
    }
}
