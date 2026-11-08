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

// Épic 18, US18.4-US18.5 — the shared dish list (first data not scoped to a baby, D18-R).
//
// ⚠ The database persists for the whole run and the list is GLOBAL: every label is made unique with a
// random alphabetic token, and no test ever asserts the EQUALITY of a global list — only presence,
// absence or relative order of its own dishes (the token is the search key that isolates them).
// Ordering assertions only use pairs that do not depend on the Postgres collation (a letter decides).
@QuarkusTest
class DishTest {

    static final String PWD = "dish-pwd-123";
    static final String DISHES = "/api/dishes";
    static final String MEALS = "/api/babies/{babyId}/solid-meals";

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

    private JsonPath search(Parent p, String q) {
        return given().cookie(AuthFixture.COOKIE, p.cookie())
                .queryParam("q", q)
                .when().get(DISHES)
                .then().statusCode(200)
                .extract().jsonPath();
    }

    @Nested
    @DisplayName("Ajouter en enregistrant (US18.4, D18-AF)")
    class AddFromMeal {

        @Test
        @DisplayName("Scénario : repas + addToDishes → un plat créé, auteur = moi")
        void ajouter_en_enregistrant() {
            Parent p = parent("add");
            String label = "Purée de carottes " + token();

            postMeal(p, meal(null, label, true)).then().statusCode(201);

            assertEquals(1, data.countDishesNormalized(label));
            String id = search(p, label).getString("items[0].id");
            assertEquals(p.userId(), data.dishAuthor(UUID.fromString(id)));
        }

        @Test
        @DisplayName("Scénario : sans la case (addToDishes absent ou false), aucun plat n'est ajouté")
        void sans_la_case() {
            Parent p = parent("nocase");
            String j = token();

            postMeal(p, meal(null, "Gratin " + j, null)).then().statusCode(201);
            postMeal(p, meal(null, "Gratin bis " + j, false)).then().statusCode(201);

            assertEquals(0, data.countDishesNormalized("Gratin " + j));
            assertEquals(0, data.countDishesNormalized("Gratin bis " + j));
            assertEquals(List.of(), search(p, j).getList("items"));
        }

        @Test
        @DisplayName("Scénario : un repas refusé n'ajoute rien (heure future, plat trop long)")
        void repas_refuse_n_ajoute_rien() {
            Parent p = parent("refused");
            String label = "Gratin " + token();

            postMeal(p, meal(Instant.now().plus(10, ChronoUnit.MINUTES).toString(), label, true))
                    .then().statusCode(400);

            String tooLong = "y".repeat(61);
            postMeal(p, meal(null, tooLong, true)).then().statusCode(400);

            assertEquals(0, data.countSolidMeal(p.babyId()));
            assertEquals(0, data.countDishesNormalized(label));
            assertEquals(0, data.countDishesNormalized(tooLong));
        }

        @Test
        @DisplayName("Scénario : Purée et Compote ne sont jamais ajoutés, même avec la case (non-événement silencieux)")
        void puree_compote_jamais_ajoutes() {
            Parent p = parent("fixed");

            for (String dish : new String[]{"purée", "Purée", "  PURÉE ", "Compote", " compote "}) {
                postMeal(p, meal(null, dish, true)).then().statusCode(201);
            }

            assertEquals(5, data.countSolidMeal(p.babyId()));
            assertEquals(0, data.countDishesNormalized("puree"));
            assertEquals(0, data.countDishesNormalized("compote"));
        }

        @Test
        @DisplayName("Scénario : plat déjà présent — repas enregistré tel que saisi, toujours un seul plat, auteur inchangé")
        void plat_deja_present() {
            Parent a = parent("owner");
            Parent b = parent("other");
            String j = token();
            UUID existing = data.createDish(a.userId(), "Purée de carottes " + j);

            String storedDish = postMeal(b, meal(null, "purée de  carottes " + j, true))
                    .then().statusCode(201)
                    // The meal keeps what was typed (case kept, blanks collapsed).
                    .extract().path("dish");

            assertEquals("purée de carottes " + j, storedDish);
            assertEquals(1, data.countDishesNormalized("Purée de carottes " + j));
            assertEquals(a.userId(), data.dishAuthor(existing));
            assertEquals("Purée de carottes " + j, data.dishLabel(existing));
        }

