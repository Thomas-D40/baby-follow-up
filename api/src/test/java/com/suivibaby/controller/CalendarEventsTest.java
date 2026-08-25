package com.suivibaby.controller;

import com.suivibaby.model.CareType;
import com.suivibaby.model.MilkType;
import com.suivibaby.model.StoolConsistency;
import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.hasKey;

/**
 * US6.1 — événements d'un jour (lecture seule, D6-A à D6-H). Un {@code @Nested} par cible d'AC (§4 du
 * plan). L'enjeu est la <strong>correction de lecture</strong> : frontières DST (été + hiver),
 * semi-ouvert à minuit (D6-C), overlap de sieste cross-minuit (D6-F), sieste en cours (D6-G), tri par
 * heure, 404-vs-vide (D6-E), IDOR (US1.5). Les bornes sont seedées via {@code ZonedDateTime} en
 * Europe/Paris pour matérialiser le bon offset de la saison.
 */
@QuarkusTest
class CalendarEventsTest {

    static final String PWD = "calendar-events-pwd-123";
    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    @Inject
    TestDataFactory data;

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

    private static Instant paris(int y, int mo, int d, int h, int mi) {
        return ZonedDateTime.of(y, mo, d, h, mi, 0, 0, PARIS).toInstant();
    }

    @Nested
    @DisplayName("Frontières de jour (DST) — D6-C/D6-D, R2")
    class DayBoundaries {

