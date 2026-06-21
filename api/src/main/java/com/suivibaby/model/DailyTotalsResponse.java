package com.suivibaby.model;

import java.time.LocalDate;

/**
 * Totaux quotidiens d'un bébé (Épic 6, US6.3, D6-H). {@code date} = jour demandé (Europe/Paris).
 * {@code totalMilkMl} = somme des ml du jour (0 si aucun biberon). {@code totalSleepMinutes} = sommeil
 * <strong>clippé</strong> à la fenêtre du jour (D6-F), sieste en cours comptée jusqu'à {@code now()}
 * (D6-G). {@code stoolCount} = nombre de selles du jour.
 */
public record DailyTotalsResponse(LocalDate date, int totalMilkMl, long totalSleepMinutes,
                                  long stoolCount) {
}
