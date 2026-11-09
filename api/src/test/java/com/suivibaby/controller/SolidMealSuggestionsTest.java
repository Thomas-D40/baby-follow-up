package com.suivibaby.controller;

import com.suivibaby.test.AuthFixture;
import com.suivibaby.test.TestDataFactory;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 23, US23.2 — GET /api/babies/{babyId}/solid-meals/dish-suggestions?q=
// The baby's own meal history (newest first) then the shared dish list, merged on the server.
//
// ⚠ The shared dish list is GLOBAL and persistent: every shared label seeded here carries a random
// alphabetic token, and the request that isolates it contains that token. The meal HISTORY is per
// baby and every test uses a fresh baby: history labels need no token unless the test also mixes the
// shared list in. Orders are only asserted on instants that differ, and on shared pairs decided by a
// letter (independent of the Postgres collation).
@QuarkusTest
class SolidMealSuggestionsTest {

    static final String PWD = "dish-suggestions-pwd-123";
    static final String MEALS = "/api/babies/{babyId}/solid-meals";
    static final String SUGGESTIONS = MEALS + "/dish-suggestions";
    static final String DISHES = "/api/dishes";

    @Inject
    TestDataFactory data;

    // Lower-case alphabetic token, unique per call: letters only, so normalization leaves it unchanged.
    private static String token() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            sb.append((char) ('a' + ThreadLocalRandom.current().nextInt(26)));
        }
        return sb.toString();
    }

    private record Parent(UUID userId, UUID babyId, String cookie) {
    }

    // An active parent linked to a baby of their own (their "family"), logged in.
    private Parent parent(String prefix) {
        String email = data.uniqueEmail(prefix);
        UUID userId = data.createActiveParent(email, PWD);
        UUID babyId = data.createBaby("Bébé-" + prefix);
        data.link(userId, babyId);
        return new Parent(userId, babyId, AuthFixture.loginCookie(email, PWD));
    }

    private static Instant ago(long hours) {
        return Instant.now().minus(hours, ChronoUnit.HOURS);
    }

    private static Instant daysAgo(long days) {
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }

    // Direct seed of a meal given by the parent himself.
    private void seed(Parent p, Instant at, String dish) {
        data.createSolidMeal(p.babyId(), p.userId(), at, dish, null);
    }

    private Response suggestionsResponse(Parent p, UUID babyId, String q) {
        var request = given().cookie(AuthFixture.COOKIE, p.cookie());
        if (q != null) {
            request = request.queryParam("q", q);
        }
        return request.when().get(SUGGESTIONS, babyId);
    }

    private JsonPath suggestions(Parent p, String q) {
        return suggestionsResponse(p, p.babyId(), q).then().statusCode(200).extract().jsonPath();
    }

    private static Map<String, Object> meal(Object occurredAt, Object dish, Object addToDishes) {
        Map<String, Object> m = new HashMap<>();
        m.put("occurredAt", occurredAt);
        m.put("dish", dish);
        m.put("addToDishes", addToDishes);
        return m;
    }

    private Response postMeal(Parent p, Map<String, Object> body) {
        return given().cookie(AuthFixture.COOKIE, p.cookie())
                .contentType(ContentType.JSON)
                .body(body)
                .when().post(MEALS, p.babyId());
    }

    @Nested
    @DisplayName("Les plats récents à l'ouverture")
    class RecentAtOpening {

        @Test
        @DisplayName("Scénario : rien de tapé → les plats distincts du bébé, du plus récent au plus ancien")
        void recents_a_l_ouverture() {
            Parent p = parent("recent");
            seed(p, daysAgo(1), "Banane");
            seed(p, daysAgo(1).minus(4, ChronoUnit.HOURS), "Purée de carottes");
            seed(p, daysAgo(2), "Banane");

            assertEquals(List.of("Banane", "Purée de carottes"), suggestions(p, "").getList("labels"));
        }

        @Test
        @DisplayName("Scénario : q absent, vide ou blanc donnent le même résultat (200, pas d'erreur)")
        void q_absent_vide_ou_blanc() {
            Parent p = parent("recent-q");
            seed(p, daysAgo(1), "Banane");
            seed(p, daysAgo(1).minus(4, ChronoUnit.HOURS), "Purée de carottes");
            List<String> expected = List.of("Banane", "Purée de carottes");

            assertEquals(expected, suggestions(p, null).getList("labels"));
            assertEquals(expected, suggestions(p, "").getList("labels"));
            assertEquals(expected, suggestions(p, "   ").getList("labels"));
        }
    }

    @Nested
    @DisplayName("Le référentiel n'apparaît pas avant la frappe")
    class NoSharedBeforeTyping {

        @Test
        @DisplayName("Scénario : un plat partagé que le bébé n'a pas mangé n'est pas proposé tant que rien n'est tapé")
        void pas_de_partage_avant_la_frappe() {
            Parent p = parent("noshared");
            String j = token();
            data.createDish(p.userId(), "Compote poire-vanille " + j);

            JsonPath result = suggestions(p, "");

            assertFalse(result.getList("labels").contains("Compote poire-vanille " + j));
            assertFalse(result.getBoolean("exactMatch"));
        }
    }

    @Nested
    @DisplayName("Un plat jamais partagé revient")
    class UnsharedComesBack {

        @Test
        @DisplayName("Scénario : un plat saisi sans la case revient chez son bébé, jamais chez une autre famille")
        void non_partage_revient() {
            Parent a = parent("unshared-a");
            Parent b = parent("unshared-b");
            String j = token();
            String label = "Pâtes au jambon " + j;

            postMeal(a, meal(null, label, null)).then().statusCode(201);

            assertTrue(suggestions(a, "").getList("labels").contains(label));
            assertFalse(suggestions(b, j).getList("labels").contains(label));
            assertEquals(0, data.countDishesNormalized(label));
        }
    }

    @Nested
    @DisplayName("Partager plus tard un plat récent")
    class ExactMatchIgnoresHistory {

        @Test
        @DisplayName("Scénario : un plat présent seulement dans l'historique est proposé, exactMatch reste faux")
        void exact_match_ignore_l_historique() {
            Parent a = parent("exact-history");
            String j = token();
            String label = "Pâtes au jambon " + j;
            postMeal(a, meal(null, label, null)).then().statusCode(201);

            JsonPath result = suggestions(a, label);

            assertTrue(result.getList("labels").contains(label));
            assertFalse(result.getBoolean("exactMatch"));
        }

        @Test
        @DisplayName("Scénario : un plat du référentiel donne exactMatch vrai, sur le texte entier (casse et blancs ignorés)")
        void exact_match_du_referentiel() {
            Parent p = parent("exact-shared");
            String j = token();
            data.createDish(p.userId(), "Purée de panais " + j);

            assertTrue(suggestions(p, "purée de  panais " + j).getBoolean("exactMatch"));
            assertFalse(suggestions(p, "panais " + j).getBoolean("exactMatch"));
        }
    }

    @Nested
    @DisplayName("Un ancien repas « Purée » est un plat récent")
    class OldPureeIsRecent {

        @Test
        @DisplayName("Scénario : un repas « Purée » déjà saisi est proposé comme n'importe quel plat récent")
        void ancien_puree() {
            Parent p = parent("old-puree");
            seed(p, daysAgo(10), "Purée");

            assertTrue(suggestions(p, "").getList("labels").contains("Purée"));
        }
    }

    @Nested
    @DisplayName("« Purée » partagé est proposé à toutes les familles")
    class SharedPureeVisible {

        @Test
        @DisplayName("Scénario : un parent d'une autre famille tape « purée » et retrouve le « Purée » partagé")
        void puree_partage_visible() {
            data.deleteDishesNormalized("Purée");
            Parent a = parent("puree-shared-a");
            Parent b = parent("puree-shared-b");

            postMeal(a, meal(null, "Purée", true)).then().statusCode(201);

            JsonPath result = suggestions(b, "purée");
            assertTrue(result.getList("labels").contains("Purée"));
            assertTrue(result.getBoolean("exactMatch"));
        }
    }

    @Nested
    @DisplayName("Au plus dix plats récents")
    class AtMostTenRecent {

        @Test
        @DisplayName("Scénario : douze plats distincts → les dix plus récents, dans l'ordre")
        void au_plus_dix() {
            Parent p = parent("ten-recent");
            List<String> expected = new ArrayList<>();
            for (int i = 0; i < 12; i++) {
                String label = "Plat " + (char) ('a' + i);
                seed(p, ago(i + 1), label);
                if (i < 10) {
                    expected.add(label);
                }
            }

            assertEquals(expected, suggestions(p, "").getList("labels"));
        }
    }

    @Nested
    @DisplayName("Variantes d'un même plat")
    class Variants {

        @Test
        @DisplayName("Scénario : « purée de carottes » ce matin et « Puree de Carottes » hier → un seul, le libellé le plus récent")
        void variantes() {
            Parent p = parent("variants");

            postMeal(p, meal(ago(2).toString(), "purée de carottes", null)).then().statusCode(201);
            postMeal(p, meal(daysAgo(1).toString(), "Puree de Carottes", null)).then().statusCode(201);

            assertEquals(List.of("purée de carottes"), suggestions(p, "").getList("labels"));
        }
    }

    @Nested
    @DisplayName("Bébé sans repas")
    class NoMeal {

        @Test
        @DisplayName("Scénario : bébé neuf → labels vide, exactMatch faux, exactement ces deux clés")
        void sans_repas() {
            Parent p = parent("nomeal");

            JsonPath result = suggestions(p, "");

            assertEquals(List.of(), result.getList("labels"));
            assertFalse(result.getBoolean("exactMatch"));
            assertEquals(Set.of("labels", "exactMatch"), result.getMap("$").keySet());
        }
    }

    @Nested
    @DisplayName("Historique puis référentiel")
    class HistoryThenShared {

        @Test
        @DisplayName("Scénario : les plats du bébé précèdent les plats partagés, même alphabétiquement postérieurs")
        void historique_puis_referentiel() {
            Parent p = parent("history-shared");
            String j = token();
            seed(p, ago(3), "Compote maison " + j);
            data.createDish(p.userId(), "Compote poire-vanille " + j);
            data.createDish(p.userId(), "Abricot " + j);

            assertEquals(List.of("Compote maison " + j, "Abricot " + j, "Compote poire-vanille " + j),
                    suggestions(p, j).getList("labels"));
        }
    }

    @Nested
    @DisplayName("La recherche remonte au-delà des dix récents")
    class SearchWholeHistory {

        @Test
        @DisplayName("Scénario : un plat de il y a trois mois est absent à l'ouverture, trouvé en tapant")
        void recherche_dans_tout_l_historique() {
            Parent p = parent("whole-history");
            seed(p, daysAgo(90), "Fenouil");
            for (int i = 0; i < 10; i++) {
                seed(p, ago(i + 1), "Plat " + (char) ('a' + i));
            }

            assertFalse(suggestions(p, "").getList("labels").contains("Fenouil"));
            assertTrue(suggestions(p, "fenou").getList("labels").contains("Fenouil"));
        }
    }

    @Nested
    @DisplayName("Pas de doublon entre les deux sources")
    class NoDuplicate {

        @Test
        @DisplayName("Scénario : un plat du bébé aussi au référentiel apparaît une fois, avec le libellé du repas")
        void pas_de_doublon() {
            Parent p = parent("nodup");
            String j = token();
            seed(p, ago(2), "yaourt " + j);
            data.createDish(p.userId(), "Yaourt " + j);

            JsonPath result = suggestions(p, "yaourt " + j);

            assertEquals(List.of("yaourt " + j), result.getList("labels"));
            assertTrue(result.getBoolean("exactMatch"));
        }
    }

    @Nested
    @DisplayName("Dix propositions au plus en tout")
    class TenInTotal {

        @Test
        @DisplayName("Scénario : 6 plats du bébé puis les 4 premiers plats partagés, l'ensemble plafonné à dix")
        void dix_en_tout() {
            Parent p = parent("ten-total");
            String j = token();
            List<String> expected = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                String label = "Pur" + (char) ('a' + i) + " " + j;
                seed(p, ago(i + 1), label);
                expected.add(label);
            }
            for (int i = 0; i < 8; i++) {
                String label = "Pur" + (char) ('m' + i) + " " + j;
                data.createDish(p.userId(), label);
                if (i < 4) {
                    expected.add(label);
                }
            }

            List<String> labels = suggestions(p, j).getList("labels");

            assertEquals(10, labels.size());
            assertEquals(expected, labels);
        }
    }

    @Nested
    @DisplayName("Le plat noté remonte en tête")
    class NewMealOnTop {

        @Test
        @DisplayName("Scénario : après avoir noté « Poire », elle précède « Banane » (saisie de maintenant)")
        void nouveau_repas_en_tete() {
            Parent p = parent("on-top");
            seed(p, ago(2), "Banane");

            postMeal(p, meal(null, "Poire", null)).then().statusCode(201);

            assertEquals(List.of("Poire", "Banane"), suggestions(p, "").getList("labels"));
        }
    }

    @Nested
    @DisplayName("Un repas saisi après coup garde sa place")
    class LateEntryKeepsPlace {

        @Test
        @DisplayName("Scénario : un repas noté maintenant mais daté d'il y a 7 h passe après un repas d'il y a 1 h")
        void saisie_apres_coup() {
            Parent p = parent("late");
            seed(p, ago(1), "Banane");

            postMeal(p, meal(ago(7).toString(), "Poire", null)).then().statusCode(201);

            assertEquals(List.of("Banane", "Poire"), suggestions(p, "").getList("labels"));
        }
    }

    @Nested
    @DisplayName("Corriger un repas corrige les propositions")
    class EditMealChangesSuggestions {

        @Test
        @DisplayName("Scénario : après correction du plat d'un repas, seul le libellé corrigé est proposé")
        void correction() {
            Parent p = parent("edit");
            UUID meal = data.createSolidMeal(p.babyId(), p.userId(), ago(3), "Purée de carrotes", null);

            Map<String, Object> patch = new HashMap<>();
            patch.put("occurredAt", null);
            patch.put("dish", "Purée de carottes");
            patch.put("portion", null);
            given().cookie(AuthFixture.COOKIE, p.cookie())
                    .contentType(ContentType.JSON)
                    .body(patch)
                    .when().patch(MEALS + "/{id}", p.babyId(), meal)
                    .then().statusCode(200);

            assertEquals(List.of("Purée de carottes"), suggestions(p, "").getList("labels"));
        }
    }

    @Nested
    @DisplayName("Gérer le référentiel ne touche pas les récents")
    class ManagingSharedListKeepsRecent {

        @Test
        @DisplayName("Scénario : supprimer mon plat partagé le retire des autres familles, pas de mes récents")
        void supprimer_le_plat_partage() {
            Parent a = parent("manage-a");
            Parent b = parent("manage-b");
            String j = token();
            String label = "Compote poire " + j;

            postMeal(a, meal(null, label, true)).then().statusCode(201);
            assertTrue(suggestions(b, j).getList("labels").contains(label));

            String dishId = given().cookie(AuthFixture.COOKIE, a.cookie())
                    .queryParam("q", label)
                    .when().get(DISHES)
                    .then().statusCode(200)
                    .extract().path("items[0].id");
            given().cookie(AuthFixture.COOKIE, a.cookie())
                    .when().delete(DISHES + "/{id}", dishId)
                    .then().statusCode(204);

            assertTrue(suggestions(a, "").getList("labels").contains(label));
            assertFalse(suggestions(b, j).getList("labels").contains(label));
        }
    }

    @Nested
    @DisplayName("Chaque bébé ses plats")
    class PerBaby {

        @Test
        @DisplayName("Scénario : un parent lié à deux bébés — le plat du premier n'est pas proposé pour le second")
        void par_bebe() {
            Parent p = parent("per-baby");
            UUID second = data.createBaby("Bébé-second");
            data.link(p.userId(), second);
            seed(p, ago(1), "Banane");

            assertTrue(suggestions(p, "").getList("labels").contains("Banane"));
            List<String> forSecond = suggestionsResponse(p, second, "")
                    .then().statusCode(200).extract().jsonPath().getList("labels");
            assertFalse(forSecond.contains("Banane"));
        }
    }

    @Nested
    @DisplayName("Co-parents")
    class CoParents {

        @Test
        @DisplayName("Scénario : le repas saisi par l'autre parent est proposé (historique de tous les auteurs)")
        void co_parent() {
            Parent a = parent("coparent-a");
            Parent b = parent("coparent-b");
            data.linkAsCaregiver(b.userId(), a.babyId());
            data.createSolidMeal(a.babyId(), b.userId(), ago(1), "Banane", null);

            assertTrue(suggestionsResponse(a, a.babyId(), "").then().statusCode(200)
                    .extract().jsonPath().getList("labels").contains("Banane"));
            assertTrue(suggestionsResponse(b, a.babyId(), "").then().statusCode(200)
                    .extract().jsonPath().getList("labels").contains("Banane"));
        }
    }

    @Nested
    @DisplayName("Isolation")
    class Isolation {

        @Test
        @DisplayName("Scénario : bébé d'une autre famille ou inconnu → 404 ; sans session → 401 ; parent lié → 200")
        void isolation() {
            Parent mine = parent("isolation-mine");
            Parent other = parent("isolation-other");
            seed(other, ago(1), "Banane");

            suggestionsResponse(mine, other.babyId(), "").then().statusCode(404);
            suggestionsResponse(mine, UUID.randomUUID(), "").then().statusCode(404);
            given().queryParam("q", "")
                    .when().get(SUGGESTIONS, mine.babyId())
                    .then().statusCode(401);
            // Guard against a general failure: the linked parent does get a 200 on the same route.
            suggestionsResponse(mine, mine.babyId(), "").then().statusCode(200);
        }
    }
}