        @Test
        @DisplayName("Scénario : deux parents ajoutent le même plat → deux repas, un seul plat, auteur = le premier")
        void deux_parents_meme_plat() {
            Parent a = parent("first");
            Parent b = parent("second");
            String j = token();

            postMeal(a, meal(null, "Yaourt " + j, true)).then().statusCode(201);
            postMeal(b, meal(null, "Yaourt " + j, true)).then().statusCode(201);

            assertEquals(1, data.countSolidMeal(a.babyId()));
            assertEquals(1, data.countSolidMeal(b.babyId()));
            assertEquals(1, data.countDishesNormalized("Yaourt " + j));
            UUID dishId = UUID.fromString(search(a, j).getString("items[0].id"));
            assertEquals(a.userId(), data.dishAuthor(dishId));
        }

        @Test
        @DisplayName("Scénario : le second parent saisit une variante (casse, espaces) → 201, toujours un seul plat")
        void deux_parents_variante() {
            Parent a = parent("first-v");
            Parent b = parent("second-v");
            String j = token();

            postMeal(a, meal(null, "Yaourt " + j, true)).then().statusCode(201);
            postMeal(b, meal(null, "  YAOURT   " + j + " ", true)).then().statusCode(201);

            assertEquals(1, data.countDishesNormalized("Yaourt " + j));
        }

        @Test
        @DisplayName("Scénario : modifier un repas — addToDishes du PATCH est ignoré, aucun plat créé")
        void patch_ignore_add_to_dishes() {
            Parent p = parent("patch");
            String j = token();
            UUID meal = data.createSolidMeal(p.babyId(), p.userId(),
                    Instant.now().minus(1, ChronoUnit.HOURS), "Yaourt nature " + j, null);

            Map<String, Object> patch = new HashMap<>();
            patch.put("occurredAt", null);
            patch.put("dish", "Yaourt vanille " + j);
            patch.put("portion", null);
            patch.put("addToDishes", true);
            given().cookie(AuthFixture.COOKIE, p.cookie())
                    .contentType(ContentType.JSON)
                    .body(patch)
                    .when().patch(MEALS + "/{id}", p.babyId(), meal)
                    .then().statusCode(200);

            assertEquals("Yaourt vanille " + j, data.solidMealDish(meal));
            assertEquals(0, data.countDishesNormalized("Yaourt vanille " + j));
            assertEquals(0, data.countDishesNormalized("Yaourt nature " + j));
        }
    }

    @Nested
    @DisplayName("Retrouver en tapant (US18.4, D18-U/D18-AE/D18-AG)")
    class Search {

        @Test
        @DisplayName("Scénario : les plats contenant le texte, triés alphabétiquement")
        void retrouver_en_tapant() {
            Parent p = parent("search");
            String j = token();
            data.createDish(p.userId(), "Purée de carottes " + j);
            data.createDish(p.userId(), "Carottes râpées " + j);

            JsonPath result = search(p, j);

            assertEquals(List.of("Carottes râpées " + j, "Purée de carottes " + j), result.getList("items.label"));
            assertFalse(result.getBoolean("exactMatch"));
        }

        @Test
        @DisplayName("Scénario : insensible à la casse et aux accents (PUREE DE CAROTTES trouve Purée de carottes)")
        void casse_et_accents() {
            Parent p = parent("case");
            String j = token();
            data.createDish(p.userId(), "Purée de carottes " + j);

            List<String> labels = search(p, "PUREE DE CAROTTES " + j.toUpperCase()).getList("items.label");

            assertTrue(labels.contains("Purée de carottes " + j));
        }

        @Test
        @DisplayName("Scénario : texte au milieu du libellé trouvé (sous-chaîne, pas seulement préfixe)")
        void sous_chaine() {
            Parent p = parent("substring");
            String j = token();
            data.createDish(p.userId(), "Gratin de courgettes " + j);

            assertTrue(search(p, "courgettes " + j).getList("items.label").contains("Gratin de courgettes " + j));
        }

        @Test
        @DisplayName("Scénario : au plus dix résultats, les dix premiers dans l'ordre alphabétique")
        void au_plus_dix() {
            Parent p = parent("ten");
            String j = token();
            List<String> expected = new ArrayList<>();
            for (int i = 0; i < 15; i++) {
                String label = "Plat" + (char) ('a' + i) + " " + j;
                data.createDish(p.userId(), label);
                if (i < 10) {
                    expected.add(label);
                }
            }

            List<String> labels = search(p, j).getList("items.label");

            assertEquals(10, labels.size());
            assertEquals(expected, labels);
        }

