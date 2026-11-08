package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
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
import static org.junit.jupiter.api.Assertions.assertNull;

// Épic 19, US19.1 — medication intake CRUD under the membership filter, cloned from SolidMealCrudTest.
// Specific rules: mandatory free-text name and optional free-text dosage (both: edges stripped, inner
// blanks collapsed, <= 60 chars, case and accents kept) and a PATCH where a null dosage is CLEARED
// while a null name / occurredAt is unchanged (D19-P). Two intakes at the same time are never
// compared (D19-W): every list test uses distinct hours.
@QuarkusTest
class MedicationCrudTest {

    static final String PWD = "medication-crud-pwd-123";
    static final String PATH = "/api/babies/{babyId}/medications";
    static final String ITEM_PATH = PATH + "/{id}";
    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    @Inject
    TestDataFactory data;

    // Null-tolerant payload (Map.of is not): every key is always sent, null when not specified.
    private static Map<String, Object> payload(Object occurredAt, Object medicationName, Object dosage) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("medicationName", medicationName);
        m.put("dosage", dosage);
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

    private static Instant paris(int y, int mo, int d, int h, int mi) {
        return ZonedDateTime.of(y, mo, d, h, mi, 0, 0, PARIS).toInstant();
    }

    @Nested
    @DisplayName("POST /api/babies/{babyId}/medications")
    class Create {

        @Test
        @DisplayName("Scénario : Doliprane « 1 dose 6 kg » à l'heure saisie → 201, valeurs conservées, author_id = courant")
        void defaut_avec_posologie() {
            Caregiver c = linkedCaregiver("creator");
            String when = ago(3).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when, "Doliprane", "1 dose 6 kg"))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .body("occurredAt", is(when))
                    .body("medicationName", is("Doliprane"))
                    .body("dosage", is("1 dose 6 kg"))
                    .body("authorId", is(c.userId().toString()));

            assertEquals(1, data.countMedication(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : heure absente → 201, occurredAt = maintenant")
        void heure_absente() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Ventoline", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("occurredAt", notNullValue());
        }

        @Test
        @DisplayName("Scénario : sans posologie — absente, vide ou blanche → 201, dosage null (réponse et base)")
        void sans_posologie() {
            Caregiver c = linkedCaregiver("creator");

            // Key absent altogether.
            Map<String, Object> absent = new HashMap<>();
            absent.put("medicationName", "Ventoline");
            String id1 = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(absent)
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("dosage", nullValue())
                    .extract().path("id");
            assertNull(data.medicationDosage(UUID.fromString(id1)));

            for (String blank : new String[]{"", "   "}) {
                String id = given().cookie(AuthFixture.COOKIE, c.cookie())
                        .contentType(ContentType.JSON)
                        .body(payload(null, "Ventoline", blank))
                        .when().post(PATH, c.babyId())
                        .then().statusCode(201)
                        .body("dosage", nullValue())
                        .extract().path("id");
                assertNull(data.medicationDosage(UUID.fromString(id)));
            }
        }

        @Test
        @DisplayName("Scénario : médicament libre « Gaviscon » → 201")
        void medicament_libre() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Gaviscon", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("medicationName", is("Gaviscon"));
        }

