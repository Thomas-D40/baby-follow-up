package com.suivibaby.controller;

import com.suivibaby.model.BreastSide;
import com.suivibaby.model.CareType;
import com.suivibaby.model.MealPortion;
import com.suivibaby.model.MilkType;
import com.suivibaby.model.StoolConsistency;
import com.suivibaby.model.VitaminType;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.mailer.MockMailbox;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 24, US24.1 — the administrator deletes an account. Two routes under /api/admin/users:
// GET /{id}/deletion-impact (preview) and DELETE /{id}?impactToken=… (deletion).
//
// The database persists for the whole run: emails are unique per test and no assertion ever relies on
// the size of a global list. The impact token is always read from the preview, never recomputed.
@QuarkusTest
class AccountDeletionTest {

    static final String PWD = "account-deletion-pwd-123";
    static final String ADMIN_USERS = "/api/admin/users";
    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    @Inject
    TestDataFactory data;

    @Inject
    MockMailbox mailbox;

    UUID adminId;
    String adminEmail;
    String adminCookie;

    @BeforeEach
    void seedAdmin() {
        mailbox.clear();
        adminEmail = data.uniqueEmail("admin");
        adminId = data.createUser(adminEmail, "Thomas", "admin", PWD);
        adminCookie = AuthFixture.loginCookie(adminEmail, PWD);
    }

    private record Account(UUID id, String email, String cookie) {
    }

    // An active parent with a first name, logged in.
    private Account parent(String firstName) {
        String email = data.uniqueEmail(firstName.toLowerCase());
        UUID id = data.createUser(email, firstName, "parent", PWD);
        return new Account(id, email, AuthFixture.loginCookie(email, PWD));
    }

    private RequestSpecification as(String cookie) {
        return given().cookie(AuthFixture.COOKIE, cookie);
    }

    private Response impactOf(String cookie, Object userId) {
        return as(cookie).when().get(ADMIN_USERS + "/{id}/deletion-impact", userId);
    }

    private Response impactOf(Object userId) {
        return impactOf(adminCookie, userId);
    }

    private String tokenFor(UUID userId) {
        return impactOf(userId).then().statusCode(200).extract().path("impactToken");
    }

    // A null token leaves the query parameter out altogether.
    private Response deleteAccount(String cookie, Object userId, String impactToken) {
        RequestSpecification request = as(cookie);
        if (impactToken != null) {
            request = request.queryParam("impactToken", impactToken);
        }
        return request.when().delete(ADMIN_USERS + "/{id}", userId);
    }

    private Response deleteAccount(Object userId, String impactToken) {
        return deleteAccount(adminCookie, userId, impactToken);
    }

    private List<String> listedEmails() {
        return as(adminCookie).when().get(ADMIN_USERS)
                .then().statusCode(200)
                .extract().jsonPath().getList("email");
    }

    private Response caregiversOf(String cookie, UUID babyId) {
        return as(cookie).when().get("/api/babies/{babyId}/caregivers", babyId);
    }

    // The « nothing happened » shortcut: the account and its babies are still there.
    private void assertUntouched(UUID userId, UUID... babies) {
        assertTrue(data.userExists(userId), "le compte est toujours là");
        for (UUID baby : babies) {
            assertTrue(data.babyExists(baby), "le bébé est toujours là");
        }
    }

