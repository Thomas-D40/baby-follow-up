package com.suivibaby.service;

import jakarta.ws.rs.BadRequestException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 18 — pure label rules shared by the meal dish, the dish list and the rename (D18-AD, D18-AE).
// Plain JUnit: no Quarkus boot needed, the class is static and stateless.
class DishLabelsTest {

    @Nested
    @DisplayName("validate — mise en forme du libellé (D18-AD)")
    class Validate {

        @Test
        @DisplayName("Scénario : espaces de bord retirés, casse et accents conservés")
        void bords_retires() {
            assertEquals("Compote pomme-poire", DishLabels.validate("  Compote pomme-poire  "));
            assertEquals("Purée de Carottes", DishLabels.validate("Purée de Carottes"));
        }

        @Test
        @DisplayName("Scénario : blancs intérieurs répétés réduits à un seul espace")
        void blancs_reduits() {
            assertEquals("Compote Pomme-poire", DishLabels.validate("  Compote   Pomme-poire "));
            assertEquals("Purée de carottes", DishLabels.validate("Purée\tde \n carottes"));
        }

        @Test
        @DisplayName("Scénario : libellé vide ou blanc → BadRequestException")
        void vide_ou_blanc() {
            assertThrows(BadRequestException.class, () -> DishLabels.validate(""));
            assertThrows(BadRequestException.class, () -> DishLabels.validate("   "));
            assertThrows(BadRequestException.class, () -> DishLabels.validate(" \t "));
        }

        @Test
        @DisplayName("Scénario : 60 caractères passent, 61 sont refusés (après mise en forme)")
        void longueur_maximale() {
            assertEquals(60, DishLabels.MAX_LENGTH);
            assertEquals("x".repeat(60), DishLabels.validate("x".repeat(60)));
            assertThrows(BadRequestException.class, () -> DishLabels.validate("x".repeat(61)));
        }

        @Test
        @DisplayName("Scénario : la longueur se mesure après mise en forme, pas sur la saisie brute")
        void longueur_apres_mise_en_forme() {
            assertEquals("x".repeat(60), DishLabels.validate("   " + "x".repeat(60) + "   "));
            // 59 letters + a run of blanks collapsing to one space + 1 letter = 61 → refused.
            assertThrows(BadRequestException.class,
                    () -> DishLabels.validate("x".repeat(59) + "     " + "y".repeat(2)));
            // 30 + collapsed blank + 29 = 60 → accepted although the raw input is longer.
            assertEquals("x".repeat(30) + " " + "y".repeat(29),
                    DishLabels.validate("x".repeat(30) + "        " + "y".repeat(29)));
        }
    }

    @Nested
    @DisplayName("normalize — clé de recherche et d'unicité (D18-AE)")
    class Normalize {

        @Test
        @DisplayName("Scénario : espaces compactés, minuscules, accents retirés")
        void cas_de_reference() {
            assertEquals("puree de carottes", DishLabels.normalize("  Purée   de Carottes "));
            assertEquals("puree", DishLabels.normalize("PURÉE"));
            assertEquals("creme brulee", DishLabels.normalize("Crème brûlée"));
        }

        @Test
        @DisplayName("Scénario : deux saisies qui ne diffèrent que par casse, accents ou espaces se normalisent pareil")
        void variantes_equivalentes() {
            assertEquals(DishLabels.normalize("Purée de carottes"), DishLabels.normalize("puree  DE   carottes"));
            assertEquals(DishLabels.normalize("Compote"), DishLabels.normalize(" COMPOTE "));
        }

        @Test
        @DisplayName("Scénario : deux libellés différents ne se confondent pas")
        void libelles_distincts() {
            assertFalse(DishLabels.normalize("Purée de carottes").equals(DishLabels.normalize("Purée de carrotes")));
        }
    }

    @Nested
    @DisplayName("isFixed — Purée et Compote ne vont jamais au référentiel (D18-AF)")
    class IsFixed {

        @Test
        @DisplayName("Scénario : puree et compote (formes normalisées) sont fixes")
        void fixes() {
            assertTrue(DishLabels.isFixed("puree"));
            assertTrue(DishLabels.isFixed("compote"));
        }

        @Test
        @DisplayName("Scénario : un autre plat, même proche, n'est pas fixe")
        void non_fixes() {
            assertFalse(DishLabels.isFixed("puree de carottes"));
            assertFalse(DishLabels.isFixed("compote de pomme"));
            assertFalse(DishLabels.isFixed("yaourt"));
        }

        @Test
        @DisplayName("Scénario : appliqué à une saisie normalisée, Purée / PURÉE / compote sont reconnus")
        void apres_normalisation() {
            assertTrue(DishLabels.isFixed(DishLabels.normalize("  Purée ")));
            assertTrue(DishLabels.isFixed(DishLabels.normalize("COMPOTE")));
        }
    }
}
