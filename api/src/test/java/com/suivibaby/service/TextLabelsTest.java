package com.suivibaby.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

// Épic 19 — the tidy rule shared by dish, medication and dosage labels (D19-Q).
// Plain JUnit: the class is static and stateless.
class TextLabelsTest {

    @Test
    @DisplayName("Scénario : null → chaîne vide")
    void null_donne_vide() {
        assertEquals("", TextLabels.tidy(null));
    }

    @Test
    @DisplayName("Scénario : bords retirés, blancs intérieurs répétés réduits à un espace")
    void bords_et_blancs() {
        assertEquals("a b", TextLabels.tidy("  a   b "));
        assertEquals("", TextLabels.tidy("   "));
    }

    @Test
    @DisplayName("Scénario : tabulations et retours à la ligne comptent comme des blancs")
    void tabulations_et_retours() {
        assertEquals("a b c", TextLabels.tidy("a\tb\n c"));
    }

    @Test
    @DisplayName("Scénario : casse et accents conservés")
    void casse_et_accents() {
        assertEquals("Célestène Bébé", TextLabels.tidy("  Célestène   Bébé "));
    }
}
