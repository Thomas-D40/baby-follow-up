package com.suivibaby.service;

import jakarta.ws.rs.BadRequestException;

// One formatting rule for every dish label (meal dish, shared dish, rename): edges stripped and
// repeated blanks collapsed to one space, case and accents kept, 60 characters at most (D18-AD).
public final class DishLabels {

    public static final int MAX_LENGTH = 60;

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
}