        @Test
        @DisplayName("Scénario : médicament obligatoire — null, vide, blanc ou corps absent → 400, rien enregistré")
        void medicament_obligatoire() {
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

            assertEquals(0, data.countMedication(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : médicament de 61 caractères → 400 ; de 60 → 201")
        void medicament_trop_long() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "x".repeat(61), null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);
            assertEquals(0, data.countMedication(c.babyId()));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "x".repeat(60), null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201);
            assertEquals(1, data.countMedication(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : posologie de 61 caractères → 400 ; de 60 → 201")
        void posologie_trop_longue() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Doliprane", "x".repeat(61)))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);
            assertEquals(0, data.countMedication(c.babyId()));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Doliprane", "x".repeat(60)))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201);
            assertEquals(1, data.countMedication(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : la longueur se mesure après mise en forme (espaces de bord ignorés)")
        void longueur_apres_mise_en_forme() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  " + "x".repeat(60) + "  ", "  " + "y".repeat(60) + "  "))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("medicationName", is("x".repeat(60)))
                    .body("dosage", is("y".repeat(60)));
        }

        @Test
        @DisplayName("Scénario : enregistré tel que saisi — bords retirés, blancs répétés réduits, casse conservée")
        void mise_en_forme() {
            Caregiver c = linkedCaregiver("creator");

            String id = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  Gaviscon   nourrisson  ", "  2  ml"))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("medicationName", is("Gaviscon nourrisson"))
                    .body("dosage", is("2 ml"))
                    .extract().path("id");

            assertEquals("Gaviscon nourrisson", data.medicationName(UUID.fromString(id)));
            assertEquals("2 ml", data.medicationDosage(UUID.fromString(id)));
        }

        @Test
        @DisplayName("Scénario : texte libre égal à un défaut (« doliprane ») → enregistré tel que tapé")
        void libre_egal_a_un_defaut() {
            Caregiver c = linkedCaregiver("creator");

            String id = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "doliprane", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(201)
                    .body("medicationName", is("doliprane"))
                    .extract().path("id");

            assertEquals("doliprane", data.medicationName(UUID.fromString(id)));
        }

        @Test
        @DisplayName("Scénario : heure invalide (futur > +5 min, passé < now − 730 j) → 400, rien enregistré")
        void heure_invalide() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().plus(10, ChronoUnit.MINUTES).toString(), "Doliprane", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().minus(731, ChronoUnit.DAYS).toString(), "Doliprane", null))
                    .when().post(PATH, c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countMedication(c.babyId()));
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/medications (keyset)")
    class List {

        @Test
        @DisplayName("Scénario : 1ʳᵉ page triée occurredAt DESC, puis page suivante via before")
        void pages_triees() {
            Caregiver c = linkedCaregiver("lister");
            UUID ancien = data.createMedication(c.babyId(), c.userId(), ago(5), "Smecta", null);
            UUID milieu = data.createMedication(c.babyId(), c.userId(), ago(4), "Advil", "1 dose");
            UUID recent = data.createMedication(c.babyId(), c.userId(), ago(3), "Doliprane", "1 dose 6 kg");

            String nextCursor = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .when().get(PATH, c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(2))
                    .body("items[0].id", is(recent.toString()))
                    .body("items[0].medicationName", is("Doliprane"))
                    .body("items[0].dosage", is("1 dose 6 kg"))
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
                    .body("items[0].dosage", nullValue())
                    .body("nextCursor", nullValue());
        }

        @Test
        @DisplayName("Scénario : limit par défaut 20, plafonné à 50")
        void limit_par_defaut_et_plafond() {
            Caregiver c = linkedCaregiver("lister");
            // Distinct minutes keep the order unambiguous (D19-W).
            for (int i = 0; i < 51; i++) {
                data.createMedication(c.babyId(), c.userId(),
                        Instant.now().minus(1, ChronoUnit.HOURS).minus(i, ChronoUnit.MINUTES), "Doliprane", null);
            }

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get(PATH, c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(20))
                    .body("nextCursor", notNullValue());

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 100)
                    .when().get(PATH, c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(50))
                    .body("nextCursor", notNullValue());
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
        @DisplayName("Scénario : curseur invalide → 400")
        void curseur_invalide() {
            Caregiver c = linkedCaregiver("lister");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("before", "not-a-cursor")
                    .when().get(PATH, c.babyId())
                    .then().statusCode(400);
        }
    }

    @Nested
    @DisplayName("PATCH / DELETE /api/babies/{babyId}/medications/{id}")
    class UpdateDelete {

        private UUID seedEvent(Caregiver c) {
            return data.createMedication(c.babyId(), c.userId(), ago(2), "Dolipran", "1 dose 6 kg");
        }

        @Test
        @DisplayName("Scénario : corriger Dolipran → Doliprane, effacer la posologie (null), changer l'heure → 200, valeurs stockées")
        void corriger_une_prise() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String corrige = ago(1).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(corrige, "Doliprane", null))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("medicationName", is("Doliprane"))
                    .body("dosage", nullValue())
                    .body("occurredAt", is(corrige));

            assertEquals("Doliprane", data.medicationName(event));
            assertNull(data.medicationDosage(event));
        }

        @Test
        @DisplayName("Scénario : medicationName null = inchangé ; la posologie envoyée est posée")
        void nom_null_inchange() {
            Caregiver c = linkedCaregiver("editor");
            Instant start = ago(2);
            UUID event = data.createMedication(c.babyId(), c.userId(), start, "Doliprane", null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, null, "2 ml"))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("medicationName", is("Doliprane"))
                    .body("dosage", is("2 ml"))
                    .body("occurredAt", is(start.toString()));

            assertEquals("Doliprane", data.medicationName(event));
            assertEquals("2 ml", data.medicationDosage(event));
        }

