package com.suivibaby.controller;

import com.suivibaby.model.MealPortion;
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

// Épic 18, US18.3 — solid meal CRUD under the membership filter, cloned from BreastfeedingCrudTest.
// Specific rules: mandatory free-text dish (edges stripped, inner blanks collapsed, <= 60 chars,
// D18-AD) and a PATCH where a null portion is CLEARED while a null dish / occurredAt is unchanged
// (D18-AC).
@QuarkusTest
class SolidMealCrudTest {

    static final String PWD = "solid-meal-crud-pwd-123";
    static final String PATH = "/api/babies/{babyId}/solid-meals";
    static final String ITEM_PATH = PATH + "/{id}";

    @Inject
    TestDataFactory data;

    // Null-tolerant payload (Map.of is not): every key is always sent, null when not specified.
    private static Map<String, Object> payload(Object occurredAt, Object dish, Object portion) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("dish", dish);
        m.put("portion", portion);
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
    @DisplayName("POST /api/babies/{babyId}/solid-meals")
    class Create {

        @Test
        @DisplayName("Scénario : Purée sans portion → 201, portion null, author_id = courant")
        void puree_sans_portion() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Purée", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .body("occurredAt", notNullValue())
                    .body("dish", is("Purée"))
                    .body("portion", nullValue())
                    .body("authorId", is(c.userId().toString()));

            assertEquals(1, data.countSolidMeal(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : plat libre + portion « La moitié » + heure fournie → 201, valeurs conservées")
        void plat_libre_et_portion() {
            Caregiver c = linkedCaregiver("creator");
            String when = ago(3).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when, "Purée de carottes", "half"))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("dish", is("Purée de carottes"))
                    .body("portion", is("half"))
                    .body("occurredAt", is(when));
        }

        @Test
        @DisplayName("Scénario : les trois portions sont acceptées (tasted, half, all)")
        void trois_portions() {
            Caregiver c = linkedCaregiver("creator");

            for (String portion : new String[]{"tasted", "half", "all"}) {
                given().cookie(AuthFixture.COOKIE, c.cookie())
                        .contentType(ContentType.JSON)
                        .body(payload(null, "Compote", portion))
                        .when().post(PATH, c.babyId())
                        .then().statusCode(201)
                        .body("portion", is(portion));
            }
        }

        @Test
        @DisplayName("Scénario : plat obligatoire — null, vide, blanc ou corps absent → 400, rien enregistré")
        void plat_obligatoire() {
            Caregiver c = linkedCaregiver("creator");

            for (String invalid : new String[]{null, "", "   "}) {
                given().cookie(AuthFixture.COOKIE, c.cookie())
                        .contentType(ContentType.JSON)
                        .body(payload(null, invalid, null))
                        .when().post(PATH, c.babyId())
                        .then().statusCode(400);
            }
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countSolidMeal(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : plat de 61 caractères → 400 ; de 60 → 201")
        void plat_trop_long() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "x".repeat(61), null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);
            assertEquals(0, data.countSolidMeal(c.babyId()));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "x".repeat(60), null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201);
            assertEquals(1, data.countSolidMeal(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : la longueur se mesure après mise en forme (espaces de bord ignorés)")
        void longueur_apres_mise_en_forme() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  " + "x".repeat(60) + "  ", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("dish", is("x".repeat(60)));
        }

        @Test
        @DisplayName("Scénario : enregistré tel que saisi — bords retirés, blancs répétés réduits, casse conservée")
        void mise_en_forme_du_plat() {
            Caregiver c = linkedCaregiver("creator");

            String id1 = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  Compote pomme-poire  ", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("dish", is("Compote pomme-poire"))
                    .extract().path("id");
            assertEquals("Compote pomme-poire", data.solidMealDish(UUID.fromString(id1)));

            String id2 = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  Compote   Pomme-poire ", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("dish", is("Compote Pomme-poire"))
                    .extract().path("id");
            assertEquals("Compote Pomme-poire", data.solidMealDish(UUID.fromString(id2)));
        }

        @Test
        @DisplayName("Scénario : portion hors énumération → 400")
        void portion_invalide() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Compote", "enormous"))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countSolidMeal(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : heure invalide (futur > +5 min, passé < now − 730 j) → 400")
        void heure_invalide() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().plus(10, ChronoUnit.MINUTES).toString(), "Compote", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().minus(731, ChronoUnit.DAYS).toString(), "Compote", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countSolidMeal(c.babyId()));
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/solid-meals (keyset)")
    class List {

