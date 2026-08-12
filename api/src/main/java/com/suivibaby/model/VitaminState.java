package com.suivibaby.model;

import java.util.UUID;

/**
 * État d'un type de vitamine pour un jour donné (US9.1). {@code given} = la case est cochée ;
 * {@code authorId} = qui a noté la prise (null si non donnée, D9-F).
 */
public record VitaminState(VitaminType vitaminType, boolean given, UUID authorId) {
}
