package com.suivibaby.model;

import java.util.List;

// Labels only: nothing that could identify an author, a baby or a date.
public record DishSuggestionsResponse(List<String> labels, boolean exactMatch) {
}
