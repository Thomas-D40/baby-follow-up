package com.suivibaby.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

// Épic 23, US23.2 — pure merge of the baby's meal history and the shared dish search (D23-J).
// Plain JUnit: no Quarkus boot needed, the class is static and reads no database.
class DishSuggestionsTest {

    @Nested
    @DisplayName("merge — rien de tapé : les plats récents du bébé")
    class RecentOnly {

        @Test
        @DisplayName("Scénario : les plats récents, distincts, du plus récent au plus ancien")
        void recents_distincts() {
            List<String> history = List.of("Banane", "Purée de carottes", "Banane");

            assertEquals(List.of("Banane", "Purée de carottes"), DishSuggestions.merge(history, List.of(), ""));
        }

        @Test
        @DisplayName("Scénario : au plus dix plats récents, les dix plus récents dans l'ordre")
        void au_plus_dix() {
            List<String> history = new ArrayList<>();
            for (int i = 0; i < 12; i++) {
                history.add("Plat " + (char) ('a' + i));
            }

            List<String> merged = DishSuggestions.merge(history, List.of(), "");

            assertEquals(10, merged.size());
            assertEquals(history.subList(0, 10), merged);
        }

        @Test
        @DisplayName("Scénario : la borne publique est de dix")
        void borne() {
            assertEquals(10, DishSuggestions.MAX_SUGGESTIONS);
        }

        @Test
        @DisplayName("Scénario : historique et référentiel vides → aucune proposition")
        void rien() {
            assertEquals(List.of(), DishSuggestions.merge(List.of(), List.of(), ""));
        }
    }

    @Nested
    @DisplayName("merge — variantes d'un même plat")
    class Variants {

        @Test
        @DisplayName("Scénario : casse et accents seuls différents → un seul plat, le libellé du repas le plus récent")
        void variantes_de_casse_et_d_accent() {
            List<String> history = List.of("purée de carottes", "Puree de Carottes", "PURÉE DE CAROTTES");

            assertEquals(List.of("purée de carottes"), DishSuggestions.merge(history, List.of(), ""));
        }

        @Test
        @DisplayName("Scénario : deux appels sur la même entrée donnent la même sortie (ordre stable)")
        void ordre_stable() {
            List<String> history = List.of("Banane", "Poire", "banane", "Pomme");
            List<String> shared = List.of("Pomme", "Poire d'été");

            assertEquals(DishSuggestions.merge(history, shared, "po"), DishSuggestions.merge(history, shared, "po"));
        }
    }

    @Nested
    @DisplayName("merge — texte tapé : historique puis référentiel")
    class HistoryThenShared {

        @Test
        @DisplayName("Scénario : l'historique précède un plat partagé alphabétiquement antérieur")
        void historique_d_abord() {
            List<String> merged = DishSuggestions.merge(List.of("Zeste xyz"), List.of("Abricot xyz"), "xyz");

            assertEquals(List.of("Zeste xyz", "Abricot xyz"), merged);
        }

        @Test
        @DisplayName("Scénario : seuls les plats de l'historique contenant le texte (sans casse ni accents) sont retenus")
        void historique_filtre_par_le_texte() {
            List<String> history = List.of("Banane", "Purée de carottes", "Poire");

            assertEquals(List.of("Purée de carottes"), DishSuggestions.merge(history, List.of(), "puree"));
            assertEquals(List.of("Banane"), DishSuggestions.merge(history, List.of(), "nan"));
            assertEquals(List.of(), DishSuggestions.merge(history, List.of(), "kiwi"));
        }

        @Test
        @DisplayName("Scénario : un plat présent dans les deux sources apparaît une fois, avec le libellé du repas")
        void pas_de_doublon() {
            List<String> merged = DishSuggestions.merge(List.of("yaourt xyz"), List.of("Yaourt xyz"), "yaourt xyz");

            assertEquals(List.of("yaourt xyz"), merged);
        }

        @Test
        @DisplayName("Scénario : dix propositions au plus en tout, les plats du bébé d'abord")
        void dix_en_tout() {
            List<String> history = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                history.add("Pur" + (char) ('a' + i) + " xyz");
            }
            List<String> shared = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                shared.add("Pur" + (char) ('m' + i) + " xyz");
            }

            List<String> merged = DishSuggestions.merge(history, shared, "xyz");

            List<String> expected = new ArrayList<>(history);
            expected.addAll(shared.subList(0, 4));
            assertEquals(10, merged.size());
            assertEquals(expected, merged);
        }

        @Test
        @DisplayName("Scénario : un doublon du référentiel ne prend pas la place d'un autre plat partagé")
        void doublon_saute_sans_perte() {
            List<String> history = List.of("Pur a xyz", "Pur b xyz");
            List<String> shared = new ArrayList<>(List.of("PUR A XYZ", "Pur b xyz"));
            for (int i = 0; i < 8; i++) {
                shared.add("Pur " + (char) ('m' + i) + " xyz");
            }

            List<String> merged = DishSuggestions.merge(history, shared, "xyz");

            assertEquals(10, merged.size());
            assertEquals(List.of("Pur a xyz", "Pur b xyz"), merged.subList(0, 2));
            assertEquals(shared.subList(2, 10), merged.subList(2, 10));
        }
    }
}
