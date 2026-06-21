package com.suivibaby.model;

import java.util.List;

/**
 * Page keyset de biberons (D3-J). {@code items} triés {@code occurred_at DESC, id DESC} ;
 * {@code nextCursor} = curseur opaque à repasser en {@code ?before=…} pour la page suivante,
 * {@code null} ⇒ dernière page atteinte.
 */
public record BottleFeedingPage(List<BottleFeedingResponse> items, String nextCursor) {
}