        @Test
        @DisplayName("Scénario : biberon à 23h30 Paris un jour d'ÉTÉ (offset +02:00) → bon jour")
        void biberon_2330_ete() {
            Caregiver c = linkedCaregiver("dst-summer");
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 23, 30), 120, MilkType.formula);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(1))
                    .body("[0].type", is("bottle_feeding"));

            // Pas sur le jour suivant.
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : le MÊME test un jour d'HIVER (offset +01:00) → bon jour")
        void biberon_2330_hiver() {
            Caregiver c = linkedCaregiver("dst-winter");
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 1, 15, 23, 30), 120, MilkType.formula);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-01-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-01-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : événement à 00:00:00 Paris pile → appartient au NOUVEAU jour, pas au précédent")
        void minuit_semi_ouvert() {
            Caregiver c = linkedCaregiver("midnight");
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 0, 0), StoolConsistency.soft);

            // [from, to) : 00:00 appartient à J (borne basse inclusive).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1));

            // …et PAS à J−1 (borne haute exclusive → pas de double-comptage à minuit).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-14")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }
    }

    @Nested
    @DisplayName("Sieste à cheval sur minuit — overlap (D6-C/D6-F)")
    class CrossMidnightNap {

        @Test
        @DisplayName("Scénario : sieste 22h(J)→08h(J+1) présente sur J ET J+1, absente de J−1")
        void sieste_nuit_sur_deux_jours() {
            Caregiver c = linkedCaregiver("crossnap");
            data.createNap(c.babyId(), c.userId(), paris(2026, 7, 15, 22, 0), paris(2026, 7, 16, 8, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1)).body("[0].type", is("nap"));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1)).body("[0].type", is("nap"));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-14")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : sieste entièrement dans J n'apparaît pas sur J−1/J+1")
        void sieste_dans_le_jour() {
            Caregiver c = linkedCaregiver("innap");
            data.createNap(c.babyId(), c.userId(), paris(2026, 7, 15, 13, 0), paris(2026, 7, 15, 14, 30));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-14")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }
    }

    @Nested
    @DisplayName("Sieste en cours (end_at NULL) — D6-G")
    class OngoingNap {

        @Test
        @DisplayName("Scénario : sieste ouverte démarrée hier apparaît AUSSI aujourd'hui, endAt null")
        void sieste_ouverte_hier_visible_aujourdhui() {
            Caregiver c = linkedCaregiver("ongoing");
            String today = LocalDate.now(PARIS).toString();
            String yesterday = LocalDate.now(PARIS).minusDays(1).toString();
            // Démarrée hier 23h Paris, jamais terminée (overlap couvre tous les jours depuis).
            Instant startedYesterday = LocalDate.now(PARIS).minusDays(1).atTime(23, 0).atZone(PARIS).toInstant();
            data.createNap(c.babyId(), c.userId(), startedYesterday, null);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", today)
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(1))
                    .body("[0].type", is("nap"))
                    .body("[0].endAt", nullValue());

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", yesterday)
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(1));
        }
    }

    @Nested
    @DisplayName("GET /events — tri, contenu, date")
    class ListBehaviour {

        @Test
        @DisplayName("Scénario : biberons + siestes + selles → triés par heure DESC (anté-chronologique, US11.1), types corrects")
        void journee_mixte_triee() {
            Caregiver c = linkedCaregiver("mixed");
            // Désordre d'insertion volontaire ; startAt distincts et croissants à la saisie (08:00 nap,
            // 09:00 bottle, 10:00 stool). Tri attendu ANTÉ-CHRONOLOGIQUE (US11.1) : le plus récent en
            // premier → 10:00 stool, 09:00 bottle, 08:00 nap. L'ordre DESC est donc sans ambiguïté.
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 10, 0), StoolConsistency.liquid);
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 150, MilkType.breast);
            data.createNap(c.babyId(), c.userId(), paris(2026, 7, 15, 8, 0), paris(2026, 7, 15, 8, 45));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("type", contains("stool", "bottle_feeding", "nap"))
                    .body("[0].consistency", is("liquid"))
                    .body("[1].quantityMl", is(150));
        }

        @Test
        @DisplayName("Scénario : une urine du jour apparaît dans la liste, type=urine, au bon rang DESC parmi les autres types (US13.2 Lot 3)")
        void urine_dans_liste_mixte() {
            Caregiver c = linkedCaregiver("urine-mixed");
            // startAt distincts et croissants à la saisie : 08:00 nap, 09:00 bottle, 10:00 urine, 11:00 stool.
            // Tri attendu ANTÉ-CHRONOLOGIQUE (US11.1) → 11:00 stool, 10:00 urine, 09:00 bottle, 08:00 nap.
            data.createNap(c.babyId(), c.userId(), paris(2026, 7, 15, 8, 0), paris(2026, 7, 15, 8, 45));
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 150, MilkType.breast);
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 15, 10, 0));
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 11, 0), StoolConsistency.liquid);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(4))
                    .body("type", contains("stool", "urine", "bottle_feeding", "nap"))
                    // L'urine expose son type et son startAt ; les autres champs de détail sont null.
                    .body("[1].type", is("urine"))
                    .body("[1].endAt", nullValue())
                    .body("[1].quantityMl", nullValue())
                    .body("[1].consistency", nullValue());
        }

        @Test
        @DisplayName("Scénario : une urine seule dans la journée → liste d'un élément type=urine")
        void urine_seule() {
            Caregiver c = linkedCaregiver("urine-solo");
            data.createUrine(c.babyId(), c.userId(), paris(2026, 7, 15, 14, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(1))
                    .body("[0].type", is("urine"));

            // Pas sur le jour suivant (bornes [from,to) Paris).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : deux événements au MÊME startAt → tie-break déterministe par id DESC (US11.1)")
        void meme_instant_tiebreak_id_desc() {
            Caregiver c = linkedCaregiver("tiebreak");
            // Deux selles à l'instant EXACT identique (même seconde) : à startAt égal, seul le tie-break
            // `id` départage. Exerce donc le `thenComparing(id)` du tri décroissant (jamais atteint quand
            // tous les startAt diffèrent).
            Instant sameInstant = paris(2026, 7, 15, 9, 0);
            UUID a = data.createStool(c.babyId(), c.userId(), sameInstant, StoolConsistency.soft);
            UUID b = data.createStool(c.babyId(), c.userId(), sameInstant, StoolConsistency.liquid);

            // Ordre attendu = id DESC : le comparateur `comparing(startAt).thenComparing(id).reversed()`
            // trie startAt décroissant puis, à startAt égal, id décroissant (UUID.compareTo). Calculé
            // depuis les id RÉELS, pas codé en dur → on prouve le DÉTERMINISME, pas une valeur fixe.
            List<String> expected = Stream.of(a, b)
                    .sorted(Comparator.reverseOrder())
                    .map(UUID::toString)
                    .toList();

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(2))
                    .body("id", contains(expected.get(0), expected.get(1)));
        }

        @Test
        @DisplayName("Scénario : journée vide + bébé lié → 200 liste vide")
        void journee_vide() {
            Caregiver c = linkedCaregiver("empty");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : date absente → aujourd'hui (Paris), 200")
        void date_absente_defaut_aujourdhui() {
            Caregiver c = linkedCaregiver("today");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200);
        }

        @Test
        @DisplayName("Scénario : date malformée → 400")
        void date_malformee() {
            Caregiver c = linkedCaregiver("baddate");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "15-07-2026")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(400);
        }
    }

    @Nested
    @DisplayName("Températures (US15.1)")
    class Temperatures {

        @Test
        @DisplayName("Scénario : une mesure du jour apparaît dans la frise avec son startAt et sa valeur")
        void temperature_dans_la_frise() {
            Caregiver c = linkedCaregiver("temp-solo");
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 15, 14, 0), 384);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(1))
                    .body("[0].type", is("temperature"))
                    .body("[0].startAt", is(paris(2026, 7, 15, 14, 0).toString()))
                    .body("[0].temperatureCelsiusX10", is(384))
                    // Les autres natures de détail restent nulles : un champ par nature (D15-F′).
                    .body("[0].quantityMl", nullValue())
                    .body("[0].consistency", nullValue())
                    .body("[0].endAt", nullValue());

            // Pas sur le jour suivant (bornes [from,to) Paris).
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-16")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200).body("", hasSize(0));
        }

        @Test
        @DisplayName("Scénario : la température s'insère au bon rang DESC parmi les autres types")
        void temperature_dans_liste_mixte() {
            Caregiver c = linkedCaregiver("temp-mixed");
            // 09:00 bottle, 10:00 température, 11:00 selle → DESC : selle, température, biberon.
            data.createBottleFeeding(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 150, MilkType.breast);
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 15, 10, 0), 372);
            data.createStool(c.babyId(), c.userId(), paris(2026, 7, 15, 11, 0), StoolConsistency.liquid);

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(3))
                    .body("type", contains("stool", "temperature", "bottle_feeding"))
                    .body("[1].temperatureCelsiusX10", is(372))
                    // ⛔ Le biberon n'est PAS pollué : quantityMl reste des millilitres.
                    .body("[2].quantityMl", is(150))
                    .body("[2].temperatureCelsiusX10", nullValue());
        }
    }

    @Nested
    @DisplayName("Soins médicaux — deux types de calendrier (US15.2, K1/D15-F′)")
    class MedicalCares {

        @Test
        @DisplayName("Scénario : un soin des yeux remonte en type=eye_care, un soin du nez en type=nose_care")
        void deux_types_de_presentation_distincts() {
            Caregiver c = linkedCaregiver("care-types");
            data.createMedicalCare(c.babyId(), c.userId(), CareType.eye, paris(2026, 7, 15, 9, 0));
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, paris(2026, 7, 15, 10, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(2))
                    // DESC : le nez (10:00) puis les yeux (09:00). Deux types DISTINCTS, jamais un
                    // unique `medical_care` : sans ça, les deux toggles de filtre ne masqueraient rien.
                    .body("type", contains("nose_care", "eye_care"));
        }

        @Test
        @DisplayName("Scénario : le DTO calendrier d'un soin ne porte AUCUN champ careType (corollaire K1)")
        void aucun_champ_care_type_dans_le_dto_calendrier() {
            Caregiver c = linkedCaregiver("care-nofield");
            data.createMedicalCare(c.babyId(), c.userId(), CareType.eye, paris(2026, 7, 15, 9, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(1))
                    .body("[0].type", is("eye_care"))
                    // Absence du champ, pas « champ à null » : avec deux types de présentation, plus
                    // rien ne le lit côté front. `careType` reste sur MedicalCareResponse.
                    .body("[0]", not(hasKey("careType")));
        }

        @Test
        @DisplayName("Scénario : soins et température cohabitent dans la frise, triés DESC")
        void soins_et_temperature_dans_liste_mixte() {
            Caregiver c = linkedCaregiver("care-mixed");
            data.createMedicalCare(c.babyId(), c.userId(), CareType.eye, paris(2026, 7, 15, 8, 0));
            data.createTemperature(c.babyId(), c.userId(), paris(2026, 7, 15, 9, 0), 380);
            data.createMedicalCare(c.babyId(), c.userId(), CareType.nose, paris(2026, 7, 15, 10, 0));

            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", c.babyId())
                    .then().statusCode(200)
                    .body("", hasSize(3))
                    .body("type", contains("nose_care", "temperature", "eye_care"))
                    .body("[1].temperatureCelsiusX10", is(380))
                    // Un soin ne porte aucune valeur de température.
                    .body("[0].temperatureCelsiusX10", nullValue());
        }
    }

    @Nested
    @DisplayName("Isolation (US1.5 / D6-E)")
    class Isolation {

        @Test
        @DisplayName("Scénario : bébé non lié → 404 (pas 403, pas 200 vide)")
        void bebe_non_lie() {
            Caregiver c = linkedCaregiver("iso");
            UUID autrui = data.createBaby("Autrui");
            given().cookie(AuthFixture.COOKIE, c.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", autrui)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : accès croisé — A lié à B1 demande /babies/{B2}/events → 404, ne voit rien")
        void acces_croise() {
            Caregiver a = linkedCaregiver("attacker");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim"), PWD);
            UUID b2 = data.createBaby("BébéVictime");
            data.link(otherUser, b2);
            data.createBottleFeeding(b2, otherUser, paris(2026, 7, 15, 9, 0), 100, MilkType.formula);

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", b2)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : accès croisé sur une journée de température et de soins → 404, rien fuité (US15.1/US15.2)")
        void acces_croise_temperature_et_soins() {
            Caregiver a = linkedCaregiver("attacker-med");
            UUID otherUser = data.createActiveParent(data.uniqueEmail("victim-med"), PWD);
            UUID b2 = data.createBaby("BébéVictimeMédical");
            data.link(otherUser, b2);
            data.createTemperature(b2, otherUser, paris(2026, 7, 15, 9, 0), 385);
            data.createMedicalCare(b2, otherUser, CareType.nose, paris(2026, 7, 15, 10, 0));

            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", b2)
                    .then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : non authentifié → 401")
        void non_authentifie() {
            UUID baby = data.createBaby("X");
            given().queryParam("date", "2026-07-15")
                    .when().get("/api/babies/{babyId}/events", baby)
                    .then().statusCode(401);
        }
    }
}
