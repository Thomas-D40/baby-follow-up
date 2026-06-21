package com.suivibaby.model;

import java.util.List;

/**
 * Page keyset de selles (D3-J / D5-I). {@code items} triés {@code occurred_at DESC, id DESC} ;
 * {@code nextCursor} = curseur opaque à repasser en {@code ?before=…} pour la page suivante,
 * {@code null} ⇒ dernière page atteinte.
 */
public record StoolPage(List<StoolResponse> items, String nextCursor) {
}