        @Test
        @DisplayName("Scénario : 1ʳᵉ page triée occurredAt DESC, id DESC, puis page suivante via before")
        void pages_triees() {
            Caregiver c = linkedCaregiver("lister");
            UUID ancien = data.createSolidMeal(c.babyId(), c.userId(), ago(5), "Compote", null);
            UUID milieu = data.createSolidMeal(c.babyId(), c.userId(), ago(4), "Purée", null);
            UUID recent = data.createSolidMeal(c.babyId(), c.userId(), ago(3), "Yaourt", MealPortion.all);

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
    }

    @Nested
    @DisplayName("PATCH / DELETE /api/babies/{babyId}/solid-meals/{id}")
    class UpdateDelete {

        private UUID seedEvent(Caregiver c) {
            return data.createSolidMeal(c.babyId(), c.userId(), ago(2), "Purée de carrotes", MealPortion.half);
        }

        @Test
        @DisplayName("Scénario : modifier le plat et effacer la portion (portion null) → plat changé, portion null")
        void modifier_plat_et_effacer_portion() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Purée de carottes", null))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("dish", is("Purée de carottes"))
                    .body("portion", nullValue());
        }

        @Test
        @DisplayName("Scénario : dish null = inchangé ; la portion envoyée est posée")
        void dish_null_inchange() {
            Caregiver c = linkedCaregiver("editor");
            Instant start = ago(2);
            UUID event = data.createSolidMeal(c.babyId(), c.userId(), start, "Purée de carrotes", null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, null, "all"))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("dish", is("Purée de carrotes"))
                    .body("portion", is("all"))
                    .body("occurredAt", is(start.toString()));
        }

        @Test
        @DisplayName("Scénario : le plat modifié est mis en forme comme à la création")
        void plat_modifie_mis_en_forme() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  Yaourt   nature ", "half"))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("dish", is("Yaourt nature"));
            assertEquals("Yaourt nature", data.solidMealDish(event));
        }

        @Test
        @DisplayName("Scénario : plat blanc ou trop long au PATCH → 400, plat inchangé")
        void plat_invalide_au_patch() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  ", "half"))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(400);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "x".repeat(61), "half"))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(400);

            assertEquals("Purée de carrotes", data.solidMealDish(event));
        }

        @Test
        @DisplayName("Scénario : correction de l'heure → 200 ; futur → 400")
        void correction_heure() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String corrige = ago(1).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(corrige, null, "half"))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("occurredAt", is(corrige));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().plus(10, ChronoUnit.MINUTES).toString(), null, "half"))
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
                    .body(payload(null, "Compote", null))
                    .when().patch(ITEM_PATH, c.babyId(), UUID.randomUUID())
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : suppression → 204, le repas disparaît ; re-suppression → 404")
        void suppression() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(204);
            assertEquals(0, data.countSolidMeal(c.babyId()));

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
            UUID eventOfB2 = data.createSolidMeal(b2, a.userId(), ago(1), "Compote", null);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get(PATH, b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Compote", null))
                    .when().post(PATH, b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Yaourt", "all"))
                    .when().patch(ITEM_PATH, b2, eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete(ITEM_PATH, b2, eventOfB2)
                    .then().statusCode(404);

            assertEquals(1, data.countSolidMeal(b2));
        }

        @Test
        @DisplayName("Scénario : forger l'id d'un repas d'un autre bébé via mon bébé → 404 (PATCH et DELETE)")
        void event_d_un_autre_bebe() {
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            UUID eventOfB2 = data.createSolidMeal(b2, otherUser, ago(1), "Compote", MealPortion.tasted);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Piraté", "all"))
                    .when().patch(ITEM_PATH, a.babyId(), eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete(ITEM_PATH, a.babyId(), eventOfB2)
                    .then().statusCode(404);

            assertEquals(1, data.countSolidMeal(b2));
            assertEquals("Compote", data.solidMealDish(eventOfB2));
        }

        @Test
        @DisplayName("Scénario : sans session → 401 sur les quatre verbes")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            UUID event = UUID.randomUUID();

            given().when().get(PATH, baby).then().statusCode(401);
            given().contentType(ContentType.JSON).body(payload(null, "Compote", null))
                    .when().post(PATH, baby).then().statusCode(401);
            given().contentType(ContentType.JSON).body(payload(null, "Compote", null))
                    .when().patch(ITEM_PATH, baby, event).then().statusCode(401);
            given().when().delete(ITEM_PATH, baby, event).then().statusCode(401);
        }
    }
}
