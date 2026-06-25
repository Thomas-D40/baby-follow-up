package com.suivibaby.model;

import java.util.UUID;

/**
 * Membre du cercle d'un bébé (D8-N). Exception bornée à l'isolation US1.5 : on n'expose les emails
 * que dans le cercle d'un bébé déjà partagé, jamais un annuaire global.
 */
public record CaregiverResponse(UUID userId, String firstName, String email, boolean isOwner) {
}