        @Test
        @DisplayName("Scénario : posologie vide ou blanche au PATCH → effacée")
        void posologie_blanche_effacee() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, null, "   "))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("dosage", nullValue());

            assertNull(data.medicationDosage(event));
        }

        @Test
        @DisplayName("Scénario : défaut → libre au PATCH (Advil → Nurofen)")
        void defaut_vers_libre() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = data.createMedication(c.babyId(), c.userId(), ago(2), "Advil", null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Nurofen", null))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("medicationName", is("Nurofen"));

            assertEquals("Nurofen", data.medicationName(event));
        }

        @Test
        @DisplayName("Scénario : le nom et la posologie modifiés sont mis en forme comme à la création")
        void textes_modifies_mis_en_forme() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  Gaviscon   nourrisson ", "  2  ml "))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("medicationName", is("Gaviscon nourrisson"))
                    .body("dosage", is("2 ml"));

            assertEquals("Gaviscon nourrisson", data.medicationName(event));
            assertEquals("2 ml", data.medicationDosage(event));
        }

        @Test
        @DisplayName("Scénario : nom blanc ou trop long au PATCH → 400, prise inchangée")
        void nom_invalide_au_patch() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "  ", null))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(400);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "x".repeat(61), null))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(400);

            assertEquals("Dolipran", data.medicationName(event));
            assertEquals("1 dose 6 kg", data.medicationDosage(event));
        }

        @Test
        @DisplayName("Scénario : posologie trop longue au PATCH → 400, prise inchangée")
        void posologie_invalide_au_patch() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Doliprane", "x".repeat(61)))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(400);

            assertEquals("Dolipran", data.medicationName(event));
            assertEquals("1 dose 6 kg", data.medicationDosage(event));
        }

        @Test
        @DisplayName("Scénario : correction de l'heure → 200 ; futur → 400")
        void correction_heure() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String corrige = ago(1).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(corrige, null, "1 dose 6 kg"))
                    .when().patch(ITEM_PATH, c.babyId(), event)
                    .then().statusCode(200)
                    .body("occurredAt", is(corrige));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().plus(10, ChronoUnit.MINUTES).toString(), null, "1 dose 6 kg"))
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
                    .body(payload(null, "Doliprane", null))
                    .when().patch(ITEM_PATH, c.babyId(), UUID.randomUUID())
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : suppression → 204, la prise disparaît, medicationCount diminue de 1 ; re-suppression → 404")
        void suppression() {
            Caregiver c = linkedCaregiver("deleter");
            UUID first = data.createMedication(c.babyId(), c.userId(), paris(2026, 7, 15, 8, 10), "Doliprane", null);
            UUID second = data.createMedication(c.babyId(), c.userId(), paris(2026, 7, 15, 14, 0), "Ventoline", null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("medicationCount", is(2));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(ITEM_PATH, c.babyId(), first)
                    .then().statusCode(204);
            assertEquals(1, data.countMedication(c.babyId()));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/daily-totals", c.babyId())
                    .then().statusCode(200)
                    .body("medicationCount", is(1));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete(ITEM_PATH, c.babyId(), first)
                    .then().statusCode(404);
            assertEquals("Ventoline", data.medicationName(second));
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
            UUID eventOfB2 = data.createMedication(b2, a.userId(), ago(1), "Doliprane", null);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get(PATH, b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Doliprane", null))
                    .when().post(PATH, b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Advil", "1 dose"))
                    .when().patch(ITEM_PATH, b2, eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete(ITEM_PATH, b2, eventOfB2)
                    .then().statusCode(404);

            assertEquals(1, data.countMedication(b2));
        }

        @Test
        @DisplayName("Scénario : forger l'id d'une prise d'un autre bébé via mon bébé → 404 (PATCH et DELETE)")
        void event_d_un_autre_bebe() {
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            UUID eventOfB2 = data.createMedication(b2, otherUser, ago(1), "Doliprane", "1 dose 6 kg");

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, "Piraté", "x"))
                    .when().patch(ITEM_PATH, a.babyId(), eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete(ITEM_PATH, a.babyId(), eventOfB2)
                    .then().statusCode(404);

            assertEquals(1, data.countMedication(b2));
            assertEquals("Doliprane", data.medicationName(eventOfB2));
            assertEquals("1 dose 6 kg", data.medicationDosage(eventOfB2));
        }

        @Test
        @DisplayName("Scénario : sans session → 401 sur les quatre verbes")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            UUID event = UUID.randomUUID();

            given().when().get(PATH, baby).then().statusCode(401);
            given().contentType(ContentType.JSON).body(payload(null, "Doliprane", null))
                    .when().post(PATH, baby).then().statusCode(401);
            given().contentType(ContentType.JSON).body(payload(null, "Doliprane", null))
                    .when().patch(ITEM_PATH, baby, event).then().statusCode(401);
            given().when().delete(ITEM_PATH, baby, event).then().statusCode(401);
        }
    }
}
