package com.suivibaby.model;

import java.time.LocalDate;
import java.util.List;

/**
 * État des vitamines d'un jour (US9.1) : la **matrice complète** des types (d, k) avec leur état
 * {@code given}, que le front n'ait pas à connaître la liste des types (D9-B).
 */
public record VitaminDayResponse(LocalDate date, List<VitaminState> items) {
}
