package com.suivibaby.service;

// One tidying rule shared by every free-text label (dish, medication name, dosage): edges stripped
// and repeated blanks collapsed to one space; case and accents kept.
public final class TextLabels {

    private TextLabels() {
    }

    public static String tidy(String raw) {
        return raw == null ? "" : raw.replaceAll("(?U)\\s+", " ").strip();
    }
}