    // Lower-case alphabetic token, unique per call: isolates a dish in the global shared list.
    private static String token() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            sb.append((char) ('a' + ThreadLocalRandom.current().nextInt(26)));
        }
        return sb.toString();
    }

    @Nested
    @DisplayName("Scénario : supprimer un membre non-owner")
    class MembreNonOwner {

        @Test
        void l_apercu_annonce_un_bebe_partage_et_la_suppression_retire_le_compte_du_cercle() {
            Account lisa = parent("Lisa");
            Account nadia = parent("Nadia");
            UUID lea = data.createBaby("Léa");
            data.link(lisa.id(), lea);
            data.linkAsCaregiver(nadia.id(), lea);
            data.createBottleFeeding(lea, lisa.id(), Instant.now().minus(1, ChronoUnit.HOURS), 120, MilkType.formula);
            long eventsBefore = data.countAllEvents(lea);

            Response preview = impactOf(nadia.id());

            preview.then().statusCode(200)
                    .body("userId", is(nadia.id().toString()))
                    .body("status", is("active"))
                    .body("deletedBabyCount", is(0))
                    .body("sharedBabyCount", is(1))
                    .body("blockingBabyCount", is(0));
            String impactToken = preview.jsonPath().getString("impactToken");
            assertNotNull(impactToken);
            assertTrue(impactToken.matches("[0-9a-f]{64}"), impactToken);

            mailbox.clear();
            deleteAccount(nadia.id(), impactToken).then().statusCode(204);

            assertFalse(listedEmails().contains(nadia.email()));
            assertFalse(data.userExists(nadia.id()));
            caregiversOf(lisa.cookie(), lea).then().statusCode(200)
                    .body("userId", not(hasItem(nadia.id().toString())))
                    .body("userId", hasItem(lisa.id().toString()));
            as(lisa.cookie()).when().get("/api/babies/{babyId}", lea).then().statusCode(200);
            assertEquals(eventsBefore, data.countAllEvents(lea));
            assertEquals(0, mailbox.getTotalMessagesSent(), "aucun mail (D24-K)");
        }
    }

    @Nested
    @DisplayName("Scénario : supprimer un co-owner")
    class CoOwner {

        @Test
        void le_compte_est_retire_du_cercle_l_autre_owner_reste_et_le_suivi_est_intact() {
            Account lisa = parent("Lisa");
            Account marc = parent("Marc");
            UUID lea = data.createBaby("Léa");
            data.link(lisa.id(), lea);
            data.link(marc.id(), lea);
            data.createBottleFeeding(lea, lisa.id(), Instant.now().minus(1, ChronoUnit.HOURS), 90, MilkType.breast);
            long bottlesBefore = data.countBottleFeeding(lea);

            impactOf(marc.id()).then().statusCode(200)
                    .body("deletedBabyCount", is(0))
                    .body("sharedBabyCount", is(1))
                    .body("blockingBabyCount", is(0));

            deleteAccount(marc.id(), tokenFor(marc.id())).then().statusCode(204);

            assertFalse(data.userExists(marc.id()));
            assertFalse(data.isLinkedHelper(marc.id(), lea));
            assertTrue(data.isOwner(lisa.id(), lea));
            assertTrue(data.babyExists(lea));
            assertEquals(bottlesBefore, data.countBottleFeeding(lea));
        }
    }

    @Nested
    @DisplayName("Scénario : bébé suivi par la seule personne supprimée")
    class BebeSolo {

        @Test
        void le_bebe_solo_est_supprime_avec_son_suivi_et_les_bebes_partages_restent() {
            Account lisa = parent("Lisa");
            Account marc = parent("Marc");
            Account paul = parent("Paul");
            UUID mamie = data.createPendingParent(data.uniqueEmail("mamie"));
            UUID tom = data.createBaby("Tom");
            data.link(paul.id(), tom);
            UUID shared1 = data.createBaby("Partagé 1");
            UUID shared2 = data.createBaby("Partagé 2");
            data.link(lisa.id(), shared1);
            data.linkAsCaregiver(paul.id(), shared1);
            data.link(marc.id(), shared2);
            data.linkAsCaregiver(paul.id(), shared2);
            data.createBottleFeeding(tom, paul.id(), Instant.now().minus(2, ChronoUnit.HOURS), 100, MilkType.formula);
            data.createNap(tom, paul.id(), Instant.now().minus(3, ChronoUnit.HOURS),
                    Instant.now().minus(2, ChronoUnit.HOURS));
            UUID pendingOnTom = data.createInvitation(tom, paul.id(), mamie,
                    Instant.now().plus(7, ChronoUnit.DAYS), null);
            data.createBottleFeeding(shared1, lisa.id(), Instant.now().minus(1, ChronoUnit.HOURS), 80, MilkType.breast);
            data.createBottleFeeding(shared2, marc.id(), Instant.now().minus(1, ChronoUnit.HOURS), 70, MilkType.breast);
            long events1 = data.countAllEvents(shared1);
            long events2 = data.countAllEvents(shared2);

            Response preview = impactOf(paul.id());

            preview.then().statusCode(200)
                    .body("deletedBabyCount", is(1))
                    .body("sharedBabyCount", is(2))
                    .body("blockingBabyCount", is(0));
            String body = preview.asString();
            for (UUID baby : List.of(tom, shared1, shared2)) {
                assertFalse(body.contains(baby.toString()), "aucun identifiant de bébé dans l'aperçu");
            }
            assertFalse(body.contains("Tom"), "aucun prénom de bébé dans l'aperçu");

            deleteAccount(paul.id(), preview.jsonPath().getString("impactToken")).then().statusCode(204);

            assertFalse(data.userExists(paul.id()));
            assertFalse(data.babyExists(tom));
            assertEquals(0, data.countAllEvents(tom));
            given().when().get("/api/invitations/{token}", pendingOnTom).then().statusCode(410);
            assertTrue(data.babyExists(shared1));
            assertTrue(data.babyExists(shared2));
            assertEquals(events1, data.countAllEvents(shared1));
            assertEquals(events2, data.countAllEvents(shared2));
            assertTrue(data.isOwner(lisa.id(), shared1));
            assertTrue(data.isOwner(marc.id(), shared2));
        }
    }

    @Nested
    @DisplayName("Scénario : compte sans bébé")
    class SansBebe {

        @Test
        void l_apercu_est_a_zero_et_la_suppression_reussit() {
            Account nadia = parent("Nadia");

            impactOf(nadia.id()).then().statusCode(200)
                    .body("status", is("active"))
                    .body("deletedBabyCount", is(0))
                    .body("sharedBabyCount", is(0))
                    .body("blockingBabyCount", is(0));

            deleteAccount(nadia.id(), tokenFor(nadia.id())).then().statusCode(204);

            assertFalse(data.userExists(nadia.id()));
        }
    }

    @Nested
    @DisplayName("Scénario : dernier owner d'un bébé suivi par d'autres")
    class DernierOwner {

        @Test
        void refus_409_sans_effet_puis_reussite_apres_la_promotion_d_un_autre_owner() {
            Account lisa = parent("Lisa");
            Account nadia = parent("Nadia");
            UUID lea = data.createBaby("Léa");
            data.link(lisa.id(), lea);
            data.linkAsCaregiver(nadia.id(), lea);
            UUID pending = data.createInvitation(lea, lisa.id(), data.createPendingParent(data.uniqueEmail("mamie")),
                    Instant.now().plus(7, ChronoUnit.DAYS), null);

            Response preview = impactOf(lisa.id());
            preview.then().statusCode(200).body("blockingBabyCount", is(1));
            String blockedToken = preview.jsonPath().getString("impactToken");

            deleteAccount(lisa.id(), blockedToken).then().statusCode(409);

            assertUntouched(lisa.id(), lea);
            assertTrue(data.isOwner(lisa.id(), lea));
            assertTrue(data.isLinkedHelper(nadia.id(), lea));
            given().when().get("/api/invitations/{token}", pending).then().statusCode(200);

            as(lisa.cookie()).contentType(ContentType.JSON).body(Map.of("isOwner", true))
                    .when().patch("/api/babies/{babyId}/caregivers/{userId}", lea, nadia.id())
                    .then().statusCode(204);

            Response after = impactOf(lisa.id());
            after.then().statusCode(200)
                    .body("sharedBabyCount", is(1))
                    .body("blockingBabyCount", is(0));
            String freeToken = after.jsonPath().getString("impactToken");
            assertNotEquals(blockedToken, freeToken);

            deleteAccount(lisa.id(), freeToken).then().statusCode(204);

            assertFalse(data.userExists(lisa.id()));
            assertTrue(data.babyExists(lea));
            assertTrue(data.isOwner(nadia.id(), lea));
        }
    }

    @Nested
    @DisplayName("Scénario : refus partiel impossible")
    class RefusPartielImpossible {

        @Test
        void le_bebe_solo_n_est_pas_supprime_quand_un_autre_bebe_bloque() {
            Account lisa = parent("Lisa");
            Account nadia = parent("Nadia");
            UUID lea = data.createBaby("Léa");
            UUID zoe = data.createBaby("Zoé");
            data.link(lisa.id(), lea);
            data.linkAsCaregiver(nadia.id(), lea);
            data.link(lisa.id(), zoe);
            data.createBottleFeeding(zoe, lisa.id(), Instant.now().minus(1, ChronoUnit.HOURS), 100, MilkType.formula);

            Response preview = impactOf(lisa.id());
            preview.then().statusCode(200)
                    .body("deletedBabyCount", is(1))
                    .body("blockingBabyCount", is(1));

            deleteAccount(lisa.id(), preview.jsonPath().getString("impactToken")).then().statusCode(409);

            assertUntouched(lisa.id(), lea, zoe);
            assertEquals(1, data.countBottleFeeding(zoe));
            assertEquals(1, data.countLink(lisa.id(), lea));
            assertEquals(1, data.countLink(lisa.id(), zoe));
        }
    }

    @Nested
    @DisplayName("Scénario : l'impact a changé depuis l'annonce")
    class ImpactChange {

        @Test
        void l_autre_membre_quitte_le_cercle_la_suppression_est_refusee_puis_annonce_le_bebe_supprime() {
            Account marc = parent("Marc");
            Account other = parent("Autre");
            UUID baby = data.createBaby("Bébé");
            data.link(marc.id(), baby);
            data.link(other.id(), baby);
            data.createBottleFeeding(baby, other.id(), Instant.now().minus(1, ChronoUnit.HOURS), 60, MilkType.breast);

            Response first = impactOf(marc.id());
            first.then().statusCode(200).body("sharedBabyCount", is(1)).body("deletedBabyCount", is(0));
            String staleToken = first.jsonPath().getString("impactToken");

            as(other.cookie()).when().delete("/api/babies/{babyId}/caregivers/{userId}", baby, other.id())
                    .then().statusCode(204);

            deleteAccount(marc.id(), staleToken).then().statusCode(409);

            assertUntouched(marc.id(), baby);
            assertTrue(data.isLinkedHelper(marc.id(), baby));
            assertEquals(1, data.countBottleFeeding(baby));

            Response second = impactOf(marc.id());
            second.then().statusCode(200).body("deletedBabyCount", is(1)).body("sharedBabyCount", is(0));
            String freshToken = second.jsonPath().getString("impactToken");
            assertNotEquals(staleToken, freshToken);

            deleteAccount(marc.id(), freshToken).then().statusCode(204);

            assertFalse(data.userExists(marc.id()));
            assertFalse(data.babyExists(baby));
        }

        @Test
        void un_bebe_solo_rejoint_par_un_membre_devient_bloquant_et_rien_n_est_supprime() {
            Account paul = parent("Paul");
            UUID tom = data.createBaby("Tom");
            data.link(paul.id(), tom);
            data.createBottleFeeding(tom, paul.id(), Instant.now().minus(1, ChronoUnit.HOURS), 100, MilkType.formula);

            Response preview = impactOf(paul.id());
            preview.then().statusCode(200).body("deletedBabyCount", is(1));
            String staleToken = preview.jsonPath().getString("impactToken");

            String mamieEmail = data.uniqueEmail("mamie");
            String invitation = as(paul.cookie()).contentType(ContentType.JSON)
                    .body(Map.of("email", mamieEmail, "firstName", "Mamie"))
                    .when().post("/api/babies/{babyId}/invitations", tom)
                    .then().statusCode(201).extract().path("token");
            given().contentType(ContentType.JSON).body(Map.of("password", "mot-de-passe-mamie-12"))
                    .when().post("/api/invitations/{token}/accept", invitation)
                    .then().statusCode(204);
            UUID mamie = data.userIdByEmail(mamieEmail);
            assertTrue(data.isLinkedHelper(mamie, tom));

            deleteAccount(paul.id(), staleToken).then().statusCode(409);

            assertUntouched(paul.id(), tom);
            assertTrue(data.isLinkedHelper(mamie, tom));
            assertEquals(1, data.countBottleFeeding(tom));
        }

        @Test
        void sans_jeton_ou_avec_un_jeton_vide_la_suppression_est_refusee() {
            Account nadia = parent("Nadia");

            deleteAccount(nadia.id(), null).then().statusCode(409);
            deleteAccount(nadia.id(), "").then().statusCode(409);

            assertUntouched(nadia.id());
        }

        @Test
        void le_jeton_d_un_compte_ne_vaut_pas_pour_un_autre() {
            Account nadia = parent("Nadia");
            Account lisa = parent("Lisa");

            deleteAccount(lisa.id(), tokenFor(nadia.id())).then().statusCode(409);

            assertUntouched(lisa.id());
            assertUntouched(nadia.id());
        }
    }

    @Nested
    @DisplayName("Scénario : le compte supprimé perd l'accès")
    class PerdLAcces {

        @Test
        void le_cookie_ouvert_et_la_connexion_donnent_401() {
            Account nadia = parent("Nadia");
            as(nadia.cookie()).when().get("/api/me").then().statusCode(200);

            deleteAccount(nadia.id(), tokenFor(nadia.id())).then().statusCode(204);

            as(nadia.cookie()).when().get("/api/me").then().statusCode(401);
            given().contentType("application/x-www-form-urlencoded")
                    .formParam("email", nadia.email()).formParam("password", PWD)
                    .when().post("/api/login")
                    .then().statusCode(401);
        }

        // Pending account: an activated account's link already answers 410 (D20-AA), so only a pending
        // one proves that the deletion itself kills the link.
        @Test
        void son_lien_d_activation_ne_fonctionne_plus() {
            UUID nadia = data.createUser(data.uniqueEmail("nadia"), "Nadia", "parent", null);
            UUID activation = data.createToken(nadia, Instant.now().plus(7, ChronoUnit.DAYS), null);
            given().when().get("/api/activation/{token}", activation).then().statusCode(204);

            deleteAccount(nadia, tokenFor(nadia)).then().statusCode(204);

            given().when().get("/api/activation/{token}", activation).then().statusCode(410);
        }
    }

    @Nested
    @DisplayName("Scénario : ses saisies et ses plats restent")
    class SaisiesEtPlats {

        @Test
        void tout_ce_qui_survit_reste_lisible_modifiable_et_supprimable_par_les_membres() {
            Account lisa = parent("Lisa");
            Account nadia = parent("Nadia");
            UUID lea = data.createBaby("Léa");
            data.link(lisa.id(), lea);
            data.linkAsCaregiver(nadia.id(), lea);
            LocalDate day = LocalDate.now(PARIS).minusDays(2);

            // Nadia's entries: three bottles (300 ml) and one row in each of the ten other tracking tables.
            UUID firstBottle = data.createBottleFeeding(lea, nadia.id(), at(day, 8), 100, MilkType.formula);
            data.createBottleFeeding(lea, nadia.id(), at(day, 11), 120, MilkType.formula);
            data.createBottleFeeding(lea, nadia.id(), at(day, 15), 80, MilkType.breast);
            data.createNap(lea, nadia.id(), at(day, 13), null); // still open
            data.createStool(lea, nadia.id(), at(day, 9), StoolConsistency.soft);
            data.createUrine(lea, nadia.id(), at(day, 9));
            data.createTemperature(lea, nadia.id(), at(day, 10), 372);
            data.createMedicalCare(lea, nadia.id(), CareType.eye, at(day, 10));
            data.createBreastfeeding(lea, nadia.id(), at(day, 7), BreastSide.left, 10);
            data.createSolidMeal(lea, nadia.id(), at(day, 12), "Purée", MealPortion.half);
            data.createMedication(lea, nadia.id(), at(day, 12), "Doliprane", "2,5 ml");
            data.giveVitamin(lea, nadia.id(), VitaminType.d, day);
            data.createWeight(lea, nadia.id(), day, 4200);
            String dishToken = token();
            String dishLabel = "Purée de panais " + dishToken;
            UUID dish = data.createDish(nadia.id(), dishLabel);
            long eventsBefore = data.countAllEvents(lea);
            assertEquals(13, eventsBefore);

            deleteAccount(nadia.id(), tokenFor(nadia.id())).then().statusCode(204);

            assertEquals(eventsBefore, data.countAllEvents(lea), "aucune ligne de suivi supprimée");
            List<Object> authors = as(lisa.cookie()).when().get("/api/babies/{babyId}/bottle-feedings", lea)
                    .then().statusCode(200)
                    .body("items.size()", is(3))
                    .extract().jsonPath().getList("items.authorId");
            assertEquals(3, authors.size());
            assertTrue(authors.stream().allMatch(Objects::isNull), "l'auteur supprimé est nul");
            as(lisa.cookie()).queryParam("date", day.toString())
                    .when().get("/api/babies/{babyId}/events", lea)
                    .then().statusCode(200)
                    .body("findAll { it.type == 'bottle_feeding' }.size()", is(3));
            as(lisa.cookie()).queryParam("date", day.toString())
                    .when().get("/api/babies/{babyId}/daily-totals", lea)
                    .then().statusCode(200)
                    .body("totalMilkMl", is(300));

            // The dish stays offered to everybody, and is now managed by the administrator only (D24-X).
            as(lisa.cookie()).queryParam("q", dishToken).when().get("/api/dishes")
                    .then().statusCode(200)
                    .body("items.label", hasItem(dishLabel));
            assertEquals(dishLabel, data.dishLabel(dish));
            assertNull(data.dishAuthor(dish));
            as(adminCookie).when().get("/api/dishes/manageable")
                    .then().statusCode(200)
                    .body("id", hasItem(dish.toString()));
            as(lisa.cookie()).contentType(ContentType.JSON).body(Map.of("label", "Autre " + token()))
                    .when().patch("/api/dishes/{id}", dish)
                    .then().statusCode(403);

            // The remaining members keep full rights on the orphaned entries.
            as(lisa.cookie()).contentType(ContentType.JSON).body(Map.of("quantityMl", 90))
                    .when().patch("/api/babies/{babyId}/bottle-feedings/{id}", lea, firstBottle)
                    .then().statusCode(200).body("quantityMl", is(90));
            as(lisa.cookie()).when().delete("/api/babies/{babyId}/bottle-feedings/{id}", lea, firstBottle)
                    .then().statusCode(204);
            as(lisa.cookie()).contentType(ContentType.JSON).body(Map.of())
                    .when().post("/api/babies/{babyId}/naps/end", lea)
                    .then().statusCode(200);
        }

        private Instant at(LocalDate day, int hour) {
            return day.atTime(hour, 0).atZone(PARIS).toInstant();
        }
    }

    @Nested
    @DisplayName("Scénario : invitations en attente")
    class InvitationsEnAttente {

        @Test
        void les_invitations_recues_et_emises_meurent_mais_le_compte_en_attente_du_destinataire_subsiste() {
            Account lisa = parent("Lisa");
            Account nadia = parent("Nadia");
            String mamieEmail = data.uniqueEmail("mamie");
            UUID mamie = data.createPendingParent(mamieEmail);
            UUID b2 = data.createBaby("B2");
            UUID b3 = data.createBaby("B3");
            data.link(lisa.id(), b2);
            data.link(lisa.id(), b3);
            data.link(nadia.id(), b3);
            Instant expiry = Instant.now().plus(7, ChronoUnit.DAYS);
            UUID toNadia = data.createInvitation(b2, lisa.id(), nadia.id(), expiry, null);
            UUID byNadia = data.createInvitation(b3, nadia.id(), mamie, expiry, null);
            given().when().get("/api/invitations/{token}", toNadia).then().statusCode(200);
            given().when().get("/api/invitations/{token}", byNadia).then().statusCode(200);
            as(lisa.cookie()).when().get("/api/babies/{babyId}/invitations", b2)
                    .then().statusCode(200).body("token", hasItem(toNadia.toString()));

            deleteAccount(nadia.id(), tokenFor(nadia.id())).then().statusCode(204);

            given().when().get("/api/invitations/{token}", toNadia).then().statusCode(410);
            given().when().get("/api/invitations/{token}", byNadia).then().statusCode(410);
            as(lisa.cookie()).when().get("/api/babies/{babyId}/invitations", b2)
                    .then().statusCode(200).body("token", not(hasItem(toNadia.toString())));
            as(lisa.cookie()).when().get("/api/babies/{babyId}/invitations", b3)
                    .then().statusCode(200).body("token", not(hasItem(byNadia.toString())));
            // The account created for the recipient of Nadia's invitation stays, pending and revocable (D17-R).
            assertTrue(data.userExists(mamie));
            assertNull(data.activatedAt(mamie));
            assertTrue(listedEmails().contains(mamieEmail));
        }
    }

    @Nested
    @DisplayName("Scénario : recréer un compte à la même adresse")
    class RecreationMemeAdresse {

        @Test
        void l_adresse_est_libre_le_compte_neuf_est_vierge_et_l_ancien_cookie_donne_401() {
            Account nadia = parent("Nadia");
            UUID lea = data.createBaby("Léa");
            data.linkAsCaregiver(nadia.id(), lea);
            data.link(parent("Lisa").id(), lea);

            deleteAccount(nadia.id(), tokenFor(nadia.id())).then().statusCode(204);

            String newId = as(adminCookie).contentType(ContentType.JSON)
                    .body(Map.of("email", nadia.email(), "firstName", "Nadia"))
                    .when().post(ADMIN_USERS)
                    .then().statusCode(201).body("userId", notNullValue())
                    .extract().path("userId");
            assertNotEquals(nadia.id().toString(), newId);
            List<Map<String, Object>> accounts = as(adminCookie).when().get(ADMIN_USERS)
                    .then().statusCode(200).extract().jsonPath().getList("$");
            Map<String, Object> recreated = accounts.stream()
                    .filter(a -> nadia.email().equals(a.get("email"))).findFirst().orElseThrow();
            assertEquals("pending", recreated.get("status"));
            assertEquals(newId, recreated.get("id"));
            assertEquals(0, data.countLink(UUID.fromString(newId), lea));

            // While the new account is pending, the old session cookie opens nothing (D24-W).
            as(nadia.cookie()).when().get("/api/me").then().statusCode(401);
            as(nadia.cookie()).when().get("/api/babies").then().statusCode(401);
            as(nadia.cookie()).queryParam("q", "pu").when().get("/api/dishes").then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Non-régression : un compte ancien rétro-marqué en attente garde sa session (D24-W)")
    class CompteAncienEnAttente {

        @Test
        void la_connexion_et_la_session_fonctionnent_encore() {
            String email = data.uniqueEmail("ancien");
            UUID id = data.createUser(email, "Ancien", "parent", PWD, Instant.now().minus(30, ChronoUnit.DAYS));
            data.markPending(id);
            assertNull(data.activatedAt(id));

            String cookie = AuthFixture.loginCookie(email, PWD);

            as(cookie).when().get("/api/me").then().statusCode(200);
        }
    }

    @Nested
    @DisplayName("Scénario : l'admin ne peut pas se supprimer")
    class AdminNonSupprimable {

        @Test
        void l_apercu_et_la_suppression_d_un_compte_admin_donnent_409_sans_effet() {
            UUID otherAdmin = data.createUser(data.uniqueEmail("autre-admin"), "Autre", "admin", PWD);

            impactOf(adminId).then().statusCode(409);
            impactOf(otherAdmin).then().statusCode(409);
            deleteAccount(adminId, "x").then().statusCode(409);
            deleteAccount(otherAdmin, "x").then().statusCode(409);
            deleteWithPendingOnly(otherAdmin, "x").then().statusCode(409);

            assertTrue(data.userExists(adminId));
            assertTrue(data.userExists(otherAdmin));
            AuthFixture.loginCookie(adminEmail, PWD);
        }

        private Response deleteWithPendingOnly(UUID userId, String impactToken) {
            return as(adminCookie).queryParam("impactToken", impactToken).queryParam("pendingOnly", true)
                    .when().delete(ADMIN_USERS + "/{id}", userId);
        }
    }

    @Nested
    @DisplayName("Scénario : anti-doublon et idempotence")
    class Idempotence {

        @Test
        void un_compte_deja_supprime_repond_404_sur_les_deux_routes() {
            Account nadia = parent("Nadia");
            String impactToken = tokenFor(nadia.id());
            deleteAccount(nadia.id(), impactToken).then().statusCode(204);

            deleteAccount(nadia.id(), impactToken).then().statusCode(404);
            impactOf(nadia.id()).then().statusCode(404);
        }

        @Test
        void identifiant_inconnu_ou_mal_forme_repond_404_sur_les_deux_routes() {
            impactOf(UUID.randomUUID()).then().statusCode(404);
            impactOf("not-a-uuid").then().statusCode(404);
            deleteAccount(UUID.randomUUID(), "x").then().statusCode(404);
            deleteAccount("not-a-uuid", "x").then().statusCode(404);
        }
    }

    @Nested
    @DisplayName("Scénario : accès réservé à l'administrateur")
    class Acces {

        @Test
        void un_parent_recoit_403_sur_les_deux_routes_sans_effet() {
            Account lisa = parent("Lisa");
            Account nadia = parent("Nadia");
            UUID lea = data.createBaby("Léa");
            data.link(nadia.id(), lea);
            String impactToken = tokenFor(nadia.id());

            impactOf(lisa.cookie(), nadia.id()).then().statusCode(403);
            deleteAccount(lisa.cookie(), nadia.id(), impactToken).then().statusCode(403);

            assertUntouched(nadia.id(), lea);
            assertTrue(data.isOwner(nadia.id(), lea));
        }

        @Test
        void sans_session_la_reponse_est_401_sur_les_deux_routes_sans_effet() {
            Account nadia = parent("Nadia");
            String impactToken = tokenFor(nadia.id());

            given().when().get(ADMIN_USERS + "/{id}/deletion-impact", nadia.id()).then().statusCode(401);
            given().queryParam("impactToken", impactToken)
                    .when().delete(ADMIN_USERS + "/{id}", nadia.id()).then().statusCode(401);

            assertUntouched(nadia.id());
        }

        @Test
        void un_parent_qui_vise_un_compte_admin_recoit_403_et_non_409() {
            Account lisa = parent("Lisa");

            impactOf(lisa.cookie(), adminId).then().statusCode(403);
            deleteAccount(lisa.cookie(), adminId, "x").then().statusCode(403);

            assertUntouched(adminId);
        }
    }
}
