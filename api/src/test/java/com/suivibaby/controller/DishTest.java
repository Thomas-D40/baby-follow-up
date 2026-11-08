package com.suivibaby.controller;

import com.suivibaby.service.DishLabels;
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
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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

        @Test
        @DisplayName("Scénario : /manageable, PATCH et DELETE sans session → 401")
        void gestion_sans_session() {
            UUID someDish = UUID.randomUUID();

            given().when().get(DISHES + "/manageable").then().statusCode(401);
            given().contentType(ContentType.JSON).body(rename("Yaourt"))
                    .when().patch(DISHES + "/{id}", someDish).then().statusCode(401);
            given().when().delete(DISHES + "/{id}", someDish).then().statusCode(401);
        }
    }

    private static Map<String, Object> rename(String label) {
        Map<String, Object> m = new HashMap<>();
        m.put("label", label);
        return m;
    }

    private Response renameDish(Parent p, UUID dishId, String label) {
        return given().cookie(AuthFixture.COOKIE, p.cookie())
                .contentType(ContentType.JSON)
                .body(rename(label))
                .when().patch(DISHES + "/{id}", dishId);
    }

    private Response deleteDish(Parent p, UUID dishId) {
        return given().cookie(AuthFixture.COOKIE, p.cookie())
                .when().delete(DISHES + "/{id}", dishId);
    }

    private JsonPath manageable(Parent p) {
        return given().cookie(AuthFixture.COOKIE, p.cookie())
                .when().get(DISHES + "/manageable")
                .then().statusCode(200)
                .extract().jsonPath();
    }

    // An administrator has no baby: only the session matters for the dish routes.
    private Parent admin() {
        String email = data.uniqueEmail("admin");
        UUID userId = data.createAdmin(email, PWD);
        return new Parent(userId, null, AuthFixture.loginCookie(email, PWD));
    }

    @Nested
    @DisplayName("L'écran liste mes plats (US18.5, D18-AI)")
    class Manageable {

        @Test
        @DisplayName("Scénario : un parent voit ses plats, alphabétiques, sans ceux d'un autre")
        void mes_plats() {
            Parent me = parent("mine");
            Parent other = parent("theirs");
            String j = token();
            data.createDish(me.userId(), "Yaourt " + j);
            data.createDish(me.userId(), "Purée de carrotes " + j);
            data.createDish(other.userId(), "Compote poire " + j);

            JsonPath result = manageable(me);

            assertEquals(List.of("Purée de carrotes " + j, "Yaourt " + j), result.getList("label"));
            assertEquals(Set.of("id", "label"), result.getMap("[0]").keySet());
        }

        @Test
        @DisplayName("Scénario : aucun plat ajouté → liste vide")
        void aucun_plat() {
            Parent me = parent("nodish");

            assertEquals(List.of(), manageable(me).getList("$"));
        }

        @Test
        @DisplayName("Scénario : l'administrateur voit les plats de tous les parents")
        void admin_voit_tout() {
            Parent a = parent("owner-a");
            Parent b = parent("owner-b");
            String j = token();
            data.createDish(a.userId(), "Soupe " + j);
            data.createDish(b.userId(), "Gratin " + j);

            List<String> labels = manageable(admin()).getList("label");

            assertTrue(labels.contains("Soupe " + j));
            assertTrue(labels.contains("Gratin " + j));
        }

        @Test
        @DisplayName("Scénario : Purée et Compote ne figurent jamais dans la liste de gestion")
        void puree_compote_absents() {
            Parent p = parent("fixed-list");
            postMeal(p, meal(null, "Purée", true)).then().statusCode(201);
            postMeal(p, meal(null, "Compote", true)).then().statusCode(201);

            List<String> labels = manageable(admin()).getList("label");

            for (String label : labels) {
                String normalized = DishLabels.normalize(label);
                assertFalse(normalized.equals("puree") || normalized.equals("compote"), label);
            }
            assertEquals(List.of(), manageable(p).getList("$"));
        }
    }

    @Nested
    @DisplayName("Renommer (US18.5, D18-AH/D18-Z)")
    class Rename {

        @Test
        @DisplayName("Scénario : renommer sans toucher l'historique — le plat change, le repas déjà saisi non")
        void renommer_sans_toucher_l_historique() {
            Parent me = parent("rename");
            String j = token();
            UUID dishId = data.createDish(me.userId(), "Purée de carrotes " + j);
            UUID oldMeal = data.createSolidMeal(me.babyId(), me.userId(),
                    Instant.now().minus(1, ChronoUnit.DAYS), "Purée de carrotes " + j, null);

            renameDish(me, dishId, "Purée de carottes " + j)
                    .then().statusCode(200)
                    .body("label", is("Purée de carottes " + j))
                    .body("id", is(dishId.toString()));

            assertEquals(List.of("Purée de carottes " + j), search(me, j).getList("items.label"));
            assertEquals("Purée de carrotes " + j, data.solidMealDish(oldMeal));
        }

        @Test
        @DisplayName("Scénario : le nouveau libellé est mis en forme comme à la création (bords, blancs répétés)")
        void libelle_mis_en_forme() {
            Parent me = parent("rename-format");
            String j = token();
            UUID dishId = data.createDish(me.userId(), "Soupe " + j);

            renameDish(me, dishId, "  Soupe   de   poireaux " + j + " ")
                    .then().statusCode(200)
                    .body("label", is("Soupe de poireaux " + j));
            assertEquals("Soupe de poireaux " + j, data.dishLabel(dishId));
        }

        @Test
        @DisplayName("Scénario : renommage invalide (vide, blanc, 61 caractères, corps absent) → 400, libellé inchangé")
        void renommage_invalide() {
            Parent me = parent("rename-bad");
            String j = token();
            String original = "Soupe " + j;
            UUID dishId = data.createDish(me.userId(), original);

            for (String invalid : new String[]{"", "   ", "z".repeat(61)}) {
                renameDish(me, dishId, invalid).then().statusCode(400);
            }
            given().cookie(AuthFixture.COOKIE, me.cookie())
                    .contentType(ContentType.JSON)
                    .when().patch(DISHES + "/{id}", dishId)
                    .then().statusCode(400);

            assertEquals(original, data.dishLabel(dishId));
        }

        @Test
        @DisplayName("Scénario : vers le libellé d'un autre plat → 409 ; vers Compote → 409 ; vers une variante de soi → 200")
        void vers_un_plat_existant() {
            Parent me = parent("rename-clash");
            Parent other = parent("rename-clash-other");
            String j = token();
            UUID mine = data.createDish(me.userId(), "Purée de carrotes " + j);
            data.createDish(other.userId(), "Purée de carottes " + j);

            renameDish(me, mine, "purée de carottes " + j).then().statusCode(409);
            renameDish(me, mine, "Compote").then().statusCode(409);
            assertEquals("Purée de carrotes " + j, data.dishLabel(mine));

            // A variant of ITS OWN label is not a clash with another dish.
            renameDish(me, mine, "PURÉE DE CARROTES " + j).then().statusCode(200);
            assertEquals("PURÉE DE CARROTES " + j, data.dishLabel(mine));
        }

        @Test
        @DisplayName("Scénario : corriger l'accent de mon plat → 200, retrouvé sous le nouveau libellé, une seule ligne")
        void corriger_l_accent() {
            Parent me = parent("rename-accent");
            String k = token();
            UUID mine = data.createDish(me.userId(), "Puree de carottes " + k);

            renameDish(me, mine, "Purée de carottes " + k).then().statusCode(200);

            assertEquals(List.of("Purée de carottes " + k), search(me, k).getList("items.label"));
        }

        @Test
        @DisplayName("Scénario : renommer en Purée ou Compote → 409, libellé inchangé")
        void renommer_en_puree_ou_compote() {
            Parent me = parent("rename-fixed");
            String k = token();
            UUID mine = data.createDish(me.userId(), "Compot " + k);

            renameDish(me, mine, "compote").then().statusCode(409);
            renameDish(me, mine, "  PURÉE ").then().statusCode(409);

            assertEquals("Compot " + k, data.dishLabel(mine));
        }

        @Test
        @DisplayName("Scénario : le plat d'un autre → 403, inchangé ; id inconnu → 404")
        void pas_le_plat_d_un_autre() {
            Parent me = parent("rename-forbidden");
            Parent owner = parent("rename-owner");
            String j = token();
            UUID theirs = data.createDish(owner.userId(), "Soupe " + j);

            renameDish(me, theirs, "Piratage " + j).then().statusCode(403);
            assertEquals("Soupe " + j, data.dishLabel(theirs));

            renameDish(me, UUID.randomUUID(), "Yaourt " + j).then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : l'administrateur renomme le plat d'un parent → 200, auteur inchangé")
        void admin_renomme() {
            Parent owner = parent("rename-admin-owner");
            String j = token();
            UUID theirs = data.createDish(owner.userId(), "Soupe " + j);

            renameDish(admin(), theirs, "Soupe corrigée " + j).then().statusCode(200);

            assertEquals("Soupe corrigée " + j, data.dishLabel(theirs));
            assertEquals(owner.userId(), data.dishAuthor(theirs));
        }
    }

    @Nested
    @DisplayName("Supprimer (US18.5, D18-X)")
    class Delete {

        @Test
        @DisplayName("Scénario : supprimer sans toucher l'historique — plat disparu pour tous, repas inchangé")
        void supprimer_sans_toucher_l_historique() {
            Parent me = parent("delete");
            Parent other = parent("delete-other");
            String j = token();
            UUID dishId = data.createDish(me.userId(), "Soupe " + j);
            UUID meal = data.createSolidMeal(me.babyId(), me.userId(),
                    Instant.now().minus(1, ChronoUnit.DAYS), "Soupe " + j, null);

            deleteDish(me, dishId).then().statusCode(204);

            assertNull(data.dishLabel(dishId));
            assertEquals(List.of(), search(other, j).getList("items"));
            assertEquals("Soupe " + j, data.solidMealDish(meal));
            assertEquals(1, data.countSolidMeal(me.babyId()));
        }

        @Test
        @DisplayName("Scénario : supprimer deux fois → 204 puis 404")
        void supprimer_deux_fois() {
            Parent me = parent("delete-twice");
            UUID dishId = data.createDish(me.userId(), "Soupe " + token());

            deleteDish(me, dishId).then().statusCode(204);
            deleteDish(me, dishId).then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : le plat d'un autre → 403, inchangé ; id inconnu → 404")
        void pas_le_plat_d_un_autre() {
            Parent me = parent("delete-forbidden");
            Parent owner = parent("delete-owner");
            UUID theirs = data.createDish(owner.userId(), "Soupe " + token());

            deleteDish(me, theirs).then().statusCode(403);
            assertNotNull(data.dishLabel(theirs));

            deleteDish(me, UUID.randomUUID()).then().statusCode(404);
        }

        @Test
        @DisplayName("Scénario : l'administrateur supprime le plat d'un parent → 204")
        void admin_supprime() {
            Parent owner = parent("delete-admin-owner");
            UUID theirs = data.createDish(owner.userId(), "Soupe " + token());

            deleteDish(admin(), theirs).then().statusCode(204);

            assertNull(data.dishLabel(theirs));
        }
    }
}
