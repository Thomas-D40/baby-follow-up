package com.suivibaby.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Épic 24, D24-T — the impact fingerprint is a pure value: no Quarkus, no database (like DishLabelsTest).
class AccountDeletionImpactTest {

    static final UUID USER = UUID.fromString("00000000-0000-0000-0000-0000000000a1");
    static final UUID OTHER_USER = UUID.fromString("00000000-0000-0000-0000-0000000000a2");
    static final UUID B1 = UUID.fromString("00000000-0000-0000-0000-0000000000b1");
    static final UUID B2 = UUID.fromString("00000000-0000-0000-0000-0000000000b2");
    static final UUID B3 = UUID.fromString("00000000-0000-0000-0000-0000000000b3");

    private static AccountDeletionImpact impact(UUID user, List<UUID> deleted, List<UUID> shared,
                                                List<UUID> blocking) {
        return new AccountDeletionImpact(user, deleted, shared, blocking);
    }

    @Test
    @DisplayName("Le jeton est indépendant de l'ordre des listes reçues")
    void ordre_des_listes_sans_effet() {
        AccountDeletionImpact a = impact(USER, List.of(B1, B2), List.of(B3), List.of());
        AccountDeletionImpact b = impact(USER, List.of(B2, B1), List.of(B3), List.of());

        assertEquals(a.token(), b.token());
    }

    @Test
    @DisplayName("Le jeton est stable pour une même composition")
    void stable() {
        AccountDeletionImpact a = impact(USER, List.of(B1), List.of(B2), List.of(B3));
        AccountDeletionImpact b = impact(USER, List.of(B1), List.of(B2), List.of(B3));

        assertEquals(a.token(), b.token());
    }

    @Test
    @DisplayName("Deux comptes sans bébé n'ont pas le même jeton (préfixe userId)")
    void deux_comptes_sans_bebe() {
        AccountDeletionImpact a = impact(USER, List.of(), List.of(), List.of());
        AccountDeletionImpact b = impact(OTHER_USER, List.of(), List.of(), List.of());

        assertNotEquals(a.token(), b.token());
    }

    @Test
    @DisplayName("Deux non-owners du même bébé n'ont pas le même jeton")
    void deux_non_owners_du_meme_bebe() {
        AccountDeletionImpact a = impact(USER, List.of(), List.of(B1), List.of());
        AccountDeletionImpact b = impact(OTHER_USER, List.of(), List.of(B1), List.of());

        assertNotEquals(a.token(), b.token());
    }

    @Test
    @DisplayName("Deux bébés qui échangent leur sort, à nombres égaux, changent le jeton")
    void echange_de_sort_a_nombres_egaux() {
        AccountDeletionImpact before = impact(USER, List.of(B1), List.of(B2), List.of());
        AccountDeletionImpact after = impact(USER, List.of(B2), List.of(B1), List.of());

        assertEquals(before.deletedBabyIds().size(), after.deletedBabyIds().size());
        assertEquals(before.sharedBabyIds().size(), after.sharedBabyIds().size());
        assertNotEquals(before.token(), after.token());
    }

    @Test
    @DisplayName("Un bébé qui passe de partagé à supprimé change le jeton")
    void partage_vers_supprime() {
        AccountDeletionImpact before = impact(USER, List.of(), List.of(B1), List.of());
        AccountDeletionImpact after = impact(USER, List.of(B1), List.of(), List.of());

        assertNotEquals(before.token(), after.token());
    }

    @Test
    @DisplayName("Un bébé qui devient bloquant change le jeton")
    void devient_bloquant() {
        AccountDeletionImpact before = impact(USER, List.of(), List.of(B1), List.of());
        AccountDeletionImpact after = impact(USER, List.of(), List.of(), List.of(B1));

        assertNotEquals(before.token(), after.token());
    }

    @Test
    @DisplayName("Un identifiant ajouté change le jeton")
    void identifiant_ajoute() {
        AccountDeletionImpact before = impact(USER, List.of(B1), List.of(), List.of());
        AccountDeletionImpact after = impact(USER, List.of(B1, B2), List.of(), List.of());

        assertNotEquals(before.token(), after.token());
    }

    @Test
    @DisplayName("Le jeton fait 64 caractères hexadécimaux minuscules")
    void format_sha256_hex() {
        String token = impact(USER, List.of(B1), List.of(B2), List.of(B3)).token();

        assertEquals(64, token.length());
        assertTrue(token.matches("[0-9a-f]{64}"), token);
    }

    @Test
    @DisplayName("isBlocked est vrai si et seulement si un bébé est bloquant")
    void is_blocked() {
        assertFalse(impact(USER, List.of(), List.of(), List.of()).isBlocked());
        assertFalse(impact(USER, List.of(B1), List.of(B2), List.of()).isBlocked());
        assertTrue(impact(USER, List.of(), List.of(), List.of(B1)).isBlocked());
        assertTrue(impact(USER, List.of(B1), List.of(B2), List.of(B3)).isBlocked());
    }
}
