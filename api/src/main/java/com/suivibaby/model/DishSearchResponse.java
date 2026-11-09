package com.suivibaby.model;

import java.util.List;

// `exactMatch` is true when the searched text designates a shared dish, even if that dish is not
// among the (capped) items: it drives the "add to my dishes" box.
public record DishSearchResponse(List<DishResponse> items, boolean exactMatch) {
}
