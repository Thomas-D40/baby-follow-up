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
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * CRUD température (US15.1) sous le filtre d'appartenance, calqué sur {@link UrineCrudTest} avec en
 * plus une valeur obligatoire bornée (300 ≤ x10 ≤ 430, D15-J). Un {@code @Nested} par cible d'AC.
 * Jalon IDOR : mesure d'un autre bébé / bébé non lié → 404 (les deux checks, anti-énumération) ;
 * pas de session → 401. Pas de dédup serveur : deux mesures à la même seconde sont voulues.
 */
@QuarkusTest
class TemperatureCrudTest {

    static final String PWD = "temperature-crud-pwd-123";

    @Inject
    TestDataFactory data;

    /** Payload tolérant aux null (Map.of ne l'est pas) pour les charges partielles. */
    private static Map<String, Object> payload(Object occurredAt, Object temperatureCelsiusX10) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("temperatureCelsiusX10", temperatureCelsiusX10);
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

    @Nested
    @DisplayName("POST /api/babies/{babyId}/temperatures")
    class Create {

        @Test
        @DisplayName("Scénario : saisie sans heure → 201, author_id = courant, occurredAt défaut = now")
        void saisie_reussie_sans_heure() {
            Caregiver c = linkedCaregiver("creator");

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 378)) // occurredAt absent → défaut now
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(201)
                    .body("id", notNullValue())
                    .body("occurredAt", notNullValue())
                    .body("temperatureCelsiusX10", is(378))
                    .body("authorId", is(c.userId().toString()));

            assertEquals(1, data.countTemperature(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt fourni → 201, valeur conservée")
        void occurred_at_fourni() {
            Caregiver c = linkedCaregiver("creator");
            String when = Instant.now().minus(2, ChronoUnit.HOURS)
                    .truncatedTo(ChronoUnit.MILLIS).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when, 372))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(201)
                    .body("occurredAt", is(when));
        }

