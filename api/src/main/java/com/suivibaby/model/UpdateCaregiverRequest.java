package com.suivibaby.model;

/**
 * Mise à jour d'un membre du cercle (Épic 8). v1 : seule la promotion en owner est exposée (D8-I) —
 * {@code isOwner = true}. La rétrogradation est hors v1 (§5).
 */
public record UpdateCaregiverRequest(Boolean isOwner) {
}
