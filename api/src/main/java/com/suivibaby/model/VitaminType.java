package com.suivibaby.model;

/**
 * Type de vitamine suivi (US9.1, D9-D). Enum applicatif **fermé** — extensible en code (ajouter une
 * constante), jamais une valeur libre. JSON minuscule (`d`/`k`), comme {@link MilkType}. La D est
 * quotidienne au long cours, la K néonatale/ponctuelle — le modèle « case par jour » couvre les deux
 * sans distinction technique.
 */
public enum VitaminType {
    d,
    k
}