        @Test
        @DisplayName("Scénario : valeur manquante → 400, rien créé")
        void valeur_manquante() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, null))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countTemperature(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : corps absent → 400, rien créé (la valeur est obligatoire)")
        void corps_absent() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countTemperature(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : valeur sous la borne (299) → 400, rien créé")
        void valeur_sous_la_borne() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 299))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countTemperature(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : valeur au-dessus de la borne (431) → 400, rien créé")
        void valeur_au_dessus_de_la_borne() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 431))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countTemperature(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : bornes incluses (300 et 430) → 201")
        void bornes_incluses() {
            Caregiver c = linkedCaregiver("creator");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 300))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(201);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 430))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(201);

            assertEquals(2, data.countTemperature(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt futur > +5min → 400 ; à +4min → 201 (tolérance d'horloge)")
        void occurred_at_futur() {
            Caregiver c = linkedCaregiver("creator");

            String tropLoin = Instant.now().plus(6, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(tropLoin, 378))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(400);

            String dansLaTolerance = Instant.now().plus(4, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(dansLaTolerance, 378))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(201);

            assertEquals(1, data.countTemperature(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : occurredAt < now − 2 ans → 400")
        void occurred_at_trop_ancien() {
            Caregiver c = linkedCaregiver("creator");
            String old = Instant.now().minus(731, ChronoUnit.DAYS).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(old, 378))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(400);

            assertEquals(0, data.countTemperature(c.babyId()));
        }

        /**
         * Test d'intention : le doublon serveur est VOULU. Pas de clé d'idempotence, pas d'unicité en
         * base — deux mesures au même instant à la seconde produisent deux lignes distinctes. La
         * protection anti-double-tap est côté front (bouton désactivé jusqu'au settled + retry: 0).
         */
        @Test
        @DisplayName("Scénario : deux POST au même occurredAt → 201 ×2, deux lignes (doublon voulu)")
        void deux_mesures_rapprochees() {
            Caregiver c = linkedCaregiver("creator");
            String when = Instant.now().minus(1, ChronoUnit.HOURS)
                    .truncatedTo(ChronoUnit.SECONDS).toString();

            String premier = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when, 372))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(201)
                    .extract().path("id");

            String second = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(when, 384))
                    .when().post("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(201)
                    .extract().path("id");

            assertNotEquals(premier, second);
            assertEquals(2, data.countTemperature(c.babyId()));
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("creator");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 378))
                    .when().post("/api/babies/{babyId}/temperatures", autrui)
                    .then().statusCode(404);

            assertEquals(0, data.countTemperature(autrui));
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().contentType(ContentType.JSON)
                    .body(payload(null, 378))
                    .when().post("/api/babies/{babyId}/temperatures", baby)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("GET /api/babies/{babyId}/temperatures (keyset)")
    class List {

        /** Seed direct (repository) à un instant donné ; l'instant sert de marqueur d'ordre. */
        private UUID seed(Caregiver c, Instant occurredAt, int celsiusX10) {
            return data.createTemperature(c.babyId(), c.userId(), occurredAt, celsiusX10);
        }

        @Test
        @DisplayName("Scénario : 1ʳᵉ page triée occurred_at DESC, id DESC")
        void premiere_page_triee() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            UUID ancien = seed(c, base, 370);                              // le plus ancien
            UUID milieu = seed(c, base.plus(1, ChronoUnit.HOURS), 381);
            UUID recent = seed(c, base.plus(2, ChronoUnit.HOURS), 392);    // le plus récent

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(3))
                    .body("items[0].id", is(recent.toString())) // récent d'abord
                    .body("items[0].temperatureCelsiusX10", is(392))
                    .body("items[1].id", is(milieu.toString()))
                    .body("items[2].id", is(ancien.toString()))
                    .body("nextCursor", nullValue()); // tout tient sur une page
        }

        @Test
        @DisplayName("Scénario : page suivante via before (ni chevauchement ni saut)")
        void page_suivante_via_before() {
            Caregiver c = linkedCaregiver("lister");
            Instant base = Instant.now().minus(3, ChronoUnit.HOURS);
            UUID ancien = seed(c, base, 370);
            UUID milieu = seed(c, base.plus(1, ChronoUnit.HOURS), 381);
            UUID recent = seed(c, base.plus(2, ChronoUnit.HOURS), 392);

            String nextCursor = given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .when().get("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(2))
                    .body("items[0].id", is(recent.toString()))
                    .body("items[1].id", is(milieu.toString()))
                    .body("nextCursor", notNullValue())
                    .extract().path("nextCursor");

            // Page suivante : le reste, sans recouvrement (recent/milieu déjà vus), nextCursor = null (fin).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 2)
                    .queryParam("before", nextCursor)
                    .when().get("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(1))
                    .body("items[0].id", is(ancien.toString()))
                    .body("nextCursor", nullValue());
        }

        @Test
        @DisplayName("Scénario : before malformé → 400")
        void before_malforme() {
            Caregiver c = linkedCaregiver("lister");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("before", "pas-un-curseur")
                    .when().get("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : limit < 1 → 400")
        void limit_invalide() {
            Caregiver c = linkedCaregiver("lister");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("limit", 0)
                    .when().get("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : bébé non lié → 404")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("lister");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/temperatures", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().when().get("/api/babies/{babyId}/temperatures", baby).then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("PATCH / DELETE /api/babies/{babyId}/temperatures/{id}")
    class UpdateDelete {

        private UUID seedEvent(Caregiver c) {
            return data.createTemperature(c.babyId(), c.userId(),
                    Instant.now().minus(1, ChronoUnit.HOURS), 378);
        }

        @Test
        @DisplayName("Scénario : correction de l'heure et de la valeur → 200")
        void edition_heure_et_valeur() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String corrige = Instant.now().minus(30, ChronoUnit.MINUTES)
                    .truncatedTo(ChronoUnit.MILLIS).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(corrige, 392))
                    .when().patch("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(200)
                    .body("occurredAt", is(corrige))
                    .body("temperatureCelsiusX10", is(392));
        }

        @Test
        @DisplayName("Scénario : patch de la valeur seule → heure inchangée")
        void edition_valeur_seule_heure_inchangee() {
            Caregiver c = linkedCaregiver("editor");
            Instant when = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS);
            UUID event = data.createTemperature(c.babyId(), c.userId(), when, 378);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 401))
                    .when().patch("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(200)
                    .body("temperatureCelsiusX10", is(401))
                    .body("occurredAt", is(when.toString()));
        }

        @Test
        @DisplayName("Scénario : patch de l'heure seule → valeur inchangée")
        void edition_heure_seule_valeur_inchangee() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String corrige = Instant.now().minus(30, ChronoUnit.MINUTES)
                    .truncatedTo(ChronoUnit.MILLIS).toString();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(corrige, null))
                    .when().patch("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(200)
                    .body("occurredAt", is(corrige))
                    .body("temperatureCelsiusX10", is(378));
        }

        @Test
        @DisplayName("Scénario : correction avec une valeur hors bornes → 400")
        void edition_valeur_invalide() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 431))
                    .when().patch("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : correction occurredAt futur → 400")
        void edition_occurred_at_futur() {
            Caregiver c = linkedCaregiver("editor");
            UUID event = seedEvent(c);
            String future = Instant.now().plus(10, ChronoUnit.MINUTES).toString();
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(future, null))
                    .when().patch("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(400);
        }

        @Test
        @DisplayName("Scénario : PATCH d'un id inconnu → 404")
        void edition_id_inconnu() {
            Caregiver c = linkedCaregiver("editor");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 378))
                    .when().patch("/api/babies/{babyId}/temperatures/{id}", c.babyId(), UUID.randomUUID())
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : suppression par un caregiver lié → 204, disparaît")
        void suppression_caregiver_lie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(204);

            assertEquals(0, data.countTemperature(c.babyId()));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/temperatures", c.babyId())
                    .then().statusCode(200)
                    .body("items", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : re-suppression / id inconnu → 404")
        void suppression_id_inconnu() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(204);

            // Re-suppression du même id → plus rien → 404.
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().delete("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401 (PATCH et DELETE)")
        void non_authentifie() {
            Caregiver c = linkedCaregiver("deleter");
            UUID event = seedEvent(c);

            given().contentType(ContentType.JSON)
                    .body(payload(null, 378))
                    .when().patch("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(401);

            given().when().delete("/api/babies/{babyId}/temperatures/{id}", c.babyId(), event)
                    .then().statusCode(401);
        }
    }

    @Nested
    @DisplayName("Maximum du jour (D15-K) — le contrat null de maxForDay")
    class MaxForDay {

        @Test
        @DisplayName("Scénario : deux mesures le même jour → le MAXIMUM, ni la dernière ni un comptage")
        void deux_mesures_le_maximum() {
            Caregiver c = linkedCaregiver("max");
            Instant from = Instant.now().minus(6, ChronoUnit.HOURS);
            Instant to = Instant.now().plus(1, ChronoUnit.HOURS);
            data.createTemperature(c.babyId(), c.userId(), from.plus(1, ChronoUnit.HOURS), 372);
            data.createTemperature(c.babyId(), c.userId(), from.plus(2, ChronoUnit.HOURS), 384);
            // La plus récente est la plus basse : c'est bien le max qui doit sortir, pas la dernière.
            data.createTemperature(c.babyId(), c.userId(), from.plus(3, ChronoUnit.HOURS), 375);

            assertEquals(384, data.maxTemperatureForDay(c.babyId(), from, to));
        }

        /**
         * Contrat volontaire (D15-K) : une journée sans mesure vaut {@code null}, jamais {@code 0} —
         * le récap ne rend alors aucune chip 🌡 (ni 0, ni tiret). Ne pas « corriger » en coalesce(…, 0).
         */
        @Test
        @DisplayName("Scénario : journée sans mesure → null (surtout pas 0)")
        void journee_vide_null() {
            Caregiver c = linkedCaregiver("max");
            Instant from = Instant.now().minus(6, ChronoUnit.HOURS);
            Instant to = Instant.now().plus(1, ChronoUnit.HOURS);

            assertNull(data.maxTemperatureForDay(c.babyId(), from, to));
        }

        @Test
        @DisplayName("Scénario : bornes [from, to) — une mesure sur to est exclue")
        void bornes_semi_ouvertes() {
            Caregiver c = linkedCaregiver("max");
            Instant from = Instant.now().minus(6, ChronoUnit.HOURS);
            Instant to = Instant.now().minus(2, ChronoUnit.HOURS);
            data.createTemperature(c.babyId(), c.userId(), from, 372);  // inclus
            data.createTemperature(c.babyId(), c.userId(), to, 420);    // exclu

            assertEquals(372, data.maxTemperatureForDay(c.babyId(), from, to));
        }
    }

    @Nested
    @DisplayName("Jalon sécurité IDOR (US1.5 / D15-C)")
    class CrossAccess {

        @Test
        @DisplayName("Scénario : forger l'id d'une mesure d'un autre bébé → 404 (PATCH et DELETE), ligne intacte")
        void acces_croise_event_autre_bebe() {
            // A est lié à B1 ; B2 (d'autrui) porte une mesure dont A forge l'id.
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            Instant mesuree = Instant.now().minus(1, ChronoUnit.HOURS);
            UUID eventOfB2 = data.createTemperature(b2, otherUser, mesuree, 378);

            // Check IDOR n°2 : A est lié à B1 (path), mais l'événement appartient à B2 → 404.
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(Instant.now().minus(30, ChronoUnit.MINUTES).toString(), 402))
                    .when().patch("/api/babies/{babyId}/temperatures/{id}", a.babyId(), eventOfB2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/temperatures/{id}", a.babyId(), eventOfB2)
                    .then().statusCode(404);

            // Check IDOR n°1 : A n'est pas lié à B2 → 404 (sans révéler l'existence).
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete("/api/babies/{babyId}/temperatures/{id}", b2, eventOfB2)
                    .then().statusCode(404);

            // La mesure de la victime est intacte : ni supprimée (elle est toujours là), ni éditée
            // (le PATCH tentait 402, la base porte toujours 378).
            assertEquals(1, data.countTemperature(b2));
            assertEquals(378, data.maxTemperatureForDay(b2,
                    mesuree.minus(1, ChronoUnit.MINUTES), mesuree.plus(1, ChronoUnit.MINUTES)).intValue());
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get("/api/babies/{babyId}/temperatures", b2)
                    .then().statusCode(404); // et A ne peut toujours pas la lire
        }

        @Test
        @DisplayName("Scénario : GET / POST sur un bébé non lié → 404 (jamais 403)")
        void acces_croise_bebe_non_lie() {
            Caregiver a = linkedCaregiver("attacker");
            UUID b2 = data.createBaby("BébéAutrui");

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().get("/api/babies/{babyId}/temperatures", b2)
                    .then().statusCode(404);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .contentType(ContentType.JSON)
                    .body(payload(null, 378))
                    .when().post("/api/babies/{babyId}/temperatures", b2)
                    .then().statusCode(404);

            assertEquals(0, data.countTemperature(b2));
        }
    }
}
