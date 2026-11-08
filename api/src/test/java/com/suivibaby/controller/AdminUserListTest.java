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
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Épic 20, US20.1 — the administrator lists every account with its status. The database is shared by
 * the whole run: each scenario filters the list on its own emails and never asserts its total size.
 */
@QuarkusTest
class AdminUserListTest {

    static final String PWD = "admin-list-pwd-123";
    static final String ADMIN_BOOTSTRAP_EMAIL = "admin@suivibaby.local";
    static final Set<String> ACCOUNT_KEYS = Set.of("id", "email", "firstName", "role", "status", "createdAt");

    @Inject
    TestDataFactory data;

    private String loginAs(String email) {
        return AuthFixture.loginCookie(email, PWD);
    }

    private List<Map<String, Object>> listAccounts(String cookie) {
        return given().cookie(AuthFixture.COOKIE, cookie)
                .when().get("/api/admin/users")
                .then().statusCode(200)
                .extract().jsonPath().getList("$");
    }

    // The listed accounts restricted to the given emails, in the order the server returned them.
    private static List<Map<String, Object>> only(List<Map<String, Object>> accounts, String... emails) {
        Set<String> wanted = Set.of(emails);
        return accounts.stream().filter(a -> wanted.contains((String) a.get("email"))).toList();
    }

    private static Map<String, Object> byEmail(List<Map<String, Object>> accounts, String email) {
        return only(accounts, email).get(0);
    }

    private String adminCookie() {
        String email = data.uniqueEmail("admin");
        data.createUser(email, "Thomas", "admin", PWD);
        return loginAs(email);
    }

    @Nested
    @DisplayName("Scénario : l'administrateur consulte les comptes")
    class AdminConsulte {

        @Test
        void liste_les_comptes_du_plus_recent_au_plus_ancien_avec_leur_statut() {
            Instant now = Instant.now();
            String thomas = data.uniqueEmail("thomas");
            String lisa = data.uniqueEmail("lisa");
            String jeanne = data.uniqueEmail("jeanne");
            data.createUser(thomas, "Thomas", "admin", PWD, now.minus(2, ChronoUnit.DAYS));
            data.createUser(lisa, "Lisa", "parent", PWD, now.minus(1, ChronoUnit.DAYS));
            data.createUser(jeanne, "Jeanne", "parent", null, now);

            List<Map<String, Object>> accounts = only(listAccounts(loginAs(thomas)), thomas, lisa, jeanne);

            assertEquals(List.of(jeanne, lisa, thomas), accounts.stream().map(a -> a.get("email")).toList());
            for (Map<String, Object> account : accounts) {
                assertEquals(ACCOUNT_KEYS, account.keySet(), "ni hash, ni jeton, ni date d'activation");
                assertNotNull(account.get("id"));
                assertNotNull(account.get("createdAt"));
            }
            assertEquals("pending", byEmail(accounts, jeanne).get("status"));
            assertEquals("active", byEmail(accounts, lisa).get("status"));
            assertEquals("active", byEmail(accounts, thomas).get("status"));
            assertEquals("parent", byEmail(accounts, jeanne).get("role"));
            assertEquals("parent", byEmail(accounts, lisa).get("role"));
            assertEquals("admin", byEmail(accounts, thomas).get("role"));
            assertEquals("Jeanne", byEmail(accounts, jeanne).get("firstName"));
        }

        @Test
        void departage_deux_comptes_crees_au_meme_instant_par_email_croissant() {
            Instant same = Instant.now().minus(10, ChronoUnit.DAYS);
            String first = data.uniqueEmail("a-tie");
            String second = data.uniqueEmail("b-tie");
            // Created in reverse order of the expected result.
            data.createUser(second, "Bea", "parent", PWD, same);
            data.createUser(first, "Ana", "parent", PWD, same);

            List<Map<String, Object>> accounts = only(listAccounts(adminCookie()), first, second);

            assertEquals(List.of(first, second), accounts.stream().map(a -> a.get("email")).toList());
        }
    }

    @Nested
    @DisplayName("Scénario : un compte créé par une invitation d'owner")
    class CompteInvitation {

        @Test
        void est_en_attente_puis_actif_apres_l_acceptation_avec_mot_de_passe() {
            String ownerEmail = data.uniqueEmail("owner");
            UUID owner = data.createUser(ownerEmail, "Thomas", "parent", PWD);
            UUID baby = data.createBaby("Léa");
            data.link(owner, baby);
            String invitee = data.uniqueEmail("jeanne");
            String token = given().cookie(AuthFixture.COOKIE, loginAs(ownerEmail))
                    .contentType(ContentType.JSON)
                    .body(Map.of("email", invitee, "firstName", "Jeanne"))
                    .when().post("/api/babies/{babyId}/invitations", baby)
                    .then().statusCode(201)
                    .extract().path("token");
            String admin = adminCookie();

            assertEquals("pending", byEmail(listAccounts(admin), invitee).get("status"));

            given().contentType(ContentType.JSON).body(Map.of("password", "mot-de-passe-invitation-1"))
                    .when().post("/api/invitations/{token}/accept", token)
                    .then().statusCode(204);

            assertEquals("active", byEmail(listAccounts(admin), invitee).get("status"));
        }
    }

    @Nested
    @DisplayName("Scénario : l'administrateur amorcé est actif")
    class AdminBootstrape {

        @Test
        void le_compte_admin_du_demarrage_apparait_actif() {
            // Migration first, then bootstrap: the seeded admin must not look "pending".
            Map<String, Object> bootstrap = byEmail(listAccounts(adminCookie()), ADMIN_BOOTSTRAP_EMAIL);

            assertEquals("active", bootstrap.get("status"));
            assertEquals("admin", bootstrap.get("role"));
        }
    }

    @Nested
    @DisplayName("Scénario : un parent ne voit pas l'écran")
    class Acces {

        @Test
        void parent_recoit_403() {
            String email = data.uniqueEmail("parent");
            data.createActiveParent(email, PWD);

            given().cookie(AuthFixture.COOKIE, loginAs(email))
                    .when().get("/api/admin/users")
                    .then().statusCode(403);
        }

        @Test
        void sans_session_recoit_401() {
            given().when().get("/api/admin/users").then().statusCode(401);
        }
    }
}