        @Test
        @DisplayName("Scénario : tri sans casse ni accents — « Épinards » avant « fenouil »")
        void tri_sans_casse_ni_accents() {
            Parent p = parent("sort");
            String j = token();
            data.createDish(p.userId(), "fenouil " + j);
            data.createDish(p.userId(), "Épinards " + j);

            // A sort on the raw label would put the lower-case « fenouil » before the accented « É ».
            assertEquals(List.of("Épinards " + j, "fenouil " + j), search(p, j).getList("items.label"));
        }

        @Test
        @DisplayName("Scénario : rien de tapé (q vide, blanc ou absent) → aucun résultat, exactMatch false")
        void rien_de_tape() {
            Parent p = parent("empty");
            data.createDish(p.userId(), "Purée de carottes " + token());

            for (String q : new String[]{"", "   "}) {
                JsonPath result = search(p, q);
                assertEquals(List.of(), result.getList("items"));
                assertFalse(result.getBoolean("exactMatch"));
            }

            JsonPath withoutQ = given().cookie(AuthFixture.COOKIE, p.cookie())
                    .when().get(DISHES)
                    .then().statusCode(200)
                    .extract().jsonPath();
            assertEquals(List.of(), withoutQ.getList("items"));
            assertFalse(withoutQ.getBoolean("exactMatch"));
        }

        @Test
        @DisplayName("Scénario : les jokers LIKE (_ et %) tapés sont des caractères, pas des motifs")
        void jokers_echappes() {
            Parent p = parent("wildcard");
            String j = token();
            data.createDish(p.userId(), "Zup " + j);

            assertFalse(search(p, "z_p " + j).getList("items.label").contains("Zup " + j));
            assertFalse(search(p, "z%" + j).getList("items.label").contains("Zup " + j));
            // Sanity: the same search without a wildcard does find it.
            assertTrue(search(p, "zup " + j).getList("items.label").contains("Zup " + j));
        }

        @Test
        @DisplayName("Scénario : partagé entre familles — un plat de A est trouvé par B, avec exactement id et label")
        void partage_entre_familles() {
            Parent a = parent("family-a");
            Parent b = parent("family-b");
            String j = token();
            data.createDish(a.userId(), "Purée de panais " + j);

            JsonPath result = search(b, j);

            assertEquals(List.of("Purée de panais " + j), result.getList("items.label"));
            Map<String, Object> item = result.getMap("items[0]");
            assertEquals(Set.of("id", "label"), item.keySet());
        }

        @Test
        @DisplayName("Scénario : exactMatch vrai pour un plat existant, quelle que soit la casse ou les espaces")
        void exact_match_plat_existant() {
            Parent p = parent("exact");
            String j = token();
            data.createDish(p.userId(), "Purée de carottes " + j);

            assertTrue(search(p, "purée de  carottes " + j).getBoolean("exactMatch"));
            assertTrue(search(p, "PUREE DE CAROTTES " + j).getBoolean("exactMatch"));
        }

        @Test
        @DisplayName("Scénario : exactMatch faux pour un texte partiel ou inconnu, et vrai pour Purée / Compote")
        void exact_match_faux_et_fixes() {
            Parent p = parent("exact2");
            String j = token();
            data.createDish(p.userId(), "Purée de carottes " + j);

            assertFalse(search(p, "carottes " + j).getBoolean("exactMatch")); // partial: found, not exact
            assertFalse(search(p, "inconnu " + j).getBoolean("exactMatch"));
            assertTrue(search(p, "compote").getBoolean("exactMatch"));
            assertTrue(search(p, "  PURÉE ").getBoolean("exactMatch"));
        }

        @Test
        @DisplayName("Scénario : exactMatch porte sur le texte entier, même quand le plat est hors des dix premiers")
        void exact_match_hors_des_dix() {
            Parent p = parent("exact3");
            String j = token();
            // Twelve dishes CONTAIN « zz <token> » and sort before the exact one, which therefore falls
            // outside the ten returned.
            for (int i = 0; i < 12; i++) {
                data.createDish(p.userId(), "Aplat" + (char) ('a' + i) + " zz " + j);
            }
            data.createDish(p.userId(), "Zz " + j);

            JsonPath result = search(p, "zz " + j);

            assertEquals(10, result.getList("items").size());
            assertFalse(result.getList("items.label").contains("Zz " + j));
            assertTrue(result.getBoolean("exactMatch"));
        }
    }

    @Nested
    @DisplayName("Accès (US18.4)")
    class Access {

        @Test
        @DisplayName("Scénario : GET /api/dishes?q=x sans session → 401")
        void recherche_sans_session() {
            given().queryParam("q", "x")
                    .when().get(DISHES)
                    .then().statusCode(401);
        }
    }

}
