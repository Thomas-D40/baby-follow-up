package com.suivibaby.model;

import java.util.List;

/**
 * Page keyset de siestes (D3-J / D4-L). {@code items} triés {@code start_at DESC, id DESC} ;
 * {@code nextCursor} = curseur opaque à repasser en {@code ?before=…} pour la page suivante,
 * {@code null} ⇒ dernière page atteinte.
 */
public record NapPage(List<NapResponse> items, String nextCursor) {
}
