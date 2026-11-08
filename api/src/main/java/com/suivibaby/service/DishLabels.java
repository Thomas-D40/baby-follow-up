package com.suivibaby.service;

import jakarta.ws.rs.BadRequestException;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

// One formatting rule for every dish label (meal dish, shared dish, rename): edges stripped and
// repeated blanks collapsed to one space, case and accents kept, 60 characters at most (D18-AD).
// `normalize` is the single source of truth for search, uniqueness and exactMatch (D18-AE).
public final class DishLabels {

    public static final int MAX_LENGTH = 60;

    // Always offered by the front, never stored in the shared list (D18-N); compared normalized.
    private static final Set<String> FIXED = Set.of("puree", "compote");

    private DishLabels() {
    }

    public static String validate(String raw) {
        String label = raw == null ? "" : raw.replaceAll("(?U)\\s+", " ").strip();
        if (label.isEmpty()) {
            throw new BadRequestException("Indiquez le plat.");
        }
        if (label.length() > MAX_LENGTH) {
            throw new BadRequestException("Plat trop long (60 caractères au plus).");
        }
        return label;
    }

    public static String normalize(String label) {
        return Normalizer.normalize(label, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("(?U)\\s+", " ")
                .strip();
    }

    public static boolean isFixed(String normalized) {
        return FIXED.contains(normalized);
    }
}
