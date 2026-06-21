package com.suivibaby.model;

/**
 * Type discriminant d'un événement dans la liste chronologique unifiée du calendrier (Épic 6, D6-H).
 * Les constantes reprennent les noms de table (sérialisées telles quelles en JSON) ; couplées à l'id,
 * elles permettent au front de router l'édition vers le bon endpoint (Épic 7).
 */
public enum CalendarEventType {
    bottle_feeding,
    nap,
    stool
}
