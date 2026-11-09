package com.suivibaby.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Merges the dishes a baby already ate with the shared list into one capped list of suggestions
// (D23-J). Pure: reads no database.
public final class DishSuggestions {

    public static final int MAX_SUGGESTIONS = 10;

    private DishSuggestions() {
    }

    // `history`: raw labels, newest meal first. `shared`: raw labels in display order.
    // `normalizedQuery`: already normalized, "" when nothing is typed. The history comes first, then
    // the shared list; a label is kept when it contains the query and its normalized form is not
    // already kept, so the label shown is the one of the most recent meal.
    // Why a shared search capped at 10 is enough: if k labels come from the history, at most k shared
    // ones are duplicates of them (the shared forms are unique), so 10 shared labels leave 10 - k
    // candidates.
    public static List<String> merge(List<String> history, List<String> shared, String normalizedQuery) {
        Map<String, String> kept = new LinkedHashMap<>();
        keep(kept, history, normalizedQuery);
        keep(kept, shared, normalizedQuery);
        return new ArrayList<>(kept.values());
    }

    private static void keep(Map<String, String> kept, List<String> labels, String normalizedQuery) {
        for (String label : labels) {
            if (kept.size() == MAX_SUGGESTIONS) {
                return;
            }
            String normalized = DishLabels.normalize(label);
            if (normalized.contains(normalizedQuery)) {
                kept.putIfAbsent(normalized, label);
            }
        }
    }
}
