package com.suivibaby.controller;

import com.suivibaby.model.BreastSide;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;

// Épic 18, US18.2 — breastfeeding CRUD under the membership filter, cloned from UrineCrudTest.
// Specific rules: optional side / duration (1..120), PATCH where a null optional field is CLEARED
// (D18-AC) while a null occurredAt is left unchanged, and the "last feed" lookup (limit=1) ordered by
// start time, not by entry time (D18-AM).
@QuarkusTest
class BreastfeedingCrudTest {

    static final String PWD = "breastfeeding-crud-pwd-123";
    static final String PATH = "/api/babies/{babyId}/breastfeedings";
    static final String ITEM_PATH = PATH + "/{id}";

    @Inject
    TestDataFactory data;

    // Null-tolerant payload (Map.of is not): every key is always sent, null when not specified.
    private static Map<String, Object> payload(Object occurredAt, Object side, Object durationMinutes) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("side", side);
        m.put("durationMinutes", durationMinutes);
        return m;
    }

    private record Caregiver(UUID userId, UUID babyId, String cookie) {
    }

    private Caregiver linkedCaregiver(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID userId = data.createActiveParent(email, PWD);
        UUID babyId = data.createBaby("Bébé-" + prefix);
        data.link(userId, babyId);
        String cookie = AuthFixture.loginCookie(email, PWD);
        return new Caregiver(userId, babyId, cookie);
    }

    private static Instant ago(long hours) {
        return Instant.now().minus(hours, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS);
    }

    @Nested
    @DisplayName("POST /api/babies/{babyId}/breastfeedings")
    class Create {

        @Test
        @DisplayName("Scénario : tétée complète (côté, durée, heure) → 201, author_id = courant")
        void tetee_complete() {
            Caregiver c = linkedCaregiver("creator");
            String when = ago(2).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when, "left", 12))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .body("occurredAt", is(when))
                    .body("side", is("left"))
                    .body("durationMinutes", is(12))
                    .body("authorId", is(c.userId().toString()));

            assertEquals(1, data.countBreastfeeding(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : sans côté ni durée (corps absent) → 201, side et durationMinutes null")
        void sans_cote_ni_duree() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("occurredAt", notNullValue())
                    .body("side", nullValue())
                    .body("durationMinutes", nullValue());

            assertEquals(1, data.countBreastfeeding(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : côté droit sans durée → 201, durationMinutes null")
        void cote_sans_duree() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "right", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("side", is("right"))
                    .body("durationMinutes", nullValue());
        }

        @Test
        @DisplayName("Scénario : durée hors bornes (0 et 121) → 400, rien enregistré")
        void duree_hors_bornes() {
            Caregiver c = linkedCaregiver("creator");

            for (int invalid : new int[]{0, 121}) {
                given().cookie(AuthFixture.COOKIE, c.cookie())
                        .contentType(ContentType.JSON)
                        .body(payload(null, "left", invalid))
                        .when().post(PATH, c.babyId())
                        .then().statusCode(400);
            }

            assertEquals(0, data.countBreastfeeding(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : durées limites (1 et 120) → 201")
        void duree_bornes_incluses() {
            Caregiver c = linkedCaregiver("creator");

            for (int valid : new int[]{1, 120}) {
                given().cookie(AuthFixture.COOKIE, c.cookie())
                        .contentType(ContentType.JSON)
                        .body(payload(null, null, valid))
                        .when().post(PATH, c.babyId())
                        .then().statusCode(201)
                        .body("durationMinutes", is(valid));
            }

            assertEquals(2, data.countBreastfeeding(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : côté hors énumération → 400")
        void cote_invalide() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "middle", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countBreastfeeding(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : heure invalide (futur > +5 min, passé < now − 730 j) → 400")
        void heure_invalide() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().plus(10, ChronoUnit.MINUTES).toString(), null, null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().minus(731, ChronoUnit.DAYS).toString(), null, null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countBreastfeeding(c.babyId()));
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/breastfeedings (keyset, rappel de la dernière tétée)")
    class List {

        @Test
        @DisplayName("Scénario : 1ʳᵉ page triée occurredAt DESC, id DESC, tout sur une page")
        void premiere_page_triee() {
            Caregiver c = linkedCaregiver("lister");
            UUID ancien = data.createBreastfeeding(c.babyId(), c.userId(), ago(5), null, null);
            UUID milieu = data.createBreastfeeding(c.babyId(), c.userId(), ago(4), null, null);
            UUID recent = data.createBreastfeeding(c.babyId(), c.userId(), ago(3), null, null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get(PATH, c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(3))
                    .body("items[0].id", is(recent.toString()))
                    .body("items[1].id", is(milieu.toString()))
                    .body("items[2].id", is(ancien.toString()))
                    .body("nextCursor", nullValue());
        }

        @Test
        @DisplayName("Scénario : page suivante via before (ni chevauchement ni saut)")
        void page_suivante_via_before() {
            Caregiver c = linkedCaregiver("lister");
            UUID ancien = data.createBreastfeeding(c.babyId(), c.userId(), ago(5), null, null);
            UUID milieu = data.createBreastfeeding(c.babyId(), c.userId(), ago(4), null, null);
            UUID recent = data.createBreastfeeding(c.babyId(), c.userId(), ago(3), null, null);

            String nextCursor = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .when().get(PATH, c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(2))
                    .body("items[0].id", is(recent.toString()))
                    .body("items[1].id", is(milieu.toString()))
                    .body("nextCursor", notNullValue())
                    .extract().path("nextCursor");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .queryParam("before", nextCursor)
                    .when().get(PATH, c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(1))
                    .body("items[0].id", is(ancien.toString()))
                    .body("nextCursor", nullValue());
        }

        @Test
        @DisplayName("Scénario : limit < 1 → 400")
        void limit_invalide() {
            Caregiver c = linkedCaregiver("lister");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 0)
                    .when().get(PATH, c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : rappel sans côté — limit=1 renvoie la plus récente, side null")
        void rappel_sans_cote() {
            Caregiver c = linkedCaregiver("rappel");
            data.createBreastfeeding(c.babyId(), c.userId(), ago(6), BreastSide.right, 10);
            data.createBreastfeeding(c.babyId(), c.userId(), ago(2), null, null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 1)
                    .when().get(PATH, c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(1))
                    .body("items[0].side", nullValue());
        }

        @Test
        @DisplayName("Scénario : une tétée saisie après coup ne remplace pas le rappel (heure de début, D18-AM)")
        void tetee_saisie_apres_coup() {
            Caregiver c = linkedCaregiver("rappel-apres-coup");
            String recentStart = ago(2).toString();

            String recentId = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(recentStart, "left", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .extract().path("id");

            // Entered LATER but dated EARLIER: it must not become "the last feed".
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(ago(5).toString(), "right", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 1)
                    .when().get(PATH, c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(1))
                    .body("items[0].id", is(recentId))
                    .body("items[0].side", is("left"));
        }
    }

    @Nested
    @DisplayName("PATCH / DELETE /api/babies/{babyId}/breastfeedings/{id}")
    class UpdateDelete {

        private UUID seedEvent(Caregiver c) {
            return data.createBreastfeeding(c.babyId(), c.userId(), ago(2),
                    BreastSide.left, 12);
        }

        @Test
        @DisplayName("Scénario : modifier côté et durée, heure inchangée (occurredAt null) → 200")
        void modifier_cote_et_duree() {
            Caregiver c = linkedCaregiver("editor");
            Instant start = ago(2);
            UUID event = data.createBreastfeeding(c.babyId(), c.userId(), start,
                    BreastSide.left, 12);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "right", 15))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("side", is("right"))
                    .body("durationMinutes", is(15))
                    .body("occurredAt", is(start.toString()));
        }

        @Test
        @DisplayName("Scénario : effacer la durée (durationMinutes null) → null, côté conservé tel qu'envoyé")
        void effacer_la_duree() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "left", null))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("durationMinutes", nullValue())
                    .body("side", is("left"));
        }

        @Test
        @DisplayName("Scénario : revenir à « non précisé » (side null) → côté effacé")
        void effacer_le_cote() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, null, 12))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("side", nullValue())
                    .body("durationMinutes", is(12));
        }

        @Test
        @DisplayName("Scénario : correction de l'heure → 200, valeur conservée")
        void correction_heure() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String corrige = ago(1).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(corrige, "left", 12))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("occurredAt", is(corrige));
        }

        @Test
        @DisplayName("Scénario : heure invalide ou durée hors bornes au PATCH → 400")
        void patch_invalide() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().plus(10, ChronoUnit.MINUTES).toString(), "left", 12))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(400);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "left", 121))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : PATCH sans corps → 400")
        void patch_corps_absent() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : PATCH d'un id inconnu → 404")
        void patch_id_inconnu() {
            Caregiver c = linkedCaregiver("editor");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "left", 12))
                    .when().patch(ITEM_PATH, c.babyId(), UUID.randomUUID())
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : suppression par un caregiver lié → 204, la tétée disparaît")
        void suppression() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(204);

            assertEquals(0, data.countBreastfeeding(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : re-suppression → 404")
        void re_suppression() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(204);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(404);
        }
    }

    @Nested
    @DisplayName("Isolation (jalon IDOR, anti-énumération)")
    class CrossAccess {

        @Test
        @DisplayName("Scénario : GET / POST / PATCH / DELETE sur un bébé non lié → 404 (jamais 403)")
        void bebe_non_lie() {
            Caregiver a = linkedCaregiver("attacker");
            UUID b2 = data.createBaby("BébéAutrui");
            UUID eventOfB2 = data.createBreastfeeding(b2, a.userId(), ago(1), null, null);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get(PATH, b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, null, null))
                    .when().post(PATH, b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "left", 5))
                    .when().patch(ITEM_PATH, b2, eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete(ITEM_PATH, b2, eventOfB2)
                    .then().statusCode(404);

            assertEquals(1, data.countBreastfeeding(b2));
        }

        @Test
        @DisplayName("Scénario : forger l'id d'une tétée d'un autre bébé via mon bébé → 404 (PATCH et DELETE)")
        void event_d_un_autre_bebe() {
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            UUID eventOfB2 = data.createBreastfeeding(b2, otherUser, ago(1),
                    BreastSide.left, 8);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "right", 20))
                    .when().patch(ITEM_PATH, a.babyId(), eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete(ITEM_PATH, a.babyId(), eventOfB2)
                    .then().statusCode(404);

            assertEquals(1, data.countBreastfeeding(b2));
        }

        @Test
        @DisplayName("Scénario : sans session → 401 sur les quatre verbes")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            UUID event = UUID.randomUUID();

            given().when().get(PATH, baby).then().statusCode(401);
            given().contentType(ContentType.JSON).body(payload(null, null, null))
                    .when().post(PATH, baby).then().statusCode(401);
            given().contentType(ContentType.JSON).body(payload(null, "left", 5))
                    .when().patch(ITEM_PATH, baby, event).then().statusCode(401);
            given().when().delete(ITEM_PATH, baby, event).then().statusCode(401);
        }
    }
}
